const SUPABASE_PROJECT_HOST = /^[a-z0-9]{20}\.supabase\.co$/
const WEBHOOK_PATH = '/functions/v1/webhook-agent'

export function validateSupabaseProjectUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('공식 Supabase 프로젝트 HTTPS 주소가 필요합니다.')
  }

  if (
    url.protocol !== 'https:'
    || !SUPABASE_PROJECT_HOST.test(url.hostname)
    || url.port
    || url.username
    || url.password
    || (url.pathname !== '/' && url.pathname !== '')
    || url.search
    || url.hash
  ) {
    throw new Error('공식 Supabase 프로젝트 HTTPS 주소가 필요합니다.')
  }
  return url.origin
}

export function buildWebhookUrl(supabaseUrl: string): string {
  return `${validateSupabaseProjectUrl(supabaseUrl)}${WEBHOOK_PATH}`
}

export function validateWebhookUrl(value: string, supabaseUrl: string): string {
  const expected = buildWebhookUrl(supabaseUrl)
  let actual: URL
  try {
    actual = new URL(value)
  } catch {
    throw new Error('webhook 주소가 유효하지 않습니다.')
  }
  if (actual.toString() !== expected) {
    throw new Error('webhook 주소는 공식 서버의 고정 경로여야 합니다.')
  }
  return expected
}
