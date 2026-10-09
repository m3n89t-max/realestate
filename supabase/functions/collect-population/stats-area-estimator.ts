export type Point = [number, number]

export type StatsAreaGeometry =
  | { type: 'Polygon'; coordinates: Point[][] }
  | { type: 'MultiPolygon'; coordinates: Point[][][] }

export interface StatsAreaFeature {
  admCd: string
  baseYear: string | null
  geometry: StatsAreaGeometry
}

export interface StatsAreaStat {
  admCd: string
  population: number
  households: number
}

interface EstimateInput {
  center: Point
  radiusM: number
  features: StatsAreaFeature[]
  stats: StatsAreaStat[]
}

export interface StatsAreaRadiusEstimate {
  population: number
  households: number
  /** 통계가 확인된 집계구가 500m 원을 덮은 면적 비율 */
  coverageRatio: number
  /** 경계는 있으나 통계가 없는 집계구가 원을 덮은 면적 비율 */
  missingStatsAreaRatio: number
  matchedStatsAreaCount: number
  missingStatsAreaCount: number
  unmatchedStatsCount: number
  /** 기여한 집계구 중 가장 넓은 경계 면적(㎡). 균일분포 가정의 위험도 지표 */
  maxContributingStatsAreaM2: number
  boundaryBaseYear: string | null
}

// ── 기하 유틸 ────────────────────────────────────────────────────────────────

function cross(a: Point, b: Point): number {
  return a[0] * b[1] - a[1] * b[0]
}

function dot(a: Point, b: Point): number {
  return a[0] * b[0] + a[1] * b[1]
}

function ringArea(ring: Point[]): number {
  let twiceArea = 0
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[(i + 1) % ring.length]
    twiceArea += x1 * y2 - x2 * y1
  }
  return Math.abs(twiceArea) / 2
}

function polygonArea(rings: Point[][]): number {
  if (rings.length === 0) return 0
  const outer = ringArea(rings[0])
  const holes = rings.slice(1).reduce((sum, ring) => sum + ringArea(ring), 0)
  return Math.max(0, outer - holes)
}

/**
 * 원점 중심 반지름 r 원과 삼각형 (원점, a, b)의 교차 면적(부호 있음).
 * 그리드 샘플링 대신 해석적으로 계산하므로 오차와 계산량이 모두 없다.
 */
function triangleCircleArea(a: Point, b: Point, r: number): number {
  const sector = (p: Point, q: Point) => 0.5 * r * r * Math.atan2(cross(p, q), dot(p, q))

  const da = Math.hypot(a[0], a[1])
  const db = Math.hypot(b[0], b[1])
  if (da <= r && db <= r) return 0.5 * cross(a, b)

  const d: Point = [b[0] - a[0], b[1] - a[1]]
  const A = dot(d, d)
  if (A === 0) return 0
  const B = 2 * dot(a, d)
  const C = dot(a, a) - r * r
  const disc = B * B - 4 * A * C
  if (disc <= 0) return sector(a, b)

  const sq = Math.sqrt(disc)
  const t1 = (-B - sq) / (2 * A)
  const t2 = (-B + sq) / (2 * A)
  if (t1 >= 1 || t2 <= 0) return sector(a, b)

  const tA = Math.max(0, t1)
  const tB = Math.min(1, t2)
  if (tA >= tB) return sector(a, b)

  const p: Point = [a[0] + d[0] * tA, a[1] + d[1] * tA]
  const q: Point = [a[0] + d[0] * tB, a[1] + d[1] * tB]

  let area = 0.5 * cross(p, q)
  if (tA > 0) area += sector(a, p)
  if (tB < 1) area += sector(q, b)
  return area
}

function ringCircleArea(ring: Point[], center: Point, r: number): number {
  if (ring.length < 3) return 0
  let area = 0
  for (let i = 0; i < ring.length; i++) {
    const a: Point = [ring[i][0] - center[0], ring[i][1] - center[1]]
    const next = ring[(i + 1) % ring.length]
    const b: Point = [next[0] - center[0], next[1] - center[1]]
    area += triangleCircleArea(a, b, r)
  }
  return Math.abs(area)
}

function polygonCircleArea(rings: Point[][], center: Point, r: number): number {
  if (rings.length === 0) return 0
  const outer = ringCircleArea(rings[0], center, r)
  const holes = rings.slice(1).reduce((sum, ring) => sum + ringCircleArea(ring, center, r), 0)
  return Math.max(0, outer - holes)
}

function polygonsOf(geometry: StatsAreaGeometry): Point[][][] {
  return geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
}

// ── 응답 파싱 (fail-closed) ──────────────────────────────────────────────────

function parseNonNegativeNumber(raw: unknown): number {
  // Number('') 과 Number(null) 은 0 이므로 먼저 문자열 형태를 검증한다.
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw < 0) throw new Error('SGIS 집계구 통계 응답 형식 오류')
    return raw
  }
  if (typeof raw !== 'string') throw new Error('SGIS 집계구 통계 응답 형식 오류')
  const trimmed = raw.trim()
  if (!/^\d+(\.\d+)?$/.test(trimmed)) throw new Error('SGIS 집계구 통계 응답 형식 오류')
  const value = Number(trimmed)
  if (!Number.isFinite(value) || value < 0) throw new Error('SGIS 집계구 통계 응답 형식 오류')
  return value
}

