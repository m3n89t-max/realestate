const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    "https://mlluhuiwtsjndkztomjx.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1sbHVodWl3dHNqbmRrenRvbWp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMjUxMzcsImV4cCI6MjA4NDcwMTEzN30.zExaSeZL3TnlBHfE6TnWQm-Za3VVjkHqYLKAGfQlTog"
);

async function checkOrgs() {
    const { data: orgs, error } = await supabase.from('organizations').select('*');
    if (error) console.error('Error orgs:', error);
    else {
        console.log('Organizations:');
        console.table(orgs);
    }

    const { data: projects, error: pError } = await supabase.from('projects').select('*');
    if (pError) console.error('Error projects:', pError);
    else {
        console.log('Projects:');
        console.table(projects.map(p => ({ id: p.id, org_id: p.org_id, address: p.address })));
    }

    const { data: tasks, error: tError } = await supabase.from('tasks').select('*');
    if (tError) console.error('Error tasks:', tError);
    else {
        console.log('All Tasks:');
        console.table(tasks);
    }
}

checkOrgs();
