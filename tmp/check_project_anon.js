const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    "https://mlluhuiwtsjndkztomjx.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
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
