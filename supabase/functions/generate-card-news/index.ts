import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { getAuthenticatedUser, getOrgId, checkQuota } from '../_shared/auth.ts'
import { callOpenAI, callOpenAIVision } from '../_shared/openai.ts'

type Platform = 'instagram' | 'kakao'

function buildInstagramSystemPrompt(): string {
  return `당신은 부동산 인스타그램 카드뉴스 제작 전문가입니다.
매물 정보, 입지 분석, 사진 분석을 바탕으로 정확히 6장의 카드뉴스 JSON을 생성하세요.

[핵심 원칙]
- 추상적 표현 금지. "좋음", "우수함" 대신 구체적 사실/수치 사용
- checkpoints: 매물의 실제 강점을 간결하고 임팩트 있게 (15자 이내)
- image_prompt: 이 매물의 실제 지역·건물유형·외관·분위기를 영어로 구체적 묘사 (generic 금지)
- 사진 분석 결과가 있으면 내부/외관 특징에 반드시 반영
- ⚠️ 데이터 없음 → 생략 원칙: 제공된 데이터에 없는 정보는 절대 추측하거나 지어내지 말 것. 임대현황이 없으면 4장에 "임대 정보 없음"이라 쓰거나 알고 있는 정보만 기재. 층별 구성 모르면 spec_grid에 "미확인" 대신 알려진 내용만 기재. 빈 checkpoints/points는 실제 근거 있는 것만 포함하되 1개라도 무방

[image_prompt 작성 규칙 - 매우 중요]
❌ 나쁜 예: "Professional real estate exterior photo, bright lighting"
✅ 좋은 예: "Small 2-story brick commercial building in Jeju Island Korea, ground floor storefront with large windows, residential neighborhood alley, warm afternoon light, Korean traditional neighborhood feel, photorealistic"
→ 반드시: 지역명(영어) + 건물유형 + 층수/외관 + 주변환경 + 조명/분위기

[카드 6장 구성]
1장(cover): 후킹 제목(2줄, 줄당 8자 이내) + 가격뱃지 + 핵심강점 체크포인트 3개
2장(location): 위치 + 주소 + 교통·생활 인프라 체크포인트 3개(구체적 거리/시간 포함)
3장(composition): 층별 구성 스펙그리드 2칸 (실제 업종/용도 명시) + 추가포인트 2개
4장(investment): 임대현황 하이라이트 + 투자수익 관련 포인트 2개
5장(interior): 사진 분석 기반 내부 특징 4개 (가장 눈에 띄는 것부터)
6장(cta): 임팩트 제목(2줄) + 가격뱃지 + CTA문구 + 해시태그 8개

[출력 JSON - 반드시 이 구조만]
{"cards":[
  {
    "card_number":1,"layout":"cover",
    "title":"후킹 2줄 제목\\n(줄당 8자 이내)",
    "subtitle":"핵심 특장점 요약 (20자 이내)",
    "price_badge":"매매가 OO억 OO만원",
    "checkpoints":["구체적 강점1","구체적 강점2","구체적 강점3"],
    "image_prompt":"[지역영문] [건물유형], [외관특징], [층수], [주변환경], warm light, photorealistic, no text"
  },
  {
    "card_number":2,"layout":"location",
    "title":"입지 분석","address":"전체 주소",
    "checkpoints":["교통: 구체적 내용","생활: 구체적 내용","환경: 구체적 내용"],
    "body":"한줄 입지 요약 (20자 이내)",
    "image_prompt":"[지역영문] street view, [건물주변환경], sunny day, Korean neighborhood, photorealistic, no text"
  },
  {
    "card_number":3,"layout":"composition",
    "title":"건물 구성",
    "spec_grid":[
      {"label":"1층","value":"실제 업종 또는 용도\\n면적/특징 추가"},
      {"label":"2층 이상","value":"실제 구성\\n현황 추가"}
    ],
    "points":["추가 구성 포인트1","추가 구성 포인트2"],
    "image_prompt":"[건물유형] interior or facade in [지역영문], clean and bright, commercial space, photorealistic, no text"
  },
  {
    "card_number":4,"layout":"investment",
    "title":"임대 현황 · 투자 포인트",
    "highlight":"핵심 임대현황 한 줄",
    "body":"수익/투자 관련 부가 설명 (30자 이내)",
    "points":["투자포인트1 (수치 포함)","투자포인트2 (수치 포함)"],
    "image_prompt":"[건물유형] exterior in [지역영문], afternoon lighting, investment property vibe, photorealistic, no text"
  },
  {
    "card_number":5,"layout":"interior",
    "title":"내부 상태 · 실거주 매력",
    "checkpoints":["내부특징1 (사진분석 반영)","내부특징2","내부특징3","보너스특징"],
    "image_prompt":"[건물유형] interior room in Korea, natural light, clean, photorealistic, no text"
  },
  {
    "card_number":6,"layout":"cta",
    "title":"지금이 기회\\n놓치지 마세요",
    "price_badge":"매매가 OO억 OO만원",
    "cta":"지금 바로 문의하세요 →",
    "hashtags":["#지역태그","#매물유형태그","#투자태그","#부동산태그","#지역특성태그","#추가태그1","#추가태그2","#추가태그3"],
    "image_prompt":"[건물유형] exterior in [지역영문], golden hour, warm glow, photorealistic, no text"
  }
]}`
}

