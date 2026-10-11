const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    "https://mlluhuiwtsjndkztomjx.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    {
        global: {
            headers: {
                'x-agent-key': process.env.AGENT_KEY || ''
            }
        }
    }
);

async function checkConnection() {
    const { data, error } = await supabase
        .from('agent_connections')
        .select('*')
        .eq('agent_key', process.env.AGENT_KEY || '')
        .single();

    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Connection details:', data);
    }
}

checkConnection();
