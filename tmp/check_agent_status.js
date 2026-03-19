const { createClient } = require('@supabase/supabase-js');

const agentKey = 'agent-3b89b0c7-a170-4ea8-b8f9-27add6a50770';
const supabase = createClient(
    "https://mlluhuiwtsjndkztomjx.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1sbHVodWl3dHNqbmRrenRvbWp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMjUxMzcsImV4cCI6MjA4NDcwMTEzN30.zExaSeZL3TnlBHfE6TnWQm-Za3VVjkHqYLKAGfQlTog",
    {
        global: {
            headers: {
                'x-agent-key': agentKey
            }
        }
    }
);

async function checkStatus() {
    const { data: agents, error } = await supabase
        .from('agent_connections')
        .select('*');

    if (error) {
        console.error('Error:', error);
    } else {
        console.table(agents.map(a => ({
            id: a.id,
            status: a.status,
            last_seen_at: a.last_seen_at,
            now: new Date().toISOString(),
            diff_sec: Math.floor((new Date() - new Date(a.last_seen_at)) / 1000)
        })));
    }
}

checkStatus();
