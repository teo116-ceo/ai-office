import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import { fork, type ChildProcess } from 'child_process'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import path from 'path'

interface ApiKeys {
  anthropic: string
  openai: string
  gemini: string
}

const CONFIG_FILE = path.join(app.getPath('userData'), 'api-keys.json')

function loadApiKeys(): ApiKeys {
  try {
    if (!existsSync(CONFIG_FILE)) return { anthropic: '', openai: '', gemini: '' }
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) as ApiKeys
  } catch {
    return { anthropic: '', openai: '', gemini: '' }
  }
}

function saveApiKeys(keys: ApiKeys): void {
  writeFileSync(CONFIG_FILE, JSON.stringify(keys, null, 2), 'utf-8')
}

let serverProcess: ChildProcess | null = null
let mainWindow: BrowserWindow | null = null

function startServer(keys: ApiKeys): void {
  // fork() cannot read files inside ASAR — use the unpacked path instead
  const serverPath = path.join(__dirname, 'server.cjs').replace('app.asar', 'app.asar.unpacked')
  // app.getAppPath() returns the ASAR path; convert to unpacked for child process
  const appPath = app.getAppPath().replace('app.asar', 'app.asar.unpacked')
  const distPath = path.join(appPath, 'dist')
  serverProcess = fork(serverPath, [], {
    env: {
      ...process.env,
      ANTHROPIC_API_KEY: keys.anthropic,
      OPENAI_API_KEY: keys.openai,
      GEMINI_API_KEY: keys.gemini,
      ELECTRON_SERVE: 'true',
      ELECTRON_DIST_PATH: distPath,
    },
    cwd: app.getPath('userData'),
  })

  serverProcess.on('error', (err) => {
    console.error('[server] error:', err)
  })
}

async function waitForServer(retries = 30, delayMs = 500): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch('http://localhost:3001/api/health')
      if (res.ok) return
    } catch {
      // not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
  console.warn('[server] did not become healthy in time')
}

function getDistPath(): string {
  if (app.isPackaged) {
    // 패키징된 앱: dist는 app.asar.unpacked/dist 에 위치
    return path.join(app.getAppPath().replace('app.asar', 'app.asar.unpacked'), 'dist')
  }
  // 개발 모드: 프로젝트 루트/dist
  return path.join(app.getAppPath(), 'dist')
}

function createWindow(): void {
  const distPath = getDistPath()
  const indexHtml = path.join(distPath, 'index.html')

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'AI 오피스',
    backgroundColor: '#0d0d1a',
    show: false,
  })

  void waitForServer().then(() => {
    mainWindow?.loadURL('http://localhost:3001')
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
}

// ─── IPC ─────────────────────────────────────────────────────────────────────
ipcMain.handle('get-api-keys', () => loadApiKeys())

ipcMain.handle('has-api-keys', () => {
  const keys = loadApiKeys()
  return Boolean(keys.anthropic || keys.openai || keys.gemini)
})

ipcMain.handle('save-api-keys', (_event, keys: ApiKeys) => {
  saveApiKeys(keys)
  app.relaunch()
  app.exit(0)
})

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  const keys = loadApiKeys()
  startServer(keys)
  createWindow()

  // Auto-updater (Private GitHub 레포)
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: process.env.GITHUB_OWNER ?? 'YOUR_GITHUB_USERNAME',
    repo: process.env.GITHUB_REPO ?? 'ai-office',
    token: process.env.GITHUB_TOKEN ?? '',
    private: true,
  })

  autoUpdater.on('error', (err) => {
    console.error('[updater] error:', err)
  })

  autoUpdater.on('update-available', () => {
    void dialog.showMessageBox({
      type: 'info',
      title: '업데이트',
      message: '새 버전이 있습니다. 다운로드를 시작합니다.',
      buttons: ['확인'],
    })
  })

  autoUpdater.on('update-downloaded', () => {
    void dialog.showMessageBox({
      type: 'info',
      title: '업데이트 준비 완료',
      message: '업데이트가 다운로드되었습니다. 앱을 재시작하면 업데이트가 적용됩니다.',
      buttons: ['지금 재시작', '나중에'],
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall()
    })
  })

  void autoUpdater.checkForUpdatesAndNotify()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  serverProcess?.kill()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  serverProcess?.kill()
})
