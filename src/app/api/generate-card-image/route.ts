import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '인증되지 않은 요청입니다' }, { status: 401 })

    const { image_prompt, card_number } = await req.json()
    if (!image_prompt) return NextResponse.json({ error: 'image_prompt가 필요합니다' }, { status: 400 })

    const openaiKey = process.env.OPENAI_API_KEY
    if (!openaiKey) return NextResponse.json({ error: 'OPENAI_API_KEY가 설정되지 않았습니다' }, { status: 500 })

    const safePrompt = `${image_prompt}. Professional real estate photography style. Square composition. No text, no watermarks, no logos. High quality.`

    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: safePrompt,
        n: 1,
        size: '1024x1024',
        quality: 'standard',
        response_format: 'url',
      }),
    })

    const data = await res.json()
    if (!res.ok) {
      console.error('[generate-card-image] DALL-E error:', data)
      return NextResponse.json({ error: data.error?.message ?? 'DALL-E 호출 실패' }, { status: 500 })
    }

    const image_url: string = data.data?.[0]?.url
    if (!image_url) return NextResponse.json({ error: '이미지 URL을 받지 못했습니다' }, { status: 500 })

    return NextResponse.json({ success: true, image_url, card_number })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'AI 이미지 생성에 실패했습니다'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
