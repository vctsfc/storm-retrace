/**
 * Runtime URL helpers for IEM API and public asset paths.
 *
 * In Vite dev mode the IEM proxy at `/api/iem` is available.
 * In Electron (production) we fetch directly from IEM and strip the
 * Origin header in the main process to avoid CORS issues.
 */

function isElectron(): boolean {
  return !!(window as any).electronAPI?.isElectron;
}

function isDevServer(): boolean {
  return window.location.protocol !== 'file:' && import.meta.env.DEV;
}

/**
 * Base URL for Iowa Environmental Mesonet requests.
 *
 * - Dev server → `/api/iem` (Vite proxy)
 * - Electron / production → `https://mesonet.agron.iastate.edu`
 */
export function getIEMBaseUrl(): string {
  if (isDevServer()) return '/api/iem';
  return 'https://mesonet.agron.iastate.edu';
}

/**
 * Resolve a path inside the `public/` folder to a fetch-safe URL.
 *
 * - Dev server → absolute (`/nexrad-stations.geojson`)
 * - Electron / production → relative (`./nexrad-stations.geojson`)
 */
export function getPublicAssetUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  if (isElectron() || !isDevServer()) return `./${cleanPath}`;
  return `/${cleanPath}`;
}
