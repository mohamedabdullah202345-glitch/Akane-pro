import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const electron = require('electron');
const {
  app,
  BrowserWindow,
  clipboard,
  desktopCapturer,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  session,
  shell,
  Tray,
} = electron;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

let mainWindow = null;
let tray = null;
let bridgeInstance = null;
let companionMode = false;
let clickThrough = false;
let startWithWindows = false;

const DEV_APP_ORIGIN = 'http://127.0.0.1:3000';
const LOCALHOST_DEV_ORIGINS = new Set(['http://localhost:3000', 'http://127.0.0.1:3000']);

function isTrustedAppUrl(targetUrl) {
  if (typeof targetUrl !== 'string') return false;
  if (targetUrl.startsWith('file://')) {
    const distPrefix = path.resolve(ROOT_DIR, 'dist').replace(/\\/g, '/').toLowerCase();
    return targetUrl.replace(/\\/g, '/').toLowerCase().includes(distPrefix);
  }
  try {
    const parsed = new URL(targetUrl);
    return LOCALHOST_DEV_ORIGINS.has(parsed.origin);
  } catch {
    return false;
  }
}

function isSafeExternalUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'https:' || (parsed.protocol === 'http:' && parsed.hostname === 'localhost');
  } catch {
    return false;
  }
}

function getAppStartUrl() {
  const distIndex = path.join(ROOT_DIR, 'dist', 'index.html');
  if (!process.env.AKANE_ELECTRON_DEV && fs.existsSync(distIndex)) {
    return { type: 'file', target: distIndex };
  }
  return { type: 'url', target: process.env.AKANE_ELECTRON_URL || DEV_APP_ORIGIN };
}

function broadcastDesktopState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('akane:desktop-state', {
    companionMode,
    clickThrough,
    startWithWindows,
    emergencyStopped: bridgeInstance?.getSnapshot().emergencyStopped ?? false,
  });
}

function rebuildTrayMenu() {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    {
      label: mainWindow?.isVisible() ? 'Hide Akane' : 'Show Akane',
      click: () => {
        if (!mainWindow) return;
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      label: 'Companion Overlay Mode',
      type: 'checkbox',
      checked: companionMode,
      click: (item) => applyCompanionMode(Boolean(item.checked)),
    },
    {
      label: 'Click-Through Window',
      type: 'checkbox',
      checked: clickThrough,
      click: (item) => applyClickThrough(Boolean(item.checked)),
    },
    {
      label: 'Talk Shortcut (Ctrl+Shift+Space)',
      click: () => mainWindow?.webContents.send('akane:talk-shortcut'),
    },
    { type: 'separator' },
    {
      label: 'EMERGENCY STOP ALL (Ctrl+Shift+Esc)',
      click: () => triggerGlobalEmergencyStop('Tray Emergency Stop'),
    },
    {
      label: 'Start with Windows',
      type: 'checkbox',
      checked: startWithWindows,
      enabled: process.platform === 'win32' || process.platform === 'darwin',
      click: (item) => applyStartWithWindows(Boolean(item.checked)),
    },
    { type: 'separator' },
    {
      label: 'Quit Akane Pro',
      click: () => app.quit(),
    },
  ]);
  tray.setContextMenu(menu);
}

function applyClickThrough(enabled) {
  clickThrough = Boolean(enabled);
  if (mainWindow && !mainWindow.isDestroyed()) {
    // forward: true lets companion hover controls re-enable interaction when toggled
    mainWindow.setIgnoreMouseEvents(clickThrough, { forward: true });
  }
  rebuildTrayMenu();
  broadcastDesktopState();
}

function applyCompanionMode(enabled) {
  const next = Boolean(enabled);
  if (next === companionMode && mainWindow) {
    broadcastDesktopState();
    return;
  }
  companionMode = next;
  if (!companionMode && clickThrough) {
    clickThrough = false;
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    const oldBounds = mainWindow.getBounds();
    createMainWindow(oldBounds);
  }
  rebuildTrayMenu();
  broadcastDesktopState();
}

function applyStartWithWindows(enabled) {
  startWithWindows = Boolean(enabled);
  if (process.platform === 'win32' || process.platform === 'darwin') {
    try {
      app.setLoginItemSettings({ openAtLogin: startWithWindows });
    } catch {
      // Ignore login item errors in unpackaged mode
    }
  }
  rebuildTrayMenu();
  broadcastDesktopState();
}

function triggerGlobalEmergencyStop(reason = 'Global Emergency Hotkey') {
  try {
    bridgeInstance?.triggerEmergencyStop(reason);
  } catch {
    // Ignore
  }
  if (clickThrough) {
    clickThrough = false;
    mainWindow?.setIgnoreMouseEvents(false);
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('akane:emergency-stop', { reason });
  }
  broadcastDesktopState();
}

async function capturePrimaryScreenDataUrl() {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 1280, height: 720 },
  });
  const primary = sources[0];
  if (!primary) {
    throw new Error('No screen source available for direct capture.');
  }
  const thumb = primary.thumbnail;
  const size = thumb.getSize();
  const dataUrl = `data:image/jpeg;base64,${thumb.toJPEG(72).toString('base64')}`;
  return { width: size.width, height: size.height, dataUrl };
}

