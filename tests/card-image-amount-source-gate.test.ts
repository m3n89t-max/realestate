import test from 'node:test'
import assert from 'node:assert/strict'
import { renderCardImage, cardContainsAmount, type CardRenderInput } from '../src/lib/card-image-renderer'

// 금액이 적힌 카드는 출처명·기준일 없이 렌더되면 안 된다.
// 이 스위트는 '실제로 이미지에 그려지는 모든 필드'와 '한국 중개 실무의 금액 표기 변형'을 함께 훑는다.
//
// 과거 결함 1: 금액 탐지가 title/subtitle/body/highlight/checkpoints/points 만 보고
//   spec_grid·address·cta 를 보지 않아, 3장 층별 구성에 적힌 월세·보증금이 출처 없이 발행됐다.
// 과거 결함 2: 정규식이 숫자 바로 뒤 단위만 받아 '3,000 만원'(공백) 한 번이면 전부 뚫렸다.
// 과거 결함 3: '5천만원' 같은 한글 수사, '₩3000', '30,000,000', '3000/250'(보증금/월세)을 못 봤다.
// 과거 결함 4: 탐지를 sanitize 이후에 해서, 금지문구에 섞인 금액이 문구와 함께 지워져 게이트를 빠져나갔다.
// 과거 결함 5: price_badge 를 내용 검사 없이 금액으로 단정해, 프롬프트 규칙이 지시한
//   '미입력 (중개사에게 문의)' 와 '가격 협의' 가 렌더를 차단했다.

const noSource = { value_type: '실거래', source_name: '', source_date: '' }
const withSource = { value_type: '실거래', source_name: '국토교통부 실거래가', source_date: '2026-03-01' }

const base = { platform: 'instagram' as const, region: '서울' }

const amountCards: { label: string; card: CardRenderInput['card'] }[] = [
  {
    label: 'spec_grid 값에 보증금',
    card: { order: 3, layout: 'composition', title: '건물 구성', spec_grid: [{ label: '1층', value: '카페 보증금 3000만원' }, { label: '2층', value: '사무실' }] },
  },
  {
    label: 'spec_grid 라벨에 금액',
    card: { order: 3, layout: 'composition', title: '건물 구성', spec_grid: [{ label: '월세 250만원', value: '1층 카페' }] },
  },
  {
    label: 'address 에 금액',
    card: { order: 2, layout: 'location', title: '입지', address: '성수동 12억원 코너' },
  },
  {
    label: 'hashtags 에 금액 (instagram 은 그려진다)',
    card: { order: 6, layout: 'cta', title: '문의', cta: '문의하기', hashtags: ['#12억원매물', '#상가'] },
  },
  {
    label: 'cta 에 금액',
    card: { order: 6, layout: 'cta', title: '문의', cta: '보증금 5000만원 협의 가능' },
  },
  {
    label: 'price_badge 에 금액',
    card: { order: 1, layout: 'cover', title: '코너 상가', price_badge: '매매 12억원' },
  },
  {
    label: 'body 에 금액',
    card: { order: 3, layout: 'composition', title: '건물 구성', body: '보증금 3000만원' },
  },
  // --- 표기 변형: 숫자와 단위 사이 공백 ---
  {
    label: '공백 끼운 금액 "3,000 만원"',
    card: { order: 1, layout: 'cover', title: '성수동 상가 보증금 3,000 만원' },
  },
  {
    label: '공백 끼운 금액 "3000만 원"',
    card: { order: 1, layout: 'cover', title: '성수동 상가 보증금 3000만 원' },
  },
  {
    label: 'NBSP 끼운 금액',
    card: { order: 1, layout: 'cover', title: '성수동 상가 보증금 3000\u00a0만원' },
  },
  // --- 표기 변형: 한글 수사 ---
  {
    label: '한글 수사 "5천만원"',
    card: { order: 1, layout: 'cover', title: '성수동 상가 보증금 5천만원' },
  },
  {
    label: '한글 수사 "3백만원"',
    card: { order: 3, layout: 'composition', title: '구성', body: '월세 3백만원' },
  },
  {
    label: '한글 수사 "삼천만원"',
    card: { order: 1, layout: 'cover', title: '보증금 삼천만원 상가' },
  },
  // --- 표기 변형: 통화기호·순수 숫자 ---
  {
    label: '통화기호 "₩300,000,000"',
    card: { order: 1, layout: 'cover', title: '성수동 상가 ₩300,000,000' },
  },
  {
    label: '쉼표 3묶음 "30,000,000"',
    card: { order: 1, layout: 'cover', title: '성수동 상가 30,000,000' },
  },
  {
    label: 'KRW 표기',
    card: { order: 1, layout: 'cover', title: '성수동 상가 KRW 3000' },
  },
  // --- 표기 변형: 보증금/월세 슬래시 (한국 임대 광고 표준 표기) ---
  {
    label: '슬래시 표기 "3000/250"',
    card: { order: 3, layout: 'composition', title: '임대 구성', spec_grid: [{ label: '1층', value: '3000/250' }] },
  },
  {
    label: '키워드 근접 "보증금 3천 / 월 250"',
    card: { order: 3, layout: 'composition', title: '임대 구성', body: '보증금 3천 / 월 250' },
  },
]

