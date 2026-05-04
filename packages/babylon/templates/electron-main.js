const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron');
const { join } = require('node:path');
const path = require('node:path');
const fs = require('node:fs');
const { initAIService, disposeAIService } = require('./ai-service');

// Increase V8 heap limit for large asset collections (models + textures + NPC data).
// This affects both the main and renderer processes.
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=16384');
// Prevent Chromium from throttling the renderer when backgrounded
app.commandLine.appendSwitch('disable-renderer-backgrounding');
// Force GPU rasterization for better WebGL/3D performance
app.commandLine.appendSwitch('enable-gpu-rasterization');

// The built directory structure
// ├─┬ dist
// │ └─ index.html
// └─ package.json

let win = null;
const isDev = process.argv.includes('--dev');

function createWindow() {
  win = new BrowserWindow({
    title: '{{WORLD_NAME}}',
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false, // Don't show until ready
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      // Allow cross-origin requests to the Insimul API server for cloud saves
      webSecurity: false,
    },
  });

  // Load the app
  if (isDev) {
    // In development, load from Vite server
    win.loadURL('http://localhost:5173');
    // Open DevTools in dev mode
    win.webContents.openDevTools();
  } else {
    // In production, load the built app
    // main.js is in electron/, so we need to go up one level to reach the root
    win.loadFile(join(__dirname, '..', 'dist', 'index.html'));
    // Open DevTools in production when not packaged (useful during local testing)
    if (!app.isPackaged) {
      win.webContents.openDevTools();
    }
  }

  // Show window when ready to prevent visual flash
  win.once('ready-to-show', () => {
    win.show();
  });

  // Make all links open with the browser, not with the application
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url);
    return { action: 'deny' };
  });

  // Allow F12 to open DevTools even in production (useful for diagnosing load failures)
  win.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') {
      win.webContents.toggleDevTools();
    }
  });
}

// IPC handler: read a file relative to dist/ for the renderer process.
// fetch() is blocked on file:// protocol in Electron's renderer, so we use this bridge instead.
ipcMain.handle('read-file', (event, relativePath) => {
  const filePath = join(__dirname, '..', 'dist', relativePath);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return fs.readFileSync(filePath, 'utf8');
});

// This method will be called when Electron has finished initialization
app.whenReady().then(async () => {
  createWindow();
  await initAIService(app, win);
});

app.on('window-all-closed', async () => {
  await disposeAIService();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Disable menu bar for cleaner game experience
Menu.setApplicationMenu(null);
