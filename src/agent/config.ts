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
    };

    if (!config.supabase_url) {
        throw new Error('[Config] SUPABASE_URL이 설정되지 않았습니다.');
    }

    return config;
}
