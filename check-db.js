const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    console.log('--- LOCATION ANALYSES ---');
    const { data: analyses, error: err1 } = await supabase.from('location_analyses').select('*');
    if (err1) console.error(err1);
    else console.log(analyses);

    console.log('\n--- TASKS (location_analyze) ---');
    const { data: tasks, error: err2 } = await supabase.from('tasks').select('*').eq('type', 'location_analyze');
    if (err2) console.error(err2);
    else console.log(tasks);
}

check();
