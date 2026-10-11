/**
 * gemini.ts 런타임 검증 (Deno).
 * fetch 를 가로채 실제로 Gemini 에 보내는 payload 를 확인한다.
 * 외부 네트워크 호출 없음.
 */
import { assert, assertEquals, assertRejects, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { callGemini, callGeminiVision, type VisionContent } from '../_shared/gemini.ts'

const realFetch = globalThis.fetch

function stubFetch(handler: (url: string, body: Record<string, never>) => unknown) {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    // 이미지 내려받기 요청은 작은 PNG 를 돌려준다.
    if (!url.includes('generativelanguage.googleapis.com')) {
      return Promise.resolve(
        new Response(new Uint8Array([137, 80, 78, 71]), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        }),
      )
    }
    const body = JSON.parse(String(init?.body ?? '{}'))
    return Promise.resolve(
      new Response(JSON.stringify(handler(url, body)), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
  }) as typeof fetch
}

function restore() {
  globalThis.fetch = realFetch
}

const reply = (text: string) => ({ candidates: [{ content: { parts: [{ text }] } }] })

Deno.test('callGemini 은 문자열 content 를 그대로 parts.text 로 보낸다', async () => {
  Deno.env.set('GOOGLE_AI_API_KEY', 'test-key')
  let sent: Record<string, never> = {} as Record<string, never>
  stubFetch((_u, body) => {
    sent = body
    return reply('{"ok":true}')
  })
  try {
    const out = await callGemini(
      [
        { role: 'system', content: '시스템' },
        { role: 'user', content: '사용자' },
      ],
      { responseFormat: 'json' },
    )
    assertEquals(out, '{"ok":true}')

    const contents = sent.contents as unknown as Array<{ parts: Array<{ text: string }> }>
    assertEquals(typeof contents[0].parts[0].text, 'string')
    assertEquals(contents[0].parts[0].text, '사용자')

    const cfg = sent.generationConfig as unknown as Record<string, unknown>
    assertEquals(cfg.responseMimeType, 'application/json')
  } finally {
    restore()
  }
})

Deno.test('callGemini 에 이미지 배열을 넘기면 깨진 요청을 보내지 않고 즉시 실패한다', async () => {
  Deno.env.set('GOOGLE_AI_API_KEY', 'test-key')
  let called = false
  stubFetch(() => {
    called = true
    return reply('nope')
  })
  try {
    const parts = [
      { type: 'text', text: '프롬프트' },
      { type: 'image_url', image_url: { url: 'https://example.com/a.png' } },
    ]
    const error = await assertRejects(() =>
      callGemini([{ role: 'user', content: parts as unknown as string }]),
    )
    assertStringIncludes((error as Error).message, 'callGeminiVision')
    assertEquals(called, false, 'Gemini 에 요청을 보내면 안 됩니다.')
  } finally {
    restore()
  }
})

Deno.test('callGeminiVision 은 이미지를 inlineData 로 붙이고 JSON 형식을 전달한다', async () => {
  Deno.env.set('GOOGLE_AI_API_KEY', 'test-key')
  let sent: Record<string, never> = {} as Record<string, never>
  stubFetch((_u, body) => {
    sent = body
    return reply('{"hook":"테스트"}')
  })
  try {
    const content: VisionContent[] = [
      { type: 'text', text: '프롬프트' },
      { type: 'image_url', image_url: { url: 'https://example.com/a.png' } },
    ]
    const out = await callGeminiVision(
      [
        { role: 'system', content: '시스템' },
        { role: 'user', content },
      ],
      { responseFormat: 'json' },
    )
    assertEquals(out, '{"hook":"테스트"}')

    const contents = sent.contents as unknown as Array<{ parts: Array<Record<string, unknown>> }>
    const userParts = contents[0].parts
    assertEquals(typeof userParts[0].text, 'string')
    const inline = userParts[1].inlineData as { mimeType: string; data: string }
    assert(inline, '이미지가 inlineData 로 붙어야 합니다.')
    assertEquals(inline.mimeType, 'image/png')
    assert(inline.data.length > 0)

    const cfg = sent.generationConfig as unknown as Record<string, unknown>
    assertEquals(cfg.responseMimeType, 'application/json')
  } finally {
    restore()
  }
})

Deno.test('이미지를 한 장도 못 받으면 조용히 텍스트로 보내지 않고 사유를 알린다', async () => {
  Deno.env.set('GOOGLE_AI_API_KEY', 'test-key')
  // 이미지 요청만 실패시킨다.
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (!url.includes('generativelanguage.googleapis.com')) {
      return Promise.resolve(new Response('not found', { status: 404 }))
    }
    void init
    return Promise.resolve(
      new Response(JSON.stringify(reply('should not be used')), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
  }) as typeof fetch
  try {
    const content: VisionContent[] = [
      { type: 'text', text: '프롬프트' },
      { type: 'image_url', image_url: { url: 'https://example.com/missing.png' } },
    ]
    const error = await assertRejects(() => callGeminiVision([{ role: 'user', content }]))
    assertStringIncludes((error as Error).message, '내려받지 못했습니다')
  } finally {
    restore()
  }
})

Deno.test('응답이 비면 finishReason 을 포함한 오류를 낸다', async () => {
  Deno.env.set('GOOGLE_AI_API_KEY', 'test-key')
  stubFetch(() => ({ candidates: [{ content: { parts: [] }, finishReason: 'SAFETY' }] }))
  try {
    const error = await assertRejects(() => callGemini([{ role: 'user', content: 'x' }]))
    assertStringIncludes((error as Error).message, 'SAFETY')
  } finally {
    restore()
  }
})
