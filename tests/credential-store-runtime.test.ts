import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

// tsx는 이 테스트를 CJS로 변환하므로 require 캐시에 electron 스텁을 심어
// 실제 Electron 런타임 없이 safeStorage 계약을 그대로 검증한다.
const state = { available: true }

const electronStub = {
  safeStorage: {
    isEncryptionAvailable: () => state.available,
    encryptString: (plain: string) => Buffer.concat([Buffer.from('ENC:'), Buffer.from(plain, 'utf8')]),
    decryptString: (buffer: Buffer) => {
      const raw = buffer.toString('utf8')
      if (!raw.startsWith('ENC:')) throw new Error('암호문 형식이 아닙니다.')
      return raw.slice(4)
    },
  },
}

const electronResolved = require.resolve('electron')
require.cache[electronResolved] = {
  id: electronResolved,
  filename: electronResolved,
  loaded: true,
  exports: electronStub,
} as unknown as NodeModule

const storePath = path.join(process.cwd(), 'src/agent/credential-store.ts')

type Store = typeof import('../src/agent/credential-store')

function freshStore(): { store: Store; configDir: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jipporter-credential-'))
  process.env.APPDATA = root
  state.available = true
  delete require.cache[require.resolve(storePath)]
  const store = require(storePath) as Store
  return { store, configDir: path.join(root, 'RealEstateAIOS') }
}

test('safeStorage로 저장한 로그인정보는 평문으로 남지 않고 다시 복호화된다', () => {
  const { store, configDir } = freshStore()

  store.savePlatformCredentials({ naver: { id: 'broker-id', pw: 'super-secret-pw' } })

  const onDisk = fs.readFileSync(path.join(configDir, 'credentials.secure'), 'utf8')
  assert.ok(!onDisk.includes('super-secret-pw'), '비밀번호가 평문으로 남아 있습니다.')

  const restored = store.getPlatformCredential('naver')
  assert.equal(restored?.pw, 'super-secret-pw')
  assert.equal(restored?.id, 'broker-id')
  assert.deepEqual(store.getCredentialStatus(), { naver: true, google: false, instagram: false, kakao: false })
})

test('삭제한 로그인정보는 상태와 조회에서 모두 사라진다', () => {
  const { store } = freshStore()

  store.savePlatformCredentials({ naver: { id: 'broker-id', pw: 'pw-1' } })
  store.deletePlatformCredential('naver')

  assert.equal(store.getPlatformCredential('naver'), null)
  assert.equal(store.getCredentialStatus().naver, false)
})

test('암호화를 사용할 수 없으면 저장을 거부한다', () => {
  const { store } = freshStore()
  state.available = false

  assert.throws(() => store.savePlatformCredentials({ naver: { id: 'a', pw: 'b' } }), /보안 저장소/)
})

test('식별자 없는 비밀번호만으로는 저장되지 않는다', () => {
  const { store } = freshStore()

  assert.throws(() => store.savePlatformCredentials({ naver: { pw: 'only-pw' } }), /식별자/)
})

test('agent_key와 building_api_key는 각각 보호 저장소에 보관된다', () => {
  const { store, configDir } = freshStore()

  store.saveAgentKey('agent-connection-key')
  store.saveBuildingApiKey('building-api-secret')

  const onDisk = fs.readFileSync(path.join(configDir, 'credentials.secure'), 'utf8')
  assert.ok(!onDisk.includes('agent-connection-key'))
  assert.ok(!onDisk.includes('building-api-secret'))
  assert.equal(store.getAgentKey(), 'agent-connection-key')
  assert.equal(store.getBuildingApiKey(), 'building-api-secret')
})

test('레거시 마이그레이션은 building_api_key까지 이전한 뒤 평문 파일을 삭제한다', () => {
  const { store, configDir } = freshStore()
  fs.mkdirSync(configDir, { recursive: true })
  const legacyPath = path.join(configDir, 'credentials.json')
  fs.writeFileSync(legacyPath, JSON.stringify({
    naver: { id: 'legacy-id', pw: 'legacy-pw' },
    building_api_key: 'legacy-building-key',
  }))

  assert.equal(store.migrateLegacyCredentials(), true)
  assert.equal(fs.existsSync(legacyPath), false, '평문 레거시 파일이 남아 있습니다.')
  assert.equal(store.getPlatformCredential('naver')?.pw, 'legacy-pw')
  assert.equal(store.getBuildingApiKey(), 'legacy-building-key')
})

test('불완전한 레거시 항목은 평문 파일을 보존하고 오류로 알린다', () => {
  const { store, configDir } = freshStore()
  fs.mkdirSync(configDir, { recursive: true })
  const legacyPath = path.join(configDir, 'credentials.json')
  fs.writeFileSync(legacyPath, JSON.stringify({ naver: { pw: 'orphan-pw' } }))

  assert.throws(() => store.migrateLegacyCredentials(), /불완전/)
  assert.equal(fs.existsSync(legacyPath), true, '실패한 마이그레이션에서 원본을 지우면 안 됩니다.')
})

test('알 수 없는 레거시 항목이 있으면 원본을 삭제하지 않는다', () => {
  const { store, configDir } = freshStore()
  fs.mkdirSync(configDir, { recursive: true })
  const legacyPath = path.join(configDir, 'credentials.json')
  fs.writeFileSync(legacyPath, JSON.stringify({ unknown_service: { pw: 'x' } }))

  assert.throws(() => store.migrateLegacyCredentials(), /알 수 없는/)
  assert.equal(fs.existsSync(legacyPath), true)
})

test('손상된 보안 저장소는 연결 안 됨으로 보고하고 덮어쓰기를 거부한다', () => {
  const { store, configDir } = freshStore()
  fs.mkdirSync(configDir, { recursive: true })
  fs.writeFileSync(path.join(configDir, 'credentials.secure'), 'not-a-valid-ciphertext')

  assert.equal(store.getPlatformCredential('naver'), null)
  assert.equal(store.getCredentialStatus().naver, false)
  assert.throws(() => store.savePlatformCredentials({ naver: { id: 'a', pw: 'b' } }))
})
