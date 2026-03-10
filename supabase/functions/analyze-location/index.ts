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

function formatLandUse(land_use_data: any[] | null): string {
  if (!land_use_data || land_use_data.length === 0) return '(토지이용규제 데이터 없음)'
  return land_use_data.map(z =>
    `${z.zone_name ?? '-'}${z.law_name ? ` [${z.law_name}]` : ''}`
  ).join(', ')
}

function formatRealPrice(real_price_data: any[] | null): string {
  if (!real_price_data || real_price_data.length === 0) return '(실거래가 데이터 없음)'
  const recent = real_price_data.slice(0, 10)
  return recent.map(t =>
    `${t.deal_ym} ${t.name ?? ''} ${t.area ?? '?'}㎡ ${t.floor ? t.floor + '층' : ''} ${t.amount ? Math.round(t.amount / 10000) + '억' : '-'}`
  ).join('\n')
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

    const { data: project } = await supabaseClient
      .from('projects')
      .select('*')
      .eq('id', project_id)
      .single()
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

    // ── 실제 수집 데이터 포맷팅 ──────────────────────────────
    const poiText       = formatPOI(project.poi_data)
    const landUseText   = formatLandUse(project.land_use_data)
    const realPriceText = formatRealPrice(project.real_price_data)

    const systemPrompt = `당신은 대한민국 부동산 입지 분석 전문가입니다.
실제 수집된 데이터를 기반으로 입지 분석을 수행하세요. 수집된 데이터가 있으면 반드시 활용하고, 없는 항목은 주소와 지역 특성으로 추론하세요.

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
  "analysis_text": "종합 분석 문장 (150자 내외)"
}`

    const userPrompt = `다음 매물의 입지를 분석하세요.

주소: ${project.address}
매물 유형: ${project.property_type ?? '미분류'}
특징: ${(project.features ?? []).join(', ') || '없음'}
${lat && lng ? `좌표: 위도 ${lat}, 경도 ${lng}` : ''}

[실제 수집된 POI 데이터]
${poiText}

[토지이용규제]
${landUseText}

[최근 3개월 실거래가]
${realPriceText}

위 실제 데이터를 적극 활용하여 분석하세요. 장점은 "도보/차량 N분" 등 구체적 수치 표현을 사용하세요.`

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
        advantages:           analysis.advantages,
        recommended_targets:  analysis.recommended_targets,
        nearby_facilities:    analysis.nearby_facilities,
        analysis_text:        analysis.analysis_text,
        land_use_summary:     analysis.land_use_summary ?? null,
        price_trend:          analysis.price_trend ?? null,
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
