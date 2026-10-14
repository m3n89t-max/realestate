import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { renderCardImage, type PhotoFallbackReason } from '@/lib/card-image-renderer'
import { normalizeCardSlide, type CardPlatform } from '@/lib/card-news-contract'
import { PriceSourceError, type PriceSourceMeta } from '@/lib/price-source'

export const runtime = 'nodejs'

interface CardImageRequest {
  card: Record<string, unknown>
  photo_url?: string
  project_id: string
  platform?: CardPlatform
  region?: string
}

const MAX_PHOTO_BYTES = 15 * 1024 * 1024

async function downloadPhoto(url?: string): Promise<{ buffer?: Buffer; reason?: PhotoFallbackReason }> {
  if (!url?.trim()) return { reason: 'no_assets' }
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return { reason: 'fetch_failed' }
    const response = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: 'error' })
    if (!response.ok) return { reason: 'fetch_failed' }
    const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
    const declaredLength = Number(response.headers.get('content-length') ?? 0)
    if (!contentType.startsWith('image/') || declaredLength > MAX_PHOTO_BYTES) return { reason: 'fetch_failed' }
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.byteLength > MAX_PHOTO_BYTES) return { reason: 'fetch_failed' }
    return { buffer }
  } catch {
    return { reason: 'fetch_failed' }
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '인증되지 않은 요청입니다' }, { status: 401 })

    const body = await req.json() as CardImageRequest
    if (!body.card) return NextResponse.json({ error: 'card 데이터가 필요합니다' }, { status: 400 })
    if (!body.project_id?.trim()) return NextResponse.json({ error: 'project_id가 필요합니다' }, { status: 400 })
    if (body.platform !== undefined && body.platform !== 'instagram' && body.platform !== 'kakao') {
      return NextResponse.json({ error: 'platform은 instagram 또는 kakao 이어야 합니다' }, { status: 400 })
    }
    const platform: CardPlatform = body.platform ?? 'instagram'

    let project: (PriceSourceMeta & { address?: string | null; org_id?: string | null }) | null = null
    let contact: { officeName?: string; phone?: string; registrationNumber?: string } | undefined
    let approvedPhotoUrl: string | undefined
    if (body.project_id) {
      const { data, error } = await supabase
        .from('projects')
        .select('address,org_id,value_type,source_name,source_date,source_channel')
        .eq('id', body.project_id)
        .single()
      if (error || !data) return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다' }, { status: 404 })
      project = data
      if (data.org_id) {
        const { data: organization } = await supabase
          .from('organizations')
          .select('name,phone,business_number')
          .eq('id', data.org_id)
          .single()
        if (organization) {
          contact = {
            officeName: organization.name ?? undefined,
            phone: organization.phone ?? undefined,
            registrationNumber: organization.business_number ?? undefined,
          }
        }
      }
      if (body.photo_url?.trim()) {
        const { data: asset } = await supabase
          .from('assets')
          .select('file_url')
          .eq('project_id', body.project_id)
          .eq('file_url', body.photo_url)
          .maybeSingle()
        approvedPhotoUrl = asset?.file_url
      }
    }

    const card = normalizeCardSlide(body.card, Number(body.card.order ?? body.card.card_number ?? 1) - 1, platform)
    // 클라이언트가 임의 URL을 주입할 수 없도록 이 프로젝트에 실제 업로드된 asset URL만 내려받는다.
    const photo = card.layout === 'cta' ? {} : await downloadPhoto(approvedPhotoUrl)
    const priceSource = project ?? {}
    const region = body.region ?? project?.address?.split(' ').slice(0, 3).join(' ') ?? ''
    const rendered = await renderCardImage({
      card,
      platform,
      priceSource,
      region,
      contact,
      photoBuffer: photo.buffer,
      photoFallbackReason: photo.reason,
    })

    let storedUrl = `data:image/png;base64,${rendered.png.toString('base64')}`
    try {
      const { createClient: createAdminClient } = await import('@supabase/supabase-js')
      const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
      const objectPath = `card-news/${body.project_id ?? user.id}/${Date.now()}-card${card.order}.png`
      const { error: uploadError } = await admin.storage
        .from('project-assets')
        .upload(objectPath, rendered.png, { contentType: 'image/png', upsert: true })
      if (!uploadError) {
        const { data } = admin.storage.from('project-assets').getPublicUrl(objectPath)
        if (data.publicUrl) storedUrl = data.publicUrl
      } else {
        console.error('[card-image] storage upload failed, falling back to data URL:', uploadError.message)
      }
    } catch (error) {
      console.error('[card-image] storage upload threw, falling back to data URL:', error)
    }

    return NextResponse.json({
      success: true,
      image_url: storedUrl,
      card_number: card.order,
      layout_used: rendered.layoutUsed,
      photo_fallback_reason: rendered.photoFallbackReason,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '카드 이미지 생성 실패'
    return NextResponse.json({ error: message }, { status: error instanceof PriceSourceError ? 400 : 500 })
  }
}
