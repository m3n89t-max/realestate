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

async function checkTasks() {
    const { data: tasks, error } = await supabase
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) {
        console.error('Error fetching tasks:', error);
        return;
    }

    console.log('Recent 10 Tasks:');
    console.table(tasks.map(t => ({
        id: t.id,
        type: t.type,
        status: t.status,
        org_id: t.org_id,
        created_at: t.created_at
    })));

    const { data: agents, error: aError } = await supabase
        .from('agent_connections')
        .select('*');

    if (aError) console.error('Error fetching agents:', aError);
    else {
        console.log('Agent Connections:');
        console.table(agents);
    }
}

checkTasks();
