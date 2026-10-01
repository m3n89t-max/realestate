import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  CURRENT_POPULATION_METHOD,
  CURRENT_POPULATION_METHOD_LABEL,
  DEPRECATED_POPULATION_FIELDS,
  buildFacilityHeatPoints,
  canRenderPopulationStats,
  describeBarrierStatus,
  describePopulationStatus,
  evaluatePopulationDisplay,
  getPopulationEstimate,
  hasDisplayableMetric,
  type PopulationDisplayStatus,
} from '../src/lib/location-data-truthfulness'

const readProjectFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

/** 지금 방법으로 수집된 정상 행. */
const currentRow = {
  radius_500m_estimated: 1_000,
  adm_level: '읍면동',
  adm_nm: '연동',
  source_year: '2023',
  estimation_method: CURRENT_POPULATION_METHOD,
  status: 'available',
  density: 1_273,
  total_population: 20_000,
}

test('상권등급은 거주인구 추정값을 바꾸지 않는다', () => {
  const estimate = getPopulationEstimate({ ...currentRow, commercial_grade: 'S' })

  assert.equal(estimate?.value, 1_000)
  assert.equal(estimate?.title, '매물 주변 500m 거주인구')
  assert.match(estimate?.sourceLabel ?? '', /2023년 · 읍면동 통계/)
  assert.equal(estimate?.method, CURRENT_POPULATION_METHOD)
  assert.equal(estimate?.methodLabel, CURRENT_POPULATION_METHOD_LABEL)
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
    // 게이트도 정의부에서 null-safe 해야 한다. 가드를 지우면 이 줄이 던진다.
    assert.equal(evaluatePopulationDisplay(empty as never).status, 'not_collected')
    assert.equal(canRenderPopulationStats(empty as never), false)
  }
})

test('제품 화면은 오해를 부르는 입지분석 문구를 사용하지 않는다', () => {
  const surfaces = [
    readProjectFile('src/components/KakaoMap.tsx'),
    readProjectFile('src/app/(dashboard)/projects/[id]/components/AnalysisTab.tsx'),
  ].join('\n')

  assert.doesNotMatch(surfaces, /유효 배후인구/)
  assert.doesNotMatch(surfaces, /유동인구 히트맵/)
  assert.doesNotMatch(surfaces, /카드 사용량 기반 유동인구 추정 \(전국 적용\)/)
})

test('SGIS 진단 API는 운영 환경에서 공개되지 않는다', () => {
  const source = readProjectFile('src/app/api/test-sgis/route.ts')
  assert.match(source, /process\.env\.NODE_ENV === 'production'/)
  assert.match(source, /status:\s*404/)
})

// ── 거주인구 표시 게이트 ─────────────────────────────────────────────────────

test('산정 방법 스탬프가 없는 레거시 행은 거주인구 값을 렌더하지 않는다', () => {
  // 운영 DB 22건 전부가 이 모양이다(estimation_method 없음). 예전에는 화면이
  // 이 값을 그대로 '약 N명'으로 보여줬고, 같은 주소가 수집 시점에 따라
  // 6,816명 / 11,035명(1.6배)으로 갈렸다.
  const legacy = { ...currentRow, estimation_method: undefined }
  const result = evaluatePopulationDisplay(legacy)

  assert.equal(result.status, 'superseded_method')
  assert.equal(result.estimate, null)
  assert.equal(result.needsRecollection, true)
  assert.equal(getPopulationEstimate(legacy), null)
})

test('구버전 산정 방법으로 계산된 행은 거부한다', () => {
  // 집계구 가중 밀도 경로로 계산된 행. 읍면동 평균 환산값과 최대 7배 차이가 났다.
  const otherMethod = { ...currentRow, estimation_method: 'census_block_weighted_density@0' }

  assert.equal(evaluatePopulationDisplay(otherMethod).status, 'superseded_method')
  assert.equal(getPopulationEstimate(otherMethod), null)
})

test('기준연도나 공간단위가 없는 파생 수치는 렌더하지 않는다', () => {
  // '기준연도 미표기'라는 문자열을 붙여서 값을 그대로 보여주면 안 된다.
  for (const broken of [
    { ...currentRow, source_year: null },
    { ...currentRow, source_year: '  ' },
    { ...currentRow, adm_level: null },
    { ...currentRow, adm_level: '' },
  ]) {
    const result = evaluatePopulationDisplay(broken)
    assert.equal(result.status, 'superseded_method')
    assert.equal(result.estimate, null)
    assert.doesNotMatch(result.message, /미표기/)
  }
})

test('폐기된 barrier_coefficient 를 들고 있는 행은 값과 장벽 모두 거부한다', () => {
  // 운영에 3건 남아 있다(25 / 53 / 70). 차감이 값에 반영됐는지 행만 보고는 알 수 없다.
  // 화면은 '현재는 인구 숫자에서 임의로 차감하지 않는다'고 안내하므로,
  // 차감 시절 값을 같은 화면에 섞으면 안내문 자체가 거짓이 된다.
  const deducted = {
    ...currentRow,
    barrier_coefficient: 70,
    barrier_status: 'available',
    barrier_names: ['애조로'],
  }

  assert.equal(evaluatePopulationDisplay(deducted).status, 'superseded_method')
  assert.equal(getPopulationEstimate(deducted), null)
  assert.equal(describeBarrierStatus(deducted), null)
  assert.equal(canRenderPopulationStats(deducted), false)
  assert.ok(DEPRECATED_POPULATION_FIELDS.includes('barrier_coefficient'))
})

