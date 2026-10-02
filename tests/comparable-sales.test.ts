// 실거래 비교군(주변 시세) 결함 회귀 테스트
// ------------------------------------------------------------------
// 운영 DB 실측으로 확인된 세 결함을 막는다.
//  1) 매물 종류 불일치: 상가 매물 비교군이 전부 아파트였고 그 평균이 주변 금액으로 표시됐다.
//  2) 지역 구성 왜곡: 연동 매물 비교군 60건 중 연동 9건(15%)인데 '연동'으로 라벨링됐다.
//  3) 면적 미정규화: 84.97㎡ 매물 비교군에 151.008㎡ 거래가 섞여 평균이 부풀었다.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path, { dirname, join } from 'node:path'

import {
  AREA_BAND_MIN_SAMPLE,
  AREA_BAND_RATIO,
  COMPARABLE_COLLECTION_MONTHS,
  COMPARABLE_DEAL_SERVICE_MAP,
  REGION_LABEL_MAJORITY_RATIO,
  buildComparableSalesView,
  dealServiceNameFor,
  describeComparableSalesStatus,
  describeComparableStatsBasis,
  normalizeDongName,
  type ComparableSalesStatus,
  type ComparableStatsBasis,
} from '../src/lib/comparable-sales'
import type { RealPriceItem } from '../src/lib/types'

const HERE = typeof __dirname !== 'undefined' ? __dirname : dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

const APT = 'RTMSDataSvcAptTrade'
const NRG = 'RTMSDataSvcNrgTrade'

function item(over: Partial<RealPriceItem> = {}): RealPriceItem {
  return {
    deal_ym: '202606',
    amount: 100_000,
    area: 84.97,
    floor: '8',
    name: '표본단지',
    dong: '잠실동',
    type: APT,
    ...over,
  }
}

// ── [결함 1] 매물 종류 불일치 ───────────────────────────────────────────────

test('[결함 1] 상가 매물의 비교군이 아파트 거래뿐이면 평균을 계산하지 않는다', () => {
  // 실측: 서울 중구 서소문로 138 상가 매물의 비교군이 남산타운·약수하이츠 등 전부 아파트였고
  // UI가 그 평균(18억 8,090만원)을 주변 금액으로 제시했다.
  const view = buildComparableSalesView({
    propertyType: 'commercial',
    legalDong: '서소문동',
    area: 300,
    items: [
      item({ name: '남산타운', amount: 1_200_000, area: 84.9 }),
      item({ name: '약수하이츠', amount: 1_100_000, area: 84.9 }),
      item({ name: '서울역센트럴자이', amount: 1_300_000, area: 84.9 }),
    ],
  })

  assert.equal(view.status, 'asset_type_mismatch')
  assert.equal(view.canShowStats, false)
  assert.equal(view.stats, null)
  assert.equal(view.matchedItems.length, 0)
  assert.equal(view.mismatchedCount, 3)
  assert.equal(view.needsRecollect, true)
})

test('[결함 1] 매핑에 없는 매물 종류는 아파트로 대체하지 않고 unsupported로 끝낸다', () => {
  for (const type of ['multi_unit', 'mixed_use', 'knowledge_industry', 'factory', 'forest', 'oneroom']) {
    assert.equal(dealServiceNameFor(type), null, `${type}은 매핑에 없어야 한다`)
    const view = buildComparableSalesView({ propertyType: type, items: [item()] })
    assert.equal(view.status, 'unsupported', `${type}은 unsupported여야 한다`)
    assert.equal(view.canShowStats, false)
    assert.equal(view.stats, null)
  }
})

test('[결함 1] 매물 종류별 서비스명 매핑이 유지된다', () => {
  assert.equal(COMPARABLE_DEAL_SERVICE_MAP.apartment, APT)
  assert.equal(COMPARABLE_DEAL_SERVICE_MAP.commercial, NRG)
  assert.equal(dealServiceNameFor('villa'), 'RTMSDataSvcRHTrade')
  assert.equal(dealServiceNameFor(null), null)
})

