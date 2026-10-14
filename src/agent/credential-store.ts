import { safeStorage } from 'electron'
import fs from 'fs'
import os from 'os'
import path from 'path'

export type PlatformKey = 'naver' | 'google' | 'instagram' | 'kakao'

export interface PlatformCredential {
  id?: string
  email?: string
  pw: string
  saved_at?: string
}

interface SecurePayload {
  version: 1
  agent_key?: string
  building_api_key?: string
  platforms: Partial<Record<PlatformKey, PlatformCredential>>
}

const STORE_NAME = 'credentials.secure'
const LEGACY_NAME = 'credentials.json'
const PLATFORMS: PlatformKey[] = ['naver', 'google', 'instagram', 'kakao']
const CREDENTIAL_FIELDS = new Set(['id', 'email', 'pw', 'saved_at'])

function configDir(): string {
  return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'RealEstateAIOS')
}

function securePath(): string {
  return path.join(configDir(), STORE_NAME)
}

export function getLegacyCredentialPath(): string {
  return path.join(configDir(), LEGACY_NAME)
}

function blankPayload(): SecurePayload {
  return { version: 1, platforms: {} }
}

function assertEncryptionAvailable(): void {
  if (!safeStorage || !safeStorage.isEncryptionAvailable()) {
    throw new Error('운영체제 보안 저장소를 사용할 수 없습니다. Electron 앱에서 다시 시도해 주세요.')
  }
}

function readSecurePayload(): SecurePayload {
  const filePath = securePath()
  if (!fs.existsSync(filePath)) return blankPayload()

  assertEncryptionAvailable()
  const encrypted = Buffer.from(fs.readFileSync(filePath, 'utf8'), 'base64')
  const parsed = JSON.parse(safeStorage.decryptString(encrypted)) as SecurePayload
  if (parsed.version !== 1 || !parsed.platforms || typeof parsed.platforms !== 'object') {
    throw new Error('지원하지 않는 보안 저장소 형식입니다.')
  }
  return parsed
}

function writeSecurePayload(payload: SecurePayload): void {
  assertEncryptionAvailable()
  const dir = configDir()
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  const filePath = securePath()
  const temporaryPath = `${filePath}.tmp`
  try {
    const encrypted = safeStorage.encryptString(JSON.stringify(payload)).toString('base64')
    fs.writeFileSync(temporaryPath, encrypted, { encoding: 'utf8', mode: 0o600 })
    fs.renameSync(temporaryPath, filePath)
    const verified = readSecurePayload()
    if (JSON.stringify(verified) !== JSON.stringify(payload)) {
      throw new Error('보안 저장소 저장 후 복호화 검증에 실패했습니다.')
    }
  } finally {
    fs.rmSync(temporaryPath, { force: true })
  }
}

