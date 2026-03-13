import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { getAuthenticatedUser, getOrgId, checkQuota } from '../_shared/auth.ts'
import { callOpenAI, countTokens } from '../_shared/openai.ts'
import { maskPersonalInfo } from '../_shared/masking.ts'
import { buildBlogSystemPrompt, buildBlogUserPrompt, type BlogPromptContext } from '../_shared/seo-prompt.ts'

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    // 인증
    const { user, supabaseClient } = await getAuthenticatedUser(req)
    const orgId = await getOrgId(supabaseClient, user.id)

    // 사용량 한도 확인
    await checkQuota(supabaseClient, orgId, 'generation')

    // 요청 파싱
    const { project_id, style = 'informative' } = await req.json()
    if (!project_id) throw new Error('project_id가 필요합니다')

    // 프로젝트 데이터 조회
    const { data: project, error: pError } = await supabaseClient
      .from('projects')
      .select('*')
      .eq('id', project_id)
      .single()
    if (pError || !project) throw new Error('프로젝트를 찾을 수 없습니다')

    // 입지 분석 데이터 조회
    const { data: location } = await supabaseClient
      .from('location_analyses')
      .select('*')
      .eq('project_id', project_id)
      .single()

    // 매물 사진 조회
    const { data: assets } = await supabaseClient
      .from('assets')
      .select('file_url, alt_text, category, is_cover')
      .eq('project_id', project_id)
      .eq('type', 'image')
      .order('is_cover', { ascending: false })
      .order('sort_order', { ascending: true })
      .limit(10)

    // 기존 버전 번호 조회
    const { data: existing } = await supabaseClient
      .from('generated_contents')
      .select('version')
      .eq('project_id', project_id)
      .eq('type', 'blog')
      .order('version', { ascending: false })
      .limit(1)
      .single()

    const nextVersion = (existing?.version ?? 0) + 1

    // 프롬프트 컨텍스트 구성 (개인정보 마스킹)
    const ctx: BlogPromptContext = {
      address: maskPersonalInfo(project.address),
      property_type: project.property_type ?? '아파트',
      price: project.price,
      area: project.area,
      floor: project.floor,
      total_floors: project.total_floors,
      direction: project.direction,
      features: project.features,
      location_advantages: location?.advantages,
      nearby_facilities: location?.nearby_facilities,
      style,
      photo_urls: (assets ?? []).map((a: any) => ({
        url: a.file_url,
        alt: a.alt_text || a.category || '매물사진',
        category: a.category,
      })),
    }

    // OpenAI API 호출
    const systemPrompt = buildBlogSystemPrompt()
    const userPrompt = buildBlogUserPrompt(ctx)
    const tokenEstimate = countTokens(systemPrompt + userPrompt)

    const responseText = await callOpenAI(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { responseFormat: 'json', maxTokens: 5000, temperature: 0.7 }
    )

    // JSON 파싱
    const result = JSON.parse(responseText)

    // Supabase에 저장
    const { data: saved, error: saveError } = await supabaseClient
      .from('generated_contents')
      .insert({
        project_id,
        org_id: orgId,
        type: 'blog',
        title: result.titles?.[0] ?? '',
        content: result.content,
        meta_description: result.meta_description,
        tags: result.tags,
        seo_score: result.seo_score,
        faq: result.faq,
        version: nextVersion,
      })
      .select()
      .single()

    if (saveError) throw new Error(saveError.message)

    // 사용량 기록
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    await adminClient.rpc('increment_usage', { p_org_id: orgId, p_type: 'generation', p_amount: 1 })
    await adminClient.rpc('increment_usage', { p_org_id: orgId, p_type: 'token', p_amount: tokenEstimate })

    return new Response(JSON.stringify({
      success: true,
      content_id: saved.id,
      titles: result.titles,
      seo_score: result.seo_score,
      version: nextVersion,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[generate-blog]', err)
    const message = err instanceof Error ? err.message : '블로그 생성에 실패했습니다'
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