test('[결함 1] 수집기는 매물 종류와 무관하게 아파트 거래를 수집하지 않는다', () => {
  // 변경 전: const svcNames = new Set<string>(['RTMSDataSvcAptTrade']) 가 항상 아파트를 넣었다.
  // normalize-parcel 도 같은 코드를 복제해 real_price_data 를 쓰므로 함께 검사한다.
  for (const file of [
    'supabase/functions/collect-real-price/index.ts',
    'supabase/functions/normalize-parcel/index.ts',
  ]) {
    const source = read(file)
    assert.doesNotMatch(source, /new Set<string>\(\[\s*'RTMSDataSvcAptTrade'\s*\]\)/, `${file}이 아파트를 기본값으로 넣는다`)
    assert.doesNotMatch(source, /svcNames\.add/, `${file}이 아파트와 union 한다`)
  }
})

// ── [결함 2] 지역 구성 왜곡 ────────────────────────────────────────────────

test('[결함 2] 명명된 동이 과반이 아니면 그 동 이름으로 라벨링하지 않는다', () => {
  // 실측: 제주 신대로110(연동) 비교군 60건 중 연동 9건(15%), 노형동 23건(38%)인데 '연동 주변 거래 60건'이었다.
  const items = [
    ...Array.from({ length: 9 }, () => item({ dong: '연동' })),
    ...Array.from({ length: 23 }, () => item({ dong: '노형동' })),
    ...Array.from({ length: 28 }, () => item({ dong: '이도이동' })),
  ]
  const view = buildComparableSalesView({ propertyType: 'apartment', legalDong: '연동', area: 84.97, items })

  assert.equal(view.regionScope, 'sigungu')
  assert.doesNotMatch(view.regionLabel, /연동/)
  assert.match(view.regionLabel, /시·군·구 전체/)
  assert.equal(view.composition[0]?.dong, '이도이동')
  assert.equal(view.composition[0]?.count, 28)
  assert.ok((view.composition.find(c => c.dong === '연동')?.ratio ?? 0) < REGION_LABEL_MAJORITY_RATIO)
})

test('[결함 2] 55%는 과반이므로 동 이름으로 라벨링한다', () => {
  // 실측: 서울 잠실동 매물은 잠실동 33건 / 60건(55%)이다.
  const items = [
    ...Array.from({ length: 33 }, () => item({ dong: '잠실동' })),
    ...Array.from({ length: 27 }, () => item({ dong: '신천동' })),
  ]
  const view = buildComparableSalesView({ propertyType: 'apartment', legalDong: '잠실동', area: 84.97, items })

  assert.equal(view.regionScope, 'named_dong')
  assert.match(view.regionLabel, /잠실동 거래 60건/)
})

test('[결함 2] 정확히 절반이면 과반이 아니므로 동 이름을 쓰지 않는다', () => {
  const items = [
    ...Array.from({ length: 5 }, () => item({ dong: '연동' })),
    ...Array.from({ length: 5 }, () => item({ dong: '노형동' })),
  ]
  const view = buildComparableSalesView({ propertyType: 'apartment', legalDong: '연동', area: 84.97, items })
  assert.equal(view.regionScope, 'sigungu')
})

test('[결함 2] 숫자가 붙은 행정동 이름도 같은 동으로 센다', () => {
  assert.equal(normalizeDongName('역삼1동'), '역삼')
  assert.equal(normalizeDongName('역삼동'), '역삼')
  assert.equal(normalizeDongName(null), '')

  const items = Array.from({ length: 4 }, () => item({ dong: '역삼1동' }))
  const view = buildComparableSalesView({ propertyType: 'apartment', legalDong: '역삼동', area: 84.97, items })
  assert.equal(view.regionScope, 'named_dong')
})

test('[결함 2] 수집기의 동 필터 임계값 3건 분기가 남아 있지 않다', () => {
  const source = read('supabase/functions/collect-real-price/index.ts')
  assert.doesNotMatch(source, /sameDong\.length >= 3/)
})

// ── [결함 3] 면적 정규화 ──────────────────────────────────────────────────

