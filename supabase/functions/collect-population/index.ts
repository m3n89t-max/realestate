import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { getAuthenticatedUser } from '../_shared/auth.ts'

// ── 산정 방법 스탬프 ──────────────────────────────────────────────────────────
//
// 이 식별자는 src/lib/location-data-truthfulness.ts 의 CURRENT_POPULATION_METHOD 와
// 반드시 같아야 한다. 다르면 화면이 이 함수가 저장한 값을 'superseded_method'로
// 거부한다(tests/location-data-truthfulness.test.ts 가 두 값의 일치를 검사한다).
//
// 과거에는 계산 경로가 두 갈래였다. 읍면동 평균 밀도 환산과 집계구 가중 밀도
// 환산이 공존했고, 화면은 둘을 똑같이 '약 N명'으로 보여줬다. 그래서 같은 주소가
// 수집 시점에 따라 1.6~7.0배까지 다른 값을 냈다. 지금은 읍면동 평균 밀도 하나만 쓴다.
//
// 산식이 바뀌면 @1 을 올려라. 올리면 과거 행은 화면에서 자동으로 거부된다.
const POPULATION_METHOD = 'adm_avg_density_x_circle_500m@1'

/** 반경 500m 원 면적(㎢). π × 0.5² = π × 0.25 ≈ 0.785. */
const CIRCLE_500M_AREA_KM2 = Math.PI * 0.25

// ── SGIS 헬퍼 ────────────────────────────────────────────────────────────────

async function getSgisToken(serviceId: string, securityKey: string): Promise<string> {
  const url = `https://sgisapi.kostat.go.kr/OpenAPI3/auth/authentication.json?consumer_key=${serviceId}&consumer_secret=${securityKey}`
  const res = await fetch(url)
  const data = await res.json()
  if (data.errCd !== 0) throw new Error(`SGIS 인증 실패: ${data.errMsg} (${data.errCd})`)
  return data.result.accessToken
}

async function transcoord(lng: number, lat: number, token: string): Promise<{ posX: number; posY: number }> {
  // SGIS는 EPSG:5179를 쓴다. 서울 열린데이터(EPSG:5181)와 섞지 마라.
  const url = `https://sgisapi.kostat.go.kr/OpenAPI3/transformation/transcoord.json?src=4326&dst=5179&posX=${lng}&posY=${lat}&accessToken=${token}`
  const res = await fetch(url)
  const data = await res.json()
  if (data.errCd !== 0) throw new Error(`SGIS 좌표변환 실패: ${data.errMsg}`)
  return data.result
}

async function rgeocode(posX: number, posY: number, token: string) {
  const url = `https://sgisapi.kostat.go.kr/OpenAPI3/addr/rgeocode.json?x_coor=${posX}&y_coor=${posY}&addr_type=20&accessToken=${token}`
  const res = await fetch(url)
  const data = await res.json()
  if (data.errCd !== 0 || !data.result?.length) throw new Error(`SGIS 역지오코딩 실패: ${data.errMsg}`)
  const r = data.result[0]
  const sido = r.sido_cd
  const sgg = r.sgg_cd ?? ''
  const emd = r.emdong_cd ? `${sido}${sgg}${r.emdong_cd}` : (r.adm_cd || '')
  const adm_nm = r.emdong_nm || r.adm_nm || ''
  if (!sido) throw new Error('SGIS 역지오코딩: sido_cd 없음')
  return { sido, sgg, emd, adm_nm }
}

// 집계구 단위 하위검색(low_search 1)은 더 쓰지 않는다. 그 경로가 두 번째 산정식의
// 입력이었고, 같은 읍면동에서 평균 환산값과 1.6~7.0배 차이를 냈다.
async function getPopStat(year: string, admCd: string, token: string) {
  const url = `https://sgisapi.kostat.go.kr/OpenAPI3/stats/population.json?year=${year}&adm_cd=${admCd}&low_search=0&accessToken=${token}`
  const res = await fetch(url)
  const data = await res.json()
  if (data.errCd !== 0) throw new Error(`SGIS 인구통계 실패: ${data.errMsg}`)
  return data.result
}

