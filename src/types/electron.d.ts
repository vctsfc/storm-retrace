/**
 * Type declarations for the Electron preload API.
 *
 * When running in Electron, `window.electronAPI` is exposed via
 * contextBridge in `electron/preload.ts`. In a regular browser
 * this property is `undefined`.
 */

interface ElectronAPI {
  isElectron: boolean;
}

interface Window {
  electronAPI?: ElectronAPI;
}
