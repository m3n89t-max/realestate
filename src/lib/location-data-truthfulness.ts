import type { KakaoDensity, POIItem } from './types'

export type MetricSemantics =
  | 'observed'
  | 'sample_observed'
  | 'estimated'
  | 'redistributed_estimate'
  | 'local_currency'
  | 'proxy'

export interface DataProvenance {
  source: string
  metric_semantics: MetricSemantics
  source_as_of: string | null
  collected_at?: string | null
  spatial_unit?: string | null
  method?: string | null
  coverage_note?: string | null
}

/**
 * 거주인구 추정의 정식 산정 방법 식별자.
 *
 * 이 값이 그대로 찍혀 있지 않은 행은 표시하지 않는다. 과거에 두 가지 계산 경로가
 * 공존했고(읍면동 평균 밀도 환산 / 집계구 가중 밀도 환산), 화면은 둘을 똑같이
 * '약 N명'으로 보여줬다. 그래서 같은 주소가 수집 시점에 따라 1.6~7.0배까지 다른
 * 값을 냈다. 방법 이름을 행에 남기고, 이름이 다르면 거부하는 것이 유일한 해법이다.
 *
 * 숫자 접미사(@1)는 산식이 바뀔 때 올린다. 올리면 과거 행은 자동으로 거부된다.
 */
export const CURRENT_POPULATION_METHOD = 'adm_avg_density_x_circle_500m@1'

/** 사람이 읽는 산식 설명. 엣지 함수와 화면이 같은 문장을 쓰도록 한곳에 둔다. */
export const CURRENT_POPULATION_METHOD_LABEL =
  '읍면동 평균 인구밀도 × 반경 500m 원 면적(0.785㎢) 단순 환산'

/**
 * 폐기된 필드. 이 키가 남아 있는 행은 '인구 숫자에서 임의로 차감하던 시절'의 값이다.
 * 차감이 값에 반영됐는지 행만 보고는 알 수 없으므로 표시하지 않는다.
 */
export const DEPRECATED_POPULATION_FIELDS = ['barrier_coefficient'] as const

export type PopulationDisplayStatus =
  | 'available'
  | 'available_without_value'
  | 'superseded_method'
  | 'unsupported'
  | 'unconfigured'
  | 'failed'
  | 'not_collected'

export interface PopulationSourceInput {
  radius_500m_estimated?: number | null
  adm_level?: string | null
  adm_nm?: string | null
  source_year?: string | number | null
  estimation_method?: string | null
  status?: string | null
  error?: unknown
  commercial_grade?: string | null
  barrier_status?: string | null
  barrier_names?: string[] | null
  barrier_coefficient?: number | null
  density?: number | null
  total_population?: number | null
  [key: string]: unknown
}

export interface PopulationEstimate {
  value: number
  title: string
  description: string
  sourceLabel: string
  method: string
  methodLabel: string
}

export interface PopulationDisplayState {
  status: PopulationDisplayStatus
  /** 초보 중개사가 바로 이해할 평문 한 문장. 상태마다 서로 다르다. */
  message: string
  /** status === 'available' 일 때만 값이 들어 있다. 그 외에는 항상 null. */
  estimate: PopulationEstimate | null
  /** 다시 수집하면 해결되는 상태인지. */
  needsRecollection: boolean
}

const POPULATION_MESSAGES: Record<PopulationDisplayStatus, string> = {
  available: '행정구역 평균 인구밀도로 환산한 참고값이에요. 실제 보행권 인구와는 다를 수 있어요.',
  available_without_value: '인구 자료는 받았지만 주변 500m 거주인구 추정값은 들어오지 않았어요.',
  superseded_method:
    '예전 산정 방법으로 계산된 값이라 보여드리지 않아요. 다시 수집하면 지금 기준으로 다시 계산해요.',
  unsupported: '이 지역은 공개된 인구 통계가 없어서 거주인구를 추정할 수 없어요.',
  unconfigured: '관리자가 인구 통계 연결을 준비하고 있어요. 준비되면 자동으로 채워져요.',
  failed: '인구 자료를 가져오지 못했어요. 다시 수집해 주세요.',
  not_collected: '주변 거주인구를 아직 수집하지 않았어요.',
}

