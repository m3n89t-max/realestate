import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const CARD_IMAGE_ROUTE = join(process.cwd(), 'src/app/api/generate-card-image/route.ts')
const EDGE_CARD_IMAGE = join(process.cwd(), 'supabase/functions/generate-card-image/index.ts')
const BLOG = join(process.cwd(), 'supabase/functions/generate-blog/index.ts')
const LOCATION = join(process.cwd(), 'supabase/functions/analyze-location/index.ts')
const DOCUMENT = join(process.cwd(), 'supabase/functions/analyze-document/index.ts')
const CARD_NEWS_TAB = join(process.cwd(), 'src/app/(dashboard)/projects/[id]/components/CardNewsTab.tsx')

test('카드 이미지 경로는 생성형 이미지 모델을 호출하지 않는다', () => {
  const source = readFileSync(CARD_IMAGE_ROUTE, 'utf8')

  assert.doesNotMatch(source, /generativelanguage\.googleapis\.com|gemini-3\.1-flash-image-preview|responseModalities/)
  assert.match(source, /renderCardImage/)
  assert.match(source, /@napi-rs\/canvas|card-image-renderer/)
})

test('사진이 없거나 다운로드가 실패하면 text_only 정상 결과로 전환한다', () => {
  const source = readFileSync(CARD_IMAGE_ROUTE, 'utf8')

  assert.doesNotMatch(source, /reason:\s*'photo_required'/)
  assert.match(source, /no_assets/)
  assert.match(source, /fetch_failed/)
  assert.match(source, /layout_used/)
  assert.match(source, /photo_fallback_reason/)
})

test('실제 매물 사진 없이 건물 이미지를 만들어내는 경로는 폐기돼 있다', () => {
  const source = readFileSync(EDGE_CARD_IMAGE, 'utf8')
  assert.ok(!/dall-e-3/.test(source))
})

test('사진 다운로드는 인증된 프로젝트 asset과 HTTPS·이미지·크기 제한을 적용한다', () => {
  const source = readFileSync(CARD_IMAGE_ROUTE, 'utf8')

  assert.match(source, /project_id가 필요합니다/)
  assert.match(source, /\.eq\('project_id', body\.project_id\)/)
  assert.match(source, /\.eq\('file_url', body\.photo_url\)/)
  assert.match(source, /parsed\.protocol !== 'https:'/)
  assert.match(source, /contentType\.startsWith\('image\/'\)/)
  assert.match(source, /MAX_PHOTO_BYTES/)
  assert.match(source, /redirect: 'error'/)
})

test('플랫폼 드롭다운 선택값이 기존 콘텐츠 값에 덮어쓰이지 않는다', () => {
  const source = readFileSync(CARD_NEWS_TAB, 'utf8')

  assert.match(source, /const contentPlatform: CardPlatform = platform/)
  assert.doesNotMatch(source, /const contentPlatform:[^\n]*rawContent\?\.platform/)
  assert.match(source, /platform: contentPlatform/)
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
    const guarded = source.match(/try \{[^}]*JSON\.parse\(responseText\)[\s\S]{0,300}?catch/g) ?? []
    assert.equal(guarded.length, parses.length)
  }
})
