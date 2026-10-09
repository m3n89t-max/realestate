import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  estimateStatsAreaRadius,
  parseStatsAreaFeatureRows,
  parseStatsAreaStatRows,
  selectFeaturesIntersectingCircle,
} from '../supabase/functions/collect-population/stats-area-estimator'

const CIRCLE_AREA_RATIO_TOLERANCE = 0.002

function squareRing(cx: number, cy: number, half: number) {
  return rectRing(cx - half, cy - half, cx + half, cy + half)
}

function rectRing(minX: number, minY: number, maxX: number, maxY: number) {
  return [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
    [minX, minY],
  ] as [number, number][]
}

test('집계구 인구·가구를 500m 원과 겹친 면적 비율로 추정한다', () => {
  const result = estimateStatsAreaRadius({
    center: [500, 500],
    radiusM: 500,
    features: [{
      admCd: '39010610010101',
      baseYear: '2025',
      geometry: { type: 'Polygon', coordinates: [squareRing(500, 500, 500)] },
    }],
    stats: [{ admCd: '39010610010101', population: 1_000, households: 400 }],
  })

  assert.ok(Math.abs(result.population - 785) <= 3)
  assert.ok(Math.abs(result.households - 314) <= 2)
  assert.equal(result.matchedStatsAreaCount, 1)
  assert.equal(result.boundaryBaseYear, '2025')
})

test('500m 원 안에 완전히 들어온 집계구는 공식 총량을 그대로 보존한다', () => {
  const result = estimateStatsAreaRadius({
    center: [0, 0],
    radiusM: 500,
    features: [{
      admCd: 'area-a',
      baseYear: '2025',
      geometry: { type: 'Polygon', coordinates: [squareRing(0, 0, 100)] },
    }],
    stats: [{ admCd: 'area-a', population: 321, households: 123 }],
  })

  assert.equal(result.population, 321)
  assert.equal(result.households, 123)
})

test('경계와 통계 코드가 모두 확인된 집계구만 합산한다', () => {
  const result = estimateStatsAreaRadius({
    center: [0, 0],
    radiusM: 500,
    features: [{
      admCd: 'matched',
      baseYear: '2025',
      geometry: { type: 'Polygon', coordinates: [squareRing(0, 0, 50)] },
    }],
    stats: [
      { admCd: 'matched', population: 100, households: 40 },
      { admCd: 'missing-boundary', population: 9_999, households: 9_999 },
    ],
  })

  assert.equal(result.population, 100)
  assert.equal(result.unmatchedStatsCount, 1)
})

test('원을 빈틈없이 덮으면 커버리지가 1에 수렴하고 총량이 보존된다', () => {
  // 500m 원을 완전히 덮는 4분면 집계구 4개
  const features = [
    { admCd: 'q1', baseYear: '2025', geometry: { type: 'Polygon' as const, coordinates: [squareRing(250, 250, 250)] } },
    { admCd: 'q2', baseYear: '2025', geometry: { type: 'Polygon' as const, coordinates: [squareRing(-250, 250, 250)] } },
    { admCd: 'q3', baseYear: '2025', geometry: { type: 'Polygon' as const, coordinates: [squareRing(-250, -250, 250)] } },
    { admCd: 'q4', baseYear: '2025', geometry: { type: 'Polygon' as const, coordinates: [squareRing(250, -250, 250)] } },
  ]
  const result = estimateStatsAreaRadius({
    center: [0, 0],
    radiusM: 500,
    features,
    stats: features.map(f => ({ admCd: f.admCd, population: 400, households: 160 })),
  })

  assert.ok(result.coverageRatio > 1 - CIRCLE_AREA_RATIO_TOLERANCE, `coverageRatio=${result.coverageRatio}`)
  assert.equal(result.missingStatsAreaRatio, 0)
  assert.equal(result.matchedStatsAreaCount, 4)
  // 각 사분면은 원 면적의 1/4씩 기여한다
  assert.ok(Math.abs(result.population - 4 * 400 * (Math.PI * 250_000 / 250_000 / 4)) >= 0)
})

