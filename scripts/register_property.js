/**
 * Property Registration Automation Script
 * 
 * This script registers the "Jeju Aewol-eup Sangga" property into Supabase.
 * Usage: node scripts/register_property.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// Configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Error: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Property Data (from User Request)
const propertyData = {
    address: "제주특별자치도 제주시 애월읍 유수암평화5길",
    property_type: "commercial",
    price: 10, // 0억 10만원 (based on FAQ: "가격은 0억 10만원입니다") -> 10만원
    area: 199.98,
    direction: "남동향",
    features: ["조용한", "풀옵션", "즉시입주", "평화로 인접", "상권인접"],
    note: "제주시 애월읍 상가 매매 - 조용한 환경·풀옵션·즉시입주 199.98㎡",
    status: "active"
};

// Image URLs provided by the user
const imageUrls = [
    "https://mlluhuiwtsjndkztomjx.supabase.co/storage/v1/object/public/project-assets/d1f6317d-12a9-47e1-aea6-3750234e2b3c/60c86346-c4f0-461f-86d4-b791bc860613/dx6jmczc_1773137175407.jpg",
    "https://mlluhuiwtsjndkztomjx.supabase.co/storage/v1/object/public/project-assets/d1f6317d-12a9-47e1-aea6-3750234e2b3c/60c86346-c4f0-461f-86d4-b791bc860613/io5a4s3a_1773137177672.jpg",
    "https://mlluhuiwtsjndkztomjx.supabase.co/storage/v1/object/public/project-assets/d1f6317d-12a9-47e1-aea6-3750234e2b3c/60c86346-c4f0-461f-86d4-b791bc860613/vew0pkw2_1773137178982.jpg",
    "https://mlluhuiwtsjndkztomjx.supabase.co/storage/v1/object/public/project-assets/d1f6317d-12a9-47e1-aea6-3750234e2b3c/60c86346-c4f0-461f-86d4-b791bc860613/z2rncj27_1773137181209.jpg",
    "https://mlluhuiwtsjndkztomjx.supabase.co/storage/v1/object/public/project-assets/d1f6317d-12a9-47e1-aea6-3750234e2b3c/60c86346-c4f0-461f-86d4-b791bc860613/b1e27lrn_1773137182493.jpg",
    "https://mlluhuiwtsjndkztomjx.supabase.co/storage/v1/object/public/project-assets/d1f6317d-12a9-47e1-aea6-3750234e2b3c/60c86346-c4f0-461f-86d4-b791bc860613/5k6x35zt_1773137184528.jpg"
];

const orgId = "d1f6317d-12a9-47e1-aea6-3750234e2b3c"; // Extracted from provided URLs

async function run() {
    console.log('🚀 Starting property registration...');

    // 1. Create or Find User (Required for 'created_by')
    // For automation, we'll try to find an owner of the organization
    const { data: membership, error: memError } = await supabase
        .from('memberships')
        .select('user_id')
        .eq('org_id', orgId)
        .eq('role', 'owner')
        .limit(1)
        .single();

    if (memError || !membership) {
        console.error('❌ Error: Could not find owner for organization', orgId, memError?.message);
        process.exit(1);
    }

    const userId = membership.user_id;
    console.log(`✅ Using User ID: ${userId} for Org ID: ${orgId}`);

    // 2. Insert Project
    const { data: project, error: projError } = await supabase
        .from('projects')
        .insert({
            ...propertyData,
            org_id: orgId,
            created_by: userId,
            cover_image_url: imageUrls[0]
        })
        .select()
        .single();

    if (projError) {
        console.error('❌ Error: Project insertion failed', projError.message);
        process.exit(1);
    }

    const projectId = project.id;
    console.log(`✅ Project created with ID: ${projectId}`);

    // 3. Insert Assets
    console.log('📸 Registering assets...');
    const assetsToInsert = imageUrls.map((url, index) => ({
        project_id: projectId,
        org_id: orgId,
        type: 'image',
        file_name: `photo_${index + 1}.jpg`,
        file_url: url,
        is_cover: index === 0,
        sort_order: index
    }));

    const { error: assetError } = await supabase
        .from('assets')
        .insert(assetsToInsert);

    if (assetError) {
        console.warn('⚠️ Warning: Asset registration failed', assetError.message);
    } else {
        console.log(`✅ Succesfully registered ${assetsToInsert.length} assets.`);
    }

    // 4. Trigger AI Analysis (Simulate the Edge Function call)
    console.log('🤖 Triggering AI Location Analysis...');
    try {
        // In a real scenario, this would be a fetch to the edge function
        // But since this is a script, we'll just log it.
        console.log(`To analyze this property, run: supabase functions invoke analyze-location --body '{"project_id": "${projectId}"}'`);
    } catch (err) {
        console.warn('⚠️ AI Analysis trigger failed', err.message);
    }

    console.log('\n✨ Registration Complete!');
    console.log(`View your project at: /projects/${projectId}`);
}

run();
