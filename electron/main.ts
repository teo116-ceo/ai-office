import { app, BrowserWindow, ipcMain, dialog, shell, utilityProcess } from 'electron'
import type { UtilityProcess } from 'electron'
import { autoUpdater } from 'electron-updater'
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from 'fs'
import path from 'path'
import os from 'os'

// ─── 전역 크래시 로그 (바탕화면에 기록) ─────────────────────────────────────
const CRASH_LOG = path.join(os.homedir(), 'Desktop', 'ai-office-crash.log')
function crashLog(msg: string) {
  try { appendFileSync(CRASH_LOG, `[${new Date().toISOString()}] ${msg}\n`) } catch { /* ignore */ }
}
process.on('uncaughtException', (err) => {
  crashLog(`uncaughtException: ${err.message}\n${err.stack}`)
})
process.on('unhandledRejection', (reason) => {
  crashLog(`unhandledRejection: ${String(reason)}`)
})

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

const ELECTRON_PORT = 58001

let serverProcess: UtilityProcess | null = null
let mainWindow: BrowserWindow | null = null

function startServer(keys: ApiKeys): void {
  // utilityProcess.fork() works correctly in packaged Electron apps (child_process.fork does not)
  const serverPath = path.join(__dirname, 'server.cjs').replace('app.asar', 'app.asar.unpacked')
  const appPath = app.getAppPath().replace('app.asar', 'app.asar.unpacked')
  const distPath = path.join(appPath, 'dist')

  // userData 디렉토리가 없으면 생성
  const userData = app.getPath('userData')
  mkdirSync(userData, { recursive: true })

  const logFile = path.join(userData, 'server.log')
  const log = (msg: string) => {
    try { appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`) } catch { /* ignore */ }
  }

  log(`서버 시작: ${serverPath}`)
  log(`포트: ${ELECTRON_PORT}`)
  log(`distPath: ${distPath}`)

  serverProcess = utilityProcess.fork(serverPath, [], {
    env: {
      ...process.env,
      ANTHROPIC_API_KEY: keys.anthropic,
      OPENAI_API_KEY: keys.openai,
      GEMINI_API_KEY: keys.gemini,
      ELECTRON_SERVE: 'true',
      ELECTRON_DIST_PATH: distPath,
      PORT: String(ELECTRON_PORT),
      // 접속 비밀번호 — API 키만 있어도 무단 사용 불가
      APP_PASSWORD: 'jng6470!!',
    },
    cwd: userData,
    stdio: 'pipe',
  })

  serverProcess.stdout?.on('data', (d: Buffer) => log(`[stdout] ${d.toString().trim()}`))
  serverProcess.stderr?.on('data', (d: Buffer) => log(`[stderr] ${d.toString().trim()}`))
  serverProcess.on('exit', (code) => log(`[exit] code=${code}`))
  serverProcess.on('spawn', () => log(`[spawn] 서버 프로세스 시작됨`))
}

async function waitForServer(retries = 60, delayMs = 1000): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch('http://localhost:58001/api/health')
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
    mainWindow?.loadURL('http://localhost:58001')
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  // Ctrl+Shift+I 로 DevTools 열기 (디버깅용)
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.control && input.shift && input.key.toLowerCase() === 'i') {
      mainWindow?.webContents.openDevTools()
    }
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

// ─── 단일 인스턴스 잠금 (중복 실행 방지) ─────────────────────────────────────
if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

app.on('second-instance', () => {
  // 이미 실행 중이면 기존 창 포커스
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  crashLog('app.whenReady fired')
  const keys = loadApiKeys()
  crashLog('loadApiKeys done')
  try {
    startServer(keys)
    crashLog('startServer done')
  } catch (err) {
    crashLog(`startServer FAILED: ${err}`)
  }
  createWindow()
  crashLog('createWindow done')

  // Auto-updater (Private GitHub 레포)
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'teo116-ceo',
    repo: 'ai-office',
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
