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
        console.error('Error:', error);
    } else {
        console.log(`Found ${tasks.length} tasks for org`);
        console.table(tasks.map(t => ({
            id: t.id,
            type: t.type,
            status: t.status,
            error_message: t.error_message,
            created_at: t.created_at,
            started_at: t.started_at
        })));
    }
}

checkTasks();
