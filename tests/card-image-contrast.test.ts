import test from 'node:test'
import assert from 'node:assert/strict'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { renderCardImage, cardContainsAmount, COLOR, type CardRenderInput } from '../src/lib/card-image-renderer'

// 이 스위트는 좌표를 가정하지 않는다. 실제로 인코딩된 PNG를 디코드해서
// 본문 글자색이 나타난 행들의 지배 배경색을 찾아 WCAG 대비를 계산한다.
// 밴드 좌표를 손으로 적으면 레이아웃이 조금 바뀔 때 '없는 결함'을 보고하게 된다.

const AA_NORMAL = 4.5
const AA_LARGE = 3.0

const toRgb = (value: string): [number, number, number] => [
  parseInt(value.slice(1, 3), 16),
  parseInt(value.slice(3, 5), 16),
  parseInt(value.slice(5, 7), 16),
]

/**
 * 렌더러가 본문 계열에 쓰는 전경색.
 * 하드코딩하지 않고 COLOR 상수를 그대로 가져온다. 색 값이 바뀌어도 테스트가 따라가므로
 * '측정 대상이 사라져 조용히 통과하는' 퇴화가 생기지 않는다.
 */
const TEXT_COLORS: { name: string; rgb: [number, number, number]; large: boolean }[] = [
  { name: 'WHITE', rgb: toRgb(COLOR.WHITE), large: false },
  { name: 'LINE', rgb: toRgb(COLOR.LINE), large: false },
  { name: 'ACCENT_SOFT', rgb: toRgb(COLOR.ACCENT_SOFT), large: false },
]

const srgb = (c: number) => {
  const v = c / 255
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}
const luminance = (c: readonly number[]) => 0.2126 * srgb(c[0]) + 0.7152 * srgb(c[1]) + 0.0722 * srgb(c[2])
const contrast = (a: readonly number[], b: readonly number[]) => {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}
const hex = (c: readonly number[]) => '#' + c.slice(0, 3).map(v => v.toString(16).padStart(2, '0')).join('')

async function decode(png: Buffer) {
  const image = await loadImage(png)
  const canvas = createCanvas(image.width, image.height)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(image, 0, 0)
  return { data: ctx.getImageData(0, 0, image.width, image.height).data, width: image.width, height: image.height }
}

interface Decoded { data: Uint8ClampedArray; width: number; height: number }

/** 정확히 이 색인 픽셀이 들어 있는 행 번호. 안티앨리어싱 중간색은 제외한다. */
function rowsContaining(img: Decoded, rgb: readonly number[]): number[] {
  const rows: number[] = []
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const i = (img.width * y + x) << 2
      if (img.data[i] === rgb[0] && img.data[i + 1] === rgb[1] && img.data[i + 2] === rgb[2]) {
        rows.push(y)
        break
      }
    }
  }
  return rows
}

