import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { getAuthenticatedUser, getOrgId } from '../_shared/auth.ts'
import { callOpenAI } from '../_shared/openai.ts'

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const { user, supabaseClient } = await getAuthenticatedUser(req)
    const orgId = await getOrgId(supabaseClient, user.id)

    const { project_id } = await req.json()
    if (!project_id) throw new Error('project_id가 필요합니다')

    const { data: project } = await supabaseClient
      .from('projects')
      .select('*')
      .eq('id', project_id)
      .single()
    if (!project) throw new Error('프로젝트를 찾을 수 없습니다')

    // 카카오맵 Geocoding (좌표가 없는 경우)
    let lat = project.lat
    let lng = project.lng

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

          await supabaseClient
            .from('projects')
            .update({ lat, lng })
            .eq('id', project_id)
        }
      }
    }

    // AI 입지 분석 프롬프트
    const systemPrompt = `당신은 대한민국 부동산 입지 분석 전문가입니다.
주어진 주소를 기반으로 실거주자와 투자자 관점의 입지 분석을 수행하세요.

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
    "school": [{"name": "학교명", "distance_m": 500, "walk_min": 6}],
    "shopping": [{"name": "상가명", "distance_m": 800, "drive_min": 5}],
    "hospital": [{"name": "병원명", "distance_m": 1000, "drive_min": 8}],
    "park": [{"name": "공원명", "distance_m": 400, "walk_min": 5}]
  },
  "analysis_text": "종합 분석 문장 (100자 내외)"
}`

    const userPrompt = `다음 매물의 입지를 분석하세요:

주소: ${project.address}
매물 유형: ${project.property_type ?? '아파트'}
특징: ${(project.features ?? []).join(', ')}
${lat && lng ? `좌표: 위도 ${lat}, 경도 ${lng}` : ''}

[분석 가이드]
1. 교통: 도보 10분 이내 지하철역, 주요 버스 정류장
2. 학군: 초/중/고등학교, 유명 학원가
3. 상권: 대형마트, 편의시설, 음식점
4. 의료: 병원, 약국
5. 자연환경: 공원, 하천, 녹지
6. 장점은 "도보/차량 N분" 형태의 구체적 표현 사용
7. 추천 타겟은 신혼부부/직장인/투자자/은퇴자/1인가구 등에서 매물에 맞게 선택`

    const responseText = await callOpenAI(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { responseFormat: 'json', maxTokens: 2000, temperature: 0.6 }
    )

    const analysis = JSON.parse(responseText)

    // location_analyses 업데이트 (upsert)
    const { error: upsertError } = await supabaseClient
      .from('location_analyses')
      .upsert({
        project_id,
        advantages: analysis.advantages,
        recommended_targets: analysis.recommended_targets,
        nearby_facilities: analysis.nearby_facilities,
        analysis_text: analysis.analysis_text,
      }, { onConflict: 'project_id' })

    if (upsertError) throw upsertError

    // 사용량 기록
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    await adminClient.rpc('increment_usage', { p_org_id: orgId, p_type: 'generation', p_amount: 1 })

    return new Response(JSON.stringify({
      success: true,
      analysis,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[analyze-location]', err)
    const message = err instanceof Error ? err.message : '입지 분석에 실패했습니다'
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
