// Google Gemini (Generative Language API) 클라이언트
// callOpenAI와 동일한 인터페이스로 교체 가능하도록 설계.

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// 기본 텍스트 모델. GEMINI_MODEL 시크릿으로 재정의 가능.
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash'

export async function callGemini(
  messages: ChatMessage[],
  options: {
    model?: string
    temperature?: number
    maxTokens?: number
    responseFormat?: 'json' | 'text'
  } = {}
): Promise<string> {
  const apiKey = Deno.env.get('GOOGLE_AI_API_KEY')
  if (!apiKey) throw new Error('Google AI(Gemini) API 키가 설정되지 않았습니다 (GOOGLE_AI_API_KEY)')

  const model = options.model ?? Deno.env.get('GEMINI_MODEL') ?? DEFAULT_GEMINI_MODEL

  // 호출자가 이미지 배열을 텍스트 전용 경로로 넘기면 payload 의 text 가 문자열이 아니게 되고
  // Gemini 가 INVALID_ARGUMENT 로 거절한다. 조용히 깨진 요청을 보내지 말고 여기서 멈춘다.
  for (const m of messages) {
    if (typeof m.content !== 'string') {
      throw new Error(
        'callGemini 는 문자열 content 만 받습니다. 이미지를 보내려면 callGeminiVision 을 쓰세요.',
      )
    }
  }

  // system 메시지는 systemInstruction으로, 나머지는 contents로 매핑 (assistant → model)
  const systemMsg = messages.find(m => m.role === 'system')
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: options.temperature ?? 0.7,
      maxOutputTokens: options.maxTokens ?? 8192,
      // 2.5+ 모델의 thinking이 출력 토큰을 소모해 JSON이 잘리는 문제 방지 (thinking 비활성화)
      thinkingConfig: { thinkingBudget: 0 },
      ...(options.responseFormat === 'json' && { responseMimeType: 'application/json' }),
    },
  }
  if (systemMsg) {
    body.systemInstruction = { parts: [{ text: systemMsg.content }] }
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Gemini API 오류: ${response.status} - ${error}`)
  }

  const data = await response.json()
  const text: string = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p: { text?: string }) => p.text ?? '')
    .join('')

  if (!text) {
    // 안전차단 등으로 응답이 비었을 때 사유 노출
    const reason = data.candidates?.[0]?.finishReason ?? data.promptFeedback?.blockReason ?? 'unknown'
    throw new Error(`Gemini 응답이 비어 있습니다 (finishReason: ${reason})`)
  }
  return text
}

// ── 비전(이미지 분석) ─────────────────────────────────────────────────────────
// callOpenAIVision과 동일 인터페이스. image_url은 URL을 받아 base64 inlineData로 변환해 전송.

export type VisionContent =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } }

export interface VisionMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | VisionContent[]
}

async function fetchImageAsInlineData(url: string): Promise<{ mimeType: string; data: string } | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    const mimeType = (res.headers.get('content-type') ?? 'image/jpeg').split(';')[0].trim()
    const bytes = new Uint8Array(buf)
    let binary = ''
    const chunk = 0x8000
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
    }
    return { mimeType, data: btoa(binary) }
  } catch {
    return null
  }
}

export async function callGeminiVision(
  messages: VisionMessage[],
  options: {
    model?: string
    maxTokens?: number
    temperature?: number
    responseFormat?: 'json' | 'text'
  } = {}
): Promise<string> {
  const apiKey = Deno.env.get('GOOGLE_AI_API_KEY')
  if (!apiKey) throw new Error('Google AI(Gemini) API 키가 설정되지 않았습니다 (GOOGLE_AI_API_KEY)')
  const model = options.model ?? Deno.env.get('GEMINI_MODEL') ?? DEFAULT_GEMINI_MODEL

  const systemMsg = messages.find(m => m.role === 'system')
  const contents: Array<{ role: string; parts: unknown[] }> = []
  let requestedImages = 0
  let attachedImages = 0
  for (const m of messages) {
    if (m.role === 'system') continue
    const parts: unknown[] = []
    if (typeof m.content === 'string') {
      parts.push({ text: m.content })
    } else {
      for (const c of m.content) {
        if (c.type === 'text') {
          parts.push({ text: c.text })
        } else if (c.type === 'image_url') {
          requestedImages += 1
          const img = await fetchImageAsInlineData(c.image_url.url)
          if (img) {
            attachedImages += 1
            parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } })
          }
        }
      }
    }
    contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts })
  }

  // 이미지를 보내려 했는데 한 장도 붙지 않았다면(만료된 서명 URL 등) 그냥 텍스트로 보내지 않는다.
  // 호출자가 이미지 기반 결과를 기대하므로 원인을 알려야 한다.
  if (requestedImages > 0 && attachedImages === 0) {
    throw new Error(
      `이미지를 ${requestedImages}장 보내려 했으나 모두 내려받지 못했습니다. 사진 URL이 만료되었는지 확인해 주세요.`,
    )
  }

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: options.temperature ?? 0.5,
      maxOutputTokens: options.maxTokens ?? 2048,
      thinkingConfig: { thinkingBudget: 0 },
      ...(options.responseFormat === 'json' && { responseMimeType: 'application/json' }),
    },
  }
  if (systemMsg && typeof systemMsg.content === 'string') {
    body.systemInstruction = { parts: [{ text: systemMsg.content }] }
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  )
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Gemini Vision API 오류: ${response.status} - ${error}`)
  }
  const data = await response.json()
  const text: string = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p: { text?: string }) => p.text ?? '')
    .join('')
  if (!text) {
    const reason = data.candidates?.[0]?.finishReason ?? data.promptFeedback?.blockReason ?? 'unknown'
    throw new Error(`Gemini Vision 응답이 비어 있습니다 (finishReason: ${reason})`)
  }
  return text
}
