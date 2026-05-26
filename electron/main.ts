import { app, BrowserWindow, ipcMain, dialog, shell, utilityProcess, Tray, Menu, globalShortcut, Notification, nativeImage } from 'electron'
import type { UtilityProcess } from 'electron'
import { autoUpdater } from 'electron-updater'
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync, unlinkSync } from 'fs'
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
const SETUP_CONFIRMED_FILE = path.join(app.getPath('userData'), 'setup-confirmed.json')
const RELAUNCH_SESSION_FILE = path.join(app.getPath('userData'), 'relaunch-session.tmp')
const APP_VERSION_FILE = path.join(app.getPath('userData'), 'app-version.json')
const FRESH_VERSION_FLAG = path.join(app.getPath('userData'), 'fresh-version.flag')

/**
 * 버전 파일을 확인해서 처음 실행이거나 이전 버전에서 온 경우를 감지합니다.
 * - 처음 실행 (버전 파일 없음 + API 키 없음): 완전 초기화 (setup-confirmed 삭제 + fresh 플래그)
 * - 이전 버전에서 업그레이드: fresh 플래그만 생성 (setup-confirmed는 유지 — 기존 사용자 데이터 보호)
 * - 동일 버전 재실행: 아무것도 하지 않음
 */
function handleVersionCheck(): void {
  const currentVersion = app.getVersion()
  try {
    mkdirSync(app.getPath('userData'), { recursive: true })
    if (!existsSync(APP_VERSION_FILE)) {
      // 처음 실행: API 키도 없는 경우에만 setup-confirmed 초기화 (재설치 감지)
      const keys = loadApiKeys()
      const hasKeys = Boolean(keys.anthropic || keys.openai || keys.gemini)
      if (!hasKeys && existsSync(SETUP_CONFIRMED_FILE)) unlinkSync(SETUP_CONFIRMED_FILE)
      writeFileSync(FRESH_VERSION_FLAG, 'install', 'utf-8')  // 신규/재설치
      writeFileSync(APP_VERSION_FILE, JSON.stringify({ version: currentVersion }), 'utf-8')
      return
    }
    const stored = JSON.parse(readFileSync(APP_VERSION_FILE, 'utf-8')) as { version?: string }
    if (stored.version !== currentVersion) {
      // 버전 업데이트: fresh 플래그만 생성, setup-confirmed는 건드리지 않음
      // (기존 사용자의 API 키 입력 화면 강제 표시 방지 → 작업 데이터 유지)
      writeFileSync(FRESH_VERSION_FLAG, 'update', 'utf-8')  // 버전 업데이트
      writeFileSync(APP_VERSION_FILE, JSON.stringify({ version: currentVersion }), 'utf-8')
    }
    // 동일 버전: 아무것도 하지 않음
  } catch { /* ignore */ }
}

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
let tray: Tray | null = null
let isQuitting = false

function getTrayIconPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'favicon.ico')
  }
  return path.join(app.getAppPath(), 'public', 'icon.ico')
}

function createTray(): void {
  const iconPath = getTrayIconPath()
  const icon = nativeImage.createFromPath(iconPath)
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon)

  tray.setToolTip('AI 오피스')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'AI 오피스 열기',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
      },
    },
    { type: 'separator' },
    {
      label: '종료',
      click: () => {
        isQuitting = true
        app.quit()
      },
    },
  ])

  tray.setContextMenu(contextMenu)

  tray.on('double-click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide()
    } else {
      mainWindow?.show()
      mainWindow?.focus()
    }
  })
}

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
      // 접속 비밀번호 — 빌드 타임에 .env.electron에서 주입됨
      APP_PASSWORD: process.env.APP_PASSWORD ?? ''
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

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
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

ipcMain.handle('has-confirmed-setup', () => existsSync(SETUP_CONFIRMED_FILE))

// 새 버전 첫 실행 여부 — 동기 IPC (preload에서 sendSync로 호출, 1회용)
// 반환값: 'install' (신규/재설치) | 'update' (버전 업데이트) | null (동일 버전 재실행)
ipcMain.on('get-fresh-version-sync', (event) => {
  if (existsSync(FRESH_VERSION_FLAG)) {
    try {
      const flag = readFileSync(FRESH_VERSION_FLAG, 'utf-8').trim()
      unlinkSync(FRESH_VERSION_FLAG)
      event.returnValue = flag || 'install'
    } catch {
      event.returnValue = 'install'
    }
  } else {
    event.returnValue = null
  }
})

// API 키 저장 전 세션 토큰 임시 보존 (재시작 후 자동 로그인)
ipcMain.handle('save-session-for-relaunch', (_event, token: string) => {
  writeFileSync(RELAUNCH_SESSION_FILE, JSON.stringify({ token, ts: Date.now() }), 'utf-8')
})

// 재시작 후 세션 토큰 복원 (1회용, 5분 이내)
ipcMain.handle('get-session-for-relaunch', () => {
  if (!existsSync(RELAUNCH_SESSION_FILE)) return null
  try {
    const data = JSON.parse(readFileSync(RELAUNCH_SESSION_FILE, 'utf-8')) as { token: string; ts: number }
    unlinkSync(RELAUNCH_SESSION_FILE)
    if (Date.now() - data.ts > 5 * 60 * 1000) return null
    return data.token
  } catch {
    try { unlinkSync(RELAUNCH_SESSION_FILE) } catch { /* ignore */ }
    return null
  }
})