/** 글자색이 등장한 행들에서 가장 넓은 면적을 차지한 색 = 그 글자가 실제로 올라앉은 배경. */
function dominantBackground(img: Decoded, rows: readonly number[], exclude: readonly number[]): number[] | null {
  const counts = new Map<string, number>()
  for (const y of rows) {
    for (let x = 0; x < img.width; x++) {
      const i = (img.width * y + x) << 2
      const rgb = [img.data[i], img.data[i + 1], img.data[i + 2]]
      if (rgb[0] === exclude[0] && rgb[1] === exclude[1] && rgb[2] === exclude[2]) continue
      const key = rgb.join(',')
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  return top ? top[0].split(',').map(Number) : null
}

const priceSource = {
  value_type: '실거래',
  source_name: '국토교통부 실거래가',
  source_date: '2026-03-01',
}

const contact = {
  officeName: '새론부동산중개',
  phone: '064-123-4567',
  registrationNumber: '제5011-2026-00012호',
  kakaoId: 'saeron',
}

const cases: { name: string; input: CardRenderInput }[] = [
  {
    name: 'instagram/cover',
    input: {
      platform: 'instagram',
      priceSource,
      region: '서울 성동구',
      card: { order: 1, layout: 'cover', title: '성수동 코너 상가', subtitle: '지하철 도보 5분 생활 인프라 밀집', price_badge: '매매 12억원' },
    },
  },
  {
    name: 'kakao/cover',
    input: {
      platform: 'kakao',
      priceSource,
      region: '서울 성동구',
      card: { order: 1, layout: 'cover', title: '성수동 코너 상가', subtitle: '지하철 도보 5분', price_badge: '매매 12억원' },
    },
  },
  {
    name: 'instagram/composition',
    input: {
      platform: 'instagram',
      priceSource,
      region: '서울 성동구',
      card: {
        order: 3,
        layout: 'composition',
        title: '건물 구성',
        spec_grid: [{ label: '1층', value: '카페 전용 40㎡' }, { label: '2층', value: '사무실' }],
        points: ['코너 위치', '전면 도로 8m'],
      },
    },
  },
  {
    name: 'instagram/location',
    input: {
      platform: 'instagram',
      priceSource,
      region: '서울 성동구',
      card: { order: 2, layout: 'location', title: '입지 분석', address: '서울 성동구 성수이로 10', checkpoints: ['지하철 도보 5분', '버스 정류장 인접', '초등학교 300m', '대형마트 600m'] },
    },
  },
  {
    name: 'instagram/cta',
    input: {
      platform: 'instagram',
      priceSource,
      region: '서울 성동구',
      contact,
      card: {
        order: 6,
        layout: 'cta',
        title: '자세한 정보 문의해 주세요',
        price_badge: '매매 12억원',
        cta: '지금 문의하기',
        hashtags: ['#성수동상가', '#코너상가', '#수익형부동산', '#상가매매', '#서울상가', '#성동구', '#역세권', '#임대수익'],
      },
    },
  },
  {
    name: 'kakao/cta',
    input: {
      platform: 'kakao',
      priceSource,
      region: '서울 성동구',
      contact,
      card: { order: 6, layout: 'cta', title: '상담 문의', price_badge: '매매 12억원', cta: '상담 문의하기' },
    },
  },
]

for (const testCase of cases) {
  test(`${testCase.name}: 본문 글자색이 실제 배경 대비 WCAG AA를 만족한다`, async () => {
    const result = await renderCardImage(testCase.input)
    const img = await decode(result.png)

    let measured = 0
    for (const color of TEXT_COLORS) {
      const rows = rowsContaining(img, color.rgb)
      if (!rows.length) continue
      const background = dominantBackground(img, rows, color.rgb)
      assert.ok(background, `${color.name} 배경색을 찾지 못했습니다`)
      const value = contrast(color.rgb, background)
      const floor = color.large ? AA_LARGE : AA_NORMAL
      assert.ok(
        value >= floor,
        `${testCase.name} ${color.name} 대비 미달: ${value.toFixed(2)}:1 (fg=${hex(color.rgb)} bg=${hex(background)}, 기준 ${floor}:1)`,
      )
      measured++
    }

    // 아무 색도 측정되지 않았다면 테스트가 공허하게 통과한 것이다.
    assert.ok(measured >= 2, `${testCase.name}에서 측정된 글자색이 ${measured}개뿐입니다 — 테스트가 공허하게 통과했습니다`)
  })
}

test('금액이 있는 카드는 출처 라벨을 반환만 하지 않고 실제 픽셀로 그린다', async () => {
  // 금액이 실제로 적힌 케이스만 검사한다. composition 처럼 금액이 없는 카드는
  // 출처 라벨이 없는 것이 올바른 동작이므로 여기서 요구하면 안 된다.
  // 금액 판정을 복제하지 않고 본체 함수를 그대로 쓴다. 사본을 두면 본체 정규식이
  // 바뀌어도 표본 선정이 따라가지 않아 테스트가 조용히 어긋난다.
  const amountCases = cases.filter(testCase => cardContainsAmount(testCase.input))
  assert.ok(amountCases.length >= 3, `금액 카드 표본이 ${amountCases.length}건뿐입니다 — 테스트가 공허하게 통과합니다`)

  for (const testCase of amountCases) {
    const result = await renderCardImage(testCase.input)
    assert.ok(result.priceSourceLabel, `${testCase.name}: 금액 카드인데 출처 라벨이 없습니다`)

    const img = await decode(result.png)
    // 캡션은 LINE(#e8eaf0)으로만 그려진다. 한 행도 없으면 라벨은 응답에만 있고 화면에는 없다.
    const rows = rowsContaining(img, [232, 234, 240])
    assert.ok(
      rows.length > 0,
      `${testCase.name}: priceSourceLabel이 "${result.priceSourceLabel}" 인데 캡션 색 픽셀이 한 행도 없습니다`,
    )
  }
})

test('금액이 없는 카드는 출처 라벨을 만들지 않는다', async () => {
  const result = await renderCardImage({
    platform: 'instagram',
    priceSource: { value_type: '', source_name: '', source_date: '' },
    region: '서울 성동구',
    card: { order: 5, layout: 'interior', title: '내부 상태', checkpoints: ['남향 거실', '수납공간 넉넉'] },
  })
  assert.equal(result.priceSourceLabel, undefined)
})
