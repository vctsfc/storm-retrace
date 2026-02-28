/**
 * Electron preload script (CommonJS — required by Electron's preload context).
 *
 * Exposes a minimal API to the renderer process via contextBridge.
 * The renderer can check `window.electronAPI.isElectron` to detect
 * the Electron environment and adjust behavior accordingly.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  selectGPXFolder: () => ipcRenderer.invoke('select-gpx-folder'),
  listGPXFiles: (folderPath) => ipcRenderer.invoke('list-gpx-files', folderPath),
  readGPXFile: (filePath) => ipcRenderer.invoke('read-gpx-file', filePath),
});
