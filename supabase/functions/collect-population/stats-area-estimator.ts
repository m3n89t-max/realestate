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
  /**
   * 원 안에서 행정동 경계로 덮인 면적(㎡). 해안·하천 매물은 원의 상당 부분이
   * 어떤 행정구역에도 속하지 않아 집계구 커버리지가 구조적으로 낮아진다.
   * 이를 '조회 실패'와 구분하려면 육지 면적을 분모로 쓴 비율이 필요하다.
   * 생략하면 원 전체를 육지로 간주한다.
   */
  landAreaM2?: number
}

export interface StatsAreaRadiusEstimate {
  population: number
  households: number
  /** 통계가 확인된 집계구가 500m 원을 덮은 면적 비율 */
  coverageRatio: number
  /** 경계는 있으나 통계가 없는 집계구가 원을 덮은 면적 비율 */
  missingStatsAreaRatio: number
  /** 원 안에서 행정동 경계로 덮인 비율. 1 미만이면 그만큼 바다·하천이다 */
  landRatio: number
  /** 육지 면적만 분모로 한 커버리지. 해안 매물 판정에 쓴다 */
  landCoverageRatio: number
  matchedStatsAreaCount: number
  missingStatsAreaCount: number
  unmatchedStatsCount: number
  /** 기여한 집계구 중 가장 넓은 경계 면적(㎡). 균일분포 가정의 위험도 지표 */
  maxContributingStatsAreaM2: number
  /**
   * 한 집계구가 원 안 육지 면적에서 차지한 최대 비중.
   * 절대 면적보다 이 값이 균일분포 가정의 실제 위험도를 나타낸다.
   */
  maxContributingShare: number
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

function ringBounds(rings: Point[][]): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  return [minX, minY, maxX, maxY]
}

function circleIntersectsBounds(center: Point, r: number, b: [number, number, number, number]): boolean {
  const nx = Math.max(b[0], Math.min(center[0], b[2]))
  const ny = Math.max(b[1], Math.min(center[1], b[3]))
  const dx = nx - center[0]
  const dy = ny - center[1]
  return dx * dx + dy * dy <= r * r
}

/**
 * 원과 다각형의 교차 면적. bbox로 먼저 분리 여부를 판정한다.
 * 해석적 sector 합만 쓰면 멀리 떨어진 다각형에서도 부동소수점 잔차가 남아
 * `> 0` 비교를 통과하고, 행정동 전체 같은 거대 폴리곤이 교차로 잡혀
 * 커버리지와 최대 집계구 면적을 오염시킨다.
 */
function clippedPolygonArea(rings: Point[][], center: Point, r: number): number {
  if (!circleIntersectsBounds(center, r, ringBounds(rings))) return 0
  const area = polygonCircleArea(rings, center, r)
  // 원 면적의 1e-6 미만은 수치 잔차로 보고 버린다(500m 원에서 약 0.8㎡).
  const epsilon = Math.PI * r * r * 1e-6
  return area < epsilon ? 0 : area
}

// ── 응답 파싱 (fail-closed) ──────────────────────────────────────────────────

/** SGIS가 비공개 집계구에 쓰는 값. 형식 오류가 아니라 명시적 '값 없음'이다. */
function isSuppressedValue(raw: unknown): boolean {
  if (raw == null) return true
  if (typeof raw !== 'string') return false
  const t = raw.trim().toUpperCase()
  return t === '' || t === 'N/A' || t === 'NA' || t === '-'
}

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
  const parsed: StatsAreaStat[] = []
  for (const row of rows) {
    const admCd = String((row as any)?.adm_cd ?? '').trim()
    if (!admCd) throw new Error('SGIS 집계구 통계 응답 형식 오류')
    const rawPop = (row as any)?.tot_ppltn
    const rawHh = (row as any)?.tot_family
    // 비공개 집계구는 건너뛴다. 0으로 합산하면 과소추정이 되고, throw하면
    // 행정동 전체가 날아가 커버리지가 떨어진다. 둘 다 과소추정이므로
    // 결측으로 남겨 estimator의 missingStatsAreaRatio 게이트가 판단한다.
    if (isSuppressedValue(rawPop) || isSuppressedValue(rawHh)) continue
    parsed.push({
      admCd,
      population: parseNonNegativeNumber(rawPop),
      households: parseNonNegativeNumber(rawHh),
    })
  }
  if (parsed.length === 0) throw new Error('SGIS 집계구 통계 전건 비공개')
  return parsed
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
    polygonsOf(feature.geometry).some(rings => clippedPolygonArea(rings as Point[][], center, radiusM) > 0),
  )
}

// ── 추정 ─────────────────────────────────────────────────────────────────────

export function estimateStatsAreaRadius({
  center,
  radiusM,
  features,
  stats,
  landAreaM2,
}: EstimateInput): StatsAreaRadiusEstimate {
  if (!Number.isFinite(radiusM) || radiusM <= 0) throw new Error('radiusM must be positive')
  if (!Number.isFinite(center[0]) || !Number.isFinite(center[1])) throw new Error('center must be finite')

  const circleArea = Math.PI * radiusM * radiusM
  const landM2 = Number.isFinite(landAreaM2 as number) && (landAreaM2 as number) > 0
    ? Math.min(landAreaM2 as number, circleArea)
    : null
  // 육지 분모. 바다뿐인 좌표에서 0 나눗셈이 되지 않게 원 면적으로 하한을 둔다.
  const landDenominator = landM2 == null || landM2 <= 0 ? circleArea : landM2

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
      entry.overlapArea += clippedPolygonArea(rings as Point[][], center, radiusM)
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
  let maxOverlapArea = 0
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
    maxOverlapArea = Math.max(maxOverlapArea, entry.overlapArea)
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
    landRatio: landM2 == null ? 1 : Math.min(1, landM2 / circleArea),
    landCoverageRatio: Math.min(1, coveredArea / landDenominator),
    matchedStatsAreaCount,
    missingStatsAreaCount,
    unmatchedStatsCount,
    maxContributingStatsAreaM2,
    maxContributingShare: Math.min(1, maxOverlapArea / landDenominator),
    boundaryBaseYear: boundaryYears.size === 1 ? [...boundaryYears][0] : null,
  }
}