async function startEmbeddedBridge() {
  try {
    await import('tsx/esm');
    const { startBridgeServer } = await import('../bridge/server.ts');
    bridgeInstance = await startBridgeServer({
      nativeHooks: {
        openExternal: async (url) => {
          if (!isSafeExternalUrl(url)) {
            throw new Error('Blocked unsafe external URL.');
          }
          await shell.openExternal(url);
        },
        trashItem: async (targetPath) => {
          await shell.trashItem(targetPath);
        },
        readClipboard: async () => clipboard.readText(),
        captureScreenshot: capturePrimaryScreenDataUrl,
      },
      onStateChange: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('akane:bridge-updated');
        }
      },
    });
  } catch (err) {
    console.error('[Electron] Failed to start embedded bridge:', err);
  }
}

function createMainWindow(prevBounds) {
  const prevWin = mainWindow;
  const width = companionMode ? 420 : prevBounds?.width || 1280;
  const height = companionMode ? 640 : prevBounds?.height || 820;

  const win = new BrowserWindow({
    width,
    height,
    x: prevBounds?.x,
    y: prevBounds?.y,
    transparent: companionMode,
    frame: !companionMode,
    alwaysOnTop: companionMode,
    hasShadow: !companionMode,
    resizable: true,
    backgroundColor: companionMode ? '#00000000' : '#09070A',
    icon: path.join(ROOT_DIR, 'public', 'akane', 'akane_still.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  // Security: disallow loading arbitrary remote origins inside privileged Electron window
  win.webContents.on('will-navigate', (event, navigationUrl) => {
    if (!isTrustedAppUrl(navigationUrl)) {
      event.preventDefault();
      if (isSafeExternalUrl(navigationUrl)) {
        void shell.openExternal(navigationUrl);
      }
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  const start = getAppStartUrl();
  if (start.type === 'file') {
    void win.loadFile(start.target, {
      query: companionMode ? { companion: '1' } : {},
    });
  } else {
    const u = new URL(start.target);
    if (companionMode) u.searchParams.set('companion', '1');
    void win.loadURL(u.toString());
  }

  win.once('ready-to-show', () => {
    if (companionMode && clickThrough) {
      win.setIgnoreMouseEvents(true, { forward: true });
    }
    broadcastDesktopState();
  });

  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });

  mainWindow = win;
  if (prevWin && !prevWin.isDestroyed()) {
    prevWin.destroy();
  }
}

function setupTrayAndShortcuts() {
  const iconPath = path.join(ROOT_DIR, 'public', 'akane', 'akane_still.png');
  const icon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    : nativeImage.createEmpty();

  tray = new Tray(icon);
  tray.setToolTip('Akane Pro — Desktop Companion');
  tray.on('double-click', () => {
    if (!mainWindow) return;
    mainWindow.show();
    mainWindow.focus();
  });
  rebuildTrayMenu();

  // Global shortcut to toggle Talk Live
  globalShortcut.register('CommandOrControl+Shift+Space', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('akane:talk-shortcut');
    }
  });

  // Emergency Stop hotkey (stops bridge actions + live voice/vision immediately)
  globalShortcut.register('CommandOrControl+Shift+Escape', () => {
    triggerGlobalEmergencyStop('Emergency Stop hotkey (Ctrl+Shift+Esc)');
  });
}

function setupIpcHandlers() {
  ipcMain.handle('akane:get-bridge-pairing', () => {
    if (!bridgeInstance) {
      return { url: 'http://127.0.0.1:4319', token: '' };
    }
    return {
      url: `http://127.0.0.1:${bridgeInstance.port}`,
      token: bridgeInstance.token,
    };
  });

  ipcMain.handle('akane:pick-folder', async () => {
    if (!mainWindow) return null;
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Allowed Folder for Akane Bridge',
      properties: ['openDirectory'],
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    return res.filePaths[0];
  });

  ipcMain.handle('akane:set-companion-mode', (_event, enabled) => {
    applyCompanionMode(Boolean(enabled));
    return companionMode;
  });

  ipcMain.handle('akane:set-click-through', (_event, enabled) => {
    applyClickThrough(Boolean(enabled));
    return clickThrough;
  });

  ipcMain.handle('akane:set-start-with-windows', (_event, enabled) => {
    applyStartWithWindows(Boolean(enabled));
    return startWithWindows;
  });

  ipcMain.handle('akane:get-desktop-status', () => ({
    companionMode,
    clickThrough,
    startWithWindows,
    emergencyStopped: bridgeInstance?.getSnapshot().emergencyStopped ?? false,
  }));

  ipcMain.handle('akane:emergency-stop', () => {
    triggerGlobalEmergencyStop('App Emergency Stop button');
    return true;
  });

  ipcMain.handle('akane:capture-screen', () => capturePrimaryScreenDataUrl());
}

app.whenReady().then(async () => {
  // Enable direct screen capture without browser popup in Electron
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'] });
      callback({ video: sources[0] });
    } catch {
      callback({});
    }
  });

  if (process.platform === 'win32' || process.platform === 'darwin') {
    try {
      startWithWindows = Boolean(app.getLoginItemSettings().openAtLogin);
    } catch {
      startWithWindows = false;
    }
  }

  await startEmbeddedBridge();
  setupIpcHandlers();
  createMainWindow();
  setupTrayAndShortcuts();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (bridgeInstance) {
    void bridgeInstance.close();
  }
});
