import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { getAuthenticatedUser } from '../_shared/auth.ts'
import {
  estimateStatsAreaRadius,
  parseStatsAreaFeatureRows,
  parseStatsAreaStatRows,
  selectFeaturesIntersectingCircle,
  type StatsAreaFeature,
  type StatsAreaStat,
} from './stats-area-estimator.ts'

// ── 500m 집계구 추정 게이트 ──────────────────────────────────────────────────
// 부분 커버리지·통계 결측·과대 집계구는 모두 과소추정으로 이어진다.
// 기존 '읍면동 평균밀도 × 원 면적'이 만든 과소추정을 라벨만 바꿔 재현하지 않도록
// 조건을 통과하지 못하면 숫자를 내지 않는다(fail-closed).
const MIN_STATS_AREA_COVERAGE = 0.9
const MAX_MISSING_STATS_AREA_RATIO = 0.1
const MAX_STATS_AREA_TO_CIRCLE_RATIO = 1.5
const MIN_PLAUSIBLE_RADIUS_POPULATION = 20

// ── SGIS 헬퍼 ────────────────────────────────────────────────────────────────

async function fetchJsonWithTimeout(url: string, timeoutMs = 12_000): Promise<{ response: Response; data: any }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { signal: controller.signal })
    const data = await response.json()
    return { response, data }
  } finally {
    clearTimeout(timer)
  }
}

async function getSgisToken(serviceId: string, securityKey: string): Promise<string> {
  const url = `https://sgisapi.kostat.go.kr/OpenAPI3/auth/authentication.json?consumer_key=${serviceId}&consumer_secret=${securityKey}`
  const { data } = await fetchJsonWithTimeout(url)
  if (data.errCd !== 0) throw new Error(`SGIS 인증 실패: ${data.errMsg} (${data.errCd})`)
  return data.result.accessToken
}

async function transcoord(lng: number, lat: number, token: string): Promise<{ posX: number; posY: number }> {
  const url = `https://sgisapi.kostat.go.kr/OpenAPI3/transformation/transcoord.json?src=4326&dst=5179&posX=${lng}&posY=${lat}&accessToken=${token}`
  const { data } = await fetchJsonWithTimeout(url)
  if (data.errCd !== 0) throw new Error(`SGIS 좌표변환 실패: ${data.errMsg}`)
  return data.result
}

async function rgeocode(posX: number, posY: number, token: string) {
  const url = `https://sgisapi.kostat.go.kr/OpenAPI3/addr/rgeocode.json?x_coor=${posX}&y_coor=${posY}&addr_type=20&accessToken=${token}`
  const { data } = await fetchJsonWithTimeout(url)
  if (data.errCd !== 0 || !data.result?.length) throw new Error(`SGIS 역지오코딩 실패: ${data.errMsg}`)
  const r = data.result[0]
  const sido = r.sido_cd
  const sgg = r.sgg_cd ?? ''
  const emd = r.emdong_cd ? `${sido}${sgg}${r.emdong_cd}` : (r.adm_cd || '')
  const adm_nm = r.emdong_nm || r.adm_nm || ''
  if (!sido) throw new Error('SGIS 역지오코딩: sido_cd 없음')
  return { sido, sgg, emd, adm_nm }
}

async function getPopStat(year: string, admCd: string, lowSearch = '0', token: string) {
  const url = `https://sgisapi.kostat.go.kr/OpenAPI3/stats/population.json?year=${year}&adm_cd=${admCd}&low_search=${lowSearch}&accessToken=${token}`
  const { response, data } = await fetchJsonWithTimeout(url)
  if (!response.ok) throw new Error(`SGIS 인구통계 HTTP ${response.status}`)
  if (data.errCd !== 0) throw new Error(`SGIS 인구통계 실패: ${data.errMsg}`)
  return data.result
}

/**
 * 500m 원과 실제로 겹치는 행정동 코드만 고른다. 시군구 전체 행정동을 모두
 * 조회하면 호출이 과도하고, 매물 행정동만 조회하면 경계 밖이 0명으로 합산된다.
 */
