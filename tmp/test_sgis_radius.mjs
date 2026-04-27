/**
 * SGIS populationForCoordinate.json API 테스트
 * 병점역 좌표 (화성시) 기준 반경 500m 인구 조회
 *
 * 실행: node tmp/test_sgis_radius.mjs <SERVICE_ID> <SECURITY_KEY>
 */

const SERVICE_ID = process.argv[2] || process.env.SGIS_SERVICE_ID;
const SECURITY_KEY = process.argv[3] || process.env.SGIS_SECURITY_KEY;

if (!SERVICE_ID || !SECURITY_KEY) {
    console.error('Usage: node tmp/test_sgis_radius.mjs <SGIS_SERVICE_ID> <SGIS_SECURITY_KEY>');
    process.exit(1);
}

// 병점역 센트럴뷰 인근 (화성시 병점동)
const TEST_LAT = 37.1998;
const TEST_LNG = 126.9997;
const RADIUS_M = 500;

async function getToken() {
    const url = `https://sgisapi.kostat.go.kr/OpenAPI3/auth/authentication.json?consumer_key=${SERVICE_ID}&consumer_secret=${SECURITY_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.errCd !== 0) throw new Error(`Auth 실패: ${data.errMsg}`);
    console.log('✅ 토큰 발급 성공');
    return data.result.accessToken;
}

async function wgs84ToUtmk(lat, lng, token) {
    const url = `https://sgisapi.kostat.go.kr/OpenAPI3/transformation/transcoord.json?src=4326&dst=5179&posX=${lng}&posY=${lat}&accessToken=${token}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.errCd !== 0) throw new Error(`좌표변환 실패: ${data.errMsg}`);
    console.log(`✅ UTM-K 변환: (${data.result.posX}, ${data.result.posY})`);
    return { cx: data.result.posX, cy: data.result.posY };
}

async function getPopulationByRadius(cx, cy, radius, token) {
    const years = ['2023', '2022', '2021', '2020'];
    for (const year of years) {
        const url = `https://sgisapi.kostat.go.kr/OpenAPI3/stats/populationForCoordinate.json?year=${year}&cx=${cx}&cy=${cy}&radius=${radius}&accessToken=${token}`;
        console.log(`\n[${year}] 요청 URL: ${url}`);
        const res = await fetch(url);
        const data = await res.json();
        console.log(`[${year}] 응답:`, JSON.stringify(data, null, 2));
        if (data.errCd === 0 && data.result) {
            console.log(`\n✅ ${year}년 데이터 발견!`);
            return { year, result: data.result };
        }
        console.log(`❌ ${year}년: errCd=${data.errCd}, errMsg=${data.errMsg}`);
    }
    return null;
}

async function main() {
    console.log(`\n=== SGIS 반경 인구 테스트 ===`);
    console.log(`위치: 병점역 인근 (lat=${TEST_LAT}, lng=${TEST_LNG})`);
    console.log(`반경: ${RADIUS_M}m\n`);

    const token = await getToken();
    const { cx, cy } = await wgs84ToUtmk(TEST_LAT, TEST_LNG, token);
    const result = await getPopulationByRadius(cx, cy, RADIUS_M, token);

    if (result) {
        console.log(`\n=== 최종 결과 (${result.year}년) ===`);
        console.log(JSON.stringify(result.result, null, 2));
    } else {
        console.log('\n❌ 모든 연도에서 데이터를 찾을 수 없음');
    }
}

main().catch(console.error);
