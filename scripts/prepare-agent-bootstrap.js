const fs = require('node:fs')
const path = require('node:path')

const url = process.env.AGENT_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const anonKey = process.env.AGENT_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

function fail(message) {
  console.error(`[agent-bootstrap] ${message}`)
  process.exit(1)
}

let parsedUrl
try {
  parsedUrl = new URL(url)
} catch {
  fail('AGENT_SUPABASE_URL이 유효한 URL이 아닙니다.')
}
if (parsedUrl.protocol !== 'https:') fail('AGENT_SUPABASE_URL은 HTTPS여야 합니다.')
if (anonKey.length < 20 || anonKey.includes('...')) fail('유효한 AGENT_SUPABASE_ANON_KEY가 필요합니다.')

const outputPath = path.join(process.cwd(), 'dist-agent', 'bootstrap.json')
fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, JSON.stringify({ supabase_url: url, supabase_anon_key: anonKey }), { mode: 0o600 })
console.log('[agent-bootstrap] 검증된 연결 설정을 생성했습니다.')
