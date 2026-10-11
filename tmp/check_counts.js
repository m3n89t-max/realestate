const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    "https://mlluhuiwtsjndkztomjx.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

const tables = [
    'organizations', 'users', 'memberships', 'projects', 'assets',
    'generated_contents', 'location_analyses', 'documents', 'tasks',
    'task_logs', 'usage_logs', 'templates', 'agent_connections'
];

async function checkCounts() {
    console.log('Table Row Counts (without auth):');
    for (const table of tables) {
        const { count, error } = await supabase
            .from(table)
            .select('*', { count: 'exact', head: true });

        if (error) {
            console.log(`${table}: Error ${error.message}`);
        } else {
            console.log(`${table}: ${count} rows`);
        }
    }
}

checkCounts();
