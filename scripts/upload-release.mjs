/**
 * GitHub Releases 업로드 스크립트
 * release/ 폴더의 .exe, .blockmap, latest.yml을 지정 버전으로 업로드
 */
import { readFileSync, existsSync } from 'fs'
import { createReadStream, statSync } from 'fs'
import https from 'https'
import path from 'path'

// .env.electron에서 설정 읽기
let envConfig = {}
if (existsSync('.env.electron')) {
  const raw = readFileSync('.env.electron', 'utf-8')
  for (const line of raw.split('\n')) {
    const [key, ...rest] = line.split('=')
    if (key && rest.length) envConfig[key.trim()] = rest.join('=').trim()
  }
}

const TOKEN = process.env.GITHUB_TOKEN ?? envConfig.GITHUB_TOKEN ?? ''
const OWNER = process.env.GITHUB_OWNER ?? envConfig.GITHUB_OWNER ?? ''
const REPO  = process.env.GITHUB_REPO  ?? envConfig.GITHUB_REPO  ?? 'ai-office'

if (!TOKEN || !OWNER) {
  console.error('GITHUB_TOKEN / GITHUB_OWNER가 설정되지 않았습니다.')
  process.exit(1)
}

const pkg = JSON.parse(readFileSync('package.json', 'utf-8'))
const VERSION = pkg.version
const TAG = `v${VERSION}`

function apiRequest(method, path, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null
    const options = {
      hostname: 'api.github.com',
      path,
      method,
      headers: {
        'Authorization': `token ${TOKEN}`,
        'User-Agent': 'ai-office-upload',
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        ...extraHeaders,
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }
    const req = https.request(options, (res) => {
      let buf = ''
      res.on('data', (d) => buf += d)
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(buf) }) }
        catch { resolve({ status: res.statusCode, body: buf }) }
      })
    })
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

function uploadAsset(uploadUrl, filePath) {
  const filename = path.basename(filePath)
  const size = statSync(filePath).size
  // uploadUrl 예: https://uploads.github.com/repos/.../releases/123/assets{?name,label}
  const base = uploadUrl.replace('{?name,label}', '')
  const url = new URL(`${base}?name=${encodeURIComponent(filename)}`)

  const ext = path.extname(filename).toLowerCase()
  const contentType =
    ext === '.exe' ? 'application/octet-stream' :
    ext === '.blockmap' ? 'application/octet-stream' :
    ext === '.yml' ? 'text/yaml' : 'application/octet-stream'

  return new Promise((resolve, reject) => {
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Authorization': `token ${TOKEN}`,
        'User-Agent': 'ai-office-upload',
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': contentType,
        'Content-Length': size,
      },
    }
    const req = https.request(options, (res) => {
      let buf = ''
      res.on('data', (d) => buf += d)
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(buf) }) }
        catch { resolve({ status: res.statusCode, body: buf }) }
      })
    })
    req.on('error', reject)
    createReadStream(filePath).pipe(req)
  })
}

async function main() {
  console.log(`\n📦 GitHub Release 업로드: ${TAG} → ${OWNER}/${REPO}`)

  // 1. 기존 릴리스 조회 또는 새 릴리스 생성
  let releaseId, uploadUrl
  const listRes = await apiRequest('GET', `/repos/${OWNER}/${REPO}/releases/tags/${TAG}`)
  if (listRes.status === 200) {
    releaseId = listRes.body.id
    uploadUrl = listRes.body.upload_url
    console.log(`✓ 기존 릴리스 발견 (id=${releaseId})`)

    // 기존 assets 삭제 (재업로드를 위해)
    const assets = listRes.body.assets ?? []
    for (const asset of assets) {
      await apiRequest('DELETE', `/repos/${OWNER}/${REPO}/releases/assets/${asset.id}`)
      console.log(`  삭제: ${asset.name}`)
    }
  } else {
    const createRes = await apiRequest('POST', `/repos/${OWNER}/${REPO}/releases`, {
      tag_name: TAG,
      name: `AI 오피스 ${TAG}`,
      body: `AI 오피스 ${TAG} 자동 업데이트 릴리스`,
      draft: false,
      prerelease: false,
    })
    if (createRes.status !== 201) {
      console.error('릴리스 생성 실패:', createRes.body)
      process.exit(1)
    }
    releaseId = createRes.body.id
    uploadUrl = createRes.body.upload_url
    console.log(`✓ 새 릴리스 생성 (id=${releaseId})`)
  }

  // 2. 파일 업로드
  const files = [
    `release/ai-office-setup-${VERSION}.exe`,
    `release/ai-office-setup-${VERSION}.exe.blockmap`,
    `release/latest.yml`,
  ]

  for (const file of files) {
    if (!existsSync(file)) { console.warn(`  건너뜀 (없음): ${file}`); continue }
    process.stdout.write(`  업로드: ${path.basename(file)} ... `)
    const res = await uploadAsset(uploadUrl, file)
    if (res.status === 201) {
      console.log('✓')
    } else {
      console.log(`✗ (${res.status})`)
      console.error(res.body)
    }
  }

  console.log('\n🎉 업로드 완료!')
}

main().catch((e) => { console.error(e); process.exit(1) })
