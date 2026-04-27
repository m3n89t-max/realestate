const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
   const { data } = await supabase.from('generated_contents').select('content').order('created_at', { ascending: false }).limit(1);
   fs.writeFileSync('tmp/last_content.txt', data[0].content);
   console.log('Saved to tmp/last_content.txt');
})();