async function getEmdCodesIntersectingCircle(
  sggCd: string,
  emdCd8: string,
  year: string,
  center: [number, number],
  radiusM: number,
  token: string,
): Promise<string[]> {
  if (!sggCd || sggCd.length < 5) return [emdCd8]
  try {
    const url = `https://sgisapi.kostat.go.kr/OpenAPI3/boundary/hadmarea.geojson?year=${year}&adm_cd=${sggCd}&low_search=1&accessToken=${token}`
    const { response, data } = await fetchJsonWithTimeout(url)
    if (!response.ok || data.errCd !== 0 || !Array.isArray(data.features)) {
      throw new Error('SGIS 행정동 경계 실패')
    }
    const emdFeatures = parseStatsAreaFeatureRows(data.features)
    const hit = selectFeaturesIntersectingCircle(emdFeatures, center, radiusM)
      .map(feature => feature.admCd)
      .filter(cd => cd.length === 8)
    const codes = new Set<string>([emdCd8, ...hit])
    return [...codes]
  } catch {
    // 폴백해도 커버리지 게이트가 과소추정 숫자를 막는다.
    return [emdCd8]
  }
}

async function getStatsAreaBoundaries(admCd: string, token: string): Promise<StatsAreaFeature[]> {
  const url = `https://sgisapi.kostat.go.kr/OpenAPI3/boundary/statsarea.geojson?adm_cd=${admCd}&accessToken=${token}`
  const { response, data } = await fetchJsonWithTimeout(url)
  if (!response.ok) throw new Error(`SGIS 집계구경계 HTTP ${response.status}`)
  if (data.errCd !== 0 || !Array.isArray(data.features)) {
    throw new Error(`SGIS 집계구경계 실패: ${data.errMsg ?? 'invalid response'}`)
  }
  return parseStatsAreaFeatureRows(data.features)
}

async function getHhStat(year: string, admCd: string, token: string) {
  const url = `https://sgisapi.kostat.go.kr/OpenAPI3/stats/household.json?year=${year}&adm_cd=${admCd}&low_search=0&household_type=A0&accessToken=${token}`
  const { data } = await fetchJsonWithTimeout(url)
  if (data.errCd !== 0) throw new Error(`SGIS 가구통계 실패`)
  return data.result
}

async function getHousingStat(year: string, admCd: string, token: string) {
  const url = `https://sgisapi.kostat.go.kr/OpenAPI3/stats/housing.json?year=${year}&adm_cd=${admCd}&low_search=0&accessToken=${token}`
  const { data } = await fetchJsonWithTimeout(url)
  if (data.errCd !== 0) throw new Error(`SGIS 주택통계 실패`)
  return data.result
}

async function getIndustryStat(year: string, admCd: string, token: string) {
  const url = `https://sgisapi.kostat.go.kr/OpenAPI3/stats/industry.json?year=${year}&adm_cd=${admCd}&low_search=0&accessToken=${token}`
  const { data } = await fetchJsonWithTimeout(url)
  if (data.errCd !== 0) throw new Error(`SGIS 사업체통계 실패`)
  return data.result
}

// ── 장벽 감지 ────────────────────────────────────────────────────────────────

function minDistToPolylineM(lat: number, lng: number, geom: { lat: number; lon: number }[]): number {
  const cosLat = Math.cos(lat * Math.PI / 180)
  const R = 6371000
  const px = lng * R * cosLat * Math.PI / 180
  const py = lat * R * Math.PI / 180
  let minDist = Infinity
  for (let i = 0; i < geom.length - 1; i++) {
    const ax = geom[i].lon * R * cosLat * Math.PI / 180
    const ay = geom[i].lat * R * Math.PI / 180
    const bx = geom[i + 1].lon * R * cosLat * Math.PI / 180
    const by = geom[i + 1].lat * R * Math.PI / 180
    const dx = bx - ax, dy = by - ay
    const lenSq = dx * dx + dy * dy
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq))
    const nx = ax + t * dx - px, ny = ay + t * dy - py
    minDist = Math.min(minDist, Math.sqrt(nx * nx + ny * ny))
  }
  return minDist
}

