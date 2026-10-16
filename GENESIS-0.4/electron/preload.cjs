'use strict';
/**
 * Preload script: the ONLY bridge between the JENESIS web interface and Electron.
 * It exposes app information, a validated language preference, and a native,
 * confirmed installation choice. No filesystem, shell or generic IPC access.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('genesisDesktop', {
  isDesktop: true,
  getAppInfo: () => ipcRenderer.invoke('genesis:get-app-info'),
  chooseInstallation: (target) => {
    if (!['legacy', 'current'].includes(target)) return Promise.reject(new Error('Unsupported installation choice'));
    return ipcRenderer.invoke('genesis:choose-installation', target);
  },
  setLanguage: (lang) => {
    if (!['en', 'fr', 'rw'].includes(lang)) return Promise.reject(new Error('Unsupported language'));
    return ipcRenderer.invoke('genesis:set-language', lang);
  }
});