test('수집 실패 행은 인구 숫자를 0명으로 렌더하지 않는다', () => {
  // 제주 수덕로78 / 경기 병점중앙로156번길: density 0, total_population 0, error 키 존재.
  // 0을 렌더하면 '이 동네 인구가 0명'이라는 발견처럼 읽힌다.
  const failedRow = {
    error: 'SGIS 역지오코딩 실패',
    density: 0,
    total_population: 0,
    collected_at: '2026-07-31T00:00:00Z',
  }

  const result = evaluatePopulationDisplay(failedRow)
  assert.equal(result.status, 'failed')
  assert.equal(result.estimate, null)
  assert.equal(canRenderPopulationStats(failedRow), false)
  assert.doesNotMatch(result.message, /0/)
})

test('거주인구 상태 7가지는 서로 다른 사용자 문장을 낸다', () => {
  const statuses: PopulationDisplayStatus[] = [
    'available',
    'available_without_value',
    'superseded_method',
    'unsupported',
    'unconfigured',
    'failed',
    'not_collected',
  ]
  const messages = statuses.map(describePopulationStatus)

  for (const message of messages) {
    assert.ok(message && message.trim().length > 0, '빈 문장인 상태가 있다')
  }
  assert.equal(new Set(messages).size, statuses.length, '두 상태가 같은 문장을 쓴다')
  // 환경변수 이름을 사용자에게 노출하지 않는다.
  assert.doesNotMatch(messages.join('\n'), /SGIS_SERVICE_ID|SGIS_SECURITY_KEY|SUPABASE_/)
})

test('미지원 지역과 관리자 설정 대기와 미수집은 서로 다른 상태다', () => {
  assert.equal(evaluatePopulationDisplay({ status: 'unsupported' }).status, 'unsupported')
  assert.equal(evaluatePopulationDisplay({ status: 'unconfigured' }).status, 'unconfigured')
  assert.equal(evaluatePopulationDisplay(null).status, 'not_collected')
  // 미지원은 다시 눌러도 결과가 같으므로 재수집 대상이 아니다.
  assert.equal(evaluatePopulationDisplay({ status: 'unsupported' }).needsRecollection, false)
  assert.equal(evaluatePopulationDisplay({ status: 'unconfigured' }).needsRecollection, false)
})

test('스탬프는 멀쩡하지만 추정값만 없는 행은 available_without_value 다', () => {
  for (const raw of [null, undefined, Number.NaN, -1]) {
    const row = { ...currentRow, radius_500m_estimated: raw }
    assert.equal(evaluatePopulationDisplay(row).status, 'available_without_value')
    assert.equal(getPopulationEstimate(row), null)
  }
  // 행정구역 통계 자체는 정상이므로 인구 통계 블록은 계속 보여준다.
  assert.equal(canRenderPopulationStats({ ...currentRow, radius_500m_estimated: null }), true)
})

test('인구 통계 블록은 기준연도 없는 숫자를 렌더하지 않는다', () => {
  assert.equal(canRenderPopulationStats(currentRow), true)
  assert.equal(canRenderPopulationStats({ ...currentRow, source_year: null }), false)
  assert.equal(canRenderPopulationStats({ ...currentRow, total_population: 0 }), false)
})

// ── 산정 경로 단일화 (엣지 함수 소스 검증) ───────────────────────────────────

test('엣지 함수는 산정 경로가 하나뿐이고 계산한 방법을 그대로 스탬프한다', () => {
  const source = readProjectFile('supabase/functions/collect-population/index.ts')

  // 두 번째 계산 경로(집계구 가중 밀도)가 되살아나면 같은 주소가 다시 두 값을 낸다.
  assert.doesNotMatch(source, /low_search=1|'1',\s*token/)
  assert.doesNotMatch(source, /useDensity/)
  assert.doesNotMatch(source, /barrier_coefficient/)

  // 화면이 거부하지 않도록 식별자가 양쪽에서 일치해야 한다.
  assert.ok(
    source.includes(CURRENT_POPULATION_METHOD),
    `엣지 함수가 ${CURRENT_POPULATION_METHOD} 를 스탬프하지 않는다`,
  )
  // 환산식은 읍면동 평균 밀도 하나만 쓴다.
  assert.match(source, /ppltn_dnsty/)
  assert.match(source, /Math\.PI \* 0\.25/)
})

test('엣지 함수는 수집 실패를 파생 객체로 남기지 않는다', () => {
  const source = readProjectFile('supabase/functions/collect-population/index.ts')

  // 실패 경로에서 population_data 를 update 하면 0 숫자가 DB에 남는다.
  assert.doesNotMatch(source, /error:\s*e\.message[\s\S]{0,200}?update\(\{\s*population_data/)
  // DB update 에러를 확인한 뒤 success 를 반환해야 한다.
  assert.match(source, /updateError/)
})

test('표시 게이트 predicate 는 컴포넌트에서 재구성되지 않는다', () => {
  // 컴포넌트가 radius_500m_estimated 유무로 '표시 가능해 보임'을 다시 유도하면
  // 게이트가 둘로 갈라지고 레거시 행이 새 화면으로 흘러든다.
  for (const path of [
    'src/components/KakaoMap.tsx',
    'src/app/(dashboard)/projects/[id]/components/AnalysisTab.tsx',
  ]) {
    const source = readProjectFile(path)
    assert.doesNotMatch(
      source,
      /radius_500m_estimated\s*!=\s*null/,
      `${path} 가 표시 조건을 직접 재구성한다`,
    )
    assert.doesNotMatch(
      source,
      /populationData as any\)\.error|population_data\.error/,
      `${path} 가 error 키로 표시 조건을 직접 판단한다`,
    )
  }
})
