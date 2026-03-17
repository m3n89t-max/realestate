import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { getAuthenticatedUser } from '../_shared/auth.ts'

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    await getAuthenticatedUser(req)

    const { image_prompt, card_number } = await req.json()
    if (!image_prompt) throw new Error('image_prompt가 필요합니다')

    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiKey) throw new Error('OPENAI_API_KEY가 설정되지 않았습니다')

    const safePrompt = `${image_prompt}. Professional real estate photography style. Square composition. No text, no watermarks, no logos. High quality.`

    console.log(`[generate-card-image] card=${card_number} prompt="${safePrompt.slice(0, 80)}..."`)

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
      throw new Error(data.error?.message ?? 'DALL-E 호출 실패')
    }

    const image_url: string = data.data?.[0]?.url
    if (!image_url) throw new Error('이미지 URL을 받지 못했습니다')

    return new Response(JSON.stringify({ success: true, image_url, card_number }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('[generate-card-image]', e)
    const message = e instanceof Error ? e.message : 'AI 이미지 생성에 실패했습니다'
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