export function parseStatsAreaStatRows(rows: unknown): StatsAreaStat[] {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('SGIS 집계구 통계 없음')
  return rows.map(row => {
    const admCd = String((row as any)?.adm_cd ?? '').trim()
    if (!admCd) throw new Error('SGIS 집계구 통계 응답 형식 오류')
    return {
      admCd,
      population: parseNonNegativeNumber((row as any)?.tot_ppltn),
      households: parseNonNegativeNumber((row as any)?.tot_family),
    }
  })
}

export function parseStatsAreaFeatureRows(rows: unknown): StatsAreaFeature[] {
  if (!Array.isArray(rows)) throw new Error('SGIS 집계구경계 응답 형식 오류')
  return rows.map(row => {
    const admCd = String((row as any)?.properties?.adm_cd ?? '').trim()
    const geometry = (row as any)?.geometry as StatsAreaGeometry | undefined
    if (!admCd || !geometry || (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon')) {
      throw new Error('SGIS 집계구경계 응답 형식 오류')
    }
    if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length === 0) {
      throw new Error('SGIS 집계구경계 응답 형식 오류')
    }
    const rawBaseYear = (row as any)?.properties?.base_year
    return {
      admCd,
      baseYear: rawBaseYear == null || rawBaseYear === '' ? null : String(rawBaseYear),
      geometry,
    }
  })
}

export function selectFeaturesIntersectingCircle(
  features: StatsAreaFeature[],
  center: Point,
  radiusM: number,
): StatsAreaFeature[] {
  return features.filter(feature =>
    polygonsOf(feature.geometry).some(rings => polygonCircleArea(rings as Point[][], center, radiusM) > 0),
  )
}

// ── 추정 ─────────────────────────────────────────────────────────────────────

export function estimateStatsAreaRadius({
  center,
  radiusM,
  features,
  stats,
}: EstimateInput): StatsAreaRadiusEstimate {
  if (!Number.isFinite(radiusM) || radiusM <= 0) throw new Error('radiusM must be positive')
  if (!Number.isFinite(center[0]) || !Number.isFinite(center[1])) throw new Error('center must be finite')

  const circleArea = Math.PI * radiusM * radiusM

  // 같은 집계구 코드가 여러 Feature로 분리되어 와도 경계 전체를 합산한다.
  // Map 덮어쓰기로 조각이 사라지면 분모가 깨져 결과가 응답 순서에 좌우된다.
  const grouped = new Map<string, { totalArea: number; overlapArea: number; baseYears: Set<string> }>()
  for (const feature of features) {
    let entry = grouped.get(feature.admCd)
    if (!entry) {
      entry = { totalArea: 0, overlapArea: 0, baseYears: new Set<string>() }
      grouped.set(feature.admCd, entry)
    }
    for (const rings of polygonsOf(feature.geometry)) {
      entry.totalArea += polygonArea(rings as Point[][])
      entry.overlapArea += polygonCircleArea(rings as Point[][], center, radiusM)
    }
    if (feature.baseYear) entry.baseYears.add(feature.baseYear)
  }

  const statByCode = new Map<string, StatsAreaStat>()
  for (const stat of stats) {
    const previous = statByCode.get(stat.admCd)
    if (previous) {
      statByCode.set(stat.admCd, {
        admCd: stat.admCd,
        population: previous.population + stat.population,
        households: previous.households + stat.households,
      })
    } else {
      statByCode.set(stat.admCd, stat)
    }
  }

  let population = 0
  let households = 0
  let coveredArea = 0
  let missingArea = 0
  let matchedStatsAreaCount = 0
  let missingStatsAreaCount = 0
  let maxContributingStatsAreaM2 = 0
  const boundaryYears = new Set<string>()

  for (const [admCd, entry] of grouped) {
    if (!(entry.overlapArea > 0) || !(entry.totalArea > 0)) continue
    const share = Math.max(0, Math.min(1, entry.overlapArea / entry.totalArea))
    if (share === 0) continue

    const stat = statByCode.get(admCd)
    if (!stat) {
      // 경계는 있는데 통계가 없다(5명 미만 비공개 등). 조용히 0명으로 합산하면 과소추정이 된다.
      missingArea += entry.overlapArea
      missingStatsAreaCount += 1
      continue
    }

    population += stat.population * share
    households += stat.households * share
    coveredArea += entry.overlapArea
    matchedStatsAreaCount += 1
    maxContributingStatsAreaM2 = Math.max(maxContributingStatsAreaM2, entry.totalArea)
    for (const year of entry.baseYears) boundaryYears.add(year)
  }

  let unmatchedStatsCount = 0
  for (const admCd of statByCode.keys()) {
    if (!grouped.has(admCd)) unmatchedStatsCount += 1
  }

  return {
    population: Math.round(population),
    households: Math.round(households),
    coverageRatio: Math.min(1, coveredArea / circleArea),
    missingStatsAreaRatio: Math.min(1, missingArea / circleArea),
    matchedStatsAreaCount,
    missingStatsAreaCount,
    unmatchedStatsCount,
    maxContributingStatsAreaM2,
    boundaryBaseYear: boundaryYears.size === 1 ? [...boundaryYears][0] : null,
  }
}
