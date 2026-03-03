import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

// Load .env.local from the root of the project
dotenv.config({ path: path.resolve(__dirname, '../../../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
    console.warn('Supabase URL or Key is missing. Worker might not be able to connect to the database.');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

export async function logTaskEvent(taskId: string, level: 'info' | 'warn' | 'error', message: string) {
    console.log(`[${level.toUpperCase()}] Task ${taskId}: ${message}`);

    const { error } = await supabase.from('task_logs').insert({
        task_id: taskId,
        level,
        message,
    });

    if (error) {
        console.error('Failed to log to database:', error);
    }
}
