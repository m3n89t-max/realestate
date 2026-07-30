'use strict';
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('.ua/tmp/arch-input.json', 'utf8'));

function layerOf(n) {
  const id = n.id, p = n.filePath || '';
  if (id.startsWith('table:')) return 'data';
  if (p.startsWith('supabase/migrations/')) return 'data';
  if (p.startsWith('supabase/functions/')) return 'edge-functions';
  if (p === 'supabase/config.toml') return 'edge-functions';
  if (p.startsWith('src/app/api/')) return 'bff-api';
  if (p.startsWith('src/agent/')) return 'automation-agent';
  if (p.startsWith('src/lib/')) return 'shared-lib';
  if (p.startsWith('packages/')) return 'shared-lib';
  if (p.startsWith('src/app/')) return 'presentation-ui';
  if (p.startsWith('src/components/')) return 'presentation-ui';
  if (p.startsWith('scripts/')) return 'config-build';
  if (p.startsWith('public/')) return 'config-build';
  if (p.startsWith('tests/')) return 'config-build';
  return 'config-build';
}

const buckets = {};
for (const n of data.fileNodes) {
  const l = layerOf(n);
  (buckets[l] = buckets[l] || []).push(n.id);
}
let total = 0;
for (const k of Object.keys(buckets)) { console.log(k, buckets[k].length); total += buckets[k].length; }
console.log('TOTAL', total, 'expected', data.fileNodes.length);
fs.writeFileSync('.ua/tmp/ua-buckets.json', JSON.stringify(buckets, null, 2));
