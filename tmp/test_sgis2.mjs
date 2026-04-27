const SID = 'd6bb74ee9073410eafce', SK = '9158f4b394394cafb07f';

const auth = await fetch(`https://sgisapi.kostat.go.kr/OpenAPI3/auth/authentication.json?consumer_key=${SID}&consumer_secret=${SK}`).then(r => r.json());
const token = auth.result.accessToken;
console.log('token ok');

// 병점역 좌표 → UTM-K
const trans = await fetch(`https://sgisapi.kostat.go.kr/OpenAPI3/transformation/transcoord.json?src=4326&dst=5179&posX=126.9997&posY=37.1998&accessToken=${token}`).then(r => r.json());
const { posX, posY } = trans.result;
console.log('UTM-K:', posX, posY);

// rgeocode
const rgeo = await fetch(`https://sgisapi.kostat.go.kr/OpenAPI3/addr/rgeocode.json?x_coor=${posX}&y_coor=${posY}&addr_type=20&accessToken=${token}`).then(r => r.json());
const r0 = rgeo.result?.[0];
console.log('rgeocode:', JSON.stringify(r0, null, 2));

const emd8 = (r0?.adm_cd || '').substring(0, 8);
console.log('\nemd8:', emd8, '/ adm_nm:', r0?.adm_nm);

// low_search=1 → 하위 집계구 목록 조회
const pop1 = await fetch(`https://sgisapi.kostat.go.kr/OpenAPI3/stats/population.json?year=2022&adm_cd=${emd8}&low_search=1&accessToken=${token}`).then(r => r.json());
console.log('\nlow_search=1 → errCd:', pop1.errCd, '건수:', pop1.result?.length);
if (pop1.result?.length > 0) {
    console.log('adm_cd 자릿수:', pop1.result[0].adm_cd?.length, '예시:', pop1.result[0].adm_cd, pop1.result[0].adm_nm);
    console.log('전체 목록:', pop1.result.map(r => `${r.adm_cd}(${r.adm_cd?.length}자) ${r.adm_nm} 인구:${r.tot_ppltn}`));
}
