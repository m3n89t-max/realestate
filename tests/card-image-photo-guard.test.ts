import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const CARD_IMAGE_ROUTE = join(process.cwd(), 'src/app/api/generate-card-image/route.ts')
const EDGE_CARD_IMAGE = join(process.cwd(), 'supabase/functions/generate-card-image/index.ts')
const BLOG = join(process.cwd(), 'supabase/functions/generate-blog/index.ts')
const LOCATION = join(process.cwd(), 'supabase/functions/analyze-location/index.ts')
const DOCUMENT = join(process.cwd(), 'supabase/functions/analyze-document/index.ts')

/**
 * 독립 검토에서 확인된 결함:
 *
 * 1) 사진이 없으면 이미지 생성 요청이 텍스트 프롬프트만 들고 나가고,
 *    생성 모델이 매물과 무관한 건물 사진을 만들어낸다.
 *    중개사가 그 카드를 그대로 올리면 실제 매물이 아닌 사진으로 광고하는 셈이다.
 *    사진 없을 때는 사진형 카드를 만들지 말고 거절해야 한다.
 *
 * 2) 모델 응답 JSON.parse 가 전용 try/catch 없이 노출돼 있어
 *    실패 시 사용자에게 'Unexpected token <' 같은 파서 메시지가 전달된다.
 */

test('사진이 없으면 사진형 카드 이미지를 생성하지 않는다', () => {
  const source = readFileSync(CARD_IMAGE_ROUTE, 'utf8')

  assert.match(
    source,
    /if \(!photo_url\)|photo_url\s*\?\?|requiresPhoto/,
    '사진 없이 호출된 경우를 구분하는 분기가 없습니다.',
  )
  assert.match(
    source,
    /실제 매물 사진/,
    '사진이 없을 때 왜 거절하는지 사용자에게 알려야 합니다.',
  )
})

test('사진 없는 요청은 생성 모델을 호출하기 전에 막는다', () => {
  const source = readFileSync(CARD_IMAGE_ROUTE, 'utf8')

  const guardIndex = source.search(/실제 매물 사진/)
  const fetchIndex = source.search(/generativelanguage\.googleapis\.com/)

  assert.ok(guardIndex > -1, '사진 없음 안내 문구를 찾지 못했습니다.')
  assert.ok(fetchIndex > -1, '생성 모델 호출 지점을 찾지 못했습니다.')
  assert.ok(
    guardIndex < fetchIndex,
    '검사가 모델 호출보다 뒤에 있으면 가짜 사진이 이미 만들어집니다.',
  )
})

test('사진 다운로드가 실패해도 사진 없이 그냥 생성하지 않는다', () => {
  const source = readFileSync(CARD_IMAGE_ROUTE, 'utf8')

  // fetchImageAsBase64 가 null 을 반환하는 경우(만료·네트워크 실패)도
  // 사진 없는 상태와 똑같이 취급해야 한다.
  assert.match(
    source,
    /if \(!img\)[\s\S]{0,400}(return|throw)/,
    '사진을 내려받지 못했을 때 그대로 진행하면 가짜 사진이 생성됩니다.',
  )
})

test('실제 매물 사진 없이 건물 이미지를 만들어내는 경로는 폐기돼 있다', () => {
  const source = readFileSync(EDGE_CARD_IMAGE, 'utf8')

  // DALL·E 로 '텍스트 없는 배경 건물 사진'을 생성하던 경로.
  // 매물과 무관한 사진이 광고에 쓰일 수 있어 제품에서 제외한다.
  assert.ok(
    !/dall-e-3/.test(source),
    '생성형 건물 사진 경로가 남아 있으면 실제 매물이 아닌 사진이 광고에 쓰일 수 있습니다.',
  )
})

test('모델 응답 JSON 파싱 실패는 읽을 수 있는 오류로 바뀐다', () => {
  for (const [label, path] of [
    ['generate-blog', BLOG],
    ['analyze-location', LOCATION],
    ['analyze-document', DOCUMENT],
  ] as const) {
    const source = readFileSync(path, 'utf8')
    const parses = source.match(/JSON\.parse\(responseText\)/g) ?? []
    assert.ok(parses.length > 0, `${label}: JSON.parse(responseText) 를 찾지 못했습니다.`)

    // 각 파싱 지점이 전용 try/catch 안에 있어야 한다.
    const guarded = source.match(/try \{[^}]*JSON\.parse\(responseText\)[\s\S]{0,300}?catch/g) ?? []
    assert.equal(
      guarded.length,
      parses.length,
      `${label}: JSON.parse 지점 ${parses.length}곳 중 ${guarded.length}곳만 보호됩니다. 파서 원문 메시지가 사용자에게 갑니다.`,
    )
  }
})