async function detectBarriers(lat: number, lng: number, radiusM: number): Promise<{ status: 'available' | 'failed'; barriers: string[] }> {
  const query = `[out:json][timeout:10];
(
  way["highway"~"^(motorway|trunk|primary|secondary)$"](around:${radiusM},${lat},${lng});
  way["waterway"~"^(river|canal)$"](around:${radiusM},${lat},${lng});
);
out geom;`
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) throw new Error(`Overpass ${res.status}`)
    const data = await res.json()
    const roadMap = new Map<string, { dist: number; label: string }>()
    for (const way of (data.elements || []) as any[]) {
      if (!way.geometry || way.geometry.length < 2) continue
      const dist = minDistToPolylineM(lat, lng, way.geometry)
      if (dist >= radiusM) continue
      const hw = way.tags?.highway
      const ww = way.tags?.waterway
      const label = way.tags?.name || (ww ? '하천' : hw === 'motorway' ? '고속화도로' : hw === 'trunk' ? '간선도로' : '대로')
      const key = way.tags?.name || `${hw || ww}_${Math.round(dist)}`
      if (!roadMap.has(key) || roadMap.get(key)!.dist > dist) roadMap.set(key, { dist, label })
    }
    const barriers: string[] = []
    for (const { label } of roadMap.values()) barriers.push(label)
    return { status: 'available', barriers }
  } catch {
    return { status: 'failed', barriers: [] }
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    const { supabaseClient } = await getAuthenticatedUser(req)
    const { project_id } = await req.json()
    if (!project_id) throw new Error('project_id 필요')

    const serviceId = (Deno.env.get('SGIS_SERVICE_ID') ?? '').trim()
    const securityKey = (Deno.env.get('SGIS_SECURITY_KEY') ?? '').trim()
    if (!serviceId || !securityKey) {
      return new Response(JSON.stringify({
        success: false,
        status: 'unconfigured',
        source: 'SGIS',
        message: '관리자가 인구 통계 연결을 준비 중입니다.',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data: project } = await supabaseClient.from('projects').select('lat, lng, org_id').eq('id', project_id).single()
    if (!project?.lat || !project?.lng) throw new Error('프로젝트 좌표 없음')

    const { lat, lng } = project

    // 1. SGIS 인증
    const token = await getSgisToken(serviceId, securityKey)
    console.log('[population] SGIS auth 성공')

    // 2. 좌표변환
    const { posX, posY } = await transcoord(lng, lat, token)

    // 3. 역지오코딩
    const { sido, sgg, emd, adm_nm } = await rgeocode(posX, posY, token)
    console.log('[population] codes:', { sido, sgg, emd, adm_nm })

    // 4. 인구통계 (읍면동 → 시군구 → 시도 폴백)
    const YEARS = ['2024', '2023', '2022', '2021', '2020']
    let popData: any = null
    let targetYear = '2024'
    let usedAdmCd = emd || `${sido}${sgg}`

    const emdCd8 = emd.length >= 8 ? emd.substring(0, 8) : emd
    for (const cd of [...new Set([emdCd8, emd].filter(Boolean))]) {
      for (const y of YEARS) {
        try {
          const stats = await getPopStat(y, cd, '0', token)
          if (stats?.[0]) { popData = stats[0]; targetYear = y; usedAdmCd = cd; break }
        } catch { /* fallthrough */ }
      }
      if (popData) break
    }

    if (!popData && sgg) {
      usedAdmCd = `${sido}${sgg}`
      for (const y of YEARS) {
        try {
          const stats = await getPopStat(y, usedAdmCd, '0', token)
          if (stats?.[0]) { popData = stats[0]; targetYear = y; break }
        } catch { /* fallthrough */ }
      }
    }

    if (!popData) {
      usedAdmCd = sido
      for (const y of YEARS) {
        try {
          const stats = await getPopStat(y, sido, '0', token)
          if (stats?.[0]) { popData = stats[0]; targetYear = y; break }
        } catch { /* fallthrough */ }
      }
    }

    if (!popData) throw new Error('SGIS 인구 통계 데이터 없음 (해당 지역 미제공)')

    // 5. 1인 가구
    let single_households = 0
    try {
      const hh = await getHhStat(targetYear, usedAdmCd, token)
      if (hh?.[0]) single_households = parseInt(hh[0].household_cnt || '0', 10)
    } catch { /* ignore */ }

    // 5b. 주택 유형별 통계
    let housing_stat: Record<string, number> | null = null
    try {
      const hs = await getHousingStat(targetYear, usedAdmCd, token)
      if (hs?.[0]) {
        const h = hs[0]
        housing_stat = {
          total: parseInt(h.house_cnt || '0', 10),
          apt: parseInt(h.apt_cnt || '0', 10),
          detached: parseInt(h.detach_house_cnt || h.detached_cnt || '0', 10),
          row_house: parseInt(h.row_house_cnt || h.rowhouse_cnt || '0', 10),
          multi: parseInt(h.multi_house_cnt || h.multi_cnt || '0', 10),
          other: parseInt(h.etc_house_cnt || h.etc_cnt || '0', 10),
        }
      }
    } catch { /* ignore */ }

    // 5c. 사업체·종사자 통계
    let industry_stat: { bsns_cnt: number; wrkr_cnt: number } | null = null
    try {
      const ind = await getIndustryStat(targetYear, usedAdmCd, token)
      if (ind?.[0]) {
        const r = ind[0]
        // SGIS 사업체통계: bsns_cnt(사업체수), wrkr_cnt(종사자수) — 필드명 변형 대응
        const bsns = parseInt(r.bsns_cnt || r.bsns_fmly_cnt || r.biz_cnt || '0', 10)
        const wrkr = parseInt(r.wrkr_cnt || r.emplye_cnt || r.emp_cnt || '0', 10)
        if (bsns > 0 || wrkr > 0) industry_stat = { bsns_cnt: bsns, wrkr_cnt: wrkr }
      }
    } catch { /* ignore */ }

    // 6. SGIS 집계구 경계와 집계구별 공식 통계를 500m 원에 면적 가중한다.
    // 법정동 주민등록 총량과는 모집단·공간단위가 다르므로 결합하지 않는다.
    const adm_level = usedAdmCd.length >= 8 ? '읍면동' : usedAdmCd.length >= 5 ? '시군구' : '시도'
    let radius_500m_estimated: number | null = null
    let radius_500m_households_estimated: number | null = null
    let estimation_method: string | null = null
    let metric_semantics: string | null = null
    let spatial_unit: string | null = null
    let source_as_of: string | null = null
    let stats_area_count: number | null = null
    let boundary_base_year: string | null = null
    let coverage_ratio: number | null = null
    let barrier_status: 'available' | 'failed' | 'not_collected' = 'not_collected'
    let barrier_names: string[] = []

    if (usedAdmCd === emdCd8 && emdCd8.length === 8) {
      try {
        const center: [number, number] = [Number(posX), Number(posY)]
        if (!Number.isFinite(center[0]) || !Number.isFinite(center[1])) {
          throw new Error('SGIS 좌표변환 결과 없음')
        }

        // 집계구 경계는 year 파라미터가 없어 항상 최신 기준연도다.
        // 재획정된 경계에 과거 연도 통계를 붙이면 오매칭이므로 같은 연도만 쓴다.
        const ownBoundaries = await getStatsAreaBoundaries(emdCd8, token)
        if (ownBoundaries.length === 0) throw new Error('SGIS 집계구 경계 없음')
        const ownYears = new Set(ownBoundaries.map(f => f.baseYear).filter(Boolean) as string[])
        if (ownYears.size !== 1) throw new Error('SGIS 집계구 경계 기준연도 불일치')
        const statsAreaYear = [...ownYears][0]

        // 500m 원(지름 1km)은 행정동 경계를 흔히 넘는다. 매물 행정동만 조회하면
        // 넘어간 부분이 0명으로 합산되어 과거 읍면동 평균과 같은 과소추정이 된다.
        const emdCodes = await getEmdCodesIntersectingCircle(
          `${sido}${sgg}`, emdCd8, statsAreaYear, center, 500, token,
        )

        const extraBoundaries = await Promise.all(
          emdCodes
            .filter(cd => cd !== emdCd8)
            .map(cd => getStatsAreaBoundaries(cd, token).catch(() => null)),
        )
        const boundaries: StatsAreaFeature[] = [...ownBoundaries]
        for (const result of extraBoundaries) {
          if (result) boundaries.push(...result)
        }
        // 경계 기준연도가 섞이면 코드 체계가 달라 오매칭이 된다.
        const boundaryYears = new Set(boundaries.map(f => f.baseYear).filter(Boolean) as string[])
        if (boundaryYears.size !== 1) throw new Error('SGIS 집계구 경계 기준연도 불일치')

        const statResults = await Promise.all(
          emdCodes.map(cd =>
            getPopStat(statsAreaYear, cd, '1', token)
              .then(rows => parseStatsAreaStatRows(rows))
              .catch(() => null),
          ),
        )
        const stats: StatsAreaStat[] = []
        for (const result of statResults) {
          if (result) stats.push(...result)
        }
        if (stats.length === 0) throw new Error('SGIS 집계구 통계 없음')

        const estimate = estimateStatsAreaRadius({
          center,
          radiusM: 500,
          features: boundaries,
          stats,
        })

        // 원을 충분히 덮지 못했으면 숫자를 내지 않는다. 부분 커버리지는 곧 과소추정이다.
        if (estimate.coverageRatio < MIN_STATS_AREA_COVERAGE) {
          throw new Error(`SGIS 500m 커버리지 부족: ${estimate.coverageRatio.toFixed(3)}`)
        }
        // 경계는 있으나 통계가 비공개(5명 미만 등)인 집계구가 넓으면 역시 과소추정이다.
        if (estimate.missingStatsAreaRatio > MAX_MISSING_STATS_AREA_RATIO) {
          throw new Error(`SGIS 집계구 통계 결측 과다: ${estimate.missingStatsAreaRatio.toFixed(3)}`)
        }
        if (estimate.matchedStatsAreaCount < 1) throw new Error('SGIS 500m 교차 집계구 없음')
        // 집계구가 원보다 훨씬 넓으면 '집계구 내부 균일분포' 가정이 깨져
        // 과거 읍면동 평균밀도 환산과 같은 구조의 과소추정이 된다.
        const circleArea = Math.PI * 500 * 500
        if (estimate.maxContributingStatsAreaM2 > circleArea * MAX_STATS_AREA_TO_CIRCLE_RATIO) {
          throw new Error('SGIS 집계구가 500m 원보다 과도하게 넓어 균일분포 가정 불가')
        }
        // 거주지인데 0~수명으로 표시되는 것을 막는다.
        if (estimate.population < MIN_PLAUSIBLE_RADIUS_POPULATION) {
          throw new Error(`SGIS 500m 추정 인구가 신뢰 하한 미달: ${estimate.population}`)
        }

        radius_500m_estimated = estimate.population
        radius_500m_households_estimated = estimate.households
        estimation_method = 'sgis_statsarea_areal_interpolation_v1'
        metric_semantics = 'redistributed_estimate'
        spatial_unit = 'radius_500m'
        source_as_of = statsAreaYear
        stats_area_count = estimate.matchedStatsAreaCount
        boundary_base_year = estimate.boundaryBaseYear
        coverage_ratio = Math.round(estimate.coverageRatio * 1000) / 1000
      } catch (error) {
        console.warn('[population] 집계구 500m 추정 생략:', error instanceof Error ? error.message : 'unknown')
      }
    }

    if (usedAdmCd.length >= 8) {
      try {
        const barrier = await detectBarriers(lat, lng, 500)
        barrier_status = barrier.status
        barrier_names = barrier.barriers
      } catch {
        barrier_status = 'failed'
      }
    }

    const population_data = {
      density: parseFloat(popData.ppltn_dnsty || '0'),
      total_population: parseInt(popData.tot_ppltn || '0', 10),
      total_households: parseInt(popData.tot_family || '0', 10),
      single_households,
      avg_members: parseFloat(popData.avg_fmember_cnt || '0'),
      avg_age: parseFloat(popData.avg_age || '0'),
      adm_nm: popData.adm_nm || adm_nm,
      adm_cd: usedAdmCd,
      adm_level,
      source_year: targetYear,
      radius_500m_estimated,
      radius_500m_households_estimated,
      estimation_method,
      metric_semantics,
      spatial_unit,
      source_as_of,
      source: radius_500m_estimated == null ? null : 'SGIS 인구주택총조사 집계구',
      stats_area_count,
      boundary_base_year,
      coverage_ratio,
      coverage_note: radius_500m_estimated == null
        ? null
        : '집계구별 센서스 인구·가구를 500m 원과 겹친 경계면적 비율로 합산한 추정값. 주민등록 세대와 모집단이 다릅니다.',
      barrier_status,
      barrier_names,
      housing_stat,
      industry_stat,
      collected_at: new Date().toISOString(),
    }

    const { error: updateError } = await admin.from('projects').update({ population_data }).eq('id', project_id).eq('org_id', project.org_id)
    if (updateError) throw new Error(`인구 통계 저장 실패: ${updateError.message}`)

    return new Response(JSON.stringify({ success: true, population_data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    console.error('[collect-population] error:', e.message)
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