test('[결함 3] 면적대를 벗어난 거래는 평균에서 제외한다', () => {
  // 실측: 잠실 84.97㎡ 매물 비교군에 151.008㎡ 아시아선수촌 54억이 섞여 평균 34억 2,522만원이 나왔다.
  const items = [
    item({ amount: 180_000, area: 84.97 }),
    item({ amount: 190_000, area: 82.5 }),
    item({ amount: 200_000, area: 88.0 }),
    item({ name: '아시아선수촌', amount: 540_000, area: 151.008 }),
  ]
  const view = buildComparableSalesView({ propertyType: 'apartment', legalDong: '잠실동', area: 84.97, items })

  assert.equal(view.canShowStats, true)
  assert.equal(view.statsBasis, 'area_band')
  assert.equal(view.stats?.count, 3)
  assert.equal(view.stats?.max, 200_000)
  assert.equal(view.stats?.average, 190_000)
  assert.ok((view.stats?.max ?? 0) < 540_000, '면적대 밖 거래가 최고가로 올라오면 안 된다')
  assert.equal(view.matchedItems.length, 4)
  assert.equal(view.bandCount, 3)
})

// ── [결함 5] 평균 산출 범위와 화면 목록이 어긋난다 ─────────────────────────
// 실측(운영 배포 후): 잠실 84.97㎡ 매물 화면이 '비슷한 면적(±20%) 거래 44건만으로
// 계산'이라고 쓰면서, 목록 맨 위에 평균에서 제외된 151.008㎡ 54억을 그대로 보여줬다.
// 중개사는 '평균 34억인데 맨 위가 54억'을 읽고 숫자를 신뢰할 수 없게 된다.

test('[결함 5] 평균에 쓴 거래와 쓰지 않은 거래를 목록에서 구분한다', () => {
  const items = [
    item({ name: '아시아선수촌', amount: 540_000, area: 151.008 }),
    item({ amount: 180_000, area: 84.97 }),
    item({ amount: 190_000, area: 82.5 }),
    item({ amount: 200_000, area: 88.0 }),
  ]
  const view = buildComparableSalesView({ propertyType: 'apartment', legalDong: '잠실동', area: 84.97, items })

  // 목록은 '평균에 쓴 것'만 담는다. 제외된 건은 별도 배열로 분리해 섞이지 않게 한다.
  assert.equal(view.statsItems.length, 3, '평균에 쓴 거래만 담는 배열이 있어야 한다')
  assert.equal(view.excludedItems.length, 1, '면적대 밖 거래는 별도로 분리해야 한다')
  assert.equal(view.excludedItems[0]?.name, '아시아선수촌')
  assert.ok(
    view.statsItems.every(it => (it.area ?? 0) <= 102 && (it.area ?? 0) >= 68),
    '평균에 쓴 목록에 면적대 밖 거래가 섞이면 안 된다',
  )
  // 평균 건수와 목록 건수가 같아야 '44건으로 계산'이라는 문장이 사실이 된다.
  assert.equal(view.statsItems.length, view.bandCount)
})

test('[결함 5] 화면 목록은 평균 산출 범위와 같은 배열을 쓴다', () => {
  // 화면이 matchedItems(전체)를 직접 렌더하면 통계 범위와 목록이 다시 어긋난다.
  for (const file of [
    'src/app/(dashboard)/projects/[id]/components/AnalysisTab.tsx',
    'src/app/(dashboard)/projects/[id]/components/LocationDataCards.tsx',
  ]) {
    const source = read(file)
    assert.doesNotMatch(source, /view\.matchedItems\.slice/, `${file}이 전체 목록을 그대로 렌더한다`)
    assert.match(source, /view\.statsItems/, `${file}이 평균 산출 범위를 쓰지 않는다`)
  }
})

test('[결함 5] 면적을 몰라 평균을 못 내면 목록도 평균 범위를 주장하지 않는다', () => {
  const items = [
    item({ amount: 180_000, area: 84.97 }),
    item({ amount: 540_000, area: 151.008 }),
    item({ amount: 200_000, area: 88.0 }),
  ]
  const view = buildComparableSalesView({ propertyType: 'apartment', legalDong: '잠실동', area: null, items })

  assert.equal(view.canShowStats, false)
  // 평균을 못 내는 상태에서는 걸러낼 기준도 없다. 전체를 보여주고 제외 목록은 비운다.
  assert.equal(view.statsItems.length, 3)
  assert.equal(view.excludedItems.length, 0)
})

