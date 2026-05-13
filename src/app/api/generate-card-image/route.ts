import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const GEMINI_MODEL = 'gemini-3.1-flash-image-preview'
const CARD_PROMPTS: Record<string, string> = {
  cover: 'Luxury Korean real estate property exterior, golden hour lighting, dramatic sky, architectural beauty, premium residential building facade, cinematic wide angle, no people, no text',
  location: 'Vibrant Korean urban neighborhood aerial view, nearby subway station, shopping streets, parks, beautiful city infrastructure, bustling but clean environment, drone photography style, no text',
  composition: 'Elegant modern Korean apartment interior, living room and dining area, natural daylight through large windows, premium materials, minimalist furniture, architectural photography, no text',
  investment: 'Abstract financial growth concept, glowing upward graph over Seoul city skyline at night, blue and gold tones, professional corporate photography, no text',
  interior: 'Luxurious Korean apartment bedroom and kitchen, marble countertops, high-end appliances, warm ambient lighting, interior design magazine quality, no text',
  cta: 'Soft blurred luxury residential building exterior, bokeh effect, warm golden morning light, serene premium real estate atmosphere, abstract elegant background, no text',
}

function buildPrompt(layout: string, propertyType?: string, address?: string, imagePrompt?: string): string {
  const base = imagePrompt || CARD_PROMPTS[layout] || CARD_PROMPTS.cover
  const typeHint = propertyType === 'commercial' ? 'commercial property' : 'residential apartment'
  return `${base}. ${typeHint} photography. Square 1:1 composition. NO text, NO watermarks, NO logos, NO readable signs. Professional photography, 4K quality.`
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '인증되지 않은 요청입니다' }, { status: 401 })

    const { image_prompt, card_number, layout, property_type, address, project_id } = await req.json()

    const apiKey = process.env.GOOGLE_AI_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'GOOGLE_AI_API_KEY가 설정되지 않았습니다' }, { status: 500 })

    const prompt = buildPrompt(layout ?? 'cover', property_type, address, image_prompt)

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
        }),
      }
    )

    const data = await res.json()
    if (!res.ok) {
      console.error('[nano-banana] Gemini error:', data)
      return NextResponse.json({ error: data.error?.message ?? 'Nano Banana 호출 실패' }, { status: 500 })
    }

    const parts: any[] = data.candidates?.[0]?.content?.parts ?? []
    const imagePart = parts.find((p: any) => p.inlineData?.mimeType?.startsWith('image/'))
    if (!imagePart) return NextResponse.json({ error: '이미지를 생성하지 못했습니다' }, { status: 500 })

    const { mimeType, data: b64 } = imagePart.inlineData
    const image_url = `data:${mimeType};base64,${b64}`

    // Supabase Storage에 업로드하여 영구 URL 생성
    let stored_url = image_url
    try {
      const buf = Buffer.from(b64, 'base64')
      const ext = mimeType === 'image/png' ? 'png' : 'jpg'
      const path = `card-news/${project_id ?? user.id}/${Date.now()}-card${card_number ?? 1}.${ext}`
      const adminSupabase = await createAdminClient()
      const { error: upErr } = await adminSupabase.storage
        .from('assets')
        .upload(path, buf, { contentType: mimeType, upsert: true })
      if (!upErr) {
        const { data: pub } = adminSupabase.storage.from('assets').getPublicUrl(path)
        if (pub?.publicUrl) stored_url = pub.publicUrl
      }
    } catch { /* fallback to data URL */ }

    return NextResponse.json({ success: true, image_url: stored_url, card_number })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Nano Banana 이미지 생성 실패'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

async function createAdminClient() {
  const { createClient: createSupa } = await import('@supabase/supabase-js')
  return createSupa(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
