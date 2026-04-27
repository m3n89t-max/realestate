const SID = 'd6bb74ee9073410eafce', SK = '9158f4b394394cafb07f';

const auth = await fetch(`https://sgisapi.kostat.go.kr/OpenAPI3/auth/authentication.json?consumer_key=${SID}&consumer_secret=${SK}`).then(r => r.json());
const token = auth.result.accessToken;

const trans = await fetch(`https://sgisapi.kostat.go.kr/OpenAPI3/transformation/transcoord.json?src=4326&dst=5179&posX=126.9997&posY=37.1998&accessToken=${token}`).then(r => r.json());
const { posX, posY } = trans.result;

const rgeo = await fetch(`https://sgisapi.kostat.go.kr/OpenAPI3/addr/rgeocode.json?x_coor=${posX}&y_coor=${posY}&addr_type=20&accessToken=${token}`).then(r => r.json());
const r0 = rgeo.result?.[0];
console.log('rgeocode raw:', JSON.stringify(r0));

// 8자리 읍면동 코드 조합: sido_cd(2) + sgg_cd(3) + emdong_cd(3)
const sidoCd = r0.sido_cd || '';
const sggCd  = r0.sgg_cd  || '';
const emdCd  = r0.emdong_cd || '';
const emd8   = sidoCd + sggCd + emdCd;
const sgg5   = sidoCd + sggCd;

console.log(`\n코드: sido=${sidoCd}, sgg5=${sgg5}, emd8=${emd8}`);
console.log(`지명: ${r0.sido_nm} ${r0.sgg_nm} ${r0.emdong_nm}`);

// 읍면동 8자리로 인구 조회
for (const [label, cd] of [['읍면동(8자리)', emd8], ['시군구(5자리)', sgg5], ['시도(2자리)', sidoCd]]) {
    const pop = await fetch(`https://sgisapi.kostat.go.kr/OpenAPI3/stats/population.json?year=2022&adm_cd=${cd}&low_search=0&accessToken=${token}`).then(r => r.json());
    if (pop.errCd === 0 && pop.result?.[0]) {
        const d = pop.result[0];
        console.log(`\n✅ ${label} (${cd}): ${d.adm_nm}`);
        console.log(`   총인구: ${parseInt(d.tot_ppltn).toLocaleString()}명`);
        console.log(`   인구밀도: ${d.ppltn_dnsty}명/㎢`);
        console.log(`   총가구: ${d.tot_family}`);
    } else {
        console.log(`\n❌ ${label} (${cd}): ${pop.errMsg}`);
    }
}