for (const { label, card } of amountCards) {
  test(`${label}: 금액을 탐지한다`, () => {
    assert.equal(
      cardContainsAmount({ ...base, priceSource: noSource, card }),
      true,
      `${label}: 금액이 있는데 cardContainsAmount가 false입니다`,
    )
  })

  test(`${label}: 출처가 비면 렌더를 거부한다`, async () => {
    await assert.rejects(
      renderCardImage({ ...base, priceSource: noSource, card }),
      /출처명과 기준일/,
      `${label}: 출처 없는 금액 카드가 렌더됐습니다`,
    )
  })

  test(`${label}: 출처가 있으면 캡션을 만든다`, async () => {
    const result = await renderCardImage({ ...base, priceSource: withSource, card })
    assert.equal(
      result.priceSourceLabel,
      '실거래 · 국토교통부 실거래가 · 2026년 3월 1일 기준',
      `${label}: 출처 캡션이 없습니다`,
    )
  })
}

// --- sanitize 우회 경로 ---
test('금지문구에 섞인 금액도 탐지한다 (sanitize 가 지우기 전에 본다)', async () => {
  // '시세 대비 저렴' 은 FORBIDDEN 이라 title 이 통째로 빈 문자열이 된다.
  // 탐지를 sanitize 이후에 하면 금액도 함께 사라져 게이트를 빠져나갔다.
  const card: CardRenderInput['card'] = { order: 1, layout: 'cover', title: '시세 대비 저렴한 3억원 매물', subtitle: '성수역 도보 3분' }
  assert.equal(cardContainsAmount({ ...base, priceSource: noSource, card }), true)
  await assert.rejects(renderCardImage({ ...base, priceSource: noSource, card }), /출처명과 기준일/)
})

test('금지문구로 제목이 통째로 지워지면 제목 없는 카드를 발행하지 않는다', async () => {
  const card: CardRenderInput['card'] = { order: 1, layout: 'cover', title: '문의 폭주 중인 상가', subtitle: '성수역 도보 3분' }
  await assert.rejects(renderCardImage({ ...base, priceSource: withSource, card }), /사용할 수 없는 문구/)
})

// --- 렌더에 그려지는 외부 필드 ---
test('region 에 적힌 금액도 탐지한다 (cover pill 로 실제 그려진다)', async () => {
  const card: CardRenderInput['card'] = { order: 1, layout: 'cover', title: '성수동 상가' }
  assert.equal(cardContainsAmount({ ...base, priceSource: noSource, region: '12억원', card }), true)
  await assert.rejects(renderCardImage({ ...base, priceSource: noSource, region: '12억원', card }), /출처명과 기준일/)
})

test('중개사무소명에 적힌 금액도 탐지한다 (cta 에 실제 그려진다)', () => {
  const card: CardRenderInput['card'] = { order: 6, layout: 'cta', title: '문의', cta: '문의하기' }
  assert.equal(
    cardContainsAmount({ ...base, priceSource: noSource, card, contact: { officeName: '보증금 3000만원 전문' } }),
    true,
  )
})

