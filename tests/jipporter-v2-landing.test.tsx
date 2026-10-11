import test from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import LandingPage from '../src/app/page'

const SPEC_STATUSES = ['직접 발행 가능', '파일 다운로드', '문구 복사', '연동 필요', '지원 예정']
const FORBIDDEN_PHRASES = ['자동 등록', '동시 발행', '원클릭 등록', '모든 사이트에 자동', '자동등록']

test('집포터 2.0 랜딩은 한 번 입력부터 검토·채널 준비까지 한 화면에서 설명한다', () => {
  const html = renderToStaticMarkup(<LandingPage />)

  assert.match(html, /주소·사진·특징만 넣으세요/)
  assert.match(html, /블로그 글/)
  assert.match(html, /카드뉴스/)
  assert.match(html, /중개사가 최종 검토/)
  assert.match(html, /채널별 발행 준비/)
  for (const channel of ['네이버부동산', '직방', '다방', '오일장', '교차로']) {
    assert.match(html, new RegExp(channel))
  }
})

test('랜딩 금지 표현을 한 건도 노출하지 않는다', () => {
  const html = renderToStaticMarkup(<LandingPage />)

  for (const phrase of FORBIDDEN_PHRASES) {
    assert.ok(!html.includes(phrase), `금지 표현이 노출됨: ${phrase}`)
  }
})

test('채널 상태는 제품 명세의 다섯 값만 사용하고 오늘 할 일을 함께 표시한다', () => {
  const source = readFileSync(join(process.cwd(), 'src/app/page.tsx'), 'utf8')
  const channelBlock = source.match(/const channels = \[[\s\S]*?\n\]/)
  assert.ok(channelBlock, 'channels 정의를 찾지 못했습니다.')

  const statuses = [...channelBlock[0].matchAll(/status: '([^']+)'/g)].map(match => match[1])
  assert.ok(statuses.length >= 5, '채널이 5개 이상이어야 합니다.')
  for (const status of statuses) {
    assert.ok(SPEC_STATUSES.includes(status), `명세 밖 상태값: ${status}`)
  }

  const actions = [...channelBlock[0].matchAll(/todo: '([^']+)'/g)].map(match => match[1])
  assert.equal(actions.length, statuses.length, '채널마다 오늘 할 일(todo)을 표시해야 합니다.')

  const spec = readFileSync(join(process.cwd(), 'docs/jipporter-channel-integration.md'), 'utf8')
  assert.match(spec, /제주오일장신문[\s\S]*?판정: `제휴 필요`/)
  const oilMarket = channelBlock[0].match(/name: '[^']*오일장[^']*', status: '([^']+)'/)
  assert.ok(oilMarket, '오일장 채널 정의를 찾지 못했습니다.')
  assert.equal(oilMarket[1], '연동 필요', '조사 문서의 제휴 필요 판정과 상태가 일치해야 합니다.')
})

test('가입 CTA와 사실확인 책임 경계를 명확히 표시한다', () => {
  const html = renderToStaticMarkup(<LandingPage />)

  assert.match(html, /href="\/login\?mode=signup"/)
  assert.match(html, /내 매물로 시작하기/)
  assert.match(html, /공식 API 또는 서면 제휴/)
  assert.match(html, /최종 등록은 중개사가 확인/)
  assert.match(html, /가격·면적·주소 공개 범위/)
})

test('데모 영상 설명은 실제 제공 산출물만 알린다', () => {
  const html = renderToStaticMarkup(<LandingPage />)

  assert.ok(!html.includes('쇼츠 스크립트'), '제품 범위 밖 산출물을 광고하면 안 됩니다.')
  assert.match(html, /입지분석, 블로그 글, 카드뉴스/)
})

test('모바일 고정 CTA는 안전영역 여백을 확보한다', () => {
  const source = readFileSync(join(process.cwd(), 'src/app/page.tsx'), 'utf8')
  assert.match(source, /env\(safe-area-inset-bottom\)/)
})

test('4단계 흐름은 순서형 목록으로 제공한다', () => {
  const html = renderToStaticMarkup(<LandingPage />)
  assert.match(html, /<ol[^>]*>[\s\S]*?01[\s\S]*?04[\s\S]*?<\/ol>/)
})
