import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

import { callOpenAI } from '../_shared/openai.ts'

const POI_LABEL_MAP: Record<string, string> = {
  subway:      '지하철역',
  mart:        '대형마트',
  convenience: '편의점',
  hospital:    '병원',
  pharmacy:    '약국',
  school:      '학교',
  bank:        '은행',
  cafe:        '카페',
  restaurant:  '음식점',
  gas_station: '주유소',
  parking:     '주차장',
  culture:     '문화시설',
}

function formatPOI(poi_data: Record<string, any[]> | null): string {
  if (!poi_data) return '(POI 데이터 없음)'
  const lines: string[] = []
  for (const [key, items] of Object.entries(poi_data)) {
    if (!Array.isArray(items) || items.length === 0) continue
    const label = POI_LABEL_MAP[key] ?? key
    const names = items.slice(0, 3).map(i =>
      `${i.name}(${i.distance_m}m)`
    ).join(', ')
    lines.push(`${label}: ${names}`)
  }
  return lines.join('\n') || '(근처 시설 없음)'
}


function formatRealPrice(real_price_data: any[] | null): string {
  if (!real_price_data || real_price_data.length === 0) return '(실거래가 데이터 없음)'
  const recent = real_price_data.slice(0, 10)
  return recent.map(t =>
    `${t.deal_ym} ${t.name ?? ''} ${t.area ?? '?'}㎡ ${t.floor ? t.floor + '층' : ''} ${t.amount ? Math.round(t.amount / 10000) + '억' : '-'}`
  ).join('\n')
}

function formatCommercial(commercial_data: any): string {
  if (!commercial_data) return '(상권 데이터 없음)'
  const { zones = [], store_count_by_category = {}, stores = [], radius_m = 500 } = commercial_data
  const lines: string[] = [
    `반경 ${radius_m}m 내 상가업소: ${stores.length}개`,
  ]
  if (zones.length > 0) {
    lines.push(`주변 상권: ${zones.slice(0, 3).map((z: any) => z.mainTrarNm).join(', ')}`)
  }
  const categories = Object.entries(store_count_by_category as Record<string, number>)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
  if (categories.length > 0) {
    lines.push(`업종별 현황: ${categories.map(([k, v]) => `${k}(${v}개)`).join(', ')}`)
  }
  return lines.join('\n')
}