async function getHhStat(year: string, admCd: string, token: string) {
  const url = `https://sgisapi.kostat.go.kr/OpenAPI3/stats/household.json?year=${year}&adm_cd=${admCd}&low_search=0&household_type=A0&accessToken=${token}`
  const res = await fetch(url)
  const data = await res.json()
  if (data.errCd !== 0) throw new Error(`SGIS 가구통계 실패`)
  return data.result
}

async function getHousingStat(year: string, admCd: string, token: string) {
  const url = `https://sgisapi.kostat.go.kr/OpenAPI3/stats/housing.json?year=${year}&adm_cd=${admCd}&low_search=0&accessToken=${token}`
  const res = await fetch(url)
  const data = await res.json()
  if (data.errCd !== 0) throw new Error(`SGIS 주택통계 실패`)
  return data.result
}

async function getIndustryStat(year: string, admCd: string, token: string) {
  const url = `https://sgisapi.kostat.go.kr/OpenAPI3/stats/industry.json?year=${year}&adm_cd=${admCd}&low_search=0&accessToken=${token}`
  const res = await fetch(url)
  const data = await res.json()
  if (data.errCd !== 0) throw new Error(`SGIS 사업체통계 실패`)
  return data.result
}

// ── 장벽 감지 ────────────────────────────────────────────────────────────────
//
// 장벽은 참고정보로만 쓴다. 인구 숫자에서 차감하지 않는다.
// 과거 장벽 차감 계수로 인구를 깎던 로직은 제거했고, 그 폐기 필드를 들고 있는
// 행은 화면에서 거부한다(차감이 반영됐는지 행만 보고는 알 수 없기 때문).

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

// ── 실패 상태 저장 ───────────────────────────────────────────────────────────
//
// 실패를 숫자 0으로 남기지 않는다. 과거에는 density 0 / total_population 0 을
// 들고 있는 population_data 가 남아서 화면이 '이 동네 인구 0명'처럼 렌더했다.
// 실패 행에는 숫자를 하나도 넣지 않고 status 만 남긴다.
async function saveNonValueState(
  admin: ReturnType<typeof createClient>,
  projectId: string,
  orgId: string,
  status: 'failed' | 'unsupported',
  reason: string,
): Promise<string | null> {
  const population_data = {
    status,
    source: 'SGIS',
    estimation_method: POPULATION_METHOD,
    failure_reason: reason,
    collected_at: new Date().toISOString(),
  }
  const { error } = await admin
    .from('projects')
    .update({ population_data })
    .eq('id', projectId)
    .eq('org_id', orgId)
  return error?.message ?? null
}

