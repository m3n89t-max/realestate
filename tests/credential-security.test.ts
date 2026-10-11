import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readProjectFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test('진단 스크립트는 로그인 값과 에이전트 키를 코드에 저장하지 않는다', () => {
  const naverScript = readProjectFile('tmp/test_naver_upload.ts')
  assert.match(naverScript, /process\.env\.NAVER_TEST_ID/)
  assert.match(naverScript, /process\.env\.NAVER_TEST_PW/)
  assert.doesNotMatch(naverScript, /Hardcoded credentials/i)

  const diagnosticFiles = [
    'tmp/test_heartbeat.js',
    'tmp/check_connection.js',
    'tmp/check_agent_status.js',
    'tmp/check_tasks.js',
    'tmp/check_recent_tasks.js',
  ]

  for (const file of diagnosticFiles) {
    const source = readProjectFile(file)
    assert.doesNotMatch(source, /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i, file)
    assert.match(source, /process\.env\.AGENT_KEY/, file)
  }
})

test('웹은 외부 플랫폼 비밀번호를 받거나 저장하지 않는다', () => {
  const form = readProjectFile('src/app/(dashboard)/settings/credentials/CredentialForm.tsx')
  const route = readProjectFile('src/app/api/agent/credentials/route.ts')

  assert.doesNotMatch(form, /type=["']password["']/)
  assert.doesNotMatch(form, /\/api\/agent\/credentials/)
  assert.doesNotMatch(form, /href=["']\/agent-setup\.bat["']/)
  assert.match(form, /로컬 에이전트/)
  assert.match(route, /status:\s*410/)
  assert.doesNotMatch(route, /from ['"]fs['"]/)
  assert.doesNotMatch(route, /credentials\.json/)
})

test('Electron renderer는 격리되고 preload의 제한된 API만 사용한다', () => {
  const main = readProjectFile('src/agent/main.ts')
  const setup = readProjectFile('src/agent/setup.html')
  const preloadPath = resolve(process.cwd(), 'src/agent/preload.ts')

  assert.equal(existsSync(preloadPath), true)
  assert.match(main, /nodeIntegration:\s*false/)
  assert.match(main, /contextIsolation:\s*true/)
  assert.match(main, /sandbox:\s*true/)
  assert.match(main, /preload:/)
  assert.match(main, /assertTrustedSender/)
  assert.doesNotMatch(setup, /require\(['"]electron['"]\)/)
  assert.match(setup, /window\.jipporter/)
  assert.match(setup, /instagram_id/)
  assert.match(setup, /instagram_pw/)
})

test('로컬 자격증명 저장소는 Electron safeStorage로 암호화한다', () => {
  const store = readProjectFile('src/agent/credential-store.ts')
  const config = readProjectFile('src/agent/config.ts')

  assert.match(store, /safeStorage/)
  assert.match(store, /encryptString/)
  assert.match(store, /decryptString/)
  assert.match(store, /fs\.rmSync\(legacyPath/)
  assert.doesNotMatch(config, /credentials\.json/)
})

test('레거시 비밀 마이그레이션 실패가 앱 전체를 조용히 종료시키지 않는다', () => {
  const main = readProjectFile('src/agent/main.ts')

  assert.match(main, /try\s*{[\s\S]*migrateLegacySecrets\(\)[\s\S]*}\s*catch/)
  assert.match(main, /showSetupWindow\(\)/)
})

test('로컬 HTTP 자격증명 서버는 에이전트 시작 경로에서 제거한다', () => {
  const worker = readProjectFile('src/agent/worker.ts')
  const main = readProjectFile('src/agent/main.ts')

  assert.doesNotMatch(worker, /startUIServer/)
  assert.doesNotMatch(main, /localhost:3005/)
})
