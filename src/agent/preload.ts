import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('agentSetup', {
    saveConfig: (data: unknown) => ipcRenderer.invoke('save-config', data),
    saveCredentials: (data: unknown) => ipcRenderer.invoke('save-credentials', data),
    configSaved: () => ipcRenderer.invoke('config-saved'),
});