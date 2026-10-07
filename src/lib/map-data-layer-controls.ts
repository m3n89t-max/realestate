export type MapDataLayerId =
  | 'facilities'
  | 'population'
  | 'activity'
  | 'spending'
  | 'land'

export interface MapDataLayerDefinition {
  id: MapDataLayerId
  label: string
  description: string
  scopeLabel: string
  sourceLabel: string
  colorClass: string
}

export interface MapDataLayerAvailability {
  facilities: boolean
  population: boolean
  activity: boolean
  spending: boolean
}

export interface MapDataLayerOption extends MapDataLayerDefinition {
  available: boolean
}

export const MAP_DATA_LAYER_DEFINITIONS: readonly MapDataLayerDefinition[] = [
  {
    id: 'facilities',
    label: '생활·교통',
    description: '주변 시설의 실제 위치와 밀집 정도를 보여줘요.',
    scopeLabel: '장소 좌표 · 매물 주변',
    sourceLabel: '카카오 로컬 API',
    colorClass: 'bg-orange-500 border-orange-400',
  },
  {
    id: 'population',
    label: '인구',
    description: '행정구역 평균으로 환산한 500m 거주인구 참고값이에요.',
    scopeLabel: '반경 500m 추정 · 행정구역 통계',
    sourceLabel: '통계청 SGIS',
    colorClass: 'bg-blue-600 border-blue-500',
  },
  {
    id: 'activity',
    label: '유동',
    description: '수집된 카드·상권 자료로 시간대별 활동 정도를 보여줘요.',
    scopeLabel: '제공기관 집계 범위 기준',
    sourceLabel: '제주데이터허브 · 소상공인시장진흥공단',
    colorClass: 'bg-violet-600 border-violet-500',
  },
  {
    id: 'spending',
    label: '상권·소비',
    description: '상권 결제 동향과 지역화폐 업종별 소비를 보여줘요.',
    scopeLabel: '상권 또는 읍면동 집계',
    sourceLabel: '서울특별시 · 한국조폐공사 · 공공 상권자료',
    colorClass: 'bg-sky-600 border-sky-500',
  },
  {
    id: 'land',
    label: '토지·지적',
    description: '카카오맵의 지적편집도로 토지 경계와 용도를 확인해요.',
    scopeLabel: '지도 지적편집도',
    sourceLabel: '카카오맵',
    colorClass: 'bg-emerald-600 border-emerald-500',
  },
] as const

export function buildMapDataLayerOptions(
  availability: MapDataLayerAvailability,
): MapDataLayerOption[] {
  return MAP_DATA_LAYER_DEFINITIONS.map(layer => ({
    ...layer,
    available: layer.id === 'land' || availability[layer.id],
  }))
}
