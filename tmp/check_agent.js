const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    "https://mlluhuiwtsjndkztomjx.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1sbHVodWl3dHNqbmRrenRvbWp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMjUxMzcsImV4cCI6MjA4NDcwMTEzN30.zExaSeZL3TnlBHfE6TnWQm-Za3VVjkHqYLKAGfQlTog"
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
