import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { SGISClient } from '@/lib/sgis-client'

// ── 장벽 감지 헬퍼 ────────────────────────────────────────────────────────────

/** 점(lat,lng)에서 폴리라인까지 최소 거리(미터) */
function minDistToPolylineM(
    lat: number, lng: number,
    geom: { lat: number; lon: number }[]
): number {
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

/**
 * 원(반지름 r) 중심에서 거리 d인 장벽 직선이 잘라낼 때
 * 장벽 너머(멀리) 쪽을 제외한 가까운 쪽 면적 비율
 * d=0 → 0.5 (정중앙 통과), d≥r → 1.0 (원 밖)
 */
function accessibleRatio(d: number, r: number): number {
    if (d >= r) return 1.0
    const x = d / r
    return 0.5 + Math.acos(x) / Math.PI - (x * Math.sqrt(1 - x * x)) / Math.PI
}

/** Overpass API로 반경 내 대로·하천 감지 → 보정계수 반환 */
async function detectBarriers(
    lat: number, lng: number, radiusM: number
): Promise<{ coeff: number; barriers: string[] }> {
    const query = `[out:json][timeout:10];
(
  way["highway"~"^(motorway|trunk|primary|secondary)$"](around:${radiusM},${lat},${lng});
  way["waterway"~"^(river|canal)$"](around:${radiusM},${lat},${lng});
);
out geom;`

    const res = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(12000),
    })
    const data = await res.json()

    // 도로명 기준 중복 제거: 같은 이름 도로는 가장 가까운 거리만 사용
    const roadMap = new Map<string, { dist: number; label: string }>()
    for (const way of (data.elements || []) as any[]) {
        if (!way.geometry || way.geometry.length < 2) continue
        const dist = minDistToPolylineM(lat, lng, way.geometry)
        if (dist >= radiusM) continue
        const hw = way.tags?.highway
        const ww = way.tags?.waterway
        const label = way.tags?.name ||
            (ww ? '하천' : hw === 'motorway' ? '고속화도로' : hw === 'trunk' ? '간선도로' : '대로')
        const key = way.tags?.name || `${hw || ww}_${Math.round(dist)}`
        if (!roadMap.has(key) || roadMap.get(key)!.dist > dist) {
            roadMap.set(key, { dist, label })
        }
    }

    let coeff = 1.0
    const barriers: string[] = []
    for (const { dist, label } of roadMap.values()) {
        const ratio = accessibleRatio(dist, radiusM)
        if (ratio < 0.99) {
            coeff *= ratio
            barriers.push(label)
        }
    }

    return { coeff: Math.max(0.25, coeff), barriers }
}

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const adminSupabase = await createAdminClient()
        const { data: { user } } = await supabase.auth.getUser()
        // if (!user) return NextResponse.json({ error: '인증되지 않은 요청입니다' }, { status: 401 })

        const { project_id } = await req.json()
        if (!project_id) return NextResponse.json({ error: 'project_id가 필요합니다' }, { status: 400 })

        const { data: project } = await adminSupabase
            .from('projects')
            .select('lat, lng')
            .eq('id', project_id)
            .single()

        if (!project?.lat || !project?.lng) {
            return NextResponse.json({ error: '프로젝트 좌표가 없습니다. 위치를 먼저 지정해주세요.' }, { status: 400 })
        }

        const sgis = new SGISClient()

        // 1. Get region code directly from SGIS Reverse Geocoding
        let sidoCd: string;
        let sggCd: string;
        let emdCd: string;
        let admNm: string;
        try {
            const codes = await sgis.getSgisAdmCodesFromWGS84(project.lat, project.lng);
            sidoCd = codes.sido;
            sggCd = codes.sgg;
            emdCd = codes.emd;
            admNm = codes.adm_nm;
            console.log('[population] SGIS codes:', { sidoCd, sggCd, emdCd: emdCd + `(len=${emdCd.length})`, admNm });
        } catch (e: any) {
            console.error('SGIS RGeocode Error:', e.message);
            return NextResponse.json({ error: '해당 위치의 행정동/인구 통계 데이터를 SGIS에서 찾을 수 없습니다. (좌표 예외 지역일 수 있습니다)' }, { status: 404 });
        }

        // 2. Fetch basic population/household stat — 읍면동 → 시군구 → 시도 순으로 폴백
        let popData: any = null;
        let targetYear = '2023';
        let usedAdmCd = emdCd || `${sidoCd}${sggCd}`;

        const yearsToTry = ['2023', '2022', '2021', '2020'];

        // SGIS rgeocode adm_cd는 10자리(리 단위)를 반환하지만
        // population.json API는 읍면동 8자리 코드를 요구함 → 8자리로 잘라 시도
        const emdCd8 = emdCd && emdCd.length >= 8 ? emdCd.substring(0, 8) : emdCd;

        // Try 읍면동 level first (most granular) — 8자리 우선, 실패시 원본 코드도 시도
        const emdCodesToTry = [...new Set([emdCd8, emdCd].filter(Boolean))] as string[];
        if (emdCodesToTry.length > 0) {
            outer: for (const cd of emdCodesToTry) {
                for (const y of yearsToTry) {
                    try {
                        const stats = await sgis.getPopulationStat(y, cd);
                        if (stats && stats[0]) {
                            popData = stats[0];
                            targetYear = y;
                            usedAdmCd = cd;
                            break outer;
                        }
                    } catch (e: any) {
                        console.log(`[population] emd (${cd}) year ${y} failed:`, e.message);
                    }
                }
            }
        } else {
            console.log('[population] skipping emd level — emdCd:', emdCd);
        }
        if (!popData) console.log('[population] emd level not found, trying sigungu');

        // Fallback: Sigungu level
        if (!popData && sggCd) {
            usedAdmCd = `${sidoCd}${sggCd}`;
            for (const y of yearsToTry) {
                try {
                    const stats = await sgis.getPopulationStat(y, usedAdmCd);
                    if (stats && stats[0]) {
                        popData = stats[0];
                        targetYear = y;
                        break;
                    }
                } catch { /* fallthrough */ }
            }
        }

        // 3. Final Fallback: Sido level
        if (!popData) {
            usedAdmCd = sidoCd;
            for (const y of yearsToTry) {
                try {
                    const stats = await sgis.getPopulationStat(y, sidoCd);
                    if (stats && stats[0]) {
                        popData = stats[0];
                        targetYear = y;
                        break;
                    }
                } catch { /* ignore */ }
            }
        }

        if (!popData) {
            return NextResponse.json({ error: '해당 지역의 인구 통계 데이터가 SGIS에 존재하지 않습니다. (제공되지 않는 지역이거나 코드가 불일치할 수 있습니다.)' }, { status: 404 });
        }

        let single_households = 0;

        // Attempt to get household distribution for 1인 가구 (API_0305) if needed
        try {
            const hhStats = await sgis.getHouseholdStat(targetYear, usedAdmCd, 'A0', '0');
            if (hhStats && hhStats[0]) {
                single_households = parseInt(hhStats[0].household_cnt || '0', 10);
            }
        } catch (e) {
            console.error('Failed to fetch household stat', e);
        }

        // Calculate metrics
        const adm_level = usedAdmCd.length >= 8 ? '읍면동' : usedAdmCd.length >= 5 ? '시군구' : '시도';
        const density = parseFloat(popData.ppltn_dnsty || '0');

        // 집계구 레벨 중간값 밀도로 반경 500m 추정인구 계산
        // 읍면동 low_search=1 → 집계구 목록 → 밀도 중간값 × π × 0.5²
        let radius_500m_estimated: number | null = null;
        let barrier_coefficient = 1.0;
        let barrier_names: string[] = [];

        if (usedAdmCd.length >= 8) {
            try {
                const censusStats = await sgis.getPopulationStat(targetYear, usedAdmCd, '1');
                if (censusStats && censusStats.length > 0) {
                    const densities = censusStats
                        .map((r: any) => parseFloat(r.ppltn_dnsty || '0'))
                        .filter((d: number) => d > 0)
                        .sort((a: number, b: number) => a - b);
                    if (densities.length > 0) {
                        const mid = Math.floor(densities.length / 2);
                        const medianDensity = densities.length % 2 === 0
                            ? (densities[mid - 1] + densities[mid]) / 2
                            : densities[mid];

                        // 대로·하천 장벽 감지 (Overpass API)
                        try {
                            const barrier = await detectBarriers(project.lat, project.lng, 500);
                            barrier_coefficient = barrier.coeff;
                            barrier_names = barrier.barriers;
                        } catch (e) {
                            console.log('[population] barrier detection failed, coeff=1.0');
                        }

                        radius_500m_estimated = Math.round(medianDensity * Math.PI * 0.25 * barrier_coefficient);
                    }
                }
            } catch (e) {
                console.log('[population] census block density fetch failed, skipping 500m estimate');
            }
        }

        const population_data = {
            density,
            total_population: parseInt(popData.tot_ppltn || '0', 10),
            total_households: parseInt(popData.tot_family || '0', 10),
            single_households,
            avg_members: parseFloat(popData.avg_fmember_cnt || '0'),
            avg_age: parseFloat(popData.avg_age || '0'),
            adm_nm: popData.adm_nm || admNm,
            adm_level,
            radius_500m_estimated,
            barrier_coefficient: Math.round(barrier_coefficient * 100), // 0~100%
            barrier_names,
            collected_at: new Date().toISOString()
        }

        // Save to database (admin client to bypass RLS)
        const { error: updateErr } = await adminSupabase
            .from('projects')
            .update({ population_data })
            .eq('id', project_id)

        if (updateErr) throw new Error(updateErr.message)

        return NextResponse.json({
            success: true, population_data,
            _debug: { sidoCd, sggCd, emdCd, emdLen: emdCd?.length, usedAdmCd, adm_level: population_data.adm_level }
        })
    } catch (e: any) {
        return NextResponse.json({ error: e.message || '인구 데이터 수집 실패' }, { status: 500 })
    }
}
