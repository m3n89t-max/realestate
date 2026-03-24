export class SGISClient {
    private serviceId: string;
    private securityKey: string;
    private accessToken: string | null = null;
    private tokenExpiresAt: number = 0;

    constructor(serviceId?: string, securityKey?: string) {
        this.serviceId = serviceId || process.env.SGIS_SERVICE_ID || '';
        this.securityKey = securityKey || process.env.SGIS_SECURITY_KEY || '';

        if (!this.serviceId || !this.securityKey) {
            console.warn('SGIS_SERVICE_ID or SGIS_SECURITY_KEY is not defined.');
        }
    }

    /**
     * Retrieves a valid access token. Requests a new one if expired or not available.
     */
    public async getAccessToken(): Promise<string> {
        const now = Date.now();
        // Refresh token if it expires in less than 5 minutes
        if (this.accessToken && this.tokenExpiresAt > now + 5 * 60 * 1000) {
            return this.accessToken;
        }

        try {
            const url = `https://sgisapi.kostat.go.kr/OpenAPI3/auth/authentication.json?consumer_key=${this.serviceId}&consumer_secret=${this.securityKey}`;
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`SGIS Auth Request Failed with status ${response.status}`);
            }

            const data = await response.json();

            if (data.errCd !== 0) {
                throw new Error(`SGIS Auth API Error: ${data.errMsg} (Code: ${data.errCd})`);
            }

            this.accessToken = data.result.accessToken;
            this.tokenExpiresAt = parseInt(data.result.accessTimeout, 10);

            return this.accessToken as string;
        } catch (error) {
            console.error('Error fetching SGIS access token:', error);
            throw error;
        }
    }

    /**
     * Fetches the total population information for a given region using the SGIS API.
     * Based on: https://sgisapi.kostat.go.kr/OpenAPI3/stats/population.json
     */
    public async getPopulationStat(year: string, adm_cd: string, low_search: string = '0') {
        const token = await this.getAccessToken();
        const url = `https://sgisapi.kostat.go.kr/OpenAPI3/stats/population.json?year=${year}&adm_cd=${adm_cd}&low_search=${low_search}&accessToken=${token}`;

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`SGIS Population Request Failed with status ${response.status}`);
        }

        const data = await response.json();
        if (data.errCd !== 0) {
            throw new Error(`SGIS Population API Error: ${data.errMsg} (Code: ${data.errCd})`);
        }

        return data.result;
    }

    /**
     * Fetches household statistics (API_0305).
     * @param household_type '01' for 1-gen, 'A0' for 1-person household
     */
    public async getHouseholdStat(year: string, adm_cd: string, household_type: string = 'A0', low_search: string = '0') {
        const token = await this.getAccessToken();
        const url = `https://sgisapi.kostat.go.kr/OpenAPI3/stats/household.json?year=${year}&adm_cd=${adm_cd}&low_search=${low_search}&household_type=${household_type}&accessToken=${token}`;

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`SGIS Household Request Failed with status ${response.status}`);
        }

        const data = await response.json();
        if (data.errCd !== 0) {
            throw new Error(`SGIS Household API Error: ${data.errMsg} (Code: ${data.errCd})`);
        }

        return data.result;
    }

    /**
     * Converts WGS84 (lat/lng) to UTM-K (EPSG:5179) and then retrieves SGIS adm_cd
     * Returns the 5-digit sigungu code (sido_cd + sgg_cd) or 8-digit emdong code.
     */
    public async getSgisAdmCdFromWGS84(lat: number, lng: number): Promise<string> {
        const token = await this.getAccessToken();

        // 1. Transform WGS84 to UTM-K (EPSG:5179)
        const transUrl = `https://sgisapi.kostat.go.kr/OpenAPI3/transformation/transcoord.json?src=4326&dst=5179&posX=${lng}&posY=${lat}&accessToken=${token}`;
        const transRes = await fetch(transUrl);
        const transData = await transRes.json();

        if (transData.errCd !== 0 || !transData.result) {
            throw new Error(`SGIS Transcoord API Error: ${transData.errMsg} (Code: ${transData.errCd})`);
        }

        const { posX, posY } = transData.result;

        // 2. Reverse Geocode UTM-K to get SGIS adm_cd (addr_type=20 for administrative boundaries)
        const rgeoUrl = `https://sgisapi.kostat.go.kr/OpenAPI3/addr/rgeocode.json?x_coor=${posX}&y_coor=${posY}&addr_type=20&accessToken=${token}`;
        const rgeoRes = await fetch(rgeoUrl);
        const rgeoData = await rgeoRes.json();

        if (rgeoData.errCd !== 0 || !rgeoData.result || rgeoData.result.length === 0) {
            throw new Error(`SGIS RGeocode API Error: ${rgeoData.errMsg} (Code: ${rgeoData.errCd})`);
        }

        const regionInfo = rgeoData.result[0];
        const sido = regionInfo.sido_cd;
        const sgg = regionInfo.sgg_cd;

        if (!sido || !sgg) {
            throw new Error("SGIS RGeocode did not return sido_cd or sgg_cd");
        }

        return `${sido}${sgg}`; // 5-digit SGIS Sigungu Code
    }
}

// Optional export for an initialized client if keys are in process.env
// export const sgisClient = new SGISClient();
