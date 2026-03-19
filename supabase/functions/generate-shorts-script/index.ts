import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors } from '../_shared/cors.ts'
import { getAuthenticatedUser, getOrgId } from '../_shared/auth.ts'
import { callOpenAI } from '../_shared/openai.ts'
import { maskPersonalInfo } from '../_shared/masking.ts'
import { ok, err } from '../_shared/response.ts'
import { buildShortsSystemPrompt } from '../_shared/shorts-prompt.ts'

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const { user, supabaseClient } = await getAuthenticatedUser(req)
    const orgId = await getOrgId(supabaseClient, user.id)

    const { project_id } = await req.json()
    if (!project_id) throw new Error('project_id가 필요합니다')

    const { data: project, error: pError } = await supabaseClient
      .from('projects')
      .select('*')
      .eq('id', project_id)
      .single()
    if (pError || !project) throw new Error('프로젝트를 찾을 수 없습니다')

    const [{ data: location }, { data: assets }] = await Promise.all([
      supabaseClient
        .from('location_analyses')
        .select('advantages, analysis_text')
        .eq('project_id', project_id)
        .single(),
      supabaseClient
        .from('assets')
        .select('file_url, type, file_name, sort_order')
        .eq('project_id', project_id)
        .order('sort_order'),
    ])

    const maskedAddress = maskPersonalInfo(project.address ?? '')
    const priceText = project.price
      ? `${Math.floor(project.price / 100000000)}억${Math.floor((project.price % 100000000) / 10000) > 0 ? ` ${Math.floor((project.price % 100000000) / 10000)}만원` : '원'}`
      : '가격 협의'

    const locationInfo = location
      ? `\n입지 장점: ${(location.advantages ?? []).join(', ')}\n입지 요약: ${location.analysis_text ?? ''}`
      : ''

    const imageAssets = (assets ?? []).filter(a => a.type === 'image').slice(0, 6)
    const videoAssets = (assets ?? []).filter(a => a.type === 'video')

    const assetInfo = [
      imageAssets.length > 0 ? `업로드된 사진 ${imageAssets.length}장 (카드뉴스·썸네일 활용 가능)` : '',
      videoAssets.length > 0 ? `업로드된 동영상 ${videoAssets.length}개 (${videoAssets.map(v => v.file_name).join(', ')}) - 쇼츠 편집 소스로 활용 가능` : '',
    ].filter(Boolean).join('\n')

    const userPrompt = `다음 매물에 대한 유튜브 쇼츠 스크립트를 작성하세요:

주소: ${maskedAddress}
매물 유형: ${project.property_type ?? '아파트'}
가격: ${priceText}
면적: ${project.area ? `${project.area}㎡` : ''}
층수: ${project.floor ? `${project.floor}층` : ''}
방향: ${project.direction ?? ''}
특징: ${(project.features ?? []).join(', ')}${locationInfo}
${assetInfo ? `\n[업로드된 미디어]\n${assetInfo}` : ''}

[작성 가이드]
1. hook은 시청자가 멈춰보게 만드는 강렬한 첫 문장
2. 장면1: 매물 핵심 소개 / 장면2-4: 주요 장점 / 장면5: 투자 가치 / 장면6: CTA
3. visual_description에 업로드된 사진/동영상 활용 방법을 구체적으로 지시할 것
4. 해시태그 15개 이상 (지역명, 매물유형, 투자 키워드 포함)`

    // 업로드된 사진이 있으면 vision 분석 포함
    const messages: { role: string; content: string | { type: string; text?: string; image_url?: { url: string } }[] }[] = [
      { role: 'system', content: buildShortsSystemPrompt() },
    ]

    if (imageAssets.length > 0) {
      const contentParts: { type: string; text?: string; image_url?: { url: string } }[] = [
        { type: 'text', text: userPrompt },
        ...imageAssets.map(a => ({ type: 'image_url', image_url: { url: a.file_url } })),
      ]
      messages.push({ role: 'user', content: contentParts as never })
    } else {
      messages.push({ role: 'user', content: userPrompt })
    }

    const responseText = await callOpenAI(
      messages as never,
      { responseFormat: 'json', maxTokens: 2500, temperature: 0.8 }
    )

    const script = JSON.parse(responseText)

    const { data: saved, error: saveError } = await supabaseClient
      .from('generated_contents')
      .insert({
        project_id,
        org_id: orgId,
        type: 'video_script',
        title: `쇼츠 스크립트 - ${maskedAddress}`,
        content: responseText,
        tags: script.hashtags,
        version: 1,
      })
      .select('id')
      .single()

    if (saveError) throw saveError

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: taskRecord } = await adminClient
      .from('tasks')
      .insert({
        org_id: orgId,
        project_id,
        type: 'generate_shorts_script',
        status: 'success',
        payload: { project_id },
        result: { content_id: saved.id },
        progress_pct: 100,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    await adminClient.rpc('increment_usage', { p_org_id: orgId, p_type: 'generation', p_amount: 1 })

    return ok(
      {
        content_id: saved.id,
        task_id: taskRecord?.id ?? null,
        hook: script.hook,
        scenes: script.scenes,
        hashtags: script.hashtags,
      },
      { org_id: orgId, task_id: taskRecord?.id }
    )

  } catch (error) {
    console.error('[generate-shorts-script]', error)
    const message = error instanceof Error ? error.message : '쇼츠 스크립트 생성에 실패했습니다'
    return err(message, 400)
  }
})
