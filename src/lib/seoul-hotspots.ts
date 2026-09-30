import hotspotsData from './data/seoul-hotspots.json'

/**
 * 서울시 실시간 도시데이터/상권현황 API가 지원하는 주요 장소 목록.
 *
 * API는 좌표로 조회할 수 없고 장소명 또는 장소코드로만 조회된다.
 * 따라서 매물 좌표에서 가장 가까운 공식 장소를 찾아 조회 파라미터로 쓴다.
 *
 * 좌표는 공식 첨부 shapefile(WGS84) 폴리곤 중심점에서 산출했다. 추정값이 아니다.
 */

export interface SeoulHotspot {
  area_cd: string
  area_nm: string
  category: string
  lat: number
  lng: number
  coord_source: string
  /** 상권현황(citydata_cmrcl) 데이터가 제공되는 장소인지. 121곳 중 82곳만 제공된다. */
  has_commercial: boolean
}

interface HotspotFile {
  source: string
  retrieved_at: string
  has_commercial_data_count: number
  places: SeoulHotspot[]
}

const file = hotspotsData as unknown as HotspotFile

export const SEOUL_HOTSPOT_SOURCE = file.source
export const SEOUL_HOTSPOT_RETRIEVED_AT = file.retrieved_at
export const SEOUL_HOTSPOTS: SeoulHotspot[] = file.places

/** 상권현황이 제공되는 장소만. */
export const SEOUL_COMMERCIAL_HOTSPOTS: SeoulHotspot[] = SEOUL_HOTSPOTS.filter(p => p.has_commercial)

const EARTH_RADIUS_M = 6_371_000

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)))
}

export interface NearestHotspot {
  place: SeoulHotspot
  distanceM: number
}

/**
 * 좌표에서 가장 가까운 상권 데이터 제공 장소를 찾는다.
 *
 * @param radiusM 이 거리를 넘으면 null. 기본 3km — 그보다 멀면 매물 주변 상권이라 부를 수 없다.
 */
export function findNearestSeoulHotspot(
  lat: number,
  lng: number,
  radiusM = 3000,
): NearestHotspot | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

  let best: NearestHotspot | null = null
  for (const place of SEOUL_COMMERCIAL_HOTSPOTS) {
    const distanceM = haversineMeters(lat, lng, place.lat, place.lng)
    if (!best || distanceM < best.distanceM) best = { place, distanceM }
  }

  if (!best || best.distanceM > radiusM) return null
  return best
}
