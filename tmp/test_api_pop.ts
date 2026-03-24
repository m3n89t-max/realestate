import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { SGISClient } from '../packages/commercial-engine/population-engine/src/sgis-client';

config({ path: '.env.local' });

async function testPopulationLogic() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch one project that has lat lng
    const { data: project } = await supabase
        .from('projects')
        .select('id, lat, lng')
        .not('lat', 'is', null)
        .limit(1)
        .single();

    if (!project) {
        console.log('No project with lat/lng found');
        return;
    }
    console.log('Testing with project:', project.id, project.lat, project.lng);

    const kakaoApiKey = process.env.KAKAO_REST_API_KEY;
    if (!kakaoApiKey) {
        console.log('Kakao API key missing');
        return;
    }

    try {
        // 1. Get region code from Kakao
        const regionUrl = `https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${project.lng}&y=${project.lat}`;
        const regionRes = await fetch(regionUrl, { headers: { Authorization: `KakaoAK ${kakaoApiKey}` } });
        const regionData = await regionRes.json();

        const hRegion = regionData.documents?.find((d: any) => d.region_type === 'H') || regionData.documents?.[0];
        if (!hRegion) {
            console.log('행정동 정보를 찾을 수 없습니다.', regionData);
            return;
        }
        console.log('Found Region:', hRegion.address_name, hRegion.code);

        const sgisAdmCd = hRegion.code.substring(0, 8);
        const sigunguCd = hRegion.code.substring(0, 5);

        const sgis = new SGISClient();

        let popData: any = null;
        let targetYear = '2023';

        const yearsToTry = ['2023', '2022', '2021', '2020'];
        for (const y of yearsToTry) {
            try {
                const stats = await sgis.getPopulationStat(y, sigunguCd);
                if (stats && stats[0]) {
                    popData = stats[0];
                    targetYear = y;
                    console.log(`Pop stat ok for year ${y}:`, popData.tot_ppltn);
                    break;
                }
            } catch (e: any) {
                console.log(`Year ${y} failed: ${e.message}`);
            }
        }

        if (!popData) {
            console.log('SGIS 인구 통계를 불러올 수 없습니다.');
            return;
        }

        let single_households = 0;
        try {
            const hhStats = await sgis.getHouseholdStat(targetYear, sigunguCd, 'A0', '0');
            if (hhStats && hhStats[0]) {
                single_households = parseInt(hhStats[0].household_cnt || '0', 10);
                console.log('Single hh ok:', single_households);
            }
        } catch (e: any) {
            console.error('SGIS HH Error:', e.message);
        }

        const population_data = {
            density: parseFloat(popData.ppltn_dnsty || '0'),
            total_population: parseInt(popData.tot_ppltn || '0', 10),
            total_households: parseInt(popData.tot_family || '0', 10),
            single_households,
            avg_members: parseFloat(popData.avg_fmember_cnt || '0'),
            avg_age: parseFloat(popData.avg_age || '0'),
            collected_at: new Date().toISOString()
        };

        console.log('Final Population Data:', population_data);

    } catch (e: any) {
        console.error('Outer Catch:', e);
    }
}

testPopulationLogic();
