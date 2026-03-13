import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { getAuthenticatedUser, getOrgId, checkQuota } from '../_shared/auth.ts'
import { callOpenAI } from '../_shared/openai.ts'

type Platform = 'instagram' | 'kakao'

function buildInstagramSystemPrompt(): string {
  return `당신은 부동산 인스타그램 카드뉴스 전문가입니다.
정확히 6장의 카드를 JSON 객체로 생성하세요.

[카드 구성 - 반드시 준수]
카드1: 매물 핵심 한줄 + 주소/가격
카드2: 입지 강점 (📍)
카드3: 시설 인프라 (🏫)
카드4: 투자 포인트 (💰)
카드5: 실거주 매력 (🏡)
카드6: 문의 안내 + CTA + 해시태그

[출력 형식 - 반드시 이 구조의 JSON 객체로 반환]
{"cards":[
  {"card_number":1,"title":"매물핵심(15자이내)","subtitle":"주소/가격","body":"보조설명(30자이내)","hashtags":["#부동산"]},
  {"card_number":2,"title":"입지강점","body":"설명(40자이내)","emoji":"📍"},
  {"card_number":3,"title":"시설인프라","body":"설명(40자이내)","emoji":"🏫"},
  {"card_number":4,"title":"투자포인트","body":"설명(40자이내)","emoji":"💰"},
  {"card_number":5,"title":"실거주매력","body":"설명(40자이내)","emoji":"🏡"},
  {"card_number":6,"title":"문의안내","body":"연락방법","cta":"프로필링크클릭","hashtags":["#매물문의"]}
]}`
}

function buildKakaoSystemPrompt(): string {
  return `당신은 부동산 카카오톡 카드뉴스 전문가입니다.
정확히 6장의 카드를 JSON 객체로 생성하세요.
간결하고 정보 중심, bullet point 3개씩 포함.

[출력 형식 - 반드시 이 구조의 JSON 객체로 반환]
{"cards":[
  {"card_number":1,"headline":"매물핵심(20자이내)","price":"3억5천","location":"서울강남구"},
  {"card_number":2,"section":"입지분석","points":["Point1","Point2","Point3"]},
  {"card_number":3,"section":"교통편의","points":["Point1","Point2","Point3"]},
  {"card_number":4,"section":"교육환경","points":["Point1","Point2","Point3"]},
  {"card_number":5,"section":"투자가치","points":["Point1","Point2","Point3"]},
  {"card_number":6,"section":"상담문의","phone":"대표번호기재필요","kakao_id":"카카오ID기재필요"}
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