// ── Main ─────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  // 실패 상태를 DB에 남기려면 project/org를 알아야 하므로 바깥 스코프에 둔다.
  let admin: ReturnType<typeof createClient> | null = null
  let projectId: string | null = null
  let orgId: string | null = null

  try {
    const { supabaseClient } = await getAuthenticatedUser(req)
    const { project_id } = await req.json()
    if (!project_id) throw new Error('project_id 필요')

    const serviceId = (Deno.env.get('SGIS_SERVICE_ID') ?? '').trim()
    const securityKey = (Deno.env.get('SGIS_SECURITY_KEY') ?? '').trim()
    if (!serviceId || !securityKey) {
      // 관리자 설정 대기. 환경변수 이름을 응답에 노출하지 않는다.
      // 저장도 하지 않는다 — 설정되면 다음 수집에서 바로 채워진다.
      return new Response(JSON.stringify({
        success: false,
        status: 'unconfigured',
        source: 'SGIS',
        message: '관리자가 인구 통계 연결을 준비 중입니다.',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // projects 에는 address 와 jibun_address 가 있고 road_address 는 없다.
    // 없는 컬럼을 select 에 넣으면 42703 으로 요청 전체가 죽는다.
    const { data: project } = await supabaseClient.from('projects').select('lat, lng, org_id').eq('id', project_id).single()
    if (!project?.lat || !project?.lng) throw new Error('프로젝트 좌표 없음')

    projectId = project_id
    orgId = project.org_id
    const { lat, lng } = project

    // 1. SGIS 인증
    console.log('[population] SGIS auth 시작, serviceId:', serviceId.substring(0, 6) + '...')
    const token = await getSgisToken(serviceId, securityKey)
    console.log('[population] SGIS auth 성공')

    // 2. 좌표변환 (4326 → 5179)
    const { posX, posY } = await transcoord(lng, lat, token)

    // 3. 역지오코딩
    const { sido, sgg, emd, adm_nm } = await rgeocode(posX, posY, token)
    console.log('[population] codes:', { sido, sgg, emd, adm_nm })

    // 4. 인구통계 (읍면동 → 시군구 → 시도 폴백)
    const YEARS = ['2023', '2022', '2021', '2020']
    let popData: any = null
    let targetYear: string | null = null
    let usedAdmCd = emd || `${sido}${sgg}`

    const emdCd8 = emd.length >= 8 ? emd.substring(0, 8) : emd
    for (const cd of [...new Set([emdCd8, emd].filter(Boolean))]) {
      for (const y of YEARS) {
        try {
          const stats = await getPopStat(y, cd, token)
          if (stats?.[0]) { popData = stats[0]; targetYear = y; usedAdmCd = cd; break }
        } catch { /* fallthrough */ }
      }
      if (popData) break
    }

    if (!popData && sgg) {
      usedAdmCd = `${sido}${sgg}`
      for (const y of YEARS) {
        try {
          const stats = await getPopStat(y, usedAdmCd, token)
          if (stats?.[0]) { popData = stats[0]; targetYear = y; break }
        } catch { /* fallthrough */ }
      }
    }

    if (!popData) {
      usedAdmCd = sido
      for (const y of YEARS) {
        try {
          const stats = await getPopStat(y, sido, token)
          if (stats?.[0]) { popData = stats[0]; targetYear = y; break }
        } catch { /* fallthrough */ }
      }
    }

    // 이 지역에 공개 통계가 없는 경우. '실패'와 구분한다 — 다시 눌러도 결과가 같다.
    if (!popData || !targetYear) {
      const saveError = admin && projectId && orgId
        ? await saveNonValueState(admin, projectId, orgId, 'unsupported', 'SGIS 인구 통계 미제공 지역')
        : null
      if (saveError) throw new Error(`인구 통계 상태 저장 실패: ${saveError}`)
      return new Response(JSON.stringify({
        success: false,
        status: 'unsupported',
        source: 'SGIS',
        message: '이 지역은 공개된 인구 통계가 없습니다.',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

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

    // 6. 500m 거주인구 추정 — 산정 경로는 하나다.
    //
    //    행정구역 평균 인구밀도(ppltn_dnsty, SGIS가 그대로 주는 값)에
    //    반경 500m 원 면적을 곱한다. 중간 계산으로 면적을 되만들지 않으므로
    //    같은 주소·같은 연도면 항상 같은 값이 나온다.
    const adm_level = usedAdmCd.length >= 8 ? '읍면동' : usedAdmCd.length >= 5 ? '시군구' : '시도'
    const density = parseFloat(popData.ppltn_dnsty || '0')
    const radius_500m_estimated = Number.isFinite(density) && density > 0
      ? Math.round(density * CIRCLE_500M_AREA_KM2)
      : null

    if (radius_500m_estimated != null) {
      console.log(`[population] 500m 거주인구 환산 ${radius_500m_estimated}명 (밀도 ${density}명/㎢, ${adm_level})`)
    }

    // 7. 장벽은 참고정보로만 수집한다. 인구 숫자에 반영하지 않는다.
    const barrier = await detectBarriers(lat, lng, 500)

    const population_data = {
      status: 'available',
      source: 'SGIS',
      density,
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
      // 이 값을 만든 산정 방법. 화면은 이 스탬프가 일치하지 않는 행을 거부한다.
      estimation_method: POPULATION_METHOD,
      barrier_status: barrier.status,
      barrier_names: barrier.barriers,
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
    // 실패를 숫자 없는 상태로만 남긴다. 저장 자체가 실패해도 응답은 실패로 간다.
    if (admin && projectId && orgId) {
      const saveError = await saveNonValueState(admin, projectId, orgId, 'failed', e.message ?? '알 수 없는 오류')
      if (saveError) console.error('[collect-population] 실패 상태 저장도 실패:', saveError)
    }
    return new Response(JSON.stringify({ success: false, status: 'failed', error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