function formatKakaoDensity(kakao_density: any): string {
  if (!kakao_density) return '(업종 밀집도 데이터 없음)'
  const { categories = {}, radius_m = 500 } = kakao_density
  const LABEL: Record<string, string> = {
    CE7: '카페', FD6: '음식점', HP8: '병원', AC5: '학원',
    CS2: '편의점', AG2: '부동산', PM9: '약국',
  }
  const lines: string[] = [`카카오맵 기준 반경 ${radius_m}m 업종 밀집도:`]
  const sorted = Object.entries(categories as Record<string, any>)
    .map(([code, data]) => ({ code, label: LABEL[code] ?? code, total: data.total_count ?? 0, items: data.items ?? [] }))
    .sort((a, b) => b.total - a.total)
  for (const { label, total, items } of sorted) {
    if (total === 0) continue
    const nearest = items.slice(0, 3).map((i: any) => `${i.name}(${i.distance_m}m)`).join(', ')
    lines.push(`  ${label}: 총 ${total}개 | 가까운 순: ${nearest || '-'}`)
  }
  const totalAll = sorted.reduce((s, c) => s + c.total, 0)
  lines.push(`  합계: ${totalAll}개 (상권 밀집도 지표)`)
  return lines.join('\n')
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  let project_id: string
  let task_id: string | null = null

  const authHeader = req.headers.get('Authorization') ?? ''
  const isServiceRole = authHeader.includes(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? 'never-match')

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    isServiceRole
      ? (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
      : (Deno.env.get('SUPABASE_ANON_KEY') ?? ''),
    { global: { headers: { Authorization: authHeader } } }
  )

  let orgId: string | null = null

  try {
    if (isServiceRole) {
      const body = await req.json()
      project_id = body.record?.project_id || body.project_id
      task_id    = body.record?.id         || body.task_id
      orgId      = body.record?.org_id     || body.org_id
    } else {
      const { data: { user }, error } = await supabaseClient.auth.getUser()
      if (error || !user) throw new Error('인증되지 않은 요청입니다')
      const body = await req.json()
      project_id = body.project_id
    }

    if (!project_id) throw new Error('project_id가 필요합니다')

    if (task_id) {
      await supabaseClient.from('tasks')
        .update({ status: 'running', started_at: new Date().toISOString() })
        .eq('id', task_id)
    }

    const [{ data: project }, { count: photoCount }] = await Promise.all([
      supabaseClient.from('projects').select('*').eq('id', project_id).single(),
      supabaseClient.from('assets').select('id', { count: 'exact', head: true }).eq('project_id', project_id),
    ])
    if (!project) throw new Error('프로젝트를 찾을 수 없습니다')

    if (!orgId) orgId = project.org_id

    let lat = project.lat
    let lng = project.lng

    // 좌표 없으면 Kakao fallback
    if (!lat || !lng) {
      const kakaoKey = Deno.env.get('KAKAO_REST_API_KEY')
      if (kakaoKey) {
        const geoRes = await fetch(
          `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(project.address)}`,
          { headers: { Authorization: `KakaoAK ${kakaoKey}` } }
        )
        const geoData = await geoRes.json()
        if (geoData.documents?.length > 0) {
          lat = parseFloat(geoData.documents[0].y)
          lng = parseFloat(geoData.documents[0].x)
          await supabaseClient.from('projects').update({ lat, lng }).eq('id', project_id)
        }
      }
    }

    // ── POI 자동 수집 (없으면 Kakao Local API로 수집) ──────────
    let poi_data = project.poi_data
    if ((!poi_data || Object.keys(poi_data).length === 0) && lat && lng) {
      const kakaoKey = Deno.env.get('KAKAO_REST_API_KEY')
      if (kakaoKey) {
        const POI_CATEGORIES: Record<string, string> = {
          subway:      'SW8',
          mart:        'MT1',
          hospital:    'HP8',
          school:      'SC4',
          convenience: 'CS2',
          pharmacy:    'PM9',
          bank:        'BK9',
          culture:     'CT1',
          cafe:        'CE7',
          restaurant:  'FD6',
        }
        const collected: Record<string, any[]> = {}
        await Promise.allSettled(
          Object.entries(POI_CATEGORIES).map(async ([key, code]) => {
            try {
              const url = `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=${code}&radius=1000&x=${lng}&y=${lat}&size=5`
              const res = await fetch(url, { headers: { Authorization: `KakaoAK ${kakaoKey}` } })
              const data = await res.json()
              if (data.documents?.length > 0) {
                collected[key] = data.documents.map((d: any) => ({
                  name:       d.place_name,
                  distance_m: parseInt(d.distance) || null,
                  address:    d.road_address_name || d.address_name,
                }))
              }
            } catch { /* 개별 실패 무시 */ }
          })
        )
        if (Object.keys(collected).length > 0) {
          poi_data = collected
          await supabaseClient.from('projects').update({ poi_data }).eq('id', project_id)
          console.log('[analyze-location] POI 수집 완료:', Object.keys(collected).length, '카테고리')
        }
      }
    }

    // ── 실제 수집 데이터 포맷팅 ──────────────────────────────
    const isCommercial    = project.property_type === 'commercial'
    const poiText         = formatPOI(poi_data)
    const realPriceText   = isCommercial
      ? formatCommercial(project.commercial_data)
      : formatRealPrice(project.real_price_data)
    const kakaoDensityText = formatKakaoDensity(project.kakao_density)

    // ── 유동인구 추정 (TEAM5 스펙 공식) ──────────────────────
    // foot_traffic_score = POI_density * 0.4 + transit_score * 0.3 + population_density * 0.3
    const footTrafficLocal = (() => {
      const density = project.kakao_density as any
      const totalPoi = density?.categories
        ? Object.values(density.categories as Record<string, any>)
            .reduce((s: number, c: any) => s + (c.total_count ?? 0), 0)
        : 0
      // POI 밀도 점수: 총 300개 이상이면 만점
      const poiScore = Math.min(totalPoi / 300, 1)

      // 대중교통 점수: 가장 가까운 지하철 거리 기반
      const nearestSubway = (poi_data as any)?.subway?.[0]?.distance_m ?? 99999
      const transitScore = nearestSubway < 300 ? 1.0
        : nearestSubway < 600 ? 0.75
        : nearestSubway < 1000 ? 0.5
        : nearestSubway < 2000 ? 0.25 : 0.05

      // 배후인구 추정: 업종 밀도로 대체 (상권형=높음, 주거형=중간)
      const hasFoodBiz = ((density?.categories?.FD6?.total_count ?? 0) + (density?.categories?.CE7?.total_count ?? 0))
      const populationScore = hasFoodBiz >= 30 ? 0.8 : hasFoodBiz >= 10 ? 0.5 : 0.3

      const raw = poiScore * 0.4 + transitScore * 0.3 + populationScore * 0.3
      const score = Math.round(raw * 100)
      const label = score >= 75 ? '높음' : score >= 50 ? '보통' : score >= 25 ? '낮음' : '매우 낮음'
      return { score, label, breakdown: { poi_score: Math.round(poiScore * 100), transit_score: Math.round(transitScore * 100), population_score: Math.round(populationScore * 100), total_poi: totalPoi, nearest_subway_m: nearestSubway < 99999 ? nearestSubway : null } }
    })()

    const systemPrompt = `당신은 대한민국 부동산 상권 분석 전문가입니다. TEAM5 상권 분석 엔진으로서 실측 데이터를 기반으로 정밀한 입지·상권 분석을 수행하세요.

[출력 형식: JSON - 모든 필드 필수]
{
  "advantages": ["장점1", "장점2", ..., "장점7"],
  "recommended_targets": [
    {"type": "타겟1", "reason": "이유", "priority": 1},
    {"type": "타겟2", "reason": "이유", "priority": 2},
    {"type": "타겟3", "reason": "이유", "priority": 3}
  ],
  "nearby_facilities": {
    "transport": [{"name": "시설명", "distance_m": 300, "walk_min": 4}],
    "school":    [{"name": "학교명", "distance_m": 500, "walk_min": 6}],
    "shopping":  [{"name": "상가명", "distance_m": 800, "drive_min": 5}],
    "hospital":  [{"name": "병원명", "distance_m": 1000, "drive_min": 8}],
    "park":      [{"name": "공원명", "distance_m": 400, "walk_min": 5}]
  },
  "land_use_summary": "용도지역/지구 요약 (1-2문장)",
  "price_trend": "실거래가 동향 분석 (1-2문장)",
  "commercial_grade": "S 또는 A 또는 B 또는 C",
  "commercial_type": "주거형 또는 직장인 또는 학원 또는 대학 또는 관광 또는 복합 중 택1",
  "recommended_industries": {
    "recommended": [
      {"name": "업종명", "reason": "추천 이유 (데이터 기반)"},
      {"name": "업종명", "reason": "추천 이유"},
      {"name": "업종명", "reason": "추천 이유"}
    ],
    "not_recommended": [
      {"name": "업종명", "reason": "비추천 이유 (경쟁 과밀 등)"},
      {"name": "업종명", "reason": "비추천 이유"}
    ]
  },
  "analysis_text": "종합 분석 문장 (200자 내외, 유동인구/상권등급 포함)"
}

[상권 등급 평가 기준]
S: 유동인구 높음 + 업종밀집 300개 이상 OR 지하철 300m 이내
A: 유동인구 보통 이상 + 업종 100개 이상
B: 유동인구 낮음 이상 + 상권 기반 존재
C: 고립 지역 또는 유동인구 매우 낮음

[추천 업종 분석 기준]
- 현재 부족한 업종(상권 공백) = 추천
- 과밀 업종(경쟁 포화) = 비추천
- 유동인구 특성(직장인/주거/학원가)에 맞는 업종 = 추천`

    const priceStr = project.price ? `${Math.round(project.price / 10000)}억` : null
    const areaStr  = project.area  ? `${project.area}㎡ (약 ${Math.round(project.area / 3.3)}평)` : null

    const userPrompt = `다음 매물의 입지를 분석하세요.

[매물 기본 정보]
주소: ${project.address}
매물 유형: ${project.property_type ?? '미분류'}
${priceStr              ? `매매가: ${priceStr}` : ''}
${areaStr               ? `전용면적: ${areaStr}` : ''}
${project.floor         ? `층수: ${project.floor}층 / 전체 ${project.total_floors ?? '?'}층` : ''}
${project.direction     ? `방향: ${project.direction}` : ''}
${(project.features ?? []).length > 0 ? `특징: ${project.features.join(', ')}` : ''}
${photoCount            ? `등록 사진: ${photoCount}장` : ''}
${lat && lng            ? `좌표: 위도 ${lat}, 경도 ${lng}` : ''}

[중개사 메모 / 특이사항]
${project.note || '(없음)'}

[실제 수집된 POI 데이터]
${poiText}

[${isCommercial ? '상권 분석 데이터' : '최근 실거래가'}]
${realPriceText}

[카카오맵 업종 밀집도 - 실측 데이터, 반드시 분석에 반영]
${kakaoDensityText}

[유동인구 추정 (로컬 계산 결과 - 참고용)]
유동인구 지수: ${footTrafficLocal.score}/100 (${footTrafficLocal.label})
- POI 밀도 점수: ${footTrafficLocal.breakdown.poi_score}/100 (반경 500m 총 ${footTrafficLocal.breakdown.total_poi}개)
- 대중교통 점수: ${footTrafficLocal.breakdown.transit_score}/100 ${footTrafficLocal.breakdown.nearest_subway_m ? `(가장 가까운 지하철 ${footTrafficLocal.breakdown.nearest_subway_m}m)` : '(지하철 없음)'}
- 배후인구 점수: ${footTrafficLocal.breakdown.population_score}/100

위 실측 데이터를 종합하여 분석하세요:
- 카카오맵 업종 밀집도 숫자(음식점 N개, 카페 N개 등)를 입지 장점/분석에 직접 인용
- 가장 가까운 업소 이름과 거리를 구체적으로 언급
- 상권 유형을 데이터 기반으로 판단 (주거형/직장인/학원/복합 등)
- 현재 부족한 업종과 과밀 업종을 분석하여 추천/비추천 업종 도출
- 상권 등급(S/A/B/C)을 위 기준에 따라 부여하고 근거 명시
- 중개사 메모에 특이사항이 있으면 분석에 반드시 반영`

    const responseText = await callOpenAI(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt },
      ],
      { responseFormat: 'json', maxTokens: 2500, temperature: 0.5 }
    )

    const analysis = JSON.parse(responseText)

    const { error: upsertError } = await supabaseClient
      .from('location_analyses')
      .upsert({
        project_id,
        advantages:               analysis.advantages,
        recommended_targets:      analysis.recommended_targets,
        nearby_facilities:        analysis.nearby_facilities,
        analysis_text:            analysis.analysis_text,
        land_use_summary:         analysis.land_use_summary ?? null,
        price_trend:              analysis.price_trend ?? null,
        commercial_grade:         analysis.commercial_grade ?? null,
        commercial_type:          analysis.commercial_type ?? null,
        foot_traffic:             { ...footTrafficLocal, ai_label: analysis.commercial_grade },
        recommended_industries:   analysis.recommended_industries ?? null,
        updated_at:               new Date().toISOString(),
      }, { onConflict: 'project_id' })

    if (upsertError) throw upsertError

    if (task_id) {
      await supabaseClient.from('tasks').update({
        status:       'success',
        result:       analysis,
        completed_at: new Date().toISOString(),
      }).eq('id', task_id)
    }

    if (orgId) {
      const adminClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      )
      await adminClient.rpc('increment_usage', { p_org_id: orgId, p_type: 'generation', p_amount: 1 })
    }

    return new Response(JSON.stringify({ success: true, analysis }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('[analyze-location]', error)
    const message = error instanceof Error ? error.message : '입지 분석에 실패했습니다'

    try {
      const body = await req.clone().json()
      const tid = body.record?.id || body.task_id
      if (tid) {
        const adminClient = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )
        await adminClient.from('tasks').update({
          status:        'failed',
          error_message: message,
          completed_at:  new Date().toISOString(),
        }).eq('id', tid)
      }
    } catch { /* ignore */ }

    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
