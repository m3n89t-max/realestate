const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    "https://mlluhuiwtsjndkztomjx.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1sbHVodWl3dHNqbmRrenRvbWp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMjUxMzcsImV4cCI6MjA4NDcwMTEzN30.zExaSeZL3TnlBHfE6TnWQm-Za3VVjkHqYLKAGfQlTog"
);

async function checkProject() {
    const { data: project, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', '60c86346-c4f0-461f-86d4-b791bc860613')
        .single();

    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Project Details:', {
            id: project.id,
            org_id: project.org_id,
            address: project.address
        });
    }
}

checkProject();
