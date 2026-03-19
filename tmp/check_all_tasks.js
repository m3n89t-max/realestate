const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkOrg() {
    const { data: org, error } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', 'd1f6317d-12a9-47e1-aea6-3750234e2b3c')
        .single();

    if (error) console.error(error);
    else console.log('Organization:', org.name);

    console.log('\n--- ALL TASKS (Last 5) ---');
    const { data: tasks, error: err2 } = await supabase
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

    if (err2) console.error(err2);
    else console.table(tasks.map(t => ({ id: t.id, org_id: t.org_id, type: t.type, status: t.status })));
}

checkOrg();
