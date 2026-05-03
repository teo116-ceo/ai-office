import type { Task } from '@/types'
import { DEPARTMENTS, type DepartmentId, type DepartmentResult } from '@/types'
import { useAgentStore } from '@/store/agentStore'
import { apiHeaders } from '@/utils/apiHeaders'

export interface NotionSettings {
  enabled: boolean
  token: string
  databaseId: string
  departmentDatabases: Partial<Record<DepartmentId, string>>
  onTaskComplete: boolean
  onTaskFail: boolean
}

/** 업무에 배정된 부서를 기준으로 저장할 데이터베이스 ID 목록을 반환합니다.
 *  부서별 DB가 설정된 경우 해당 DB를, 없으면 기본 DB로 묶어 중복 제거합니다. */
function resolveNotionDatabaseIds(settings: NotionSettings, deptIds: DepartmentId[]): string[] {
  const ids = new Set<string>()
  for (const deptId of deptIds) {
    const custom = settings.departmentDatabases[deptId]?.trim()
    ids.add(custom && custom.length > 0 ? custom : settings.databaseId.trim())
  }
  if (ids.size === 0 && settings.databaseId.trim()) {
    ids.add(settings.databaseId.trim())
  }
  return [...ids].filter(Boolean)
}

function heading(text: string, level: 2 | 3) {
  return {
    object: 'block',
    type: `heading_${level}`,
    [`heading_${level}`]: {
      rich_text: [{ type: 'text', text: { content: text } }],
    },
  }
}

function paragraph(text: string) {
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: [{ type: 'text', text: { content: text.slice(0, 2000) } }],
    },
  }
}

function divider() {
  return { object: 'block', type: 'divider', divider: {} }
}

function buildDepartmentResultBlocks(deptResult: DepartmentResult): object[] {
  const deptName = DEPARTMENTS[deptResult.deptId]?.name ?? deptResult.deptId
  const blocks: object[] = [
    heading(`${deptName} · ${deptResult.agentName}`, 3),
  ]
  const chunks = chunkText(deptResult.content, 2000)
  for (const chunk of chunks.slice(0, 5)) {
    blocks.push(paragraph(chunk))
  }
  return blocks
}

function buildNotionPageChildren(task: Task) {
  const statusMap: Record<Task['status'], string> = {
    pending: '대기',
    in_progress: '진행 중',
    awaiting_approval: '승인 대기',
    completed: '완료',
    failed: '실패',
  }

  const deptNames = task.assignedTo.map((id) => DEPARTMENTS[id]?.name ?? id).join(', ')

  const blocks: object[] = [
    heading('요청 내용', 2),
    paragraph(task.description.slice(0, 2000)),
    divider(),
  ]

  if (task.departmentResults && task.departmentResults.length > 0) {
    blocks.push(heading('부서별 실행 결과', 2))
    for (const deptResult of task.departmentResults) {
      blocks.push(...buildDepartmentResultBlocks(deptResult))
      blocks.push(divider())
    }
  } else if (task.result) {
    blocks.push(heading('실행 결과', 2))
    const chunks = chunkText(task.result, 2000)
    for (const chunk of chunks.slice(0, 10)) {
      blocks.push(paragraph(chunk))
    }
    blocks.push(divider())
  }

  blocks.push(
    heading('메타데이터', 2),
    paragraph(`담당 부서: ${deptNames || '미배정'}`),
    paragraph(`상태: ${statusMap[task.status]}`),
    paragraph(`생성 시각: ${task.createdAt.toLocaleString('ko-KR')}`),
  )

  if (task.approvalReasons && task.approvalReasons.length > 0) {
    blocks.push(paragraph(`승인 사유: ${task.approvalReasons.map((reason) => reason.label).join(', ')}`))
  }

  return blocks
}

const NOTION_TIMEOUT_MS = 30_000

async function fetchWithTimeout(input: string, init: RequestInit, ms = NOTION_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function createNotionPageToDB(
  token: string,
  databaseId: string,
  title: string,
  children: object[],
): Promise<void> {
  // 데이터베이스별로 토큰+ID를 서버에 설정한 뒤 페이지 생성
  await fetchWithTimeout('/api/notion/configure', {
    method: 'POST',
    headers: apiHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ token, databaseId }),
  })

  const res = await fetchWithTimeout('/api/notion/pages', {
    method: 'POST',
    headers: apiHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ title, children }),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({ message: res.statusText })) as { message?: string }
    throw new Error(data.message ?? `Notion 페이지 생성 오류 (${res.status})`)
  }
}

export async function configureNotionSettings(settings: NotionSettings): Promise<void> {
  await fetchWithTimeout('/api/notion/configure', {
    method: 'POST',
    headers: apiHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ token: settings.token, databaseId: settings.databaseId }),
  })
}

export async function createNotionPage(task: Task, settings: NotionSettings): Promise<void> {
  if (!settings.enabled || !settings.token.trim() || !settings.databaseId.trim()) return

  const databaseIds = resolveNotionDatabaseIds(settings, task.assignedTo)
  const children = buildNotionPageChildren(task)

  await Promise.allSettled(
    databaseIds.map((dbId) =>
      createNotionPageToDB(settings.token, dbId, task.title, children),
    ),
  ).then((results) => {
    const failed = results.filter((r) => r.status === 'rejected')
    if (failed.length > 0 && failed.length === results.length) {
      const reason = (failed[0] as PromiseRejectedResult).reason
      throw new Error(reason instanceof Error ? reason.message : 'Notion 페이지 생성 실패')
    }
  })
}

export function buildNotionSettings(
  store: ReturnType<typeof useAgentStore.getState>,
): NotionSettings {
  return store.notionSettings
}

export async function testNotionConnection(settings: NotionSettings): Promise<string> {
  if (!settings.token.trim()) return '토큰을 입력하세요.'
  if (!settings.databaseId.trim()) return '데이터베이스 ID를 입력하세요.'

  await configureNotionSettings(settings)

  const res = await fetchWithTimeout('/api/notion/test', {
    method: 'POST',
    headers: apiHeaders({ 'Content-Type': 'application/json' }),
  })

  const data = await res.json().catch(() => ({ message: `오류 (${res.status})` })) as { message?: string }
  return data.message ?? (res.ok ? '연결 성공!' : `오류 (${res.status})`)
}

function chunkText(text: string, size: number): string[] {
  const chunks: string[] = []
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size))
  }
  return chunks
}
