const { app, BrowserWindow, ipcMain } = require('electron');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const vault = require('./vault.cjs');

app.setName('项目管理');

const DEV_URL = 'http://127.0.0.1:43123/';
let devServer = null;

function vaultRoot() {
  return path.join(app.getPath('userData'), 'vault');
}

function callVault(fn, payload) {
  try {
    vault.setRoot(vaultRoot());
    return fn(payload);
  } catch (error) {
    return { ok: false, msg: error.message || '数据没有写进去' };
  }
}

ipcMain.on('vault:load', (event) => {
  event.returnValue = callVault(() => vault.load());
});

ipcMain.on('vault:save', (event, payload) => {
  event.returnValue = callVault(() => vault.save(payload));
});

ipcMain.on('vault:git', (event, op) => {
  event.returnValue = callVault(() => vault.gitOp(op));
});

function portOpen() {
  return new Promise((resolve) => {
    const req = http.get(DEV_URL, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function waitForServer() {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      portOpen().then((open) => {
        if (open) resolve();
        else if (Date.now() - start > 20000) reject(new Error('界面没有启动起来'));
        else setTimeout(tick, 300);
      });
    };
    tick();
  });
}

async function loadUi(win) {
  if (app.isPackaged) {
    await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
    return;
  }
  if (!(await portOpen())) {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    devServer = spawn('npm', ['run', 'dev'], {
      cwd: path.join(__dirname, '..'),
      shell: true,
      windowsHide: true,
      env,
    });
  }
  await waitForServer();
  await win.loadURL(DEV_URL);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: '项目管理',
    backgroundColor: '#141516',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.webContents.on('did-fail-load', (_event, code, description) => {
    console.error('界面加载失败', code, description);
  });
  loadUi(win).catch((error) => {
    console.error(error);
    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<p style="font-family:sans-serif">${error.message}</p>`)}`);
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (devServer && !devServer.killed) {
    spawn('taskkill', ['/pid', String(devServer.pid), '/t', '/f'], { windowsHide: true });
  }
  app.quit();
});
