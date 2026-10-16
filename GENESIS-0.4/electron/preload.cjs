'use strict';
/**
 * Preload script: the ONLY bridge between the JENESIS web interface and Electron.
 * It exposes app information and a validated language preference only.
 * No Node.js, filesystem, shell or generic IPC access is available to the renderer.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('genesisDesktop', {
  isDesktop: true,
  getAppInfo: () => ipcRenderer.invoke('genesis:get-app-info'),
  setLanguage: (lang) => {
    if (!['en', 'fr', 'rw'].includes(lang)) return Promise.reject(new Error('Unsupported language'));
    return ipcRenderer.invoke('genesis:set-language', lang);
  }
});
