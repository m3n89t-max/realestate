import { contextBridge, ipcRenderer } from 'electron'
import type { PlatformCredential, PlatformKey } from './credential-store'

const api = {
  saveConfig: (data: { agent_name: string; agent_key: string }) =>
    ipcRenderer.invoke('save-config', data),
  saveCredentials: (data: Partial<Record<PlatformKey, PlatformCredential>>) =>
    ipcRenderer.invoke('save-credentials', data),
  credentialStatus: () => ipcRenderer.invoke('credential-status'),
  deleteCredential: (platform: PlatformKey) => ipcRenderer.invoke('delete-credential', platform),
  finishSetup: () => ipcRenderer.invoke('config-saved'),
}

contextBridge.exposeInMainWorld('jipporter', api)
