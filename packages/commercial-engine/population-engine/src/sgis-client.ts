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
}

// Optional export for an initialized client if keys are in process.env
// export const sgisClient = new SGISClient();
