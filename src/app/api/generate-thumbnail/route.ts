import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createCanvas, loadImage, GlobalFonts, type SKRSContext2D } from '@napi-rs/canvas'
import path from 'path'

export const runtime = 'nodejs'

// 한글 폰트 등록 (서버리스 콜드스타트 1회)
let fontsReady = false
function ensureFonts() {
  if (fontsReady) return
  const dir = path.join(process.cwd(), 'public', 'fonts')
  GlobalFonts.registerFromPath(path.join(dir, 'NanumGothic-Regular.ttf'), 'NanumGothic')
  GlobalFonts.registerFromPath(path.join(dir, 'NanumGothic-Bold.ttf'), 'NanumGothic Bold')
  GlobalFonts.registerFromPath(path.join(dir, 'NanumGothic-ExtraBold.ttf'), 'NanumGothic ExtraBold')
  fontsReady = true
}

const W = 1080, H = 1080
const CREAM = '#faf8f4'
const NAVY = '#141a36'
const GRAY = '#5a6078'
const GRAY2 = '#787e96'
const AMBER = '#f59e0b'

// 둥근 알약(배지) 그리기 + 텍스트
function pill(ctx: SKRSContext2D, x: number, y: number, text: string, font: string, bg: string, fg: string, padx = 26, pady = 14) {
  ctx.font = font
  const m = ctx.measureText(text)
  const tw = m.width
  const asc = m.actualBoundingBoxAscent ?? 0
  const desc = m.actualBoundingBoxDescent ?? 0
  const th = asc + desc
  const h = th + pady * 2
  const w = tw + padx * 2
  ctx.fillStyle = bg
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, h / 2)
  ctx.fill()
  ctx.fillStyle = fg
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(text, x + padx, y + pady + asc)
  return { w, h }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '인증되지 않은 요청입니다' }, { status: 401 })

    const body = await req.json()
    const {
      photo_url,
      region = '',
      type_label = '',
      price_badge = '',
      badges = '',
      tag = '',
      project_id,
    } = body as {
      photo_url?: string
      region?: string
      type_label?: string
      price_badge?: string
      badges?: string
      tag?: string
      project_id?: string
    }

    if (!photo_url) return NextResponse.json({ error: '매물 사진(photo_url)이 필요합니다' }, { status: 400 })

    ensureFonts()

    const canvas = createCanvas(W, H)
    const ctx = canvas.getContext('2d')

    // 배경(크림)
    ctx.fillStyle = CREAM
    ctx.fillRect(0, 0, W, H)

    // 사진 (상단 66% 커버 크롭)
    const photoH = Math.round(H * 0.66)
    try {
      const res = await fetch(photo_url)
      const buf = Buffer.from(await res.arrayBuffer())
      const img = await loadImage(buf)
      const sr = Math.max(W / img.width, photoH / img.height)
      const dw = img.width * sr, dh = img.height * sr
      const dx = (W - dw) / 2, dy = (photoH - dh) / 2
      ctx.save()
      ctx.beginPath(); ctx.rect(0, 0, W, photoH); ctx.clip()
      ctx.drawImage(img, dx, dy, dw, dh)
      ctx.restore()
    } catch {
      ctx.fillStyle = '#dfe3ea'; ctx.fillRect(0, 0, W, photoH)
    }

    // 사진 위 지역 태그 (앰버 알약)
    if (tag) pill(ctx, 48, 44, tag, '32px "NanumGothic Bold"', AMBER, '#1e1400', 24, 12)

    // 하단 카드 텍스트
    const M = 56
    let cy = photoH + 44

    // 제목(지역) — 크게
    ctx.fillStyle = NAVY
    ctx.font = '72px "NanumGothic ExtraBold"'
    ctx.textBaseline = 'top'
    ctx.fillText(region, M, cy)
    cy += 92

    // 매물 유형 + 거래
    ctx.fillStyle = GRAY
    ctx.font = '58px "NanumGothic Bold"'
    ctx.fillText(type_label, M, cy)
    cy += 92

    // 가격 배지 (네이비 알약)
    if (price_badge) {
      const { h } = pill(ctx, M, cy, price_badge, '52px "NanumGothic Bold"', NAVY, '#ffffff', 30, 16)
      cy += h + 22
    }

    // 강점 배지들
    if (badges) {
      ctx.fillStyle = GRAY2
      ctx.font = '32px "NanumGothic Bold"'
      ctx.textBaseline = 'top'
      ctx.fillText(badges, M, cy)
    }

    const png = await canvas.encode('png')

    // Supabase Storage 업로드 (project-assets, service role)
    let stored_url = ''
    try {
      const { createClient: createSupa } = await import('@supabase/supabase-js')
      const admin = createSupa(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
      const objPath = `thumbnails/${project_id ?? user.id}/${Date.now()}.png`
      const { error: upErr } = await admin.storage.from('project-assets').upload(objPath, png, { contentType: 'image/png', upsert: true })
      if (!upErr) {
        const { data: pub } = admin.storage.from('project-assets').getPublicUrl(objPath)
        if (pub?.publicUrl) stored_url = pub.publicUrl
      } else {
        console.error('[thumbnail] storage upload failed:', upErr.message)
      }
    } catch (e) {
      console.error('[thumbnail] storage upload threw:', e)
    }

    if (!stored_url) {
      // 폴백: data URL (스토리지 실패 시)
      stored_url = `data:image/png;base64,${Buffer.from(png).toString('base64')}`
    }

    return NextResponse.json({ success: true, image_url: stored_url })
  } catch (e) {
    const message = e instanceof Error ? e.message : '썸네일 생성 실패'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