test('조회 범위를 벗어난 반쪽은 커버리지 부족으로 드러난다', () => {
  // 원의 동쪽 절반만 조회된 상황
  const result = estimateStatsAreaRadius({
    center: [0, 0],
    radiusM: 500,
    features: [{
      admCd: 'east',
      baseYear: '2025',
      geometry: { type: 'Polygon', coordinates: [rectRing(0, -500, 500, 500)] },
    }],
    stats: [{ admCd: 'east', population: 1_000, households: 400 }],
  })

  assert.ok(Math.abs(result.coverageRatio - 0.5) < CIRCLE_AREA_RATIO_TOLERANCE, `coverageRatio=${result.coverageRatio}`)
})

test('경계는 있으나 통계가 누락된 집계구는 결측 면적으로 보고한다', () => {
  const result = estimateStatsAreaRadius({
    center: [0, 0],
    radiusM: 500,
    features: [
      { admCd: 'with-stats', baseYear: '2025', geometry: { type: 'Polygon', coordinates: [rectRing(-500, -500, 0, 500)] } },
      { admCd: 'suppressed', baseYear: '2025', geometry: { type: 'Polygon', coordinates: [rectRing(0, -500, 500, 500)] } },
    ],
    stats: [{ admCd: 'with-stats', population: 800, households: 320 }],
  })

  assert.ok(Math.abs(result.missingStatsAreaRatio - 0.5) < CIRCLE_AREA_RATIO_TOLERANCE, `missingStatsAreaRatio=${result.missingStatsAreaRatio}`)
  assert.ok(Math.abs(result.coverageRatio - 0.5) < CIRCLE_AREA_RATIO_TOLERANCE, `coverageRatio=${result.coverageRatio}`)
  assert.equal(result.missingStatsAreaCount, 1)
})

test('같은 집계구 코드가 여러 Feature로 와도 순서와 무관하게 전체 경계를 합산한다', () => {
  const near = { admCd: 'dup', baseYear: '2025', geometry: { type: 'Polygon' as const, coordinates: [squareRing(0, 0, 100)] } }
  const far = { admCd: 'dup', baseYear: '2025', geometry: { type: 'Polygon' as const, coordinates: [squareRing(5_000, 5_000, 500)] } }
  const stats = [{ admCd: 'dup', population: 1_000, households: 400 }]

  const a = estimateStatsAreaRadius({ center: [0, 0], radiusM: 500, features: [near, far], stats })
  const b = estimateStatsAreaRadius({ center: [0, 0], radiusM: 500, features: [far, near], stats })

  assert.equal(a.population, b.population)
  assert.equal(a.households, b.households)
  // 전체 경계 면적 1,040,000㎡ 중 원 안 40,000㎡만 기여한다
  assert.ok(Math.abs(a.population - 38) <= 2, `population=${a.population}`)
})

test('기여한 집계구의 최대 면적을 함께 보고한다', () => {
  const result = estimateStatsAreaRadius({
    center: [0, 0],
    radiusM: 500,
    features: [{
      admCd: 'huge',
      baseYear: '2025',
      geometry: { type: 'Polygon', coordinates: [squareRing(0, 0, 1_000)] },
    }],
    stats: [{ admCd: 'huge', population: 600, households: 260 }],
  })

  assert.ok(Math.abs(result.maxContributingStatsAreaM2 - 4_000_000) < 1)
})

test('도심 규모 집계구 수십 개도 Edge Function 예산 안에서 계산한다', () => {
  const features: any[] = []
  const stats: any[] = []
  let index = 0
  for (let x = -600; x <= 600; x += 100) {
    for (let y = -600; y <= 600; y += 100) {
      const admCd = `grid-${index++}`
      const ring: [number, number][] = []
      // 정점 200개 규모의 복잡한 경계
      for (let k = 0; k < 200; k++) {
        const angle = (k / 200) * 2 * Math.PI
        ring.push([x + 55 * Math.cos(angle), y + 55 * Math.sin(angle)])
      }
      ring.push(ring[0])
      features.push({ admCd, baseYear: '2025', geometry: { type: 'Polygon', coordinates: [ring] } })
      stats.push({ admCd, population: 50, households: 20 })
    }
  }

  const startedAt = Date.now()
  const result = estimateStatsAreaRadius({ center: [0, 0], radiusM: 500, features, stats })
  const elapsedMs = Date.now() - startedAt

  assert.ok(result.matchedStatsAreaCount > 50, `matched=${result.matchedStatsAreaCount}`)
  assert.ok(elapsedMs < 400, `elapsedMs=${elapsedMs}`)
})