function assertCompleteLegacyCredential(platform: PlatformKey, value: unknown): PlatformCredential {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${platform} 레거시 로그인정보가 불완전해 원본을 보존했습니다.`)
  }
  const record = value as Record<string, unknown>
  if (Object.keys(record).some(key => !CREDENTIAL_FIELDS.has(key))) {
    throw new Error(`${platform} 레거시 로그인정보에 알 수 없는 항목이 있어 원본을 보존했습니다.`)
  }
  if (Object.values(record).some(item => item !== undefined && typeof item !== 'string')) {
    throw new Error(`${platform} 레거시 로그인정보가 불완전해 원본을 보존했습니다.`)
  }
  const pw = typeof record.pw === 'string' ? record.pw : ''
  const id = typeof record.id === 'string' ? record.id.trim() : ''
  const email = typeof record.email === 'string' ? record.email.trim() : ''
  if (!pw || (!id && !email)) {
    throw new Error(`${platform} 레거시 로그인정보가 불완전해 원본을 보존했습니다.`)
  }
  return {
    ...(id ? { id } : {}),
    ...(email ? { email } : {}),
    pw,
    ...(typeof record.saved_at === 'string' ? { saved_at: record.saved_at } : {}),
  }
}

export function savePlatformCredentials(input: Partial<Record<PlatformKey, PlatformCredential>>): void {
  const payload = readSecurePayload()
  for (const platform of PLATFORMS) {
    const credential = input[platform]
    if (!credential) continue
    if (!credential.pw && !credential.id && !credential.email) continue
    if (!credential.pw || (!credential.id && !credential.email)) {
      throw new Error(`${platform} 계정 식별자와 비밀번호가 필요합니다.`)
    }
    payload.platforms[platform] = { ...credential, saved_at: new Date().toISOString() }
  }
  writeSecurePayload(payload)
}

export function getPlatformCredential(platform: PlatformKey): PlatformCredential | null {
  try {
    return readSecurePayload().platforms[platform] || null
  } catch {
    return null
  }
}

export function getCredentialStatus(): Record<PlatformKey, boolean> {
  let payload = blankPayload()
  try {
    payload = readSecurePayload()
  } catch {
    // 손상되거나 복호화할 수 없는 저장소는 연결되지 않은 것으로 처리한다.
  }
  return Object.fromEntries(PLATFORMS.map(platform => [platform, Boolean(payload.platforms[platform]?.pw)])) as Record<PlatformKey, boolean>
}

export function deletePlatformCredential(platform: PlatformKey): void {
  if (!PLATFORMS.includes(platform)) throw new Error('지원하지 않는 플랫폼입니다.')
  const payload = readSecurePayload()
  delete payload.platforms[platform]
  writeSecurePayload(payload)
}

export function saveAgentKey(agentKey: string): void {
  if (!agentKey.trim()) throw new Error('에이전트 연결키가 필요합니다.')
  const payload = readSecurePayload()
  payload.agent_key = agentKey.trim()
  writeSecurePayload(payload)
}

export function getAgentKey(): string {
  try {
    return readSecurePayload().agent_key || ''
  } catch {
    return ''
  }
}

export function saveBuildingApiKey(apiKey: string): void {
  if (!apiKey.trim()) throw new Error('건축물대장 API 키가 필요합니다.')
  const payload = readSecurePayload()
  payload.building_api_key = apiKey.trim()
  writeSecurePayload(payload)
}

export function getBuildingApiKey(): string {
  try {
    return readSecurePayload().building_api_key || ''
  } catch {
    return ''
  }
}

export function migrateLegacyCredentials(): boolean {
  const legacyPath = getLegacyCredentialPath()
  if (!fs.existsSync(legacyPath)) return false

  const parsed = JSON.parse(fs.readFileSync(legacyPath, 'utf8')) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('레거시 로그인정보 형식이 올바르지 않아 원본을 보존했습니다.')
  }
  const legacy = parsed as Record<string, unknown>
  const knownKeys = new Set([...PLATFORMS, 'building_api_key', 'migrated'])
  if (Object.keys(legacy).some(key => !knownKeys.has(key))) {
    throw new Error('알 수 없는 레거시 로그인정보 항목이 있어 원본을 보존했습니다.')
  }
  if ('migrated' in legacy && typeof legacy.migrated !== 'boolean') {
    throw new Error('레거시 migrated 항목이 불완전해 원본을 보존했습니다.')
  }

  const payload = readSecurePayload()
  let migrated = false
  for (const platform of PLATFORMS) {
    if (!(platform in legacy)) continue
    payload.platforms[platform] = assertCompleteLegacyCredential(platform, legacy[platform])
    migrated = true
  }
  if ('building_api_key' in legacy) {
    if (typeof legacy.building_api_key !== 'string' || !legacy.building_api_key.trim()) {
      throw new Error('레거시 building_api_key가 불완전해 원본을 보존했습니다.')
    }
    payload.building_api_key = legacy.building_api_key.trim()
    migrated = true
  }

  if (migrated) writeSecurePayload(payload)
  fs.rmSync(legacyPath, { force: true })
  return migrated
}
