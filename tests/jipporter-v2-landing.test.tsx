import test from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import LandingPage from '../src/app/page'

test('집포터 2.0 랜딩은 한 번 입력부터 검토·채널 준비까지 한 화면에서 설명한다', () => {
  const html = renderToStaticMarkup(<LandingPage />)

  assert.match(html, /주소와 사진만 넣으세요/)
  assert.match(html, /블로그 글/)
  assert.match(html, /카드뉴스/)
  assert.match(html, /사람이 검토/)
  assert.match(html, /채널별 발행 준비/)
  assert.match(html, /네이버부동산/)
  assert.match(html, /직방/)
  assert.match(html, /다방/)
  assert.match(html, /오일장/)
  assert.match(html, /교차로/)
  assert.match(html, /제휴 필요/)
  assert.match(html, /파일 내보내기/)
  assert.match(html, /수동 보조/)
  assert.doesNotMatch(html, /모든 사이트에 자동 등록/)
})

test('집포터 2.0 랜딩은 가입 CTA와 기능 한계를 명확히 표시한다', () => {
  const html = renderToStaticMarkup(<LandingPage />)

  assert.match(html, /href="\/login\?mode=signup"/)
  assert.match(html, /내 매물로 시작하기/)
  assert.match(html, /공식 API 또는 서면 제휴/)
  assert.match(html, /최종 등록은 담당자가 확인/)
})
