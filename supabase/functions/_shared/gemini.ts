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
      maxOutputTokens: options.maxTokens ?? 4000,
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
