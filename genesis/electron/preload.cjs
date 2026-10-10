'use strict';
/**
 * Preload script: the ONLY bridge between the GENESIS web interface and Electron.
 * It exposes a small, read-only API. No Node.js, filesystem, shell or generic
 * IPC access is available to the renderer.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('genesisDesktop', {
  isDesktop: true,
  getAppInfo: () => ipcRenderer.invoke('genesis:get-app-info')
});
