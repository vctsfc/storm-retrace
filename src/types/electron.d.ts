/**
 * Type declarations for the Electron preload API.
 *
 * When running in Electron, `window.electronAPI` is exposed via
 * contextBridge in `electron/preload.cjs`. In a regular browser
 * this property is `undefined`.
 */

interface GPXFileInfo {
  name: string;
  path: string;
  size: number;
  modified: number; // ms timestamp
}

interface ElectronAPI {
  isElectron: boolean;
  selectGPXFolder: () => Promise<string | null>;
  listGPXFiles: (folderPath: string) => Promise<GPXFileInfo[]>;
  readGPXFile: (filePath: string) => Promise<string>;
}

interface Window {
  electronAPI?: ElectronAPI;
}
