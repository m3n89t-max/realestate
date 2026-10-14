import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()
const read = (file: string) => readFileSync(join(root, file), 'utf8')

test('SNS 자동 업로드 소스는 컴파일·패키징·renderer 계약에서 제외한다', () => {
  const worker = read('src/agent/worker.ts')
  const tsconfig = JSON.parse(read('tsconfig.agent.json')) as { include: string[]; exclude?: string[] }
  const setup = read('src/agent/setup.html')
  const preload = read('src/agent/preload.ts')

  for (const term of [
    'naver_upload', 'youtube_upload', 'instagram_upload',
    'uploadNaverBlog', 'uploadYoutube', 'uploadInstagram',
  ]) {
    assert.doesNotMatch(worker, new RegExp(term, 'i'))
    assert.doesNotMatch(setup, new RegExp(term, 'i'))
    assert.doesNotMatch(preload, new RegExp(term, 'i'))
  }
  assert.ok(tsconfig.exclude?.includes('src/agent/playwright/*_upload.ts'))
  assert.doesNotMatch(setup, /naver_pw|google_pw|instagram_pw/)
  assert.match(setup, /SNS 비밀번호를 입력받지 않습니다/)
  assert.doesNotMatch(preload, /saveCredentials|credentialStatus|deleteCredential/)
})

test('출시 산출물 금지 문자열 검사기가 dist와 app.asar를 모두 검사한다', () => {
  const verifier = read('scripts/verify-agent-artifact.js')
  assert.match(verifier, /dist-agent/)
  assert.match(verifier, /app\.asar/)
  for (const term of ['naver_upload', 'youtube_upload', 'instagram_upload', '봇 탐지 우회', '자동 로그인']) {
    assert.match(verifier, new RegExp(term))
  }
})

test('bootstrap만 endpoint를 제공하고 config.json endpoint는 제거한다', () => {
  const config = read('src/agent/config.ts')
  const main = read('src/agent/main.ts')
  const prepare = read('scripts/prepare-agent-bootstrap.js')

  assert.match(config, /loadBootstrapConfig/)
  assert.doesNotMatch(config, /fileConfig\?\.(supabase_url|supabase_anon_key|webhook_url)/)
  assert.doesNotMatch(config, /process\.env\.(NEXT_PUBLIC_SUPABASE_URL|WEBHOOK_URL)/)
  assert.match(main, /delete config\.supabase_url/)
  assert.match(main, /delete config\.supabase_anon_key/)
  assert.match(main, /delete config\.webhook_url/)
  assert.match(prepare, /supabase\.co/)
  assert.match(prepare, /functions\/v1\/webhook-agent/)
})

test('webhook fetch는 redirect를 자동 추적하지 않고 Authorization 전환 구조를 함께 보낸다', () => {
  const client = read('src/agent/webhook-client.ts')
  assert.match(client, /redirect:\s*['"]manual['"]/)
  assert.match(client, /Authorization/)
  assert.match(client, /서버가 Authorization 전환을 완료할 때까지/)
})

test('setup은 self-only CSP, 외부 script/style, password 연결키와 표시 토글을 사용한다', () => {
  const setup = read('src/agent/setup.html')
  const script = read('src/agent/setup.js')
  assert.match(setup, /Content-Security-Policy/)
  assert.match(setup, /default-src 'none'/)
  assert.match(setup, /script-src 'self'/)
  assert.match(setup, /style-src 'self'/)
  assert.doesNotMatch(setup, /<style>|<script>(?!\s*<\/script>)/)
  assert.match(setup, /id="agent_key"[^>]*type="password"/)
  assert.match(setup, /id="toggleAgentKey"/)
  assert.match(script, /agentKeyInput\.value\s*=\s*['"]/)
  assert.doesNotMatch(setup, /onclick=/)
})

test('보안 릴리스는 버전·portable·arch를 식별하고 app.getVersion만 사용한다', () => {
  const pkg = JSON.parse(read('package.json')) as { version: string; build: { artifactName: string } }
  const main = read('src/agent/main.ts')
  const config = read('src/agent/config.ts')
  assert.notEqual(pkg.version, '1.0.0')
  assert.match(pkg.build.artifactName, /\$\{version\}/)
  assert.match(pkg.build.artifactName, /portable/i)
  assert.match(pkg.build.artifactName, /\$\{arch\}/)
  assert.match(config, /app\.getVersion\(\)/)
  assert.doesNotMatch(main, /version:\s*['"]\d/)
})

test('unsigned release는 NO-GO이며 해시 manifest 도구와 수동 체크리스트가 있다', () => {
  const pkg = read('package.json')
  const releaseCheck = read('scripts/check-agent-release.js')
  const manifest = read('scripts/generate-agent-sha256.js')
  const checklistPath = join(root, 'docs/agent-release-checklist.md')
  assert.equal(existsSync(checklistPath), true)
  assert.match(pkg, /agent:release-check/)
  assert.match(pkg, /agent:sha256/)
  assert.match(releaseCheck, /CSC_LINK|WIN_CSC_LINK/)
  assert.match(releaseCheck, /NO-GO/)
  assert.match(manifest, /sha256/i)
})