/** 상태별 안내 문장. 테스트가 7개 상태 전부 서로 다른 문장인지 확인한다. */
export function describePopulationStatus(status: PopulationDisplayStatus): string {
  return POPULATION_MESSAGES[status]
}

function hasDeprecatedPopulationField(input: PopulationSourceInput): boolean {
  return DEPRECATED_POPULATION_FIELDS.some(
    (field) => Object.prototype.hasOwnProperty.call(input, field) && input[field] != null,
  )
}

function state(
  status: PopulationDisplayStatus,
  estimate: PopulationEstimate | null = null,
): PopulationDisplayState {
  return {
    status,
    message: POPULATION_MESSAGES[status],
    estimate,
    needsRecollection:
      status === 'superseded_method' ||
      status === 'failed' ||
      status === 'not_collected' ||
      status === 'available_without_value',
  }
}

/**
 * 거주인구 표시 게이트. 화면은 이 함수 결과만 믿는다.
 *
 * 컴포넌트에서 `population_data?.radius_500m_estimated != null` 같은 조건으로
 * '표시 가능해 보임'을 다시 유도하지 마라. 그렇게 하면 게이트가 늘어나고
 * 레거시 행이 새 화면으로 흘러든다.
 *
 * null/undefined 를 넣어도 던지지 않는다(정의부 null-safe). 과거에 표시 헬퍼가
 * null 을 역참조해 입지분석 페이지 전체가 죽은 사고가 있었다.
 */
export function evaluatePopulationDisplay(
  input: PopulationSourceInput | null | undefined,
): PopulationDisplayState {
  if (!input || typeof input !== 'object') return state('not_collected')

  // 1) 관리자 설정 대기. 환경변수 이름을 사용자에게 노출하지 않는다.
  if (input.status === 'unconfigured') return state('unconfigured')

  // 2) 이 지역 공개자료 없음. '실패'와 구분한다 — 다시 눌러도 결과가 같다.
  if (input.status === 'unsupported') return state('unsupported')

  // 3) 수집 실패. error 키가 남아 있는 레거시 행도 여기로 보낸다.
  //    실패 행은 density 0 / total_population 0 을 들고 있어서, 숫자를 렌더하면
  //    '이 동네 인구가 0명'이라는 발견처럼 읽힌다. 숫자 없이 실패로만 말한다.
  if (input.status === 'failed' || input.error != null) return state('failed')

  // 4) 폐기 필드를 들고 있는 행. 차감이 값에 반영됐는지 알 수 없으므로 거부한다.
  if (hasDeprecatedPopulationField(input)) return state('superseded_method')

  // 5) 산정 방법 스탬프가 없거나 지금 방법이 아닌 행.
  if (input.estimation_method !== CURRENT_POPULATION_METHOD) return state('superseded_method')

  // 6) 기준연도·공간단위가 없는 파생 수치는 렌더하지 않는다.
  //    '기준연도 미표기'라는 문자열을 달아서 값을 그대로 보여주면 안 된다.
  const year = input.source_year == null ? '' : String(input.source_year).trim()
  const level = input.adm_level == null ? '' : String(input.adm_level).trim()
  if (!year || !level) return state('superseded_method')

  // 7) 스탬프와 출처는 멀쩡한데 값만 없는 경우.
  const raw = input.radius_500m_estimated
  if (raw == null || typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) {
    return state('available_without_value')
  }

  return state('available', {
    value: Math.round(raw),
    title: '매물 주변 500m 거주인구',
    description: POPULATION_MESSAGES.available,
    sourceLabel: `${year}년 · ${level} 통계`,
    method: CURRENT_POPULATION_METHOD,
    methodLabel: CURRENT_POPULATION_METHOD_LABEL,
  })
}

/**
 * 표시 가능한 거주인구 추정값만 돌려준다. 게이트를 통과하지 못하면 null.
 * 상태별 안내 문장이 필요하면 evaluatePopulationDisplay 를 쓰라.
 */
export function getPopulationEstimate(
  input: PopulationSourceInput | null | undefined,
): PopulationEstimate | null {
  return evaluatePopulationDisplay(input).estimate
}

