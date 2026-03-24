import { config } from 'dotenv';
import { SGISClient } from '../packages/commercial-engine/population-engine/src/sgis-client';

config({ path: '.env.local' });

async function testSGIS() {
    console.log('Testing SGIS Authentication...');
    console.log('Service ID:', process.env.SGIS_SERVICE_ID);

    const client = new SGISClient();

    try {
        const token = await client.getAccessToken();
        console.log('Successfully acquired SGIS token:', token);

        // Test population API (11040 is Seongdong-gu, from the PDF example)
        const stats = await client.getPopulationStat('2022', '11040');
        console.log('SGIS Population Stats for Seongdong-gu:', stats);

    } catch (error) {
        console.error('SGIS Test failed:', error);
    }
}

testSGIS();
