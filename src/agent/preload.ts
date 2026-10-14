import { contextBridge, ipcRenderer } from 'electron'

const api = {
  saveConfig: (data: { agent_name: string; agent_key: string }) =>
    ipcRenderer.invoke('save-config', data),
  finishSetup: () => ipcRenderer.invoke('config-saved'),
}

contextBridge.exposeInMainWorld('jipporter', api)
