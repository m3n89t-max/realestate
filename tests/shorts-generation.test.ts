import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SHORTS = join(process.cwd(), 'supabase/functions/generate-shorts-script/index.ts')
const CARD_NEWS = join(process.cwd(), 'supabase/functions/generate-card-news/index.ts')
const GEMINI = join(process.cwd(), 'supabase/functions/_shared/gemini.ts')

/**
 * 재현한 실제 장애:
 * 쇼츠 생성은 사진이 있으면 content 를 배열(VisionContent[])로 만든 뒤
 * `as never` 로 타입 검사를 우회해 텍스트 전용 callGemini 에 넘겼다.
 * callGemini 는 `parts: [{ text: m.content }]` 로 매핑하므로 text 가 배열이 되고
 * Gemini API 가 INVALID_ARGUMENT 로 거절한다.
 * 즉 사진을 올린 매물에서만 쇼츠 생성이 실패했다.
 */

test('쇼츠 생성은 이미지를 보낼 때 비전 클라이언트를 쓴다', () => {
  const source = readFileSync(SHORTS, 'utf8')
  assert.match(source, /callGeminiVision/, '이미지를 보내려면 callGeminiVision 을 써야 합니다.')
})

test('쇼츠 생성은 as never 로 타입 검사를 우회하지 않는다', () => {
  const source = readFileSync(SHORTS, 'utf8')
  assert.ok(
    !source.includes('as never'),
    'as never 우회가 잘못된 payload 를 컴파일 단계에서 통과시켰습니다. 제거해야 합니다.',
  )
})

test('카드뉴스와 쇼츠는 같은 비전 호출 방식을 쓴다', () => {
  const shorts = readFileSync(SHORTS, 'utf8')
  const cardNews = readFileSync(CARD_NEWS, 'utf8')

  for (const source of [shorts, cardNews]) {
    assert.match(source, /callGeminiVision/)
  }
})

test('텍스트 전용 callGemini 는 문자열이 아닌 content 를 조용히 보내지 않는다', () => {
  const gemini = readFileSync(GEMINI, 'utf8')
  const callGemini = gemini.match(/export async function callGemini\([\s\S]*?\n}/)
  assert.ok(callGemini, 'callGemini 정의를 찾지 못했습니다.')

  assert.match(
    callGemini[0],
    /typeof .*content !== 'string'/,
    'callGemini 는 문자열이 아닌 content 를 받으면 명확히 실패해야 합니다(조용히 깨진 요청을 보내면 안 됩니다).',
  )
})

test('비전 호출에도 JSON 응답 형식과 토큰 한도를 지정할 수 있다', () => {
  const gemini = readFileSync(GEMINI, 'utf8')
  const vision = gemini.match(/export async function callGeminiVision\([\s\S]*?\n}/)
  assert.ok(vision, 'callGeminiVision 정의를 찾지 못했습니다.')

  assert.match(vision[0], /responseFormat/, '비전 호출도 JSON 강제가 필요합니다.')
  assert.match(vision[0], /responseMimeType/, 'responseMimeType 을 전달해야 JSON 이 보장됩니다.')
})

test('쇼츠 응답은 JSON 형식을 요구한다', () => {
  const source = readFileSync(SHORTS, 'utf8')
  assert.match(source, /responseFormat: 'json'/, '쇼츠 스크립트는 JSON 파싱을 하므로 JSON 형식을 강제해야 합니다.')
})

test('쇼츠 생성은 사진 분석이 실패해도 텍스트만으로 스크립트를 만든다', () => {
  const source = readFileSync(SHORTS, 'utf8')
  assert.match(
    source,
    /callGeminiVision[\s\S]{0,600}catch/,
    '사진 분석 실패로 쇼츠 생성 자체가 실패하면 사용자는 결과를 전혀 받지 못합니다. 텍스트 폴백이 필요합니다.',
  )
})

test('쇼츠 생성은 JSON 파싱 실패를 사용자에게 읽을 수 있는 오류로 바꾼다', () => {
  const source = readFileSync(SHORTS, 'utf8')
  assert.match(
    source,
    /JSON\.parse[\s\S]{0,400}catch/,
    'JSON.parse 실패가 그대로 터지면 사용자는 원인을 알 수 없습니다.',
  )
})
