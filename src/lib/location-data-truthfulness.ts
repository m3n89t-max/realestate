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
  adm_level?: string | null
  source_year?: string | number | null
  commercial_grade?: string | null
  metric_semantics?: string | null
  spatial_unit?: string | null
  estimation_method?: string | null
  source_as_of?: string | null
}

export interface PopulationEstimate {
  value: number
  title: string
  description: string
  sourceLabel: string
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
  // 명백한 과소추정을 만든다. 실제 주거 분포를 사용한 새 방법만 fail-open 한다.
  if (
    input.metric_semantics !== 'redistributed_estimate' ||
    input.spatial_unit !== 'radius_500m' ||
    input.estimation_method !== 'official_residential_redistribution_v1' ||
    !input.source_as_of
  ) return null
  const raw = input.radius_500m_estimated
  if (raw == null || !Number.isFinite(raw) || raw < 0) return null

  return {
    value: Math.round(raw),
    title: '매물 주변 500m 거주인구',
    description: '공식 인구를 실제 주거 분포에 따라 재배분한 추정값이에요.',
    sourceLabel: `${input.source_as_of} · 반경 500m`,
  }
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
