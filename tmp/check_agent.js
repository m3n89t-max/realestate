const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    "https://mlluhuiwtsjndkztomjx.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

async function checkAgent() {
    const { data: agents, error } = await supabase
        .from('agent_connections')
        .select('*')
        .limit(5);

    if (error) {
        console.error('Error fetching agents:', error);
        return;
    }

    console.log('Agent Connections:');
    console.table(agents);
}

checkAgent();
