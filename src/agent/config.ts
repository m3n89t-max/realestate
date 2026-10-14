import { app } from 'electron'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { getAgentKey, getBuildingApiKey } from './credential-store'
import { validateSupabaseProjectUrl, validateWebhookUrl } from './endpoint-policy'

export interface AgentConfig {
  agent_key: string
  supabase_url: string
  supabase_anon_key: string
  webhook_url: string
  agent_name: string
  version: string
  building_api_key: string
}

export interface BootstrapConfig {
  supabase_url: string
  supabase_anon_key: string
  webhook_url: string
}

function configPath(): string {
  const appDataPath = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
  return path.join(appDataPath, 'RealEstateAIOS', 'config.json')
}

function loadLocalPreferences(): { agent_name?: string } {
  const filePath = configPath()
  if (!fs.existsSync(filePath)) return {}
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>
  return typeof parsed.agent_name === 'string' ? { agent_name: parsed.agent_name } : {}
}

export function loadBootstrapConfig(): BootstrapConfig {
  const bootstrapPath = path.join(__dirname, 'bootstrap.json')
  if (!fs.existsSync(bootstrapPath)) {
    throw new Error('설치파일의 서버 연결 설정이 없습니다. 공식 설치파일로 다시 설치해 주세요.')
  }
  const raw = JSON.parse(fs.readFileSync(bootstrapPath, 'utf8')) as Record<string, unknown>
  const supabaseUrl = validateSupabaseProjectUrl(typeof raw.supabase_url === 'string' ? raw.supabase_url : '')
  const anonKey = typeof raw.supabase_anon_key === 'string' ? raw.supabase_anon_key : ''
  if (anonKey.length < 20 || anonKey.includes('...')) {
    throw new Error('설치파일의 서버 연결 키가 유효하지 않습니다.')
  }
  const webhookUrl = validateWebhookUrl(typeof raw.webhook_url === 'string' ? raw.webhook_url : '', supabaseUrl)
  return { supabase_url: supabaseUrl, supabase_anon_key: anonKey, webhook_url: webhookUrl }
}

export function getConfig(): AgentConfig {
  const bootstrap = loadBootstrapConfig()
  const preferences = loadLocalPreferences()
  return {
    agent_key: getAgentKey(),
    supabase_url: bootstrap.supabase_url,
    supabase_anon_key: bootstrap.supabase_anon_key,
    webhook_url: bootstrap.webhook_url,
    agent_name: preferences.agent_name || `Agent-${os.hostname()}`,
    version: app.getVersion(),
    building_api_key: getBuildingApiKey(),
  }
}
