import { execSync } from 'child_process'
import { rmSync, existsSync, mkdirSync, readFileSync } from 'fs'

const run = (cmd) => execSync(cmd, { stdio: 'inherit', shell: true })

// .env.electron 파일에서 설정 읽기
let envConfig = {}
if (existsSync('.env.electron')) {
  const raw = readFileSync('.env.electron', 'utf-8')
  for (const line of raw.split('\n')) {
    const [key, ...rest] = line.split('=')
    if (key && rest.length) envConfig[key.trim()] = rest.join('=').trim()
  }
}

const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? envConfig.GITHUB_TOKEN ?? ''
const GITHUB_OWNER = process.env.GITHUB_OWNER ?? envConfig.GITHUB_OWNER ?? ''
const GITHUB_REPO  = process.env.GITHUB_REPO  ?? envConfig.GITHUB_REPO  ?? 'ai-office'

if (!GITHUB_TOKEN || !GITHUB_OWNER) {
  console.error('\n[오류] .env.electron 파일에 GITHUB_TOKEN과 GITHUB_OWNER를 설정하세요.')
  console.error('예시:')
  console.error('  GITHUB_TOKEN=ghp_xxxxxxxxxxxx')
  console.error('  GITHUB_OWNER=your-github-username')
  console.error('  GITHUB_REPO=ai-office\n')
  process.exit(1)
}

const defines = [
  `--define:process.env.GITHUB_TOKEN='"${GITHUB_TOKEN}"'`,
  `--define:process.env.GITHUB_OWNER='"${GITHUB_OWNER}"'`,
  `--define:process.env.GITHUB_REPO='"${GITHUB_REPO}"'`,
].join(' ')

// 1. dist-electron 초기화
if (existsSync('dist-electron')) rmSync('dist-electron', { recursive: true, force: true })
mkdirSync('dist-electron', { recursive: true })

// 2. Vite 프론트엔드 빌드
console.log('\n[1/4] Vite 프론트엔드 빌드...')
run('vite build')

// 3. Express 서버 번들 (CJS)
console.log('\n[2/4] Express 서버 번들링...')
run('npx esbuild server/index.ts --bundle --platform=node --format=cjs --outfile=dist-electron/server.cjs --external:fsevents')

// 4. Electron main + preload 번들 (CJS) — GitHub 정보 빌드 시 주입
console.log('\n[3/4] Electron main/preload 번들링...')
run(`npx esbuild electron/main.ts --bundle --platform=node --format=cjs --outfile=dist-electron/main.cjs --external:electron --external:fsevents ${defines}`)
run('npx esbuild electron/preload.ts --bundle --platform=node --format=cjs --outfile=dist-electron/preload.cjs --external:electron')

// 5. electron-builder 패키징
console.log('\n[4/4] electron-builder 패키징...')
process.env.GH_TOKEN = GITHUB_TOKEN
run('npx electron-builder')

console.log('\n빌드 완료! release/ 폴더를 확인하세요.')
