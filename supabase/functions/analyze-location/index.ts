import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

import { callGemini } from '../_shared/gemini.ts'

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
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const isServiceRole = serviceRoleKey.length > 0 && authHeader === `Bearer ${serviceRoleKey}`

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
    if (isServiceRole && (!orgId || !task_id)) {
      throw new Error('서비스 역할 요청에는 task_id와 org_id가 필요합니다')
    }

    if (task_id) {
      const { data: startedTask, error: taskError } = await supabaseClient.from('tasks')
        .update({ status: 'running', started_at: new Date().toISOString() })
        .eq('id', task_id)
        .eq('org_id', orgId!)
        .eq('project_id', project_id)
        .eq('type', 'location_analyze')
        .in('status', ['queued', 'retrying'])
        .select('id')
        .maybeSingle()
      if (taskError || !startedTask) throw new Error('유효한 입지분석 작업을 찾을 수 없습니다')
    }

    let projectQuery = supabaseClient.from('projects').select('*').eq('id', project_id)
    let photoQuery = supabaseClient.from('assets').select('id', { count: 'exact', head: true }).eq('project_id', project_id)
    if (orgId) {
      projectQuery = projectQuery.eq('org_id', orgId)
      photoQuery = photoQuery.eq('org_id', orgId)
    }

    const [{ data: project }, { count: photoCount }] = await Promise.all([
      projectQuery.single(),
      photoQuery,
    ])
    if (!project) throw new Error('프로젝트를 찾을 수 없습니다')

    if (!orgId) orgId = project.org_id
    if (project.org_id !== orgId) throw new Error('프로젝트 조직이 작업 조직과 일치하지 않습니다')

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
          await supabaseClient.from('projects').update({ lat, lng }).eq('id', project_id).eq('org_id', orgId)
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
          await supabaseClient.from('projects').update({ poi_data }).eq('id', project_id).eq('org_id', orgId)
          console.log('[analyze-location] POI 수집 완료:', Object.keys(collected).length, '카테고리')
        }
      }
    }

    // ── 실제 수집 데이터 포맷팅 ──────────────────────────────
    const propertyType    = project.property_type ?? 'unknown'
    const isCommercial    = ['commercial', 'knowledge_industry'].includes(propertyType)
    const isResidential   = ['apartment', 'officetel', 'villa', 'multi_unit', 'house', 'oneroom'].includes(propertyType)
    const isMixedUse      = propertyType === 'mixed_use'
    const isLand          = ['land', 'forest'].includes(propertyType)
    const isIndustrial    = propertyType === 'factory'
    const poiText         = formatPOI(poi_data)
    const realPriceText   = isCommercial
      ? formatCommercial(project.commercial_data)
      : formatRealPrice(project.real_price_data)
    const kakaoDensityText = formatKakaoDensity(project.kakao_density)

    // ── 매물 유형별 분석 관점 설정 ──────────────────────────
    const propertyTypeLabel: Record<string, string> = {
      apartment: '아파트', officetel: '오피스텔', villa: '빌라/다세대',
      multi_unit: '다가구주택', house: '단독주택', oneroom: '원룸',
      mixed_use: '상가주택', commercial: '상가/사무실', knowledge_industry: '지식산업센터',
      factory: '공장/창고', land: '토지', forest: '임야',
    }
    const ptLabel = propertyTypeLabel[propertyType] ?? '부동산'

    const typeGuide = isMixedUse
      ? `[상가주택 분석 중점 사항]
- 1층 상가 상권 등급(S/A/B/C)과 유동인구를 데이터 기반으로 평가
- 상가 임대 수익성: 업종 추천, 공실 리스크, 임대료 수준
- 위층 주거 수익성: 원룸·다가구 임대 수요, 공실률 평가
- 교통·생활편의(주거 관점)와 상권 접근성(상가 관점)을 동시에 분석
- 전체 건물 수익률(상가+주거 합산) 관점에서 투자 매력도 평가
- recommended_targets는 투자자(임대수익) + 실거주 겸용 수요자로 작성`
      : isCommercial
      ? `[${ptLabel} 분석 중점 사항]
- 유동인구·상권 등급이 핵심 — S/A/B/C 등급을 데이터 기반으로 명확히 평가
- 음식점·카페 등 경쟁 과밀 업종과 공백 업종을 구체적으로 분석
- 업종 추천은 현재 밀집도 데이터(부족=추천, 과밀=비추천) 기반으로 도출
- 직장인 수요·주거 배후·학원가·관광 등 상권 유형을 명시
${propertyType === 'knowledge_industry' ? '- 입주 기업 업종 적합성(IT·제조·물류 등), 산업단지 접근성, 주차·화물 동선 평가' : ''}
- 임차인 유치 전략과 공실 리스크도 언급`
      : isResidential
      ? `[주거용(${ptLabel}) 분석 중점 사항]
- 교육 환경: 학교·학원가까지의 거리와 학군 수준 평가
- 생활 편의: 마트·병원·약국·카페까지의 도보 접근성
- 교통: 지하철·버스 환승 편의성, 출퇴근 편의
- 주거 쾌적성: 공원·조용함·방향·채광 등
${propertyType === 'multi_unit' ? '- 다가구주택 특성: 임대 수익성, 호실 구성, 공실률, 수익형 투자 관점 포함' : ''}
${propertyType === 'oneroom' ? '- 원룸 특성: 1~2인 가구 수요, 인근 대학·직장·역세권 여부, 임대 수요 안정성' : ''}
- 실거래가 동향을 기반으로 시세 수준과 투자 매력도 평가
- recommended_industries 필드는 "해당없음(주거용)" 으로 채울 것`
      : isLand
      ? `[${ptLabel} 분석 중점 사항]
- 용도지역/지구 규제와 개발 가능성을 최우선 분석
- 접도 조건, 지형, 형상, 경사도 관련 특이사항 언급
- 주변 개발 호재 및 지역 성장성 평가
${propertyType === 'forest' ? '- 임야 특성: 산지전용 가능 여부, 보전산지·준보전산지 구분, 개발행위허가 가능성' : '- 토지 활용 방향 제안 (주거·상업·창고·농지 전용 등)'}
- recommended_targets는 매수 적합 실수요자/투자자 유형으로 작성
- recommended_industries 필드는 "해당없음(토지/임야)" 으로 채울 것`
      : isIndustrial
      ? `[공장/창고 분석 중점 사항]
- 산업단지·IC·물류거점까지의 거리와 도로 접근성(진출입 동선) 평가
- 용도지역(공업지역·준공업·자연녹지 등) 및 건폐율·용적률 규제 확인
- 전기 용량, 하중, 층고 등 산업용 사양 관련 특이사항 메모 반영
- 인근 동종 업체 밀집도 및 노동력 공급 환경 평가
- recommended_targets는 입주 적합 업종·기업 유형으로 작성
- recommended_industries 필드는 "해당없음(공장/창고)" 으로 채울 것`
      : `[일반 부동산 분석 중점 사항]
- 교통·생활편의·교육·상권을 균형 있게 평가
- 실거래가 동향 분석 포함`

    const systemPrompt = `당신은 대한민국 부동산 입지 분석 전문가입니다. 제공된 데이터에서 직접 확인되는 사실만 짧고 쉽게 요약하세요.

[정확성 규칙]
- 입력에 없는 시설명, 거리, 공실률, 수익률, 유동인구, 매출, 개발호재를 만들지 마세요.
- 장소 검색 결과는 전수조사가 아니며 유동인구 측정값으로 해석하지 마세요.
- 확인할 수 없는 항목은 null 또는 빈 배열로 반환하세요.
- 상권등급, 상권유형, 업종추천은 이번 출력에서 생성하지 마세요.

[출력 형식: JSON]
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
  "commercial_grade": null,
  "commercial_type": null,
  "recommended_industries": null,
  "analysis_text": "종합 분석 문장 (200자 내외, 확인된 핵심 지표와 한계 포함)"
}

${typeGuide}`

    const priceStr = project.price ? `${Math.round(project.price / 10000)}억` : null
    const areaStr  = project.area  ? `${project.area}㎡ (약 ${Math.round(project.area / 3.3)}평)` : null

    const analysisInstructions = isMixedUse
      ? `- 확인된 주변 시설과 업종 구성만 요약
- 임대수요·수익률은 근거 데이터가 없으면 언급하지 않음`
      : isCommercial
      ? `- 조회된 주변 점포·업종 구성 숫자만 인용
- 조회 제한이 있는 참고자료이며 상권 전체 점포 수로 단정하지 않음`
      : isResidential
      ? `- 실제 수집된 학교·병원·마트 등 생활 인프라 거리만 언급
- 실거래가 동향을 기반으로 시세 수준과 투자 매력도 평가
- 실제 수집된 교통시설만 언급
- 소음·채광은 입력에 없으면 언급하지 않음`
      : isLand
      ? `- 용도지역 규제와 개발 가능성을 최우선 분석
- 주변 개발 호재 및 지역 성장성 평가
- 토지 활용 방향을 구체적으로 제안`
      : isIndustrial
      ? `- IC·물류거점·산업단지까지의 도로 접근성을 구체적으로 언급
- 용도지역 및 산업용 건물 요건 평가
- 입주 적합 업종·기업 유형을 데이터 기반으로 제안`
      : `- 가장 가까운 업소 이름과 거리를 구체적으로 언급
- 상권 유형을 데이터 기반으로 판단`

    const userPrompt = `다음 ${ptLabel} 매물의 입지를 분석하세요.

[매물 기본 정보]
주소: ${project.address}
매물 유형: ${ptLabel} (${propertyType})
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

[${isCommercial ? '상권 분석 데이터' : isLand ? '토지 실거래가 및 공시지가 참고' : isIndustrial ? '인근 공장/창고 실거래가 참고' : '최근 실거래가'}]
${realPriceText}

[카카오맵 장소 검색 결과 - 전수조사가 아닌 참고자료]
${kakaoDensityText}

위 확인된 데이터를 종합하여 ${ptLabel} 매물을 처음 보는 사람도 이해할 수 있게 요약하세요:
${analysisInstructions}
- 중개사 메모에 특이사항이 있으면 분석에 반드시 반영`

    const responseText = await callGemini(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt },
      ],
      { responseFormat: 'json', maxTokens: 8192, temperature: 0.5 }
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
        commercial_grade:         null,
        commercial_type:          null,
        foot_traffic:             null,
        recommended_industries:   null,
        updated_at:               new Date().toISOString(),
      }, { onConflict: 'project_id' })

    if (upsertError) throw upsertError

    if (task_id) {
      await supabaseClient.from('tasks').update({
        status:       'success',
        result:       analysis,
        completed_at: new Date().toISOString(),
      }).eq('id', task_id).eq('org_id', orgId).eq('project_id', project_id)
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
      if (task_id && orgId) {
        const adminClient = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )
        await adminClient.from('tasks').update({
          status:        'failed',
          error_message: message,
          completed_at:  new Date().toISOString(),
        }).eq('id', task_id).eq('org_id', orgId)
      }
    } catch { /* ignore */ }

    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
