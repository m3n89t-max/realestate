import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors } from '../_shared/cors.ts'
import { checkQuota, getAuthenticatedUser, getOrgId } from '../_shared/auth.ts'
import { callGemini, callGeminiVision, type VisionContent } from '../_shared/gemini.ts'
import { maskPersonalInfo } from '../_shared/masking.ts'
import { ok, err } from '../_shared/response.ts'
import { buildShortsSystemPrompt } from '../_shared/shorts-prompt.ts'
import {
  PRICE_UNKNOWN_PROMPT_RULE,
  assertRenderablePriceSource,
  buildPriceSourcePromptBlock,
  formatKeyMoney,
  formatPriceOrUnknown,
  formatPriceSourceLabel,
} from '../_shared/price-source.ts'

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const { user, supabaseClient } = await getAuthenticatedUser(req)
    const orgId = await getOrgId(supabaseClient, user.id)
    await checkQuota(supabaseClient, orgId, 'generation')

    const { project_id, custom_instructions = '' } = await req.json()
    if (!project_id) throw new Error('project_id가 필요합니다')

    const { data: project, error: pError } = await supabaseClient
      .from('projects')
      .select('*')
      .eq('id', project_id)
      .single()
    if (pError || !project) throw new Error('프로젝트를 찾을 수 없습니다')

    // ── 렌더 실패 규칙 ───────────────────────────────────────────────────────
    // 값유형이 '실거래' 또는 '호가'인데 출처명/기준일이 비어 있으면
    // 쇼츠 대본을 만들지 않고 명확한 한국어 오류로 실패시킨다.
    assertRenderablePriceSource(project, 'shorts')
    const priceSourceLabel = formatPriceSourceLabel(project)
    const priceSourceBlock = buildPriceSourcePromptBlock(project)

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
    // 이전에는 project.price 만 읽어서 전세·월세 매물의 금액이 프롬프트에
    // 전혀 들어가지 않았고, 모델이 추측 표기로 채웠다.
    // 거래유형에 맞는 금액(보증금·월세·권리금)을 모두 넘기고,
    // 미입력은 PRICE_UNKNOWN_TEXT 로 넘겨 모델이 금액을 지어내지 못하게 한다.
    const txType: string = project.transaction_type ?? 'sale'
    const priceLines: string[] = []
    if (txType === 'rent') {
      priceLines.push(`거래 유형: 월세`)
      priceLines.push(`보증금: ${formatPriceOrUnknown(project.deposit)}`)
      priceLines.push(`월세: ${formatPriceOrUnknown(project.monthly_rent)}`)
    } else if (txType === 'lease') {
      priceLines.push(`거래 유형: 전세`)
      priceLines.push(`전세 보증금: ${formatPriceOrUnknown(project.deposit)}`)
    } else {
      priceLines.push(`거래 유형: 매매`)
      priceLines.push(`매매가: ${formatPriceOrUnknown(project.price)}`)
    }
    // 권리금은 미입력과 '무권리'(실제 0원)를 구분해 넘긴다.
    priceLines.push(`권리금: ${formatKeyMoney(project.key_money)}`)
    const priceText = priceLines.join('\n')

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
${priceText}
가격 출처 (나레이션·자막에서 금액을 말할 때 반드시 함께 표기): ${priceSourceLabel}
${PRICE_UNKNOWN_PROMPT_RULE}
면적: ${project.area ? `${project.area}㎡` : ''}
층수: ${project.floor ? `${project.floor}층` : ''}
방향: ${project.direction ?? ''}
특징: ${(project.features ?? []).join(', ')}${locationInfo}
${assetInfo ? `\n[업로드된 미디어]\n${assetInfo}` : ''}

${priceSourceBlock}

[작성 가이드]
1. hook은 시청자가 멈춰보게 만드는 강렬한 첫 문장
2. 장면1: 매물 핵심 소개 / 장면2-4: 주요 장점 / 장면5: 투자 가치 / 장면6: CTA
3. visual_description에 업로드된 사진/동영상 활용 방법을 구체적으로 지시할 것
4. 해시태그 15개 이상 (지역명, 매물유형, 투자 키워드 포함)${custom_instructions ? `\n\n[공인중개사 추가 지시사항 - 반드시 최우선으로 반영]\n${custom_instructions}` : ''}`

    // 업로드된 사진이 있으면 vision 분석 포함.
    // 사진이 있을 때는 비전 클라이언트(callGeminiVision)를 써야 한다.
    // 텍스트 전용 callGemini 에 배열 content 를 넘기면 payload 의 text 가 배열이 되어
    // Gemini 가 INVALID_ARGUMENT 로 거절한다(과거 장애 원인).
    const systemPrompt = buildShortsSystemPrompt()
    const textOnlyRequest = () =>
      callGemini(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        { responseFormat: 'json', maxTokens: 8192, temperature: 0.8 }
      )

    let responseText: string

    if (imageAssets.length > 0) {
      const contentParts: VisionContent[] = [
        { type: 'text', text: userPrompt },
        ...imageAssets.map(a => ({ type: 'image_url' as const, image_url: { url: a.file_url } })),
      ]
      try {
        responseText = await callGeminiVision(
          [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: contentParts },
          ],
          { responseFormat: 'json', maxTokens: 8192, temperature: 0.8 }
        )
      } catch (visionError) {
        // 사진을 못 읽어도 매물 정보만으로 스크립트는 만들 수 있다.
        // 여기서 그대로 실패시키면 사용자는 결과를 전혀 받지 못한다.
        console.warn('[generate-shorts-script] 사진 분석 실패, 텍스트로 생성:', visionError)
        responseText = await textOnlyRequest()
      }
    } else {
      responseText = await textOnlyRequest()
    }

    // 모델이 JSON 이 아닌 응답을 주면 JSON.parse 가 터져 사용자에게는 원인 모를 오류만 남는다.
    let script: { hashtags?: string[]; [key: string]: unknown }
    try {
      script = JSON.parse(responseText)
    } catch {
      throw new Error(
        '쇼츠 스크립트 생성 결과를 해석할 수 없습니다. 잠시 후 다시 시도해 주세요.',
      )
    }

    const { data: latestVersion } = await supabaseClient
      .from('generated_contents')
      .select('version')
      .eq('project_id', project_id)
      .eq('type', 'video_script')
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()

    const { data: saved, error: saveError } = await supabaseClient
      .from('generated_contents')
      .insert({
        project_id,
        org_id: orgId,
        type: 'video_script',
        title: `쇼츠 스크립트 - ${maskedAddress}`,
        content: responseText,
        tags: script.hashtags,
        version: (latestVersion?.version ?? 0) + 1,
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