test('[결함 5] 표본이 모자라 평균을 못 내면 전체를 보여주고 제외 주장도 하지 않는다', () => {
  const items = [
    item({ amount: 180_000, area: 84.97 }),
    item({ amount: 540_000, area: 151.008 }),
  ]
  const view = buildComparableSalesView({ propertyType: 'apartment', legalDong: '잠실동', area: 84.97, items })

  assert.equal(view.statsBasis, 'band_too_small')
  assert.equal(view.canShowStats, false)
  assert.equal(view.statsItems.length, 2, '평균을 못 내면 목록을 임의로 줄이지 않는다')
  assert.equal(view.excludedItems.length, 0)
})

test('[결함 5] 제외된 거래가 있으면 그 사실을 알리는 문장을 낸다', () => {
  const items = [
    item({ name: '아시아선수촌', amount: 540_000, area: 151.008 }),
    item({ amount: 180_000, area: 84.97 }),
    item({ amount: 190_000, area: 82.5 }),
    item({ amount: 200_000, area: 88.0 }),
  ]
  const view = buildComparableSalesView({ propertyType: 'apartment', legalDong: '잠실동', area: 84.97, items })

  assert.ok(view.excludedNote, '제외된 거래가 있으면 설명 문장이 있어야 한다')
  assert.match(view.excludedNote ?? '', /1건/)
  // 제외가 없으면 문장도 없다.
  const clean = buildComparableSalesView({
    propertyType: 'apartment',
    legalDong: '잠실동',
    area: 84.97,
    items: items.slice(1),
  })
  assert.equal(clean.excludedNote, null)
})

test('[결함 3] 매물 전용면적이 없으면 평균을 단정하지 않는다', () => {
  const items = [
    item({ amount: 180_000, area: 84.97 }),
    item({ amount: 540_000, area: 151.008 }),
    item({ amount: 200_000, area: 88.0 }),
  ]
  const view = buildComparableSalesView({ propertyType: 'apartment', legalDong: '잠실동', area: null, items })

  assert.equal(view.status, 'available')
  assert.equal(view.canShowStats, false)
  assert.equal(view.stats, null)
  assert.equal(view.statsBasis, 'missing_area')
  assert.equal(view.areaBand, null)
})

test('[결함 3] 같은 면적대 표본이 최소치보다 적으면 평균을 표시하지 않는다', () => {
  const items = [
    item({ amount: 180_000, area: 84.97 }),
    item({ amount: 540_000, area: 151.008 }),
  ]
  const view = buildComparableSalesView({ propertyType: 'apartment', legalDong: '잠실동', area: 84.97, items })

  assert.equal(view.statsBasis, 'band_too_small')
  assert.equal(view.canShowStats, false)
  assert.ok(AREA_BAND_MIN_SAMPLE >= 3)
})

test('[결함 3] 면적대 경계는 상수 ±20%로 계산한다', () => {
  assert.equal(AREA_BAND_RATIO, 0.2)
  const view = buildComparableSalesView({ propertyType: 'apartment', area: 100, items: [item({ area: 100 })] })
  assert.equal(view.areaBand?.min, 80)
  assert.equal(view.areaBand?.max, 120)
})

test('[결함 3] 금액이 없는 거래만 남으면 평균을 만들어내지 않는다', () => {
  const items = Array.from({ length: 4 }, () => item({ amount: null }))
  const view = buildComparableSalesView({ propertyType: 'apartment', area: 84.97, items })
  assert.equal(view.statsBasis, 'missing_amount')
  assert.equal(view.stats, null)
})

// ── 상태 구분 ─────────────────────────────────────────────────────────────

test('모든 비교군 상태가 서로 다른 사용자 문장을 반환한다', () => {
  const statuses: ComparableSalesStatus[] = [
    'not_collected', 'failed', 'unsupported', 'empty', 'asset_type_mismatch', 'available',
  ]
  const sentences = statuses.map(describeComparableSalesStatus)
  assert.equal(new Set(sentences).size, statuses.length, `상태 문장이 겹친다: ${sentences.join(' / ')}`)
  for (const s of sentences) assert.ok(s.length > 0)
})

