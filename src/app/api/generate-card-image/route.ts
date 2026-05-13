import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const GEMINI_MODEL = 'gemini-3.1-flash-image-preview'

const CARD_STYLE: Record<string, string> = {
  cover:       '커버 카드: 매물의 첫 인상. 제목은 크고 굵게 중앙 하단, 어두운 그라디언트 오버레이, 프리미엄 느낌.',
  location:    '입지 카드: 교통/편의시설 강조. 체크포인트를 아이콘과 함께 리스트업.',
  composition: '구성 카드: 평면도/내부 구성 설명. 항목별 정보를 깔끔하게 그리드 배치.',
  investment:  '투자 카드: 가치 상승 포인트 강조. 수치와 키워드를 임팩트 있게.',
  interior:    '내부 카드: 실내 특장점 강조. 고급스러운 분위기와 디테일.',
  cta:         'CTA 카드: 문의 유도. 가격/연락처를 명확하게. 해시태그 하단 배치.',
}

function buildCardPrompt(layout: string, card: Record<string, any>): string {
  const style = CARD_STYLE[layout] ?? CARD_STYLE.cover
  const lines: string[] = [
    `한국 부동산 카드뉴스 이미지를 생성해주세요. 인스타그램용 정사각형(1:1) 비율.`,
    `카드 유형: ${style}`,
    ``,
    `※ 제공된 매물 사진을 배경으로 활용하고 아래 텍스트를 이미지 위에 한국어로 직접 렌더링해주세요.`,
    ``,
  ]

  if (card.title)       lines.push(`제목: ${card.title}`)
  if (card.subtitle)    lines.push(`부제목: ${card.subtitle}`)
  if (card.price_badge) lines.push(`가격: ${card.price_badge}`)
  if (card.address)     lines.push(`주소: ${card.address}`)
  if (card.highlight)   lines.push(`강조: ${card.highlight}`)
  if (card.body)        lines.push(`본문: ${card.body}`)

  if (Array.isArray(card.checkpoints) && card.checkpoints.length) {
    lines.push(`핵심포인트: ${card.checkpoints.filter(Boolean).join(' / ')}`)
  }
  if (Array.isArray(card.points) && card.points.length) {
    lines.push(`포인트: ${card.points.filter(Boolean).join(' / ')}`)
  }
  if (Array.isArray(card.hashtags) && card.hashtags.length) {
    lines.push(`해시태그: ${card.hashtags.filter(Boolean).slice(0, 8).join(' ')}`)
  }
  if (card.cta) lines.push(`CTA: ${card.cta}`)

  lines.push(``)
  lines.push(`디자인 요구사항:`)
  lines.push(`- 매물 사진을 배경으로 사용 (사진이 없으면 한국 아파트 분위기로 대체)`)
  lines.push(`- 텍스트는 흰색 또는 금색으로 가독성 있게 오버레이`)
  lines.push(`- 전문적이고 고급스러운 부동산 마케팅 카드 스타일`)
  lines.push(`- 카드 번호: ${card.order ?? 1}/6`)

  return lines.join('\n')
}

async function fetchImageAsBase64(url: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    const contentType = res.headers.get('content-type') ?? 'image/jpeg'
    const mimeType = contentType.split(';')[0].trim()
    return { data: Buffer.from(buf).toString('base64'), mimeType }
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '인증되지 않은 요청입니다' }, { status: 401 })

    const body = await req.json()
    const { card, photo_url, project_id } = body as {
      card: Record<string, any>
      photo_url?: string
      project_id?: string
    }

    if (!card) return NextResponse.json({ error: 'card 데이터가 필요합니다' }, { status: 400 })

    const apiKey = process.env.GOOGLE_AI_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'GOOGLE_AI_API_KEY가 설정되지 않았습니다' }, { status: 500 })

    const prompt = buildCardPrompt(card.layout ?? 'cover', card)

    // 멀티모달 파츠 구성 (사진 + 텍스트)
    const parts: any[] = []
    if (photo_url) {
      const img = await fetchImageAsBase64(photo_url)
      if (img) {
        parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } })
      }
    }
    parts.push({ text: prompt })

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
        }),
      }
    )

    const data = await res.json()
    if (!res.ok) {
      console.error('[nano-banana] error:', JSON.stringify(data).slice(0, 300))
      return NextResponse.json({ error: data.error?.message ?? 'Nano Banana 호출 실패' }, { status: 500 })
    }

    const responseParts: any[] = data.candidates?.[0]?.content?.parts ?? []
    const imagePart = responseParts.find((p: any) => p.inlineData?.mimeType?.startsWith('image/'))
    if (!imagePart) {
      const textPart = responseParts.find((p: any) => p.text)
      console.error('[nano-banana] no image in response. text:', textPart?.text?.slice(0, 200))
      return NextResponse.json({ error: '이미지를 생성하지 못했습니다' }, { status: 500 })
    }

    const { mimeType, data: b64 } = imagePart.inlineData

    // Supabase Storage 업로드
    let stored_url = `data:${mimeType};base64,${b64}`
    try {
      const buf = Buffer.from(b64, 'base64')
      const ext = mimeType === 'image/png' ? 'png' : 'jpg'
      const path = `card-news/${project_id ?? user.id}/${Date.now()}-card${card.order ?? 1}.${ext}`
      const { createClient: createSupa } = await import('@supabase/supabase-js')
      const admin = createSupa(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
      const { error: upErr } = await admin.storage
        .from('assets')
        .upload(path, buf, { contentType: mimeType, upsert: true })
      if (!upErr) {
        const { data: pub } = admin.storage.from('assets').getPublicUrl(path)
        if (pub?.publicUrl) stored_url = pub.publicUrl
      }
    } catch { /* fallback to data URL */ }

    return NextResponse.json({ success: true, image_url: stored_url, card_number: card.order })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Nano Banana 이미지 생성 실패'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
