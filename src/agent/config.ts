import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { getAgentKey, getBuildingApiKey, getPlatformCredential, type PlatformCredential, type PlatformKey } from './credential-store';

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

export function getConfig(): AgentConfig {
    const fileConfig = loadConfigFromFile();

    const supabaseUrl = fileConfig?.supabase_url || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseAnonKey = fileConfig?.supabase_anon_key || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    if (!supabaseUrl || !supabaseAnonKey || supabaseAnonKey.includes('...')) {
        throw new Error('검증된 에이전트 서버 설정이 없습니다. 공식 설치파일로 다시 설치해 주세요.');
    }

    const config: AgentConfig = {
        agent_key: getAgentKey()
            || process.env.AGENT_KEY || '',
        supabase_url: supabaseUrl,
        supabase_anon_key: supabaseAnonKey,
        webhook_url: fileConfig?.webhook_url
            || process.env.WEBHOOK_URL
            || `${supabaseUrl}/functions/v1/webhook-agent`,
        agent_name: fileConfig?.agent_name
            || process.env.AGENT_NAME || `Agent-${os.hostname()}`,
        version: fileConfig?.version || '1.0.0',
        building_api_key: getBuildingApiKey()
            || (process.env.NODE_ENV === 'production' ? '' : process.env.BUILDING_API_KEY || ''),
    };

    // supabase_url은 항상 기본값이 있으므로 에러 발생 안 함
    return config;
}

// ============================================================
// 플랫폼별 자격증명 로드
// OS 암호화 저장소 전용
// ============================================================

export function getCredentials(platform: PlatformKey): PlatformCredential | null {
    const storedCredential = getPlatformCredential(platform);
    return storedCredential?.pw ? storedCredential : null;
}