/**
 * 행정구역 인구·가구 통계 블록(총인구/밀도/가구수)을 렌더해도 되는지.
 *
 * 500m 추정값과 달리 이 숫자들은 SGIS 가 그대로 준 값이라 산정 방법과 무관하다.
 * 다만 수집 실패·미설정·미지원 행은 0 을 들고 있으므로 막아야 하고, 기준연도가
 * 없는 행도 막는다(언제 자료인지 모르는 숫자를 보여줄 수 없다).
 */
export function canRenderPopulationStats(
  input: PopulationSourceInput | null | undefined,
): boolean {
  if (!input || typeof input !== 'object') return false
  if (input.status === 'unconfigured' || input.status === 'unsupported') return false
  if (input.status === 'failed' || input.error != null) return false
  if (hasDeprecatedPopulationField(input)) return false
  const year = input.source_year == null ? '' : String(input.source_year).trim()
  if (!year) return false
  const total = input.total_population
  return typeof total === 'number' && Number.isFinite(total) && total > 0
}

export interface FacilityHeatPoint {
  name: string
  lat: number
  lng: number
  value: number
}

const FACILITY_WEIGHT: Record<string, number> = {
  subway: 10,
  mart: 7,
  convenience: 5,
  cafe: 4,
  restaurant: 4,
  hospital: 3,
  pharmacy: 3,
  school: 3,
  bank: 2,
  culture: 2,
}

function heatPointKey(name: string, lat: number, lng: number): string {
  return `${name.trim().toLocaleLowerCase('ko-KR')}|${lat.toFixed(5)}|${lng.toFixed(5)}`
}

export function buildFacilityHeatPoints(
  poiData?: Record<string, POIItem[]> | null,
  kakaoDensity?: KakaoDensity | null,
): FacilityHeatPoint[] {
  const points = new Map<string, FacilityHeatPoint>()

  const add = (name: string | undefined, lat: number | undefined, lng: number | undefined, value: number) => {
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) return
    const safeLat = lat as number
    const safeLng = lng as number
    const key = heatPointKey(name, safeLat, safeLng)
    const previous = points.get(key)
    if (!previous || previous.value < value) {
      points.set(key, { name, lat: safeLat, lng: safeLng, value })
    }
  }

  if (poiData) {
    for (const [category, items] of Object.entries(poiData)) {
      const weight = FACILITY_WEIGHT[category] ?? 2
      for (const item of items) add(item.name, item.lat, item.lng, weight)
    }
  }

  if (kakaoDensity?.categories) {
    for (const category of Object.values(kakaoDensity.categories)) {
      for (const item of category.items ?? []) add(item.name, item.lat, item.lng, 3)
    }
  }

  return [...points.values()]
}

export function hasDisplayableMetric(metric: unknown): boolean {
  if (!metric || typeof metric !== 'object') return false
  const provenance = (metric as { provenance?: Partial<DataProvenance> }).provenance
  if (!provenance?.source || !provenance.source_as_of) return false
  return provenance.metric_semantics !== 'proxy' && provenance.metric_semantics != null
}

export function describeBarrierStatus(input: PopulationSourceInput | null | undefined): string | null {
  // 인구 자료를 아직 수집하지 않은 매물은 population_data 자체가 null이다.
  // 여기서 막지 않으면 호출부 한 곳만 가드를 빠뜨려도 페이지 전체가 죽는다.
  if (!input || typeof input !== 'object') return null

  // 폐기된 차감 계수를 들고 있는 행의 장벽 목록은 '참고정보'가 아니라
  // 인구 숫자를 깎는 입력으로 쓰였다. 같은 화면에서 참고정보처럼 보여줄 수 없다.
  if (hasDeprecatedPopulationField(input)) return null

  if (input.barrier_status === 'failed') return '장벽 자료를 확인하지 못했습니다.'
  if (input.barrier_status === 'not_collected') return '장벽 자료를 아직 수집하지 않았습니다.'
  if (input.barrier_status === 'available' && (input.barrier_names?.length ?? 0) === 0) {
    return '조회 범위에서 주요 장벽이 확인되지 않았습니다.'
  }
  if (input.barrier_status === 'available' && input.barrier_names?.length) {
    return `확인된 주요 장벽: ${input.barrier_names.join(', ')}`
  }
  return null
}
