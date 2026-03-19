const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    "https://mlluhuiwtsjndkztomjx.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1sbHVodWl3dHNqbmRrenRvbWp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMjUxMzcsImV4cCI6MjA4NDcwMTEzN30.zExaSeZL3TnlBHfE6TnWQm-Za3VVjkHqYLKAGfQlTog"
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
