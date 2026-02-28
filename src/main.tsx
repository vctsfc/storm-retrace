// Browser polyfills for Node.js APIs used by nexrad-level-2-data
import { Buffer } from 'buffer';
(window as any).Buffer = Buffer;

import { createRoot } from 'react-dom/client';
import App from './App';

// Tag body for Electron-specific CSS (e.g. macOS traffic light padding)
if ((window as any).electronAPI?.isElectron && navigator.platform.includes('Mac')) {
  document.body.classList.add('electron-mac');
}

// Note: StrictMode is intentionally omitted. Its double-mount behavior
// is incompatible with imperative DOM libraries like MapLibre GL which
// attach to a container div and cannot survive mount/unmount/remount cycles
// on the same DOM element.
createRoot(document.getElementById('root')!).render(<App />);
