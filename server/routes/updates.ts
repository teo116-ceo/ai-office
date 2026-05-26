/**
 * 앱 자동 업데이트 프록시
 * Electron 앱이 토큰 없이 이 서버를 통해 GitHub Releases를 확인/다운로드할 수 있게 함.
 * 토큰은 서버 환경변수(GITHUB_TOKEN)에만 존재 — 클라이언트 빌드에 포함되지 않음.
 *
 * GET /api/updates/latest.yml   → GitHub latest.yml 프록시
 * GET /api/updates/:filename    → GitHub release asset 다운로드 리다이렉트
 */
import { Router } from 'express'
import type { Request, Response } from 'express'
import https from 'node:https'

const router = Router()

const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? ''
const GITHUB_OWNER = process.env.GITHUB_OWNER ?? 'teo116-ceo'
const GITHUB_REPO  = process.env.GITHUB_REPO  ?? 'ai-office'

function githubApiGet(path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path,
      method: 'GET',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'User-Agent': 'ai-office-server',
        'Accept': 'application/vnd.github.v3+json',
      },
    }
    const req = https.request(options, (res) => {
      let buf = ''
      res.on('data', (d: Buffer) => { buf += d.toString() })
      res.on('end', () => resolve({ status: res.statusCode ?? 500, body: buf }))
    })
    req.on('error', reject)
    req.end()
  })
}

/** latest.yml 프록시 — electron-updater의 generic provider가 이 URL을 읽음 */
router.get('/latest.yml', async (_req: Request, res: Response) => {
  try {
    const result = await githubApiGet(
      `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`
    )
    if (result.status !== 200) {
      res.status(502).send('GitHub API error')
      return
    }
    const release = JSON.parse(result.body) as {
      assets?: { name: string; browser_download_url: string }[]
    }
    const asset = release.assets?.find((a) => a.name === 'latest.yml')
    if (!asset) {
      res.status(404).send('latest.yml not found in release')
      return
    }
    // latest.yml 파일 내용을 GitHub에서 직접 가져와서 전달
    const fileResult = await fetchAssetContent(asset.browser_download_url)
    res.setHeader('Content-Type', 'text/yaml; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache')
    res.send(fileResult)
  } catch (err) {
    res.status(500).send(String(err))
  }
})

/** release asset 다운로드 리다이렉트 */
router.get('/:filename', async (req: Request, res: Response) => {
  const { filename } = req.params as { filename: string }
  try {
    const result = await githubApiGet(
      `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`
    )
    if (result.status !== 200) {
      res.status(502).send('GitHub API error')
      return
    }
    const release = JSON.parse(result.body) as {
      assets?: { name: string; browser_download_url: string }[]
    }
    const asset = release.assets?.find((a) => a.name === filename)
    if (!asset) {
      res.status(404).send('Asset not found')
      return
    }
    // GitHub의 private asset은 토큰 인증 후 redirectURL을 받아야 함
    const downloadUrl = await resolvePrivateAssetUrl(asset.browser_download_url)
    res.redirect(302, downloadUrl)
  } catch (err) {
    res.status(500).send(String(err))
  }
})

/** GitHub private asset의 실제 다운로드 URL 확인 (302 follow) */
function resolvePrivateAssetUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'User-Agent': 'ai-office-server',
        'Accept': 'application/octet-stream',
      },
    }
    const req = https.request(options, (res) => {
      if (res.statusCode === 302 && res.headers.location) {
        resolve(res.headers.location)
      } else if (res.statusCode === 200) {
        resolve(url)
      } else {
        reject(new Error(`Unexpected status: ${res.statusCode}`))
      }
      res.resume()
    })
    req.on('error', reject)
    req.end()
  })
}

/** latest.yml 파일 내용 다운로드 */
function fetchAssetContent(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'User-Agent': 'ai-office-server',
        'Accept': 'application/octet-stream',
      },
    }
    const request = (reqUrl: URL) => {
      const opt = {
        hostname: reqUrl.hostname,
        path: reqUrl.pathname + reqUrl.search,
        method: 'GET',
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'User-Agent': 'ai-office-server',
          'Accept': 'application/octet-stream',
        },
      }
      const r = https.request(opt, (res) => {
        if (res.statusCode === 302 && res.headers.location) {
          request(new URL(res.headers.location))
          res.resume()
          return
        }
        let buf = ''
        res.on('data', (d: Buffer) => { buf += d.toString() })
        res.on('end', () => resolve(buf))
      })
      r.on('error', reject)
      r.end()
    }
    request(parsed)
  })
}

export default router
