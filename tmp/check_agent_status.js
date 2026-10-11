const { createClient } = require('@supabase/supabase-js');

const agentKey = process.env.AGENT_KEY || '';
const supabase = createClient(
    "https://mlluhuiwtsjndkztomjx.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
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
