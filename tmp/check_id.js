const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    "https://mlluhuiwtsjndkztomjx.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1sbHVodWl3dHNqbmRrenRvbWp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMjUxMzcsImV4cCI6MjA4NDcwMTEzN30.zExaSeZL3TnlBHfE6TnWQm-Za3VVjkHqYLKAGfQlTog"
);

async function checkProject() {
    const id = "d1f6317d-12a9-47e1-aea6-3750234e2b3c";
    console.log('Checking Project ID:', id);

    const { data: project, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', id)
        .single();

    if (error) {
        console.error('Error fetching project:', error);
    } else {
        console.log('Project found:', JSON.stringify(project, null, 2));
    }

    const { data: tasks, error: tError } = await supabase
        .from('tasks')
        .select('*')
        .eq('org_id', id); // Try org_id = id as well

    if (tError) console.error('Error tasks by org_id:', tError);
    else console.log('Tasks for org_id', id, ':', tasks.length);
}

checkProject();
