import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import os from 'os';

// .env.local 로드
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

// ============================================================
// 에이전트 설정 타입
// ============================================================
export interface AgentConfig {
    agent_key: string;
    supabase_url: string;
    supabase_anon_key: string;
    webhook_url: string;
    agent_name: string;
    version: string;
    building_api_key: string;
}

// ============================================================
// 설정 로드: %APPDATA% config.json → .env.local 폴백
// ============================================================
function loadConfigFromFile(): Partial<AgentConfig> | null {
    const appDataPath = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    const configPath = path.join(appDataPath, 'RealEstateAIOS', 'config.json');

    if (fs.existsSync(configPath)) {
        try {
            const raw = fs.readFileSync(configPath, 'utf-8');
            return JSON.parse(raw);
        } catch {
            console.warn(`[Config] config.json 파싱 실패: ${configPath}`);
        }
    }
    return null;
}

function loadBuildingApiKeyFromCreds(): string {
    const appDataPath = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    const credPath = path.join(appDataPath, 'RealEstateAIOS', 'credentials.json');
    if (!fs.existsSync(credPath)) return '';
    try {
        const store = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
        return store.building_api_key || '';
    } catch { return ''; }
}

export function getConfig(): AgentConfig {
    const fileConfig = loadConfigFromFile();

    const supabaseUrl = fileConfig?.supabase_url
        || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseAnonKey = fileConfig?.supabase_anon_key
        || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

    const config: AgentConfig = {
        agent_key: fileConfig?.agent_key
            || process.env.AGENT_KEY || '',
        supabase_url: supabaseUrl,
        supabase_anon_key: supabaseAnonKey,
        webhook_url: fileConfig?.webhook_url
            || `${supabaseUrl}/functions/v1/webhook-agent`,
        agent_name: fileConfig?.agent_name
            || process.env.AGENT_NAME || `Agent-${os.hostname()}`,
        version: fileConfig?.version || '1.0.0',
        building_api_key: (fileConfig as any)?.building_api_key
            || loadBuildingApiKeyFromCreds()
            || process.env.BUILDING_API_KEY || '',
    };

    if (!config.supabase_url) {
        throw new Error('[Config] SUPABASE_URL이 설정되지 않았습니다.');
    }

    return config;
}

// ============================================================
// 플랫폼별 자격증명 로드
// %APPDATA%/RealEstateAIOS/credentials.json → .env 폴백
// ============================================================

export interface PlatformCredential {
    id?: string;
    email?: string;
    pw: string;
}

export function getCredentials(platform: 'naver' | 'google' | 'instagram' | 'kakao'): PlatformCredential | null {
    const appDataPath = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    const credPath = path.join(appDataPath, 'RealEstateAIOS', 'credentials.json');

    // credentials.json에서 로드 시도
    if (fs.existsSync(credPath)) {
        try {
            const store = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
            if (store[platform]?.pw) {
                return store[platform];
            }
        } catch {
            console.warn(`[Config] credentials.json 파싱 실패`);
        }
    }

    // .env 폴백
    switch (platform) {
        case 'naver':
            if (process.env.NAVER_ID && process.env.NAVER_PW) {
                return { id: process.env.NAVER_ID, pw: process.env.NAVER_PW };
            }
            break;
        case 'google':
            if (process.env.GOOGLE_EMAIL && process.env.GOOGLE_PW) {
                return { email: process.env.GOOGLE_EMAIL, pw: process.env.GOOGLE_PW };
            }
            break;
        case 'instagram':
            if (process.env.INSTAGRAM_ID && process.env.INSTAGRAM_PW) {
                return { id: process.env.INSTAGRAM_ID, pw: process.env.INSTAGRAM_PW };
            }
            break;
        case 'kakao':
            if (process.env.KAKAO_EMAIL && process.env.KAKAO_PW) {
                return { email: process.env.KAKAO_EMAIL, pw: process.env.KAKAO_PW };
            }
            break;
    }

    return null;
}
