const fs = require('node:fs')
const path = require('node:path')

const rawUrl = process.env.AGENT_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const anonKey = process.env.AGENT_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const officialHost = /^[a-z0-9]{20}\.supabase\.co$/
const webhookPath = '/functions/v1/webhook-agent'

function fail(message) {
  console.error(`[agent-bootstrap] ${message}`)
  process.exit(1)
}

let parsedUrl
try {
  parsedUrl = new URL(rawUrl)
} catch {
  fail('AGENT_SUPABASE_URL이 유효한 URL이 아닙니다.')
}
if (
  parsedUrl.protocol !== 'https:'
  || !officialHost.test(parsedUrl.hostname)
  || parsedUrl.port
  || parsedUrl.username
  || parsedUrl.password
  || (parsedUrl.pathname !== '/' && parsedUrl.pathname !== '')
  || parsedUrl.search
  || parsedUrl.hash
) {
  fail('AGENT_SUPABASE_URL은 공식 Supabase 프로젝트 HTTPS origin이어야 합니다 (*.supabase.co).')
}
if (anonKey.length < 20 || anonKey.includes('...')) fail('유효한 AGENT_SUPABASE_ANON_KEY가 필요합니다.')

const supabaseUrl = parsedUrl.origin
const outputPath = path.join(process.cwd(), 'dist-agent', 'bootstrap.json')
fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, JSON.stringify({
  supabase_url: supabaseUrl,
  supabase_anon_key: anonKey,
  webhook_url: `${supabaseUrl}${webhookPath}`,
}), { mode: 0o600 })
console.log('[agent-bootstrap] 검증된 연결 설정을 생성했습니다.')