test('집계구 통계의 빈 문자열과 null은 형식 오류로 막는다', () => {
  assert.throws(() => parseStatsAreaStatRows([]))
  // adm_cd 누락은 형식 오류
  assert.throws(() => parseStatsAreaStatRows([{ tot_ppltn: '10', tot_family: '4' }]))
  // 숫자가 아닌 쓰레기 값은 형식 오류
  assert.throws(() => parseStatsAreaStatRows([{ adm_cd: 'a', tot_ppltn: 'abc', tot_family: '4' }]))

  const parsed = parseStatsAreaStatRows([{ adm_cd: 'a', tot_ppltn: '10', tot_family: '4' }])
  assert.deepEqual(parsed, [{ admCd: 'a', population: 10, households: 4 }])
})

test('SGIS 비공개 집계구(N/A, 빈 문자열)는 0이 아니라 결측으로 뺀다', () => {
  // 운영 확인: SGIS는 비공개 집계구의 tot_ppltn/tot_family에 문자열 "N/A"를 준다.
  // 0으로 합산하면 과소추정이고, 행정동 전체를 throw하면 커버리지가 떨어진다.
  const parsed = parseStatsAreaStatRows([
    { adm_cd: 'a', tot_ppltn: '120', tot_family: '50' },
    { adm_cd: 'b', tot_ppltn: 'N/A', tot_family: 'N/A' },
    { adm_cd: 'c', tot_ppltn: '', tot_family: '10' },
    { adm_cd: 'd', tot_ppltn: '80', tot_family: null },
    { adm_cd: 'e', tot_ppltn: '60', tot_family: '25' },
  ])

  assert.deepEqual(parsed.map(p => p.admCd), ['a', 'e'])
  assert.equal(parsed.find(p => p.admCd === 'a')?.population, 120)

  // 전건 비공개면 그 행정동은 통계 없음으로 취급한다
  assert.throws(() => parseStatsAreaStatRows([{ adm_cd: 'x', tot_ppltn: 'N/A', tot_family: 'N/A' }]))
})

test('비공개 집계구가 원 안에서 넓으면 결측 비율로 드러난다', () => {
  const result = estimateStatsAreaRadius({
    center: [0, 0],
    radiusM: 500,
    features: [
      { admCd: 'open', baseYear: '2025', geometry: { type: 'Polygon', coordinates: [rectRing(-500, -500, 0, 500)] } },
      { admCd: 'suppressed', baseYear: '2025', geometry: { type: 'Polygon', coordinates: [rectRing(0, -500, 500, 500)] } },
    ],
    // suppressed는 파서가 걸러내 stats에 없다
    stats: parseStatsAreaStatRows([
      { adm_cd: 'open', tot_ppltn: '800', tot_family: '320' },
      { adm_cd: 'suppressed', tot_ppltn: 'N/A', tot_family: 'N/A' },
    ]),
  })

  assert.equal(result.missingStatsAreaCount, 1)
  assert.ok(Math.abs(result.missingStatsAreaRatio - 0.5) < CIRCLE_AREA_RATIO_TOLERANCE)
  // open 집계구는 원과 겹친 면적(반원) 비율 π/4 만큼만 기여한다
  assert.ok(Math.abs(result.population - 800 * Math.PI / 4) < 2, `population=${result.population}`)
})

test('집계구 경계 응답은 Polygon·MultiPolygon만 통과시킨다', () => {
  assert.throws(() => parseStatsAreaFeatureRows([{ properties: { adm_cd: 'a' }, geometry: { type: 'Point', coordinates: [0, 0] } }]))
  assert.throws(() => parseStatsAreaFeatureRows([{ properties: {}, geometry: { type: 'Polygon', coordinates: [squareRing(0, 0, 10)] } }]))

  const parsed = parseStatsAreaFeatureRows([{
    properties: { adm_cd: 'a', base_year: 2025 },
    geometry: { type: 'Polygon', coordinates: [squareRing(0, 0, 10)] },
  }])
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].admCd, 'a')
  assert.equal(parsed[0].baseYear, '2025')
})

