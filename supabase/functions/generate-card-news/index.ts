import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { getAuthenticatedUser, getOrgId, checkQuota } from '../_shared/auth.ts'
import { callOpenAI } from '../_shared/openai.ts'

type Platform = 'instagram' | 'kakao'

function buildInstagramSystemPrompt(): string {
  return `당신은 부동산 인스타그램 카드뉴스 제작 전문가입니다.
입지 분석 및 매물 정보를 바탕으로 정확히 6장의 카드뉴스 텍스트를 JSON 객체로 생성하세요.

[카드 6장 필수 구성 - 이 흐름을 반드시 준수]
1장: Hook (시선을 끄는 카피 한 줄)
2장: Location advantage (입지 장점)
3장: Commercial or living environment (상권 또는 주거 환경)
4장: Property key features (매물 핵심 특징)
5장: Recommended customer segment (추천 타겟 고객층)
6장: Call to action (행동 유도 및 연락처 안내)

[출력 형식 - 반드시 이 구조의 JSON 객체로 반환]
{"cards":[
  {"card_number":1,"title":"강렬한 후킹(15자 이내)","body":"시선을 끄는 부연 설명(30자 이내)","hashtags":["#부동산","#매물"]},
  {"card_number":2,"title":"특급 입지 장점","body":"설명(40자 이내)","emoji":"📍"},
  {"card_number":3,"title":"완벽한 주거/상권","body":"설명(40자 이내)","emoji":"🏫"},
  {"card_number":4,"title":"매물 핵심 가치","body":"설명(40자 이내)","emoji":"💡"},
  {"card_number":5,"title":"이런 분께 추천해요","body":"설명(40자 이내)","emoji":"🎯"},
  {"card_number":6,"title":"지금 바로 문의하세요","body":"행동 유도 연락처","cta":"프로필 링크 클릭!","hashtags":["#매물문의"]}
]}`
}

function buildKakaoSystemPrompt(): string {
  return `당신은 부동산 카카오톡 카드뉴스 제작 전문가입니다.
입지 분석 및 매물 정보를 바탕으로 정확히 6장의 카드뉴스 텍스트를 JSON 객체로 생성하세요.
카카오톡에 맞게 더 간결하고 정보 중심의 Bullet point 형식으로 작성하세요.

[카드 6장 필수 구성 - 이 흐름을 반드시 준수]
1장: Hook (시선을 끄는 카피 한 줄)
2장: Location advantage (입지 장점)
3장: Commercial or living environment (상권 또는 주거/교육 환경)
4장: Property key features (매물 핵심 특징)
5장: Recommended customer segment (추천 타겟 고객층)
6장: Call to action (행동 유도 및 상담 안내)

[출력 형식 - 반드시 이 구조의 JSON 객체로 반환]
{"cards":[
  {"card_number":1,"headline":"강렬한 후킹(20자 이내)","price":"가격정보","location":"지역정보"},
  {"card_number":2,"section":"입지 장점","points":["핵심포인트1","핵심포인트2"]},
  {"card_number":3,"section":"주거/상권 환경","points":["환경포인트1","환경포인트2"]},
  {"card_number":4,"section":"매물 특징","points":["특징1","특징2"]},
  {"card_number":5,"section":"추천 타겟","points":["추천대상1","추천대상2"]},
  {"card_number":6,"section":"상담 문의","phone":"상담번호 기재","kakao_id":"카카오ID 필요"}
]}`
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const { user, supabaseClient } = await getAuthenticatedUser(req)
    const orgId = await getOrgId(supabaseClient, user.id)
    await checkQuota(supabaseClient, orgId, 'generation')

    const { project_id, platform = 'instagram' as Platform } = await req.json()
    if (!project_id) throw new Error('project_id가 필요합니다')
    if (platform !== 'instagram' && platform !== 'kakao') {
      throw new Error('platform은 instagram 또는 kakao 이어야 합니다')
    }

    const { data: project, error: pError } = await supabaseClient
      .from('projects')
      .select('*')
      .eq('id', project_id)
      .single()
    if (pError || !project) throw new Error('프로젝트를 찾을 수 없습니다')

    const { data: location } = await supabaseClient
      .from('location_analyses')
      .select('advantages, recommended_targets')
      .eq('project_id', project_id)
      .single()

    const contentType = 'card_news'

    const { data: existing } = await supabaseClient
      .from('generated_contents')
      .select('version')
      .eq('project_id', project_id)
      .eq('type', contentType)
      .order('version', { ascending: false })
      .limit(1)
      .single()

    const nextVersion = (existing?.version ?? 0) + 1

    const priceText = project.price
      ? `${Math.floor(project.price / 100000000)}억${Math.floor((project.price % 100000000) / 10000) > 0 ? ` ${Math.floor((project.price % 100000000) / 10000)}만원` : '원'}`
      : '가격 협의'

    const advantages = (location?.advantages ?? []).slice(0, 5)
      .map((a: string, i: number) => `${i + 1}. ${a}`).join('\n')

    const userPrompt = `다음 매물로 ${platform === 'instagram' ? '인스타그램' : '카카오톡'} 카드뉴스 6장을 생성하세요:

주소: ${project.address}
유형: ${project.property_type ?? '아파트'}
가격: ${priceText}
면적: ${project.area ? `${project.area}㎡` : '미정'}
층수: ${project.floor ? `${project.floor}층` : '미정'}
방향: ${project.direction ?? '미정'}
특징: ${(project.features ?? []).join(', ')}

입지 장점:
${advantages || '입지 정보 없음'}`

    const systemPrompt = platform === 'instagram'
      ? buildInstagramSystemPrompt()
      : buildKakaoSystemPrompt()

    const responseText = await callOpenAI(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { responseFormat: 'json', maxTokens: 2500, temperature: 0.8 }
    )

    const parsed = JSON.parse(responseText)
    let cards: any[]
    if (Array.isArray(parsed)) {
      cards = parsed
    } else if (Array.isArray(parsed.cards)) {
      cards = parsed.cards
    } else {
      // 첫 번째 배열 값 탐색
      const found = Object.values(parsed).find(v => Array.isArray(v))
      cards = (found as any[]) ?? []
    }

    if (cards.length === 0) {
      throw new Error('카드뉴스 생성에 실패했습니다. 다시 시도해주세요.')
    }

    const result = { platform, cards }

    const { data: saved, error: saveError } = await supabaseClient
      .from('generated_contents')
      .insert({
        project_id,
        org_id: orgId,
        type: contentType,
        title: platform === 'instagram' ? '인스타그램 카드뉴스 6장' : '카카오톡 카드뉴스 6장',
        content: JSON.stringify(result),
        version: nextVersion,
      })
      .select()
      .single()

    if (saveError) throw new Error(saveError.message)

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    await adminClient.rpc('increment_usage', { p_org_id: orgId, p_type: 'generation', p_amount: 1 })

    return new Response(JSON.stringify({
      success: true,
      content_id: saved.id,
      platform,
      cards: result.cards,
      version: nextVersion,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (e) {
    console.error('[generate-card-news]', e)
    const message = e instanceof Error ? e.message : ((e as any)?.message ?? '카드뉴스 생성에 실패했습니다')
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