function buildKakaoSystemPrompt(): string {
  return `당신은 부동산 카카오톡 카드뉴스 제작 전문가입니다.
입지 분석 및 매물 정보를 바탕으로 정확히 6장의 카드뉴스 텍스트를 JSON 객체로 생성하세요.
카카오톡에 맞게 더 간결하고 정보 중심의 Bullet point 형식으로 작성하세요.
⚠️ 데이터에 없는 내용은 절대 추측하거나 지어내지 말 것. 근거 있는 정보만 포함하고, 없으면 해당 항목을 빈 배열이나 짧은 실제 내용으로 처리하세요.

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

    const { project_id, platform = 'instagram' as Platform, asset_urls = [], custom_instructions = '' } = await req.json()
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

    const billions = project.price ? Math.floor(project.price / 100000000) : 0
    const tenThousands = project.price ? Math.floor((project.price % 100000000) / 10000) : 0
    const priceText = project.price
      ? [billions > 0 ? `${billions}억` : '', tenThousands > 0 ? `${tenThousands}만원` : ''].filter(Boolean).join(' ') || `${project.price.toLocaleString()}원`
      : '가격 협의'

    const advantages = (location?.advantages ?? []).slice(0, 5)
      .map((a: string, i: number) => `${i + 1}. ${a}`).join('\n')

    // 사진 Vision 분석 (최대 4장)
    let photoAnalysis = ''
    const photoUrls: string[] = Array.isArray(asset_urls) ? asset_urls.slice(0, 4) : []
    if (photoUrls.length > 0) {
      try {
        photoAnalysis = await callOpenAIVision([
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: '이 부동산 매물 사진들을 분석해주세요. 다음을 한국어로 간략히 설명하세요 (각 항목 1~2문장):\n1) 건물/공간 외관 특징\n2) 내부 상태 및 컨디션\n3) 눈에 띄는 강점\n4) 개선이 필요한 부분 (있다면)'
              },
              ...photoUrls.map(url => ({
                type: 'image_url' as const,
                image_url: { url, detail: 'low' as const }
              }))
            ]
          }
        ], { maxTokens: 600, temperature: 0.3 })
        console.log('[generate-card-news] 사진 분석 완료')
      } catch (e) {
        console.warn('[generate-card-news] 사진 분석 실패 (무시):', e)
      }
    }

    const propertyType = project.property_type ?? '아파트'
    const address = project.address ?? ''
    // 주소에서 지역명 추출 (image_prompt 생성용)
    const regionHint = address.split(' ').slice(0, 3).join(' ')

    const userPrompt = `다음 매물로 ${platform === 'instagram' ? '인스타그램' : '카카오톡'} 카드뉴스 6장을 생성하세요:

주소: ${address}
유형: ${propertyType}
가격: ${priceText}${project.deposit ? ` / 보증금 ${Math.floor(project.deposit / 10000)}만원` : ''}${project.monthly_rent ? ` / 월세 ${Math.floor(project.monthly_rent / 10000)}만원` : ''}${project.key_money ? ` / 권리금 ${Math.floor(project.key_money / 10000)}만원` : ''}
면적: ${project.area ? `${project.area}㎡` : '미정'}
층수: ${project.floor ? `${project.floor}층` : '미정'}
방향: ${project.direction ?? '미정'}
건물 상태: ${project.building_condition || '미기재'}
특징: ${(project.features ?? []).join(', ') || '미기재'}

[층별 구성 - 공인중개사 직접 기록]
${project.floor_composition?.trim() || '정보 없음 - 3장 spec_grid는 알려진 내용만 기재'}

[임대 현황 - 공인중개사 직접 기록]
${project.rental_status?.trim() || '정보 없음 - 4장 임대현황은 억지로 채우지 말 것'}

[공인중개사 현장 메모 - 최우선 반영]
${project.note?.trim() || '없음'}

입지 장점:
${advantages || '입지 정보 없음'}${photoAnalysis ? `\n\n[AI 사진 분석 결과]\n${photoAnalysis}` : ''}

[image_prompt 작성 지침]
- 매물 유형 "${propertyType}", 지역 "${regionHint}" 을 반드시 반영할 것
- 각 카드 image_prompt에서 [매물유형], [지역명] 플레이스홀더를 실제 값으로 대체할 것
- 예: "[매물유형]" → "${propertyType} building", "[지역명]" → "${regionHint}"${custom_instructions ? `\n\n[공인중개사 추가 지시사항 - 반드시 최우선으로 반영]\n${custom_instructions}` : ''}`

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
