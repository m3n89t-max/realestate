import { config } from 'dotenv';
import { SGISClient } from '../packages/commercial-engine/population-engine/src/sgis-client';

config({ path: '.env.local' });

async function testReverseGeocode() {
    const client = new SGISClient();
    const token = await client.getAccessToken();

    // lat: 37.5665, lng: 126.9780 (Seoul City Hall)
    // SGIS reverse geocoding API endpoint (WGS84)
    const x_coor = '126.9780';
    const y_coor = '37.5665';

    const url = `https://sgisapi.kostat.go.kr/OpenAPI3/addr/rgeocode.json?x_coor=${x_coor}&y_coor=${y_coor}&addr_type=20&accessToken=${token}`;

    try {
        const res = await fetch(url);
        const data = await res.json();
        console.log(JSON.stringify(data, null, 2));
    } catch (e) {
        console.error(e);
    }
}

testReverseGeocode();
