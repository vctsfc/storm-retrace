/**
 * Electron main process for StormReplay.
 *
 * Creates the main BrowserWindow with macOS native traffic light buttons,
 * loads the Vite-built app (or dev server in development), and strips
 * Origin headers for IEM requests to avoid CORS issues.
 */

import { app, BrowserWindow, session } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === 'development' || !!process.env.VITE_DEV_SERVER_URL;

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    backgroundColor: '#1a1a2e',
    show: false,
  });

  // Show window once ready to avoid flash of white
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // ── CORS fix: strip Origin header for IEM requests ──
  // Desktop apps don't have CORS restrictions; this makes requests
  // behave like curl or any other non-browser HTTP client.
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['https://mesonet.agron.iastate.edu/*'] },
    (details, callback) => {
      delete details.requestHeaders['Origin'];
      callback({ requestHeaders: details.requestHeaders });
    },
  );

  // Also handle CORS response headers from IEM
  session.defaultSession.webRequest.onHeadersReceived(
    { urls: ['https://mesonet.agron.iastate.edu/*'] },
    (details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'access-control-allow-origin': ['*'],
        },
      });
    },
  );

  if (isDev) {
    const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── App lifecycle ──

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
