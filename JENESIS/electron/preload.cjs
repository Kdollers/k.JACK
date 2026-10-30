'use strict';
/**
 * Preload script: the ONLY bridge between the JENESIS web interface and Electron.
 * It exposes a small, read-only API. No Node.js, filesystem, shell or generic
 * IPC access is available to the renderer.
 */
const { contextBridge, ipcRenderer } = require('electron');

// Which application this window was opened as: the shortcut adds ?app=seller,
// ?app=maintenance or ?app=admin to the address. Read-only, and it changes
// nothing but the identity of the interface (name, colour, menu).
const appMode = (() => {
  try {
    const value = new URLSearchParams(window.location.search).get('app');
    return ['seller', 'maintenance', 'admin'].includes(String(value).toLowerCase())
      ? String(value).toLowerCase()
      : null;
  } catch (_) {
    return null;
  }
})();

contextBridge.exposeInMainWorld('genesisDesktop', {
  isDesktop: true,
  app: appMode,
  getAppInfo: () => ipcRenderer.invoke('genesis:get-app-info'),
  // Appearance only: the main process accepts 'light', 'dark' or 'system' and
  // ignores anything else. It grants no other capability.
  setTheme: (theme) => ipcRenderer.invoke('genesis:set-theme', theme),
  // Maintenance only: restarts the local service so a network change takes
  // effect. No arguments, no data, and it is refused outside the desktop shell.
  restartBackend: () => ipcRenderer.invoke('genesis:restart-backend')
});
