const SID = 'd6bb74ee9073410eafce', SK = '9158f4b394394cafb07f';
const token = (await fetch(`https://sgisapi.kostat.go.kr/OpenAPI3/auth/authentication.json?consumer_key=${SID}&consumer_secret=${SK}`).then(r=>r.json())).result.accessToken;

// 병점역 UTM-K 좌표 (이전 테스트에서 확인)
const cx = 955601.8653988242;
const cy = 1911339.3847249276;
const emd8 = '31240570'; // 화산동 (올바른 코드)

// 1. 거주인구 요약정보 API 시도 (다양한 URL 패턴)
const urls = [
    `https://sgisapi.kostat.go.kr/OpenAPI3/livelihood/residentpopulation.json?x_coor=${cx}&y_coor=${cy}&accessToken=${token}`,
    `https://sgisapi.kostat.go.kr/OpenAPI3/neighborhoodcommercial/residentpopulation.json?x_coor=${cx}&y_coor=${cy}&accessToken=${token}`,
    `https://sgisapi.kostat.go.kr/OpenAPI3/commercial/residentpopulation.json?adm_cd=${emd8}&accessToken=${token}`,
    `https://sgisapi.kostat.go.kr/OpenAPI3/smallshop/residentpopulation.json?adm_cd=${emd8}&accessToken=${token}`,
];

for (const url of urls) {
    const path = url.split('/OpenAPI3/')[1].split('?')[0];
    const res = await fetch(url);
    const text = await res.text();
    if (res.status === 200 && !text.startsWith('<')) {
        const json = JSON.parse(text);
        console.log(`✅ ${path}:`, JSON.stringify(json, null, 2).substring(0, 500));
    } else {
        console.log(`❌ ${path}: status=${res.status}`);
    }
}

// 2. population.json에서 low_search=1로 집계구 레벨 시도
console.log('\n--- low_search=1 집계구 조회 ---');
const pop = await fetch(`https://sgisapi.kostat.go.kr/OpenAPI3/stats/population.json?year=2022&adm_cd=${emd8}&low_search=1&accessToken=${token}`).then(r=>r.json());
console.log('errCd:', pop.errCd, '건수:', pop.result?.length);
if (pop.result?.length > 0) {
    pop.result.slice(0,5).forEach(r => console.log(`  ${r.adm_cd}(${r.adm_cd?.length}자) ${r.adm_nm} 인구:${r.tot_ppltn} 밀도:${r.ppltn_dnsty}`));
}
