import type { KakaoDensity, POIItem } from './types'

export type MetricSemantics =
  | 'observed'
  | 'administrative_observed'
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

interface PopulationEstimateInput {
  radius_500m_estimated?: number | null
  radius_500m_households_estimated?: number | null
  adm_level?: string | null
  source_year?: string | number | null
  commercial_grade?: string | null
  metric_semantics?: string | null
  spatial_unit?: string | null
  estimation_method?: string | null
  source_as_of?: string | null
  boundary_base_year?: string | null
  stats_area_count?: number | null
  coverage_ratio?: number | null
  /** 500m 원 중 행정구역 경계로 덮인 육지 비율. 해안 매물은 1보다 작다 */
  land_ratio?: number | null
}

export interface PopulationEstimate {
  value: number
  households: number | null
  title: string
  description: string
  sourceLabel: string
  /**
   * 원 안에 사람이 살 수 없는 면적이 큰 경우의 해석 주의사항.
   * 해당 사항이 없거나 과거 저장값처럼 판단 근거가 없으면 null이다.
   */
  areaNote: string | null
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

export function getPopulationEstimate(input: PopulationEstimateInput | null | undefined): PopulationEstimate | null {
  if (!input) return null
  // 기존 값은 읍면동 전체를 균일하게 펼친 수치라 함덕 같은 넓은 읍·면에서
  // 명백한 과소추정을 만든다. 검증된 주거 재배분 또는 SGIS 집계구 경계면적 추정만 연다.
  const isResidentialRedistribution = input.estimation_method === 'official_residential_redistribution_v1'
  const isStatsAreaInterpolation = input.estimation_method === 'sgis_statsarea_areal_interpolation_v1'
  if (
    input.metric_semantics !== 'redistributed_estimate' ||
    input.spatial_unit !== 'radius_500m' ||
    (!isResidentialRedistribution && !isStatsAreaInterpolation) ||
    !input.source_as_of
  ) return null
  const raw = input.radius_500m_estimated
  if (raw == null || !Number.isFinite(raw) || raw < 0) return null
  const rawHouseholds = input.radius_500m_households_estimated
  const households = rawHouseholds != null && Number.isFinite(rawHouseholds) && rawHouseholds >= 0
    ? Math.round(rawHouseholds)
    : null

  if (isStatsAreaInterpolation) {
    // 서버에서 이미 걸렀지만, 과거에 저장된 낮은 커버리지 값이 남아 있을 수 있다.
    // 부분 커버리지는 곧 과소추정이므로 화면에서도 다시 막는다.
    const coverage = input.coverage_ratio
    if (coverage != null && (!Number.isFinite(coverage) || coverage < 0.9)) return null
    const areaCount = input.stats_area_count != null && Number.isFinite(input.stats_area_count) && input.stats_area_count > 0
      ? ` · 집계구 ${Math.round(input.stats_area_count)}개`
      : ''
    const boundaryYear = input.boundary_base_year ? ` · 경계 ${input.boundary_base_year}` : ''
    return {
      value: Math.round(raw),
      households,
      title: '매물 주변 500m 인구·가구',
      description: 'SGIS 집계구별 센서스 인구·가구를 500m 원과 겹친 경계면적 비율로 합산한 추정값이에요. 주민등록 세대수와는 모집단이 다릅니다.',
      sourceLabel: `SGIS 인구주택총조사 ${input.source_as_of}${areaCount}${boundaryYear} · 반경 500m`,
      areaNote: buildAreaNote(input.land_ratio),
    }
  }

  return {
    value: Math.round(raw),
    households,
    title: '매물 주변 500m 거주인구',
    description: '공식 인구를 실제 주거 분포에 따라 재배분한 추정값이에요.',
    sourceLabel: `${input.source_as_of} · 반경 500m`,
    areaNote: null,
  }
}

const MIN_LAND_RATIO_WITHOUT_NOTE = 0.95

/**
 * 원 안 비거주 면적(바다·하천)이 커서 같은 반경의 내륙 매물과 단순 비교하면
 * 안 되는 경우를 알린다. land_ratio가 없는 과거 저장값은 추측하지 않는다.
 */
function buildAreaNote(landRatio: number | null | undefined): string | null {
  if (landRatio == null || !Number.isFinite(landRatio)) return null
  if (landRatio >= MIN_LAND_RATIO_WITHOUT_NOTE || landRatio <= 0) return null
  const seaPercent = Math.round((1 - landRatio) * 100)
  if (seaPercent < 5) return null
  return `반경 500m 중 약 ${seaPercent}%는 바다·하천이라 사람이 살 수 없어요. 위 숫자는 나머지 육지 면적만 집계한 값이라, 같은 반경의 내륙 매물보다 작게 나오는 게 정상입니다.`
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

export function describeBarrierStatus(input: {
  barrier_status?: string | null
  barrier_names?: string[] | null
} | null | undefined): string | null {
  // 인구 자료를 아직 수집하지 않은 매물은 population_data 자체가 null이다.
  // 여기서 막지 않으면 호출부 한 곳만 가드를 빠뜨려도 페이지 전체가 죽는다.
  if (!input) return null
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
