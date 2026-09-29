const { app, BrowserWindow, ipcMain, dialog, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { pathToFileURL } = require('url');
const { randomUUID } = require('crypto');
const { scanImageFiles } = require('./scan-files');

const SOURCE_ROOT = path.join(__dirname, 'src');
const APP_FILES = new Set([
  'index.html',
  'styles/main.css', 'styles/kenburns.css', 'styles/glass-ui.css',
  'renderer/scanner.js', 'renderer/kenburns.js',
  'renderer/ui.js', 'renderer/app.js'
]);

protocol.registerSchemesAsPrivileged([{
  scheme: 'slideshow',
  privileges: { standard: true, secure: true, supportFetchAPI: true }
}]);

let mainWindow;
let scanSequence = 0;
let currentScanId = null;
let imagePaths = [];
const smokeMode = process.env.SLIDESHOW_SMOKE === '1';
if (smokeMode) {
  const testData = path.join(process.env.SLIDESHOW_SMOKE_FOLDER, 'app-data');
  fsSync.mkdirSync(testData, { recursive: true });
  app.setPath('userData', testData);
  if (process.env.SLIDESHOW_SOFTWARE_RENDER === '1') app.disableHardwareAcceleration();
}

function isFromApp(event) {
  return mainWindow && event.sender === mainWindow.webContents &&
    event.senderFrame?.url.startsWith('slideshow://app/');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#0a0a0c',
    show: !smokeMode,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      offscreen: smokeMode,
      backgroundThrottling: !smokeMode
    }
  });

  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  if (smokeMode) {
    mainWindow.webContents.on('did-start-loading', () => console.log('SMOKE_EVENT=did-start-loading'));
    mainWindow.webContents.on('did-finish-load', () => console.log('SMOKE_EVENT=did-finish-load'));
    mainWindow.webContents.on('did-fail-load', (_event, code, description, url) =>
      console.log(`SMOKE_EVENT=did-fail-load ${code} ${description} ${url}`));
    mainWindow.webContents.on('render-process-gone', (_event, details) =>
      console.log(`SMOKE_EVENT=render-process-gone ${JSON.stringify(details)}`));
    mainWindow.webContents.on('console-message', (_event, level, message) =>
      console.log(`SMOKE_CONSOLE=${level} ${message}`));
  }
  mainWindow.loadURL('slideshow://app/index.html').catch((error) => {
    console.error('Page load failed:', error);
  });

  mainWindow.on('enter-full-screen', () => {
    mainWindow?.webContents.send('window:fullscreen-state', true);
  });
  mainWindow.on('leave-full-screen', () => {
    mainWindow?.webContents.send('window:fullscreen-state', false);
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

async function handleSlideshowRequest(request) {
  const url = new URL(request.url);
  if (url.hostname === 'app') {
    let relativePath;
    try {
      relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    } catch {
      return new Response('Bad path', { status: 400 });
    }
    if (!APP_FILES.has(relativePath)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(path.join(SOURCE_ROOT, relativePath)).href);
  }

  if (url.hostname === 'image') {
    const match = /^\/([0-9a-f-]+)\/(\d+)$/.exec(url.pathname);
    if (!match || match[1] !== currentScanId) return new Response('Not found', { status: 404 });
    const filePath = imagePaths[Number(match[2])];
    if (!filePath) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(filePath).href);
  }

  return new Response('Not found', { status: 404 });
}

async function scanFolder(event, folderPath, requestNumber = ++scanSequence) {
  if (!isFromApp(event)) throw new Error('Invalid request source');
  if (requestNumber !== scanSequence) return null;
  if (typeof folderPath !== 'string' || !folderPath) throw new Error('Invalid folder');
  const root = await fs.realpath(folderPath);
  if (!(await fs.stat(root)).isDirectory()) throw new Error('Vui lòng chọn thư mục');

  if (requestNumber !== scanSequence) return null;
  const paths = await scanImageFiles(root, {
    isCancelled: () => requestNumber !== scanSequence,
    onProgress: (count) => {
      if (!event.sender.isDestroyed()) event.sender.send('scan:progress', count);
    }
  });
  if (!paths) return null;
  if (!paths.length) return [];
  const scanId = randomUUID();
  currentScanId = scanId;
  imagePaths = paths;
  return paths.map((filePath, index) => ({
    name: path.basename(filePath),
    url: `slideshow://image/${scanId}/${index}`
  }));
}

app.whenReady().then(() => {
  protocol.handle('slideshow', handleSlideshowRequest);
  createWindow();
  if (smokeMode) {
    require('./tests/electron-smoke').run({
      window: mainWindow,
      scanFolder,
      folder: process.env.SLIDESHOW_SMOKE_FOLDER
    }).then((result) => {
      console.log('SLIDESHOW_SMOKE_RESULT=' + JSON.stringify(result));
      app.quit();
    }).catch((error) => {
      console.error('SLIDESHOW_SMOKE_ERROR=' + error.stack);
      app.exit(1);
    });
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('dialog:openFolder', async (event) => {
  if (!isFromApp(event)) throw new Error('Invalid request source');
  const requestNumber = ++scanSequence;
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  if (result.canceled || result.filePaths.length === 0) return null;
  return scanFolder(event, result.filePaths[0], requestNumber);
});

ipcMain.handle('scan:droppedFolder', (event, folderPath) => scanFolder(event, folderPath));

ipcMain.handle('window:toggleFullscreen', (event) => {
  if (!isFromApp(event)) return false;
  const isFull = !mainWindow.isFullScreen();
  mainWindow.setFullScreen(isFull);
  return isFull;
});
ipcMain.handle('window:isFullscreen', (event) => isFromApp(event) && mainWindow.isFullScreen());
ipcMain.handle('window:minimize', (event) => { if (isFromApp(event)) mainWindow.minimize(); });
ipcMain.handle('window:close', (event) => { if (isFromApp(event)) mainWindow.close(); });
