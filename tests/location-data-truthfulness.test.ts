import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildFacilityHeatPoints,
  describeBarrierStatus,
  getPopulationEstimate,
  hasDisplayableMetric,
} from '../src/lib/location-data-truthfulness'

const readProjectFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test('행정구역 평균밀도로 만든 기존 500m 값은 표시하지 않는다', () => {
  const estimate = getPopulationEstimate({
    radius_500m_estimated: 1_000,
    commercial_grade: 'S',
    adm_level: '읍면동',
    source_year: '2023',
    estimation_method: '행정구역 평균 인구밀도 × 반경 500m 원 면적 단순 환산',
  })

  assert.equal(estimate, null, '공간 분포를 모르는 균일밀도 환산값은 숫자로 보여주면 안 된다')
})

test('검증된 소지역 재배분 값만 500m 추정치로 표시한다', () => {
  const estimate = getPopulationEstimate({
    radius_500m_estimated: 1_000,
    metric_semantics: 'redistributed_estimate',
    spatial_unit: 'radius_500m',
    estimation_method: 'official_residential_redistribution_v1',
    source_as_of: '2026-09',
  })

  assert.equal(estimate?.value, 1_000)
  assert.equal(estimate?.title, '매물 주변 500m 거주인구')
  assert.match(estimate?.description ?? '', /주거 분포/)
  assert.match(estimate?.sourceLabel ?? '', /2026-09/)
})

test('SGIS 집계구 경계면적 추정은 인구와 가구를 함께 표시한다', () => {
  const estimate = getPopulationEstimate({
    radius_500m_estimated: 2_340,
    radius_500m_households_estimated: 980,
    metric_semantics: 'redistributed_estimate',
    spatial_unit: 'radius_500m',
    estimation_method: 'sgis_statsarea_areal_interpolation_v1',
    source_as_of: '2024',
    boundary_base_year: '2025',
    stats_area_count: 4,
  })

  assert.equal(estimate?.value, 2_340)
  assert.equal(estimate?.households, 980)
  assert.match(estimate?.description ?? '', /집계구.*경계면적/)
  assert.match(estimate?.sourceLabel ?? '', /2024/)
  assert.match(estimate?.sourceLabel ?? '', /집계구 4개/)
})

test('센서스 가구와 주민등록 세대의 모집단 차이를 명시한다', () => {
  const estimate = getPopulationEstimate({
    radius_500m_estimated: 2_340,
    radius_500m_households_estimated: 980,
    metric_semantics: 'redistributed_estimate',
    spatial_unit: 'radius_500m',
    estimation_method: 'sgis_statsarea_areal_interpolation_v1',
    source_as_of: '2024',
    coverage_ratio: 0.97,
  })

  assert.match(estimate?.description ?? '', /주민등록 세대수와는 모집단이 다릅니다/)
})

test('해안 매물은 바다·하천 비율을 화면에 알린다', () => {
  // 운영(함덕): 원의 45%가 바다다. 육지 면적만 집계했다는 사실을 알리지 않으면
  // 사용자는 같은 반경의 도심 매물과 그대로 비교해버린다.
  const estimate = getPopulationEstimate({
    radius_500m_estimated: 1_380,
    radius_500m_households_estimated: 558,
    metric_semantics: 'redistributed_estimate',
    spatial_unit: 'radius_500m',
    estimation_method: 'sgis_statsarea_areal_interpolation_v1',
    source_as_of: '2024',
    boundary_base_year: '2025',
    stats_area_count: 8,
    coverage_ratio: 1,
    land_ratio: 0.549,
  })

  assert.equal(estimate?.value, 1_380)
  assert.match(estimate?.areaNote ?? '', /45%/)
  assert.match(estimate?.areaNote ?? '', /바다/)
  assert.match(estimate?.areaNote ?? '', /육지/)
})

test('육지 비율이 충분하면 바다 안내를 띄우지 않는다', () => {
  const estimate = getPopulationEstimate({
    radius_500m_estimated: 10_110,
    radius_500m_households_estimated: 4_865,
    metric_semantics: 'redistributed_estimate',
    spatial_unit: 'radius_500m',
    estimation_method: 'sgis_statsarea_areal_interpolation_v1',
    source_as_of: '2024',
    coverage_ratio: 1,
    land_ratio: 1,
  })

  assert.equal(estimate?.areaNote, null)
})

test('land_ratio가 없는 과거 저장값은 바다 안내를 추측하지 않는다', () => {
  const estimate = getPopulationEstimate({
    radius_500m_estimated: 2_340,
    radius_500m_households_estimated: 980,
    metric_semantics: 'redistributed_estimate',
    spatial_unit: 'radius_500m',
    estimation_method: 'sgis_statsarea_areal_interpolation_v1',
    source_as_of: '2024',
    coverage_ratio: 0.97,
  })

  assert.equal(estimate?.areaNote, null)
})

