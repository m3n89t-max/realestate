import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

// ── SGIS 헬퍼 ────────────────────────────────────────────────────────────────

async function getSgisToken(serviceId: string, securityKey: string): Promise<string> {
  const url = `https://sgisapi.kostat.go.kr/OpenAPI3/auth/authentication.json?consumer_key=${serviceId}&consumer_secret=${securityKey}`
  const res = await fetch(url)
  const data = await res.json()
  if (data.errCd !== 0) throw new Error(`SGIS 인증 실패: ${data.errMsg} (${data.errCd})`)
  return data.result.accessToken
}

async function transcoord(lng: number, lat: number, token: string): Promise<{ posX: number; posY: number }> {
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

async function getPopStat(year: string, admCd: string, lowSearch = '0', token: string) {
  const url = `https://sgisapi.kostat.go.kr/OpenAPI3/stats/population.json?year=${year}&adm_cd=${admCd}&low_search=${lowSearch}&accessToken=${token}`
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

function accessibleRatio(d: number, r: number): number {
  if (d >= r) return 1.0
  const x = d / r
  return 0.5 + Math.acos(x) / Math.PI - (x * Math.sqrt(1 - x * x)) / Math.PI
}

async function detectBarriers(lat: number, lng: number, radiusM: number): Promise<{ coeff: number; barriers: string[] }> {
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
    let coeff = 1.0
    const barriers: string[] = []
    for (const { dist, label } of roadMap.values()) {
      const ratio = accessibleRatio(dist, radiusM)
      if (ratio < 0.99) { coeff *= ratio; barriers.push(label) }
    }
    return { coeff: Math.max(0.25, coeff), barriers }
  } catch {
    return { coeff: 1.0, barriers: [] }
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  try {
    const { project_id } = await req.json()
    if (!project_id) throw new Error('project_id 필요')

    const serviceId = (Deno.env.get('SGIS_SERVICE_ID') ?? '').trim()
    const securityKey = (Deno.env.get('SGIS_SECURITY_KEY') ?? '').trim()
    if (!serviceId || !securityKey) throw new Error('SGIS 인증키 미설정')

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data: project } = await admin.from('projects').select('lat, lng').eq('id', project_id).single()
    if (!project?.lat || !project?.lng) throw new Error('프로젝트 좌표 없음')

    const { lat, lng } = project

    // 1. SGIS 인증
    const token = await getSgisToken(serviceId, securityKey)

    // 2. 좌표변환
    const { posX, posY } = await transcoord(lng, lat, token)

    // 3. 역지오코딩
    const { sido, sgg, emd, adm_nm } = await rgeocode(posX, posY, token)
    console.log('[population] codes:', { sido, sgg, emd, adm_nm })

    // 4. 인구통계 (읍면동 → 시군구 → 시도 폴백)
    const YEARS = ['2023', '2022', '2021', '2020']
    let popData: any = null
    let targetYear = '2023'
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

    // 6. 500m 추정 배후인구
    const adm_level = usedAdmCd.length >= 8 ? '읍면동' : usedAdmCd.length >= 5 ? '시군구' : '시도'
    let radius_500m_estimated: number | null = null
    let barrier_coefficient = 1.0
    let barrier_names: string[] = []

    if (usedAdmCd.length >= 8) {
      try {
        const census = await getPopStat(targetYear, usedAdmCd, '1', token)
        if (census?.length) {
          const valid = census.filter((r: any) =>
            parseFloat(r.ppltn_dnsty || '0') > 0 && parseInt(r.tot_ppltn || '0', 10) > 0
          )
          if (valid.length > 0) {
            const totalPop = valid.reduce((s: number, r: any) => s + parseInt(r.tot_ppltn || '0', 10), 0)
            const totalArea = valid.reduce((s: number, r: any) => {
              const d = parseFloat(r.ppltn_dnsty || '0')
              const p = parseInt(r.tot_ppltn || '0', 10)
              return s + (d > 0 ? p / d : 0)
            }, 0)
            const useDensity = totalArea > 0 ? totalPop / totalArea : 0
            if (useDensity > 0) {
              const barrier = await detectBarriers(lat, lng, 500)
              barrier_coefficient = barrier.coeff
              barrier_names = barrier.barriers
              radius_500m_estimated = Math.round(useDensity * Math.PI * 0.25 * barrier_coefficient)
              console.log(`[population] 배후인구 ${radius_500m_estimated}명 (장벽계수 ${barrier_coefficient.toFixed(2)})`)
            }
          }
        }
      } catch (e) {
        console.log('[population] census block 실패, 500m 추정 생략')
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
      adm_level,
      radius_500m_estimated,
      barrier_coefficient: Math.round(barrier_coefficient * 100),
      barrier_names,
      collected_at: new Date().toISOString(),
    }

    await admin.from('projects').update({ population_data }).eq('id', project_id)

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
