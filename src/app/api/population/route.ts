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

        const kakaoApiKey = process.env.KAKAO_REST_API_KEY
        if (!kakaoApiKey) throw new Error('Kakao API key missing')

        // 1. Get region code from Kakao
        const regionUrl = `https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${project.lng}&y=${project.lat}`
        const regionRes = await fetch(regionUrl, { headers: { Authorization: `KakaoAK ${kakaoApiKey}` } })
        const regionData = await regionRes.json()

        // Use Administrative code (region_type='H') 10 digits
        const hRegion = regionData.documents?.find((d: any) => d.region_type === 'H') || regionData.documents?.[0]
        if (!hRegion) throw new Error('행정동 정보를 찾을 수 없습니다.')

        const sgisAdmCd = hRegion.code.substring(0, 8) // SGIS uses 8 digits for 읍면동
        const sigunguCd = hRegion.code.substring(0, 5) // Fallback to 5 digits (sigungu)

        const sgis = new SGISClient()

        // 2. Fetch basic population/household stat (API_0301)
        let popData: any = null;
        let targetYear = '2023';

        const yearsToTry = ['2023', '2022', '2021', '2020'];
        for (const y of yearsToTry) {
            try {
                const stats = await sgis.getPopulationStat(y, sigunguCd);
                if (stats && stats[0]) {
                    popData = stats[0];
                    targetYear = y;
                    break;
                }
            } catch (e: any) {
                console.log(`SGIS Pop Error for ${y}:`, e.message);
            }
        }

        if (!popData) {
            return NextResponse.json({ error: '해당 지역의 인구 통계 데이터가 SGIS에 존재하지 않습니다. (제공되지 않는 지역이거나 코드가 불일치할 수 있습니다.)' }, { status: 404 });
        }

        let single_households = 0;

        // Attempt to get household distribution for 1인 가구 (API_0305) if needed
        try {
            const hhStats = await sgis.getHouseholdStat(targetYear, sigunguCd, 'A0', '0');
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
