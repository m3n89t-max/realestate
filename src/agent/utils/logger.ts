import { createClient } from '@supabase/supabase-js';
import { getConfig } from '../config';

// ============================================================
// Supabase 클라이언트 & 로깅 유틸리티
// ============================================================

const config = getConfig();

export const supabase = createClient(
    config.supabase_url,
    config.supabase_anon_key
);

export async function logTaskEvent(
    taskId: string,
    level: 'info' | 'warn' | 'error',
    message: string
) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level.toUpperCase()}] Task ${taskId}: ${message}`);

    try {
        const { error } = await supabase.from('task_logs').insert({
            task_id: taskId,
            level,
            message,
        });

        if (error) {
            console.error('[Logger] DB 저장 실패:', error.message);
        }
    } catch (err: any) {
        console.error('[Logger] 예외:', err.message);
    }
}
