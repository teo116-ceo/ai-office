const NOTION_VERSION = '2022-06-28'

export interface NotionConnectionRequest {
  token: string
  databaseId: string
}

export interface NotionPageRequest extends NotionConnectionRequest {
  title: string
  children: unknown[]
}

interface NotionConnectionResult {
  ok: boolean
  status: number
  message: string
}

function notionHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Notion-Version': NOTION_VERSION,
  }
}

export async function testNotionConnection(
  request: NotionConnectionRequest,
): Promise<NotionConnectionResult> {
  if (!request.token.trim()) {
    return { ok: false, status: 400, message: '토큰을 입력하세요.' }
  }

  if (!request.databaseId.trim()) {
    return { ok: false, status: 400, message: '데이터베이스 ID를 입력하세요.' }
  }

  const response = await fetch(`https://api.notion.com/v1/databases/${request.databaseId}`, {
    headers: notionHeaders(request.token),
  })

  if (response.ok) {
    return { ok: true, status: 200, message: '연결 성공!' }
  }

  if (response.status === 401) {
    return { ok: false, status: 401, message: '인증 실패 — 토큰을 확인하세요.' }
  }

  if (response.status === 404) {
    return { ok: false, status: 404, message: '데이터베이스를 찾을 수 없습니다 — ID를 확인하세요.' }
  }

  return { ok: false, status: response.status, message: `오류 (${response.status})` }
}

export async function createNotionPage(request: NotionPageRequest): Promise<void> {
  if (!request.token.trim()) {
    throw new Error('토큰을 입력하세요.')
  }

  if (!request.databaseId.trim()) {
    throw new Error('데이터베이스 ID를 입력하세요.')
  }

  const response = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: notionHeaders(request.token),
    body: JSON.stringify({
      parent: { database_id: request.databaseId },
      properties: {
        title: {
          title: [{ type: 'text', text: { content: request.title.slice(0, 100) } }],
        },
      },
      children: request.children,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText)
    throw new Error(`Notion API 오류 (${response.status}): ${errorText}`)
  }
}