test('수집 실패와 거래 없음은 서로 다른 문장이다', () => {
  assert.notEqual(describeComparableSalesStatus('failed'), describeComparableSalesStatus('empty'))
  assert.match(describeComparableSalesStatus('failed'), /가져오지 못했습니다/)
  assert.match(describeComparableSalesStatus('empty'), /한 건도 없었습니다/)

  const failed = buildComparableSalesView({ propertyType: 'apartment', items: [], collectionFailed: true })
  assert.equal(failed.status, 'failed')
  assert.equal(failed.needsRecollect, true)
})

test('미수집과 빈 배열은 서로 다른 상태다', () => {
  assert.equal(buildComparableSalesView({ propertyType: 'apartment' }).status, 'not_collected')
  assert.equal(buildComparableSalesView({ propertyType: 'apartment', items: [] }).status, 'empty')
})

test('모든 통계 근거가 서로 다른 문장을 반환한다', () => {
  const bases: ComparableStatsBasis[] = ['area_band', 'missing_area', 'band_too_small', 'missing_amount', 'no_comparables']
  const sentences = bases.map(b => describeComparableStatsBasis(b, 3))
  assert.equal(new Set(sentences).size, bases.length, `통계 근거 문장이 겹친다: ${sentences.join(' / ')}`)
})

// ── [결함 4] UI 표기 ──────────────────────────────────────────────────────

test('[결함 4] 화면은 실제 수집 범위와 다른 기간을 제목에 쓰지 않는다', () => {
  // 수집기는 6개월치를 모으는데 카드 제목은 '최근 실거래가 (3개월)'이었다.
  assert.equal(COMPARABLE_COLLECTION_MONTHS, 6)
  const surfaces = [
    read('src/app/(dashboard)/projects/[id]/components/LocationDataCards.tsx'),
    read('src/app/(dashboard)/projects/[id]/components/AnalysisTab.tsx'),
  ].join('\n')
  assert.doesNotMatch(surfaces, /최근 실거래가 \(3개월\)/)
  assert.doesNotMatch(surfaces, /실거래가 데이터 없음/)
})

test('[결함 4] 화면은 비교군 판정을 공용 모듈에서 가져온다', () => {
  for (const file of [
    'src/app/(dashboard)/projects/[id]/components/LocationDataCards.tsx',
    'src/app/(dashboard)/projects/[id]/components/AnalysisTab.tsx',
  ]) {
    assert.match(read(file), /comparable-sales/, `${file}이 비교군 판정 모듈을 쓰지 않는다`)
  }
})

test('[결함 4] 화면은 동 라벨을 직접 만들지 않는다', () => {
  const source = read('src/app/(dashboard)/projects/[id]/components/AnalysisTab.tsx')
  // 변경 전: {legalDong} 주변 거래 {real_price_data.length}건 — 비교군 구성과 무관한 라벨이었다.
  assert.doesNotMatch(source, /주변 거래 \{/)
  assert.doesNotMatch(source, /인근 거래 \{/)
})

// ── 엣지 함수 계약 ────────────────────────────────────────────────────────

test('엣지 함수는 DB update 에러를 확인한 뒤 success를 반환한다', () => {
  const source = read('supabase/functions/collect-real-price/index.ts')
  // 변경 전: update 결과를 받지 않고 바로 success: true 를 반환해 저장 실패가 성공으로 보고됐다.
  const updateIdx = source.indexOf('.update({ real_price_data })')
  assert.ok(updateIdx > 0, '비교군 저장 update 를 찾지 못했다')
  const block = source.slice(updateIdx)
  const errorCheckIdx = block.search(/if \(updateError\)/)
  const successIdx = block.indexOf('success: true')
  assert.ok(errorCheckIdx > 0, 'update 에러를 확인하지 않는다')
  assert.ok(errorCheckIdx < successIdx, 'update 에러 확인이 success 반환보다 앞에 있어야 한다')
  // 매핑 없는 종류의 빈 배열 저장도 에러를 확인해야 한다.
  assert.match(source, /unsupportedError/)
})

test('엣지 함수는 사용자 메시지에 환경변수 이름을 노출하지 않는다', () => {
  const source = read('supabase/functions/collect-real-price/index.ts')
  assert.doesNotMatch(source, /Error\('PUBLIC_DATA_API_KEY/)
  assert.doesNotMatch(source, /Error\('KAKAO_REST_API_KEY/)
})
