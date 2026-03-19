const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const projectId = '60c86346-c4f0-461f-86d4-b791bc860613';

async function check() {
    console.log('--- PROJECT ---');
    const { data: project, error: err1 } = await supabase.from('projects').select('*').eq('id', projectId).single();
    if (err1) console.error(err1);
    else console.log(project);

    console.log('\n--- ASSETS ---');
    const { data: assets, error: err2 } = await supabase.from('assets').select('*').eq('project_id', projectId);
    if (err2) console.error(err2);
    else console.log(assets);
}

check();