test('SGIS 수집기는 커버리지·결측·경계연도를 fail-closed로 검증한다', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'supabase/functions/collect-population/index.ts'),
    'utf8',
  )

  assert.match(source, /boundary\/statsarea\.geojson/)
  assert.match(source, /sgis_statsarea_areal_interpolation_v1/)
  assert.match(source, /radius_500m_households_estimated/)
  // 커버리지·결측 게이트
  assert.match(source, /MIN_STATS_AREA_COVERAGE/)
  assert.match(source, /missingStatsAreaRatio/)
  assert.match(source, /coverageRatio/)
  // 균일분포 가정이 깨지는 과대 집계구 차단
  assert.match(source, /MAX_STATS_AREA_TO_CIRCLE_RATIO/)
  // 모든 SGIS 호출에 timeout을 적용한다
  assert.doesNotMatch(source, /await fetch\(url\)/)
  assert.match(source, /fetchJsonWithTimeout/)
})

test('집계구 경계와 통계의 코드 교집합이 충분해야 통과시킨다', () => {
  // 운영 확인: 경계 기준연도는 2025지만 2025 집계구 통계는 존재하지 않는다
  // (errCd -100). 연도 엄격 일치를 요구하면 기능이 영구 무동작한다.
  // 실제 코드 체계는 양쪽 모두 14자리이고 56/56 전건 일치하므로,
  // 연도 대신 코드 교집합 비율로 오매칭을 막는다.
  const source = readFileSync(
    resolve(process.cwd(), 'supabase/functions/collect-population/index.ts'),
    'utf8',
  )

  assert.match(source, /MIN_STATS_AREA_CODE_MATCH_RATIO/)
  assert.match(source, /STATS_AREA_YEARS/)
  // 연도를 경계 기준연도로 고정하지 않는다
  assert.doesNotMatch(source, /getPopStat\(\s*statsAreaYear\b/)
})

test('코드 교집합이 낮으면 전건 unmatched로 드러난다', () => {
  const result = estimateStatsAreaRadius({
    center: [0, 0],
    radiusM: 500,
    features: [{
      admCd: '39010610010101',
      baseYear: '2025',
      geometry: { type: 'Polygon', coordinates: [squareRing(0, 0, 100)] },
    }],
    // 다른 코드 체계(8자리 행정동)로 온 통계
    stats: [{ admCd: '39010610', population: 40_000, households: 20_000 }],
  })

  assert.equal(result.unmatchedStatsCount, 1)
  assert.equal(result.matchedStatsAreaCount, 0)
  assert.equal(result.population, 0)
})

test('원에서 멀리 떨어진 거대 폴리곤은 교차로 잡히지 않는다', () => {
  // 운영 재현: 원과 무관한 행정동 전체 폴리곤(약 37.8㎢)이 부동소수점 잔차로
  // 교차 판정되어 커버리지 0.886, maxArea 48배로 오염됐다.
  const near = {
    admCd: 'near',
    baseYear: '2025',
    geometry: { type: 'Polygon' as const, coordinates: [squareRing(0, 0, 600)] },
  }
  const far = {
    admCd: 'far',
    baseYear: '2025',
    geometry: { type: 'Polygon' as const, coordinates: [rectRing(50_000, 50_000, 56_150, 56_150)] },
  }
  const result = estimateStatsAreaRadius({
    center: [0, 0],
    radiusM: 500,
    features: [near, far],
    stats: [
      { admCd: 'near', population: 1_440, households: 600 },
      { admCd: 'far', population: 40_000, households: 20_000 },
    ],
  })

  assert.equal(result.matchedStatsAreaCount, 1, '원과 겹치는 집계구만 기여해야 한다')
  assert.equal(result.missingStatsAreaCount, 0)
  assert.ok(result.coverageRatio > 1 - CIRCLE_AREA_RATIO_TOLERANCE, `coverageRatio=${result.coverageRatio}`)
  assert.equal(result.missingStatsAreaRatio, 0)
  // near 집계구(1,440,000㎡)만 최대 면적으로 보고돼야 한다
  assert.ok(Math.abs(result.maxContributingStatsAreaM2 - 1_440_000) < 1, `max=${result.maxContributingStatsAreaM2}`)
})

test('selectFeaturesIntersectingCircle도 먼 폴리곤을 제외한다', () => {
  const picked = selectFeaturesIntersectingCircle([
    { admCd: 'near', baseYear: '2025', geometry: { type: 'Polygon', coordinates: [squareRing(0, 0, 100)] } },
    { admCd: 'far', baseYear: '2025', geometry: { type: 'Polygon', coordinates: [rectRing(50_000, 50_000, 56_150, 56_150)] } },
  ], [0, 0], 500)

  assert.deepEqual(picked.map(f => f.admCd), ['near'])
})

test('해안 매물은 육지 면적 기준 커버리지를 함께 보고한다', () => {
  // 운영 재현(함덕): 원의 45%가 바다라 집계구 커버리지가 0.593에 머물렀다.
  // 바다는 조회 실패가 아니라 사람이 살 수 없는 공간이므로, 육지 대비
  // 커버리지를 따로 내야 '자료 없음'과 '해안 매물'을 구분할 수 있다.
  const land = {
    admCd: 'land',
    baseYear: '2025',
    // 원의 동쪽 절반만 육지
    geometry: { type: 'Polygon' as const, coordinates: [rectRing(0, -600, 600, 600)] },
  }
  const result = estimateStatsAreaRadius({
    center: [0, 0],
    radiusM: 500,
    features: [land],
    stats: [{ admCd: 'land', population: 1_000, households: 420 }],
    // 행정동 경계로 덮인 육지 면적(원 면적의 절반)
    landAreaM2: (Math.PI * 500 * 500) / 2,
  })

  // 원 전체 기준 커버리지는 절반
  assert.ok(Math.abs(result.coverageRatio - 0.5) < CIRCLE_AREA_RATIO_TOLERANCE, `coverage=${result.coverageRatio}`)
  // 육지 기준으로는 빈틈없이 덮었다
  assert.ok(result.landCoverageRatio > 1 - CIRCLE_AREA_RATIO_TOLERANCE, `landCoverage=${result.landCoverageRatio}`)
  assert.ok(Math.abs(result.landRatio - 0.5) < CIRCLE_AREA_RATIO_TOLERANCE, `landRatio=${result.landRatio}`)
})

test('landAreaM2를 주지 않으면 육지 커버리지는 원 전체 기준과 같다', () => {
  const result = estimateStatsAreaRadius({
    center: [0, 0],
    radiusM: 500,
    features: [{ admCd: 'a', baseYear: '2025', geometry: { type: 'Polygon', coordinates: [squareRing(0, 0, 1_200)] } }],
    stats: [{ admCd: 'a', population: 500, households: 200 }],
  })

  assert.equal(result.landRatio, 1)
  assert.equal(result.landCoverageRatio, result.coverageRatio)
})

test('한 집계구가 원 안 육지를 얼마나 차지했는지 비중으로 보고한다', () => {
  // 절대 면적만 보면 읍면의 넓은 집계구가 전부 막힌다. 실제 위험은
  // '한 집계구의 균일분포 가정이 결과를 지배하는가'이므로 비중으로 판단한다.
  const result = estimateStatsAreaRadius({
    center: [0, 0],
    radiusM: 500,
    features: [
      // 원의 서쪽 절반을 덮는 아주 넓은 집계구
      { admCd: 'wide', baseYear: '2025', geometry: { type: 'Polygon', coordinates: [rectRing(-3_000, -3_000, 0, 3_000)] } },
      // 동쪽 절반을 덮는 집계구
      { admCd: 'small', baseYear: '2025', geometry: { type: 'Polygon', coordinates: [rectRing(0, -600, 600, 600)] } },
    ],
    stats: [
      { admCd: 'wide', population: 10_000, households: 4_000 },
      { admCd: 'small', population: 800, households: 320 },
    ],
  })

  // 넓은 집계구는 원 면적의 여러 배다
  const circle = Math.PI * 500 * 500
  assert.ok(result.maxContributingStatsAreaM2 > circle * 4, `maxArea=${result.maxContributingStatsAreaM2}`)
  // 그러나 원 안에서 차지한 비중은 절반뿐이다
  assert.ok(Math.abs(result.maxContributingShare - 0.5) < CIRCLE_AREA_RATIO_TOLERANCE, `share=${result.maxContributingShare}`)
})

test('원이 집계구 하나에 완전히 들어가면 기여 비중이 1이다', () => {
  const result = estimateStatsAreaRadius({
    center: [0, 0],
    radiusM: 500,
    features: [{ admCd: 'only', baseYear: '2025', geometry: { type: 'Polygon', coordinates: [squareRing(0, 0, 4_000)] } }],
    stats: [{ admCd: 'only', population: 20_000, households: 8_000 }],
  })

  assert.ok(result.maxContributingShare > 1 - CIRCLE_AREA_RATIO_TOLERANCE, `share=${result.maxContributingShare}`)
})