test('커버리지가 낮은 집계구 추정값은 숫자로 보여주지 않는다', () => {
  const estimate = getPopulationEstimate({
    radius_500m_estimated: 1_170,
    radius_500m_households_estimated: 480,
    metric_semantics: 'redistributed_estimate',
    spatial_unit: 'radius_500m',
    estimation_method: 'sgis_statsarea_areal_interpolation_v1',
    source_as_of: '2024',
    coverage_ratio: 0.52,
  })

  assert.equal(estimate, null, '원의 절반만 덮은 추정값은 과소추정이므로 표시하면 안 된다')
})

test('시설 히트포인트는 이름과 좌표가 같은 장소를 한 번만 포함한다', () => {
  const points = buildFacilityHeatPoints(
    {
      cafe: [{ name: '해변카페', distance_m: 120, lat: 33.1, lng: 126.1 }],
    },
    {
      radius_m: 500,
      collected_at: '2026-09-29T00:00:00Z',
      categories: {
        CE7: {
          label: '카페',
          total_count: 1,
          items: [{ name: '해변카페', address: '제주시', distance_m: 120, lat: 33.1, lng: 126.1 }],
        },
      },
    },
  )

  assert.equal(points.length, 1)
  assert.equal(points[0]?.name, '해변카페')
})

test('출처와 기준시점이 없는 유동인구·매출은 표시하지 않는다', () => {
  assert.equal(hasDisplayableMetric({ weekday: 10_000 }), false)
  assert.equal(hasDisplayableMetric({
    weekday: 10_000,
    provenance: {
      source: '부산광역시',
      metric_semantics: 'estimated',
      source_as_of: '2025-12',
    },
  }), true)
})

test('장벽 미수집과 조회 결과 없음은 서로 다르게 설명한다', () => {
  assert.equal(describeBarrierStatus({ barrier_status: 'failed' }), '장벽 자료를 확인하지 못했습니다.')
  assert.equal(describeBarrierStatus({ barrier_status: 'available', barrier_names: [] }), '조회 범위에서 주요 장벽이 확인되지 않았습니다.')
})

test('인구 자료가 없는 매물에서도 표시 헬퍼가 죽지 않는다', () => {
  // population_data는 수집 전 매물에서 null이다. 여기서 던지면 입지분석 페이지 전체가
  // 'This page couldn\'t load'로 죽는다(실제 장애: Cannot read properties of null (reading 'barrier_status')).
  for (const empty of [null, undefined]) {
    assert.equal(describeBarrierStatus(empty as never), null)
    assert.equal(getPopulationEstimate(empty as never), null)
  }
})

test('제품 화면은 오해를 부르는 입지분석 문구를 사용하지 않는다', () => {
  const surfaces = [
    readProjectFile('src/components/KakaoMap.tsx'),
    readProjectFile('src/app/(dashboard)/projects/[id]/components/AnalysisTab.tsx'),
    readProjectFile('src/lib/map-data-layer-controls.ts'),
  ].join('\n')

  assert.doesNotMatch(surfaces, /유효 배후인구/)
  assert.doesNotMatch(surfaces, /유동인구 히트맵/)
  assert.doesNotMatch(surfaces, /카드 사용량 기반 유동인구 추정 \(전국 적용\)/)
  assert.doesNotMatch(surfaces, /populationData\.radius_500m_estimated\s*!=\s*null/)
  assert.doesNotMatch(surfaces, /population_data\?\.radius_500m_estimated\s*!=\s*null/)
  assert.doesNotMatch(surfaces, /populationData\.total_population\s*\/\s*10000/)
  assert.doesNotMatch(surfaces, /행정구역 평균으로 환산한 500m/)
  assert.doesNotMatch(surfaces, /행정구역 평균 및 500m 단순 환산/)
  assert.doesNotMatch(readProjectFile('src/components/KakaoMap.tsx'), /populationData\.total_population/)
})

test('SGIS 수집기는 읍면동 평균밀도로 500m 인구를 만들지 않는다', () => {
  const source = readProjectFile('supabase/functions/collect-population/index.ts')
  assert.doesNotMatch(source, /useDensity\s*\*\s*Math\.PI\s*\*\s*0\.25/)
  assert.doesNotMatch(source, /행정구역 평균 인구밀도 × 반경 500m 원 면적/)
})

test('SGIS 진단 API는 운영 환경에서 공개되지 않는다', () => {
  const source = readProjectFile('src/app/api/test-sgis/route.ts')
  assert.match(source, /process\.env\.NODE_ENV === 'production'/)
  assert.match(source, /status:\s*404/)
})

test('공공자료 분산 잠금은 큰 JSON 전체를 URL 필터에 넣지 않는다', () => {
  const source = readProjectFile('src/app/api/public-data-layers/route.ts')
  assert.doesNotMatch(source, /eq\('public_data_layers',\s*JSON\.stringify/)
  assert.match(source, /public_data_layers->>collection_revision/)
})