// --- 과차단 방지: 이미지에 그려지지 않는 필드 ---
test('kakao 에서 해시태그는 그려지지 않으므로 차단하지 않는다', async () => {
  // 렌더러는 instagram 일 때만 해시태그를 그린다. 그려지지 않는 금액으로 차단하면
  // 중개사의 정상 카카오 카드 생성이 이유 없이 막힌다.
  const card: CardRenderInput['card'] = { order: 6, layout: 'cta', title: '문의', cta: '문의하기', hashtags: ['#12억원매물'] }
  assert.equal(cardContainsAmount({ platform: 'kakao', region: '서울', priceSource: noSource, card }), false)
  const result = await renderCardImage({ platform: 'kakao', region: '서울', priceSource: noSource, card })
  assert.equal(result.priceSourceLabel, undefined)
})

test('highlight 는 어떤 레이아웃에서도 그려지지 않으므로 차단하지 않는다', async () => {
  const card: CardRenderInput['card'] = { order: 4, layout: 'investment', title: '임대 현황', highlight: '매매 12억원', points: ['역세권'] }
  assert.equal(cardContainsAmount({ ...base, priceSource: noSource, card }), false)
  const result = await renderCardImage({ ...base, priceSource: noSource, card })
  assert.equal(result.priceSourceLabel, undefined)
})

// --- 과차단 방지: 금액이 아닌 값 ---
test('가격 미입력 표기는 금액이 아니므로 렌더를 막지 않는다', async () => {
  // PRICE_UNKNOWN_PROMPT_RULE 이 모델에게 쓰라고 지시하는 정확한 문자열이다.
  // 이걸 금액으로 보면 가격 미입력 매물은 카드뉴스를 아예 만들 수 없다.
  for (const badge of ['미입력', '미입력 (중개사에게 문의)', '가격 협의', '협의', '문의 바랍니다', '무권리']) {
    const card: CardRenderInput['card'] = { order: 1, layout: 'cover', title: '성수동 상가', price_badge: badge }
    assert.equal(cardContainsAmount({ ...base, priceSource: noSource, card }), false, `"${badge}" 를 금액으로 오인했습니다`)
    const result = await renderCardImage({ ...base, priceSource: noSource, card })
    assert.equal(result.priceSourceLabel, undefined, `"${badge}" 가 렌더를 막았습니다`)
  }
})

test('금액이 없는 카드는 출처 없이도 렌더된다', async () => {
  const card: CardRenderInput['card'] = {
    order: 5,
    layout: 'interior',
    title: '내부 상태',
    checkpoints: ['남향 거실', '수납공간 넉넉'],
    spec_grid: [{ label: '구조', value: '방 3개 거실 1개' }],
  }
  assert.equal(cardContainsAmount({ ...base, priceSource: noSource, card }), false)
  const result = await renderCardImage({ ...base, priceSource: noSource, card })
  assert.equal(result.priceSourceLabel, undefined)
})

test('면적·층수·연도·거리는 금액이 아니므로 출처를 요구하지 않는다', () => {
  // 금액 탐지가 과하게 넓으면 모든 카드가 출처를 요구해 기능이 멈춘다.
  const nonAmounts: CardRenderInput['card'][] = [
    { order: 3, layout: 'composition', title: '구성', spec_grid: [{ label: '전용면적', value: '84㎡' }] },
    { order: 3, layout: 'composition', title: '구성', spec_grid: [{ label: '층수', value: '지상 5층' }] },
    { order: 2, layout: 'location', title: '입지', address: '서울 성동구 성수이로 10' },
    { order: 2, layout: 'location', title: '입지', body: '2026년 준공' },
    { order: 2, layout: 'location', title: '입지', checkpoints: ['도보 5분', '초등학교 300m'] },
    { order: 2, layout: 'location', title: '입지', checkpoints: ['101동 1001호', '24시간 경비'] },
    { order: 5, layout: 'interior', title: '내부', checkpoints: ['1원룸 구조', '3원색 인테리어'] },
    { order: 4, layout: 'investment', title: '투자', points: ['투자 제3원칙 준수'] },
  ]
  for (const card of nonAmounts) {
    assert.equal(
      cardContainsAmount({ ...base, priceSource: noSource, card }),
      false,
      `금액이 아닌데 탐지됐습니다: ${JSON.stringify(card)}`,
    )
  }
})
