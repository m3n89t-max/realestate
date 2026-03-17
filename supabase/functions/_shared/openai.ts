// OpenAI API 클라이언트

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type VisionContent =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } }

export interface VisionMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | VisionContent[]
}

export async function callOpenAIVision(
  messages: VisionMessage[],
  options: { maxTokens?: number; temperature?: number } = {}
): Promise<string> {
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) throw new Error('OpenAI API 키가 설정되지 않았습니다')

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages,
      temperature: options.temperature ?? 0.5,
      max_tokens: options.maxTokens ?? 800,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenAI Vision API 오류: ${response.status} - ${error}`)
  }

  const data = await response.json()
  return data.choices[0].message.content
}

export async function callOpenAI(
  messages: ChatMessage[],
  options: {
    model?: string
    temperature?: number
    maxTokens?: number
    responseFormat?: 'json' | 'text'
  } = {}
): Promise<string> {
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) throw new Error('OpenAI API 키가 설정되지 않았습니다')

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: options.model ?? 'gpt-4o',
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4000,
      ...(options.responseFormat === 'json' && {
        response_format: { type: 'json_object' }
      }),
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenAI API 오류: ${response.status} - ${error}`)
  }

  const data = await response.json()
  return data.choices[0].message.content
}

export function countTokens(text: string): number {
  // 간단 추정: 한글은 1자당 약 1.5토큰, 영문은 약 0.25토큰
  const korean = (text.match(/[\u3131-\uD79D]/g) ?? []).length
  const others = text.length - korean
  return Math.ceil(korean * 1.5 + others * 0.25)
}
