import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const GEMINI_MODEL = 'gemini-3.1-flash-image-preview'

const CARD_LAYOUT_GUIDE: Record<string, { zone: string; overlay: string; style: string }> = {
  cover: {
    zone:    '사진이 화면 상단 60~70%를 선명하게 채우고, 하단 30~40%에만 반투명 그라디언트(아래→위 검정 그라디언트, opacity 75%) 적용. 텍스트는 하단 영역에만 배치.',
    overlay: '상단 사진 영역은 밝고 선명하게 유지. 오버레이 금지.',
    style:   '제목은 크고 굵은 흰색(또는 금색). 가격 배지는 반투명 흰색 박스.',
  },
  location: {
    zone:    '사진이 상단 45~55%를 선명하게 차지. 하단 절반은 어두운 네이비/차콜 배경. 텍스트는 하단 영역.',
    overlay: '상단 사진 영역 오버레이 없음. 사진 색상/밝기 그대로.',
    style:   '체크포인트는 아이콘(원형 불릿) + 흰색 텍스트 리스트.',
  },
  composition: {
    zone:    '사진이 우측 또는 상단 45%를 선명하게 차지. 나머지 영역은 진한 네이비 또는 차콜 배경. 텍스트는 사진과 겹치지 않는 배경 영역에.',
    overlay: '사진 영역은 필터 없이 원본 그대로.',
    style:   '깔끔한 그리드 레이아웃. 금색 액센트 포인트.',
  },
  investment: {
    zone:    '사진이 하단 40~50%를 선명하게 차지. 상단은 진한 배경(차콜/네이비). 텍스트와 수치는 상단 영역에.',
    overlay: '하단 사진 영역은 약한 그라디언트만 (상→하, opacity 30% 이하). 사진이 뚜렷하게 보여야 함.',
    style:   '임팩트 있는 굵은 숫자/수치. 강조 키워드는 금색.',
  },
  interior: {
    zone:    '사진이 화면 전체를 채움. 하단 35~40%에만 그라디언트 오버레이(opacity 80%). 텍스트는 하단.',
    overlay: '상단 65% 사진 영역은 밝고 선명하게. 오버레이 없음.',
    style:   '고급스러운 흰색 타이포그래피. 특장점 리스트.',
  },
  cta: {
    zone:    '사진이 상단 55%를 선명하게 차지. 하단 45%는 진한 배경. CTA 버튼은 하단 중앙.',
    overlay: '사진은 선명하게. 하단 배경 영역에 텍스트와 버튼 배치.',
    style:   '해시태그는 작은 크기로 줄바꿈. CTA 버튼은 흰색 또는 브랜드 색상 박스.',
  },
}

function buildCardPrompt(layout: string, card: Record<string, any>): string {
  const guide = CARD_LAYOUT_GUIDE[layout] ?? CARD_LAYOUT_GUIDE.cover

  const textLines: string[] = []
  if (card.title)       textLines.push(`제목(크게): ${card.title}`)
  if (card.subtitle)    textLines.push(`부제목: ${card.subtitle}`)
  if (card.price_badge) textLines.push(`가격 배지: ${card.price_badge}`)
  if (card.address)     textLines.push(`주소(작게): ${card.address}`)
  if (card.highlight)   textLines.push(`강조 문구(금색 굵게): ${card.highlight}`)
  if (card.body)        textLines.push(`본문: ${card.body}`)
  if (Array.isArray(card.checkpoints) && card.checkpoints.filter(Boolean).length)
    textLines.push(`체크포인트 리스트: ${card.checkpoints.filter(Boolean).join(' | ')}`)
  if (Array.isArray(card.points) && card.points.filter(Boolean).length)
    textLines.push(`포인트 리스트: ${card.points.filter(Boolean).join(' | ')}`)
  if (Array.isArray(card.hashtags) && card.hashtags.filter(Boolean).length)
    textLines.push(`해시태그(작게): ${card.hashtags.filter(Boolean).slice(0, 8).join(' ')}`)
  if (card.cta)         textLines.push(`CTA 버튼 텍스트: ${card.cta}`)

  return [
    `[한국 부동산 인스타그램 카드뉴스 ${card.order ?? 1}/6 — 정사각형 1:1]`,
    ``,
    `## 사진 활용 방법 (가장 중요)`,
    `- 제공된 매물 실제 사진을 ${guide.zone}`,
    `- ${guide.overlay}`,
    `- 사진 영역은 brightness 100%, contrast 105%, saturation 110% 수준으로 선명하고 생동감 있게.`,
    `- 절대로 사진 전체를 어둡게 만들지 말 것. 사진이 카드의 핵심 시각 요소임.`,
    ``,
    `## 텍스트 배치`,
    ...textLines,
    ``,
    `## 디자인 스타일`,
    guide.style,
    `- 전문적인 한국 부동산 마케팅 카드뉴스. 깔끔하고 고급스러운 레이아웃.`,
    `- 텍스트 가독성 최우선. 흰색 또는 금색 텍스트, 그림자 처리.`,
  ].join('\n')
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
        .from('project-assets')
        .upload(path, buf, { contentType: mimeType, upsert: true })
      if (!upErr) {
        const { data: pub } = admin.storage.from('project-assets').getPublicUrl(path)
        if (pub?.publicUrl) stored_url = pub.publicUrl
      } else {
        console.error('[nano-banana] storage upload failed, falling back to data URL:', upErr.message)
      }
    } catch (e) {
      console.error('[nano-banana] storage upload threw, falling back to data URL:', e)
    }

    return NextResponse.json({ success: true, image_url: stored_url, card_number: card.order })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Nano Banana 이미지 생성 실패'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
