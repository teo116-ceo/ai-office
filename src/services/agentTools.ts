import { useAgentStore } from '@/store/agentStore'
import { apiHeaders } from '@/utils/apiHeaders'
import { notifySessionExpired } from '@/services/sessionService'

export interface ToolCallRecord {
  name: string
  input: Record<string, string>
  result: string
}

export interface LLMToolsResult {
  text: string
  toolCalls: ToolCallRecord[]
}

export interface OutputFileInfo {
  name: string
  size: number
  modifiedAt: string
}

const TOOL_LABELS: Record<string, string> = {
  write_file: '파일 저장',
  read_file: '파일 읽기',
  list_files: '파일 목록',
}

export async function callLLMWithTools(params: {
  model: string
  system: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  maxTokens?: number
}): Promise<LLMToolsResult | null> {
  if (!params.model.startsWith('claude-')) return null

  try {
    const res = await fetch('/api/llm-tools', {
      method: 'POST',
      headers: apiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(params),
    })

    if (res.status === 401) {
      notifySessionExpired()
      return null
    }

    if (!res.ok) return null

    const result = await res.json() as LLMToolsResult
    if (result.toolCalls.length > 0) {
      for (const toolCall of result.toolCalls) {
        useAgentStore.getState().addExecutionLog(
          'tool',
          `${TOOL_LABELS[toolCall.name] ?? toolCall.name}${toolCall.input.filename ? ` · ${toolCall.input.filename}` : ''}`,
          toolCall.result.slice(0, 80),
        )
      }
    }

    return result
  } catch {
    return null
  }
}

export function formatToolUsageSummary(toolCalls: ToolCallRecord[]): string {
  if (toolCalls.length === 0) return ''

  const lines = toolCalls.map((toolCall) => {
    const label = TOOL_LABELS[toolCall.name] ?? toolCall.name
    const detail = toolCall.input.filename ? `: ${toolCall.input.filename}` : ''
    return `- ${label}${detail}`
  })

  return lines.join('\n')
}

export async function fetchOutputFiles(): Promise<OutputFileInfo[]> {
  try {
    const res = await fetch('/api/files', { headers: apiHeaders() })
    if (!res.ok) return []
    const data = await res.json() as { files: OutputFileInfo[] }
    return data.files ?? []
  } catch {
    return []
  }
}

export async function fetchOutputFileContent(filename: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/files/${encodeURIComponent(filename)}`, { headers: apiHeaders() })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

export async function fetchOutputFileBlob(filename: string): Promise<Blob | null> {
  try {
    const res = await fetch(`/api/files/${encodeURIComponent(filename)}`, { headers: apiHeaders() })
    if (!res.ok) return null
    return await res.blob()
  } catch {
    return null
  }
}

export async function deleteOutputFile(filename: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/files/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
      headers: apiHeaders(),
    })
    return res.ok
  } catch {
    return false
  }
}
