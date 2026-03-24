import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { SGISClient } from '@/lib/sgis-client'

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        // if (!user) return NextResponse.json({ error: '인증되지 않은 요청입니다' }, { status: 401 })

        const { project_id } = await req.json()
        if (!project_id) return NextResponse.json({ error: 'project_id가 필요합니다' }, { status: 400 })

        const { data: project } = await supabase
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
        try {
            const codes = await sgis.getSgisAdmCodesFromWGS84(project.lat, project.lng);
            sidoCd = codes.sido;
            sggCd = codes.sgg;
        } catch (e: any) {
            console.error('SGIS RGeocode Error:', e.message);
            return NextResponse.json({ error: '해당 위치의 행정동/인구 통계 데이터를 SGIS에서 찾을 수 없습니다. (좌표 예외 지역일 수 있습니다)' }, { status: 404 });
        }

        // 2. Fetch basic population/household stat (API_0301)
        let popData: any = null;
        let targetYear = '2023';
        let usedAdmCd = `${sidoCd}${sggCd}`; // default to Sigungu

        const yearsToTry = ['2023', '2022', '2021', '2020'];

        // Try Sigungu level first
        if (sggCd) {
            for (const y of yearsToTry) {
                try {
                    const stats = await sgis.getPopulationStat(y, `${sidoCd}${sggCd}`);
                    if (stats && stats[0]) {
                        popData = stats[0];
                        targetYear = y;
                        break;
                    }
                } catch (e: any) {
                    // Silently ignore Sigungu fetch errors to allow fallback
                }
            }
        }

        // 3. Adaptive Fallback: If Sigungu doesn't exist or fails, try Sido level
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
                } catch (e: any) {
                    // Ignore Sido fetch errors until the end
                }
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
        // "aged_child_idx", "avg_age", "ppltn_dnsty", "tot_family", "tot_house", "tot_ppltn", "oldage_suprt_per", "juv_suprt_per", "avg_fmember_cnt"
        const population_data = {
            density: parseFloat(popData.ppltn_dnsty || '0'),
            total_population: parseInt(popData.tot_ppltn || '0', 10),
            total_households: parseInt(popData.tot_family || '0', 10),
            single_households,
            avg_members: parseFloat(popData.avg_fmember_cnt || '0'),
            avg_age: parseFloat(popData.avg_age || '0'),
            collected_at: new Date().toISOString()
        }

        // Save to database
        const { error: updateErr } = await supabase
            .from('projects')
            .update({ population_data })
            .eq('id', project_id)

        if (updateErr) throw new Error(updateErr.message)

        return NextResponse.json({ success: true, population_data })
    } catch (e: any) {
        return NextResponse.json({ error: e.message || '인구 데이터 수집 실패' }, { status: 500 })
    }
}
