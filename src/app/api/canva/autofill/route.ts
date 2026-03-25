import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { CanvaClient, refreshCanvaToken, CANVA_TEMPLATES, type CanvaAutofillData, type CanvaTemplateKey } from '@/lib/canva-client'

/**
 * CardSlide → Canva autofill data 변환
 * card.layout에 따라 적절한 필드를 매핑한다
 */
function buildAutofillData(card: Record<string, any>, assetId?: string): CanvaAutofillData {
  const data: CanvaAutofillData = {}

  if (card.title)       data['TITLE']       = { type: 'text', text: String(card.title).slice(0, 100) }
  if (card.subtitle)    data['SUBTITLE']    = { type: 'text', text: String(card.subtitle).slice(0, 80) }
  if (card.price_badge) data['PRICE_BADGE'] = { type: 'text', text: String(card.price_badge).slice(0, 40) }
  if (card.address)     data['ADDRESS']     = { type: 'text', text: String(card.address).slice(0, 80) }
  if (card.highlight)   data['HIGHLIGHT']   = { type: 'text', text: String(card.highlight).slice(0, 60) }
  if (card.body)        data['BODY']        = { type: 'text', text: String(card.body).slice(0, 200) }
  if (card.cta)         data['CTA']         = { type: 'text', text: String(card.cta).slice(0, 60) }

  const checkpoints: string[] = card.checkpoints ?? []
  checkpoints.slice(0, 4).forEach((pt: string, i: number) => {
    data[`POINT${i + 1}`] = { type: 'text', text: String(pt).slice(0, 60) }
  })

  const points: string[] = card.points ?? []
  points.slice(0, 2).forEach((pt: string, i: number) => {
    data[`POINT${checkpoints.length + i + 1}`] = { type: 'text', text: String(pt).slice(0, 60) }
  })

  if (card.spec_grid) {
    (card.spec_grid as { label: string; value: string }[]).slice(0, 6).forEach((spec, i) => {
      data[`SPEC${i + 1}_LABEL`] = { type: 'text', text: spec.label.slice(0, 20) }
      data[`SPEC${i + 1}_VAL`]   = { type: 'text', text: spec.value.slice(0, 30) }
    })
  }

  if (assetId) {
    data['BG_IMAGE'] = { type: 'image', asset_id: assetId }
  }

  return data
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { card, asset_id, content_id } = await req.json()
    if (!card?.layout) return NextResponse.json({ error: 'card.layout 필요' }, { status: 400 })

    // 템플릿 ID 확인
    const templateKey = card.layout as CanvaTemplateKey
    const templateId = CANVA_TEMPLATES[templateKey]
    if (!templateId) {
      return NextResponse.json({ error: `Canva 템플릿 미설정: CANVA_TEMPLATE_${templateKey.toUpperCase()} 환경변수를 확인하세요.` }, { status: 400 })
    }

    // org canva_token 가져오기
    const { data: membership } = await supabase
      .from('memberships').select('org_id').eq('user_id', user.id).not('joined_at', 'is', null).limit(1).single()
    if (!membership?.org_id) return NextResponse.json({ error: 'org 없음' }, { status: 400 })

    const admin = await createAdminClient()
    const { data: org } = await admin.from('organizations').select('canva_token').eq('id', membership.org_id).single()
    if (!org?.canva_token) return NextResponse.json({ error: 'Canva 미연결' }, { status: 400 })

    let token = org.canva_token as { access_token: string; refresh_token: string; expires_at: number; token_type: string }
    if (token.expires_at < Date.now() + 60_000) {
      const refreshed = await refreshCanvaToken(token.refresh_token)
      await admin.from('organizations').update({ canva_token: refreshed }).eq('id', membership.org_id)
      token = refreshed
    }

    const client = new CanvaClient(token.access_token)

    // autofill 실행
    const autofillData = buildAutofillData(card, asset_id)
    const jobId = await client.createAutofillJob(templateId, autofillData)
    const designId = await client.pollAutofillJob(jobId)

    // content_id가 있으면 canva_design_id 저장
    if (content_id) {
      await admin.from('generated_contents').update({ canva_design_id: designId }).eq('id', content_id)
    }

    return NextResponse.json({
      design_id: designId,
      edit_url: `https://www.canva.com/design/${designId}/edit`,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
