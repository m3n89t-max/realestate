import test from 'node:test'
import assert from 'node:assert/strict'
import { createCanvas } from '@napi-rs/canvas'
import {
  renderCardImage,
  sanitizeCardClaims,
  wrapKeepAll,
  type CardRenderInput,
} from '../src/lib/card-image-renderer'
import { normalizeCardSlide } from '../src/lib/card-news-contract'

const baseInput: CardRenderInput = {
  card: {
    order: 1,
    layout: 'cover',
    title: '성수동 코너 상가',
    subtitle: '지하철 도보 5분',
    price_badge: '매매 12억원',
  },
  platform: 'instagram',
  priceSource: {
    value_type: '실거래',
    source_name: '국토교통부 실거래가',
    source_date: '2026-03-01',
  },
  region: '서울 성동구',
}

test('사진이 없으면 결정적인 text_only PNG를 렌더링한다', async () => {
  const first = await renderCardImage(baseInput)
  const second = await renderCardImage(baseInput)

  assert.equal(first.layoutUsed, 'text_only')
  assert.equal(first.photoFallbackReason, 'no_assets')
  assert.deepEqual(first.png, second.png)
  assert.equal(first.png.subarray(1, 4).toString(), 'PNG')
})

test('spec_grid를 정규화에서 보존하고 composition 렌더 데이터에 사용한다', async () => {
  const card = normalizeCardSlide({
    card_number: 3,
    layout: 'composition',
    title: '건물 구성',
    spec_grid: [{ label: '1층', value: '카페\n전용 40㎡' }, { label: '2층', value: '사무실' }],
    points: ['코너 위치'],
  }, 0, 'instagram')

  assert.deepEqual(card.spec_grid, [
    { label: '1층', value: '카페\n전용 40㎡' },
    { label: '2층', value: '사무실' },
  ])
  const result = await renderCardImage({
    ...baseInput,
    card,
  })
  assert.equal(result.layoutUsed, 'text_only')
  assert.ok(result.png.length > 10_000)
})

test('금액 카드에는 formatPriceSourceLabel 결과를 그린다', async () => {
  const result = await renderCardImage(baseInput)
  assert.equal(result.priceSourceLabel, '실거래 · 국토교통부 실거래가 · 2026년 3월 1일 기준')
})

test('실거래 금액인데 출처가 없으면 렌더를 거부한다', async () => {
  await assert.rejects(
    renderCardImage({
      ...baseInput,
      priceSource: { value_type: '실거래', source_name: '', source_date: '' },
    }),
    /출처명과 기준일/,
  )
})

test('keep-all 줄바꿈은 measureText 폭 안에 두고 어절을 우선 보존한다', () => {
  const ctx = createCanvas(1080, 1080).getContext('2d')
  ctx.font = '40px sans-serif'
  const lines = wrapKeepAll(ctx, '지하철 도보 5분 초역세권 상가이며 주변 생활 인프라가 풍부합니다', 250, 2)

  assert.equal(lines.length, 2)
  assert.ok(lines.every(line => ctx.measureText(line).width <= 250))
  assert.ok(lines[1].endsWith('…'))
})

test('instagram과 kakao 필드를 각각 손실 없이 정규화한다', () => {
  const instagram = normalizeCardSlide({ card_number: 2, layout: 'location', title: '입지', checkpoints: ['A', 'B', 'C', 'D', 'E'] }, 1, 'instagram')
  assert.deepEqual(instagram.checkpoints, ['A', 'B', 'C', 'D'])

  const kakao = normalizeCardSlide({ card_number: 1, headline: '카카오 제목', price: '5억원', location: '서울' }, 0, 'kakao')
  assert.equal(kakao.title, '카카오 제목')
  assert.equal(kakao.price_badge, '5억원')
  assert.equal(kakao.address, '서울')
  assert.equal(kakao.platform, 'kakao')

  const kakaoLocation = normalizeCardSlide({ card_number: 2, section: '입지 장점', points: ['역 도보 5분', '시장 인접'] }, 1, 'kakao')
  assert.equal(kakaoLocation.title, '입지 장점')
  assert.deepEqual(kakaoLocation.checkpoints, ['역 도보 5분', '시장 인접'])
})

test('미지원 면적 글리프를 실제로 보이는 m²/m³로 바꾸고 금지 문구를 제거한다', () => {
  const card = sanitizeCardClaims({
    order: 3,
    layout: 'composition',
    title: '문의 폭주 예상 매물',
    body: '정상 설명',
    spec_grid: [{ label: '전용면적', value: '84㎡' }, { label: '체적', value: '120㎥' }],
    points: ['원클릭 등록', '남향 거실'],
  })

  assert.equal(card.title, '')
  assert.equal(card.body, '정상 설명')
  assert.deepEqual(card.spec_grid, [
    { label: '전용면적', value: '84m²' },
    { label: '체적', value: '120m³' },
  ])
  assert.deepEqual(card.points, ['남향 거실'])
})

test('hashtags는 프롬프트와 UI 계약에 맞춰 8개까지만 보존한다', () => {
  const hashtags = Array.from({ length: 10 }, (_, index) => `#태그${index + 1}`)
  const card = normalizeCardSlide({ card_number: 6, layout: 'cta', title: '문의', hashtags }, 5, 'instagram')
  assert.equal(card.hashtags?.length, 8)
})
