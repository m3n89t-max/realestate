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

    // 요청 파싱
    const body = await req.json()
    const { project_id, style = 'informative', tone = 'professional', titles_only = false, content_id } = body

    // ── titles_only 모드: 기존 콘텐츠에 제목 5개만 재생성 ──────────────────
    if (titles_only && content_id) {
      // 기존 콘텐츠에서 project_id 파악
      const { data: existing, error: cErr } = await supabaseClient
        .from('generated_contents')
        .select('id, project_id, title')
        .eq('id', content_id)
        .single()
      if (cErr || !existing) throw new Error('콘텐츠를 찾을 수 없습니다')

      const pid = existing.project_id

      const { data: project, error: pError } = await supabaseClient
        .from('projects')
        .select('address, property_type, price, area, direction, features')
        .eq('id', pid)
        .single()
      if (pError || !project) throw new Error('프로젝트를 찾을 수 없습니다')

      const { data: location } = await supabaseClient
        .from('location_analyses')
        .select('advantages')
        .eq('project_id', pid)
        .single()

      const titlesPrompt = `다음 부동산 매물에 대해 SEO 최적화된 블로그 제목 5개를 JSON으로 반환하세요.
각 제목은 반드시 아래 5가지 스타일로 1개씩 작성하세요:
1. [정보형] 지역명+매물유형+핵심강점 나열
2. [후킹형] 강한 임팩트·긴박감 ("안 보면 후회", "지금 아니면 늦어요" 등)
3. [질문형] 독자 궁금증 자극 ("왜?", "어떻게?" 등)
4. [감성형] 라이프스타일·스토리텔링
5. [숫자형] 구체적 수치·거리·시간 강조

매물: ${maskPersonalInfo(project.address)} / ${project.property_type ?? '아파트'} / ${project.area ? project.area + '㎡' : ''} / ${project.direction ?? ''}
특징: ${project.features?.join(', ') ?? ''}
입지: ${location?.advantages?.slice(0, 3).join(', ') ?? ''}

출력 형식 (JSON만):
{"titles": ["제목1", "제목2", "제목3", "제목4", "제목5"]}`

      const responseText = await callOpenAI(
        [{ role: 'user', content: titlesPrompt }],
        { responseFormat: 'json', maxTokens: 800, temperature: 0.9 }
      )
      const result = JSON.parse(responseText)
      const newTitles: string[] = result.titles ?? []

      // DB 업데이트
      const { error: updateErr } = await supabaseClient
        .from('generated_contents')
        .update({ titles: newTitles, title: newTitles[0] ?? existing.title })
        .eq('id', content_id)
      if (updateErr) throw new Error(updateErr.message)

      return new Response(JSON.stringify({ success: true, titles: newTitles }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── 전체 블로그 생성 모드 ────────────────────────────────────────────────
    if (!project_id) throw new Error('project_id가 필요합니다')

    // 사용량 한도 확인
    await checkQuota(supabaseClient, orgId, 'generation')

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
      monthly_rent: project.monthly_rent,
      deposit: project.deposit,
      key_money: project.key_money,
      area: project.area,
      floor: project.floor,
      total_floors: project.total_floors,
      direction: project.direction,
      features: project.features,
      building_condition: project.building_condition,
      floor_composition: project.floor_composition,
      rental_status: project.rental_status,
      note: project.note,
      location_advantages: location?.advantages,
      nearby_facilities: location?.nearby_facilities,
      style,
      tone,
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

    // 동영상 에셋 조회 후 블로그 본문 마지막에 삽입
    const { data: videoAssets } = await supabaseClient
      .from('assets')
      .select('file_url, alt_text, category')
      .eq('project_id', project_id)
      .eq('type', 'video')
      .limit(3)

    if (videoAssets && videoAssets.length > 0) {
      const videoMd = videoAssets
        .map((v: any, i: number) =>
          `![${v.alt_text || `매물 영상 ${i + 1}`}](${v.file_url})\n*▲ ${v.category || '매물'} 영상 - 실제 현장 모습을 영상으로 확인하세요*`
        ).join('\n\n')
      result.content = (result.content ?? '') + '\n\n## 📹 매물 영상\n\n' + videoMd
    }

    // Supabase에 저장
    const { data: saved, error: saveError } = await supabaseClient
      .from('generated_contents')
      .insert({
        project_id,
        org_id: orgId,
        type: 'blog',
        title: result.titles?.[0] ?? '',
        titles: result.titles ?? [],
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
