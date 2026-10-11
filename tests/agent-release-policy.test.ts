import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

test('직접 게시 작업과 자동화 탐지 회피를 출시 경로에서 차단한다', () => {
  const worker = read('src/agent/worker.ts')
  const naver = read('src/agent/playwright/naver_upload.ts')
  const youtube = read('src/agent/playwright/youtube_upload.ts')
  const instagram = read('src/agent/playwright/instagram_upload.ts')

  for (const taskType of ['naver_upload', 'upload_naver_blog', 'youtube_upload', 'upload_youtube', 'instagram_upload', 'upload_instagram']) {
    assert.doesNotMatch(worker, new RegExp(`['\"]${taskType}['\"]`))
  }
  assert.doesNotMatch(naver, /AutomationControlled|navigator\s*,\s*['\"]webdriver|cdc_adoQ/)
  assert.doesNotMatch(naver, /\.click\(\)[\s\S]{0,160}(발행|publish)/i)
  assert.doesNotMatch(youtube, /publishBtn\.click\(\)/)
  assert.doesNotMatch(instagram, /shareBtn\.click\(\)/)
})

test('레거시 설치 경로와 평문 플랫폼 비밀번호 폴백을 비활성화한다', () => {
  const publicInstaller = read('public/agent-setup.bat')
  const legacyInstaller = read('scripts/setup-local-agent.bat')
  const zipBuilder = read('scripts/build-agent-zip.js')
  const config = read('src/agent/config.ts')

  assert.doesNotMatch(publicInstaller, /agent:start|npm\s+(install|run)/i)
  assert.doesNotMatch(legacyInstaller, /dist-agent[\\/]worker\.js|node\s+dist-agent/i)
  assert.doesNotMatch(zipBuilder, /dist-agent[\\/]worker\.js|tsx[\\/]dist[\\/]cli\.mjs/i)
  assert.doesNotMatch(config, /NAVER_PW|GOOGLE_PW|INSTAGRAM_PW|KAKAO_PW/)
})

test('에이전트 bootstrap은 placeholder 키를 저장하지 않고 빌드 입력을 검증한다', () => {
  const setup = read('src/agent/setup.html')
  const main = read('src/agent/main.ts')
  const packageJson = read('package.json')

  assert.doesNotMatch(setup, /eyJhbG\.\.\.|supabase_anon_key|anon_key:/)
  assert.match(main, /loadBootstrapConfig/)
  assert.match(packageJson, /prepare-agent-bootstrap/)
})

test('레거시 building_api_key는 보호 저장소로 이전한 뒤에만 원본을 제거한다', () => {
  const store = read('src/agent/credential-store.ts')
  const config = read('src/agent/config.ts')

  assert.match(store, /building_api_key/)
  assert.match(store, /saveBuildingApiKey/)
  assert.match(config, /getBuildingApiKey/)
})
