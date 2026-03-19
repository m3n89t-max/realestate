const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    "https://mlluhuiwtsjndkztomjx.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1sbHVodWl3dHNqbmRrenRvbWp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMjUxMzcsImV4cCI6MjA4NDcwMTEzN30.zExaSeZL3TnlBHfE6TnWQm-Za3VVjkHqYLKAGfQlTog",
    {
        global: {
            headers: {
                'x-agent-key': 'agent-3b89b0c7-a170-4ea8-b8f9-27add6a50770'
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
