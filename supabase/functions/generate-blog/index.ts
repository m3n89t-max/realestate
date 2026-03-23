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
    const { project_id, style = 'informative', tone, format, focus, titles_only = false, content_id } = body

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

    // 조직 정보 조회 (매물 정보표 에이전시 행)
    const { data: org } = await supabaseClient
      .from('organizations').select('name, phone, address, business_number').eq('id', orgId).single()

    // 매물 정보표 HTML (블로그 "## 매물 개요" 섹션에 삽입)
    const fmt = (won?: number) => {
      if (!won) return '-'
      const e = Math.floor(won / 100000000), m = Math.floor((won % 100000000) / 10000)
      return e > 0 && m > 0 ? `${e}억 ${m}만원` : e > 0 ? `${e}억원` : `${m}만원`
    }
    const fmtArea = (sqm?: number) => sqm ? `${sqm}㎡(${(sqm * 0.3025).toFixed(0)}평)` : '-'
    const txMap: Record<string, string> = { sale: '매매', lease: '전세', rent: '임대' }
    const txType = txMap[project.transaction_type ?? 'sale'] ?? '매매'
    const priceLabel = project.transaction_type === 'rent' ? '보증금/임대료' : project.transaction_type === 'lease' ? '전세보증금' : '매매가'
    const priceVal = project.transaction_type === 'rent'
      ? `${fmt(project.deposit)} / ${fmt(project.monthly_rent)}`
      : project.transaction_type === 'lease' ? fmt(project.deposit) : fmt(project.price)
    const agRow = org ? `<tr><td colspan="6" style="border:1px solid #bbb;padding:8px 12px;background:#f5f5f5;font-size:12px;color:#444;line-height:1.8;">${org.name ? `■ 상호: ${org.name}&nbsp;&nbsp;` : ''}${org.business_number ? `■ 중개등록번호: ${org.business_number}&nbsp;&nbsp;` : ''}${org.address ? `■ 주소: ${org.address}&nbsp;&nbsp;` : ''}${org.phone ? `■ 전화번호: ${org.phone}` : ''}</td></tr>` : ''
    const s = 'border:1px solid #bbb;padding:6px 10px;', h = s + 'background:#dbeafe;font-weight:bold;'
    const propertyTableHtml = `<table style="width:100%;border-collapse:collapse;font-size:13px;margin:16px 0;"><tbody><tr><td style="${h}">소재지</td><td style="${s}" colspan="3">${maskPersonalInfo(project.address)}</td><td style="${h}">중개대상물 종류</td><td style="${s}">${project.property_category || '-'}</td></tr><tr><td style="${h}">주용도</td><td style="${s}">${project.main_use || '-'}</td><td style="${h}">해당층/총층</td><td style="${s}">${project.floor != null || project.total_floors != null ? `${project.floor ?? '-'}층/${project.total_floors ?? '-'}층` : '-'}</td><td style="${h}">거래형태</td><td style="${s}">${txType}</td></tr><tr><td style="${h}">대지면적</td><td style="${s}">${fmtArea(project.land_area)}</td><td style="${h}">사용승인일</td><td style="${s}">${project.approval_date || '-'}</td><td style="${h}">연면적</td><td style="${s}">${fmtArea(project.total_area)}</td></tr><tr><td style="${h}">전용면적</td><td style="${s}">${fmtArea(project.area)}</td><td style="${h}">방/화장실</td><td style="${s}">${project.rooms_count != null || project.bathrooms_count != null ? `${project.rooms_count ?? '-'}/${project.bathrooms_count ?? '-'}` : '-'}</td><td style="${h}">주차</td><td style="${s}">${project.parking_legal != null || project.parking_actual != null ? `대장:${project.parking_legal ?? '-'}대/실:${project.parking_actual ?? '-'}대` : '-'}</td></tr><tr><td style="${h}">${priceLabel}</td><td style="${s}color:#dc2626;font-weight:bold;">${priceVal}</td><td style="${h}">입주가능일</td><td style="${s}">${project.move_in_date || '협의'}</td><td style="${h}">방향</td><td style="${s}">${project.direction || '-'}</td></tr><tr><td style="${h}">권리금</td><td style="${s}">${project.key_money ? fmt(project.key_money) : '무권리'}</td><td style="${h}">관리비</td><td style="${s}" colspan="3">${project.management_fee_detail || '-'}</td></tr>${agRow}</tbody></table>`

    // 프롬프트 컨텍스트 구성 (개인정보 마스킹)
    const ctx: BlogPromptContext = {
      address: maskPersonalInfo(project.address),
      property_type: project.property_type ?? '아파트',
      property_category: project.property_category,
      main_use: project.main_use,
      transaction_type: project.transaction_type,
      price: project.price,
      monthly_rent: project.monthly_rent,
      deposit: project.deposit,
      key_money: project.key_money,
      area: project.area,
      land_area: project.land_area,
      total_area: project.total_area,
      floor: project.floor,
      total_floors: project.total_floors,
      rooms_count: project.rooms_count,
      bathrooms_count: project.bathrooms_count,
      direction: project.direction,
      approval_date: project.approval_date,
      parking_legal: project.parking_legal,
      parking_actual: project.parking_actual,
      move_in_date: project.move_in_date,
      management_fee_detail: project.management_fee_detail,
      features: project.features,
      building_condition: project.building_condition,
      floor_composition: project.floor_composition,
      rental_status: project.rental_status,
      note: project.note,
      location_advantages: location?.advantages,
      nearby_facilities: location?.nearby_facilities,
      style,
      tone,
      format,
      focus,
      photo_urls: (assets ?? []).map((a: any) => ({
        url: a.file_url,
        alt: a.alt_text || a.category || '매물사진',
        category: a.category,
      })),
      property_table_html: propertyTableHtml,
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