ipcMain.handle('save-api-keys', (_event, keys: ApiKeys) => {
  saveApiKeys(keys)
  // 설정 완료 마커 기록 (다음 실행 시 API 키 입력 화면 건너뜀)
  writeFileSync(SETUP_CONFIRMED_FILE, JSON.stringify({ confirmed: true }), 'utf-8')
  app.relaunch()
  app.exit(0)
})

// ─── 시스템 설정 IPC ──────────────────────────────────────────────────────────
ipcMain.handle('get-login-item', () => {
  return app.getLoginItemSettings().openAtLogin
})

ipcMain.handle('set-login-item', (_event, enabled: boolean) => {
  app.setLoginItemSettings({ openAtLogin: enabled })
})

ipcMain.handle('show-notification', (_event, title: string, body: string) => {
  if (!Notification.isSupported()) return
  new Notification({ title, body, icon: getTrayIconPath() }).show()
})

ipcMain.handle('toggle-window', () => {
  if (!mainWindow) return
  if (mainWindow.isVisible() && mainWindow.isFocused()) {
    mainWindow.hide()
  } else {
    mainWindow.show()
    mainWindow.focus()
  }
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
  handleVersionCheck()
  crashLog('handleVersionCheck done')
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

  createTray()
  crashLog('createTray done')

  // 전역 단축키: Ctrl+Alt+A → 창 토글 (앱이 백그라운드일 때도 동작)
  const shortcutRegistered = globalShortcut.register('CommandOrControl+Alt+A', () => {
    if (!mainWindow) return
    if (mainWindow.isVisible() && mainWindow.isFocused()) {
      mainWindow.hide()
    } else {
      mainWindow.show()
      mainWindow.focus()
    }
  })
  if (!shortcutRegistered) {
    crashLog('globalShortcut Ctrl+Alt+A 등록 실패 — 다른 앱이 선점 중일 수 있음')
  }

  // Auto-updater — GitHub Releases 직접 연결 (빌드 타임에 토큰 주입)
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: process.env.GITHUB_OWNER ?? 'teo116-ceo',
    repo: process.env.GITHUB_REPO ?? 'ai-office',
    token: process.env.GITHUB_TOKEN ?? '',
  })
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  // releaseNotes가 배열일 수 있으므로 문자열로 정규화
  function normalizeReleaseNotes(notes: unknown): string {
    if (!notes) return ''
    if (typeof notes === 'string') return notes
    if (Array.isArray(notes)) {
      return notes
        .map((n: { version?: string; note?: string } | string) =>
          typeof n === 'string' ? n : `### ${n.version ?? ''}\n${n.note ?? ''}`
        )
        .join('\n\n')
    }
    return String(notes)
  }

  function sendToRenderer(channel: string, data?: unknown) {
    mainWindow?.webContents.send(channel, data)
  }

  autoUpdater.on('error', (err) => {
    console.error('[updater] error:', err)
    sendToRenderer('update:error', { message: err.message })
  })

  autoUpdater.on('checking-for-update', () => {
    sendToRenderer('update:checking')
  })

  autoUpdater.on('update-not-available', () => {
    sendToRenderer('update:not-available')
  })

  autoUpdater.on('update-available', (info) => {
    sendToRenderer('update:available', {
      version: info.version,
      releaseNotes: normalizeReleaseNotes(info.releaseNotes),
      releaseDate: info.releaseDate,
    })
  })

  autoUpdater.on('download-progress', (progress) => {
    sendToRenderer('update:progress', {
      percent: Math.round(progress.percent),
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    sendToRenderer('update:downloaded', {
      version: info.version,
      releaseNotes: normalizeReleaseNotes(info.releaseNotes),
      releaseDate: info.releaseDate,
    })
  })

  // 렌더러에서 업데이트 설치 요청
  ipcMain.handle('update:install', () => {
    autoUpdater.quitAndInstall()
  })

  // 동시 checkForUpdates 호출 방지 플래그
  let isCheckingForUpdates = false

  // 렌더러에서 수동 업데이트 확인 요청
  ipcMain.handle('update:check', async () => {
    if (isCheckingForUpdates) return
    isCheckingForUpdates = true
    try {
      await autoUpdater.checkForUpdates()
    } catch (err) {
      console.error('[updater] manual check failed:', err)
    } finally {
      isCheckingForUpdates = false
    }
  })

  // 앱 버전 조회
  ipcMain.handle('update:get-version', () => app.getVersion())

  // 창이 완전히 로드된 후 업데이트 체크 (타이밍 문제 방지 — 렌더러 리스너 등록 후 실행)
  mainWindow?.webContents.once('did-finish-load', () => {
    setTimeout(() => {
      if (isCheckingForUpdates) return
      isCheckingForUpdates = true
      void autoUpdater.checkForUpdatesAndNotify().finally(() => {
        isCheckingForUpdates = false
      })
    }, 3000)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // 트레이 상주 중에는 창이 닫혀도 앱을 종료하지 않음
  // isQuitting=true 일 때만 실제 종료
  if (isQuitting) {
    serverProcess?.kill()
    if (process.platform !== 'darwin') app.quit()
  }
})

app.on('before-quit', () => {
  isQuitting = true
  globalShortcut.unregisterAll()
  serverProcess?.kill()
})
