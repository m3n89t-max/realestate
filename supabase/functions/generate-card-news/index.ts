import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { getAuthenticatedUser, getOrgId, checkQuota } from '../_shared/auth.ts'
import { callOpenAI } from '../_shared/openai.ts'

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const { user, supabaseClient } = await getAuthenticatedUser(req)
    const orgId = await getOrgId(supabaseClient, user.id)
    await checkQuota(supabaseClient, orgId, 'generation')

    const { project_id, card_count = 6, color_theme = 'blue' } = await req.json()
    if (!project_id) throw new Error('project_id가 필요합니다')

    // 프로젝트 + 입지 분석 조회
    const { data: project } = await supabaseClient
      .from('projects')
      .select('*')
      .eq('id', project_id)
      .single()
    if (!project) throw new Error('프로젝트를 찾을 수 없습니다')

    const { data: location } = await supabaseClient
      .from('location_analyses')
      .select('advantages, recommended_targets')
      .eq('project_id', project_id)
      .single()

    const { data: existing } = await supabaseClient
      .from('generated_contents')
      .select('version')
      .eq('project_id', project_id)
      .eq('type', 'card_news')
      .order('version', { ascending: false })
      .limit(1)
      .single()

    const nextVersion = (existing?.version ?? 0) + 1

    const priceText = project.price
      ? `${Math.floor(project.price / 100000000)}억${Math.floor((project.price % 100000000) / 10000) > 0 ? ` ${Math.floor((project.price % 100000000) / 10000)}만` : ''}`
      : '가격 협의'

    const systemPrompt = `당신은 부동산 카드뉴스 전문 카피라이터입니다.
인스타그램/카카오톡 공유에 최적화된 ${card_count}장 카드뉴스를 JSON 배열로 생성하세요.

[카드 구성]
카드 1: 훅(Hook) - 강렬한 첫인상
카드 2: 가격 & 기본 정보
카드 3: 위치 & 교통 장점
카드 4: 입지 장점 TOP ${Math.min(5, card_count - 2)}
카드 5: 추천 대상
카드 6: 문의 CTA
${card_count === 8 ? '카드 7: 주변 생활 인프라\n카드 8: 특징 & 마무리 멘트' : ''}

[출력 형식: JSON 배열]
[
  {
    "order": 1,
    "title": "카드 제목 (10자 이내)",
    "body": "카드 본문 (30자 이내, 핵심 메시지)",
    "highlight": "강조 문구 (선택)",
    "emoji": "이모지",
    "background": "${color_theme}"
  }
]`

    const userPrompt = `다음 매물 정보로 카드뉴스 ${card_count}장을 생성하세요:

주소: ${project.address}
매물 유형: ${project.property_type ?? '아파트'}
가격: ${priceText}
면적: ${project.area ? `${project.area}㎡` : '미정'}
층수: ${project.floor ? `${project.floor}층` : '미정'}
방향: ${project.direction ?? '미정'}
특징: ${(project.features ?? []).join(', ')}

입지 장점:
${(location?.advantages ?? ['입지 정보 없음']).slice(0, 5).map((a: string, i: number) => `${i + 1}. ${a}`).join('\n')}

추천 대상: ${JSON.stringify(location?.recommended_targets ?? [])}`

    const responseText = await callOpenAI(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { responseFormat: 'json', maxTokens: 2000, temperature: 0.8 }
    )

    const cards = JSON.parse(responseText)
    const cardsArray = Array.isArray(cards) ? cards : cards.cards ?? []

    // 저장
    const { data: saved, error: saveError } = await supabaseClient
      .from('generated_contents')
      .insert({
        project_id,
        org_id: orgId,
        type: 'card_news',
        title: `카드뉴스 ${card_count}장`,
        content: JSON.stringify(cardsArray),
        version: nextVersion,
      })
      .select()
      .single()

    if (saveError) throw saveError

    // 사용량 기록
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    await adminClient.rpc('increment_usage', { p_org_id: orgId, p_type: 'generation', p_amount: 1 })

    return new Response(JSON.stringify({
      success: true,
      content_id: saved.id,
      cards: cardsArray,
      version: nextVersion,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[generate-card-news]', err)
    const message = err instanceof Error ? err.message : '카드뉴스 생성에 실패했습니다'
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
