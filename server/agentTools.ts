import fs from 'fs'
import path from 'path'
import Anthropic from '@anthropic-ai/sdk'
import { emitSSE } from './sseEmitter'

// 에이전트 결과물 저장 디렉토리
const OUTPUT_DIR = path.join(process.cwd(), 'agent-output')

function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true })
}

// ─── 도구 정의 ────────────────────────────────────────────────────────────────
export const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'write_file',
    description:
      '작업 결과물을 파일로 저장합니다. 보고서, 코드, 분석 결과 등을 .md, .txt, .json, .py, .ts, .js 등의 형식으로 저장할 수 있습니다.',
    input_schema: {
      type: 'object',
      properties: {
        filename: {
          type: 'string',
          description:
            '저장할 파일 이름 (예: security-report.md, api-design.ts). 경로 문자(/, \\)를 포함하지 마세요.',
        },
        content: {
          type: 'string',
          description: '파일에 저장할 내용',
        },
      },
      required: ['filename', 'content'],
    },
  },
  {
    name: 'read_file',
    description: '이전에 저장된 파일의 내용을 읽어옵니다.',
    input_schema: {
      type: 'object',
      properties: {
        filename: {
          type: 'string',
          description: '읽을 파일 이름',
        },
      },
      required: ['filename'],
    },
  },
  {
    name: 'list_files',
    description: '저장된 결과물 파일 목록을 확인합니다.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
]

// ─── 도구 실행 ────────────────────────────────────────────────────────────────
function sanitizeFilename(name: string): string {
  return path.basename(name).replace(/[^a-zA-Z0-9가-힣_.-]/g, '_').slice(0, 120)
}

interface WriteFileInput { filename: string; content: string }
interface ReadFileInput { filename: string }

export function executeTool(
  name: string,
  input: Record<string, string>,
): string {
  ensureOutputDir()

  if (name === 'write_file') {
    const { filename, content } = input as unknown as WriteFileInput
    const safe = sanitizeFilename(filename)
    const fullPath = path.join(OUTPUT_DIR, safe)
    if (!fullPath.startsWith(OUTPUT_DIR + path.sep) && fullPath !== OUTPUT_DIR) {
      return '허용되지 않은 경로입니다.'
    }
    fs.writeFileSync(fullPath, content, 'utf8')
    emitSSE('file-saved', { filename: safe, size: content.length, savedAt: new Date().toISOString() })
    return `파일 저장 완료: ${safe} (${content.length.toLocaleString()}자)`
  }

  if (name === 'read_file') {
    const { filename } = input as unknown as ReadFileInput
    const safe = sanitizeFilename(filename)
    const fullPath = path.join(OUTPUT_DIR, safe)
    if (!fullPath.startsWith(OUTPUT_DIR + path.sep) && fullPath !== OUTPUT_DIR) {
      return '허용되지 않은 경로입니다.'
    }
    if (!fs.existsSync(fullPath)) return `파일 없음: ${safe}`
    const content = fs.readFileSync(fullPath, 'utf8')
    return content.slice(0, 8000) + (content.length > 8000 ? '\n...(이하 생략)' : '')
  }

  if (name === 'list_files') {
    if (!fs.existsSync(OUTPUT_DIR)) return '저장된 파일 없음'
    const files = fs.readdirSync(OUTPUT_DIR)
      .filter((f) => fs.statSync(path.join(OUTPUT_DIR, f)).isFile())
      .map((f) => {
        const stat = fs.statSync(path.join(OUTPUT_DIR, f))
        return `${f} (${stat.size.toLocaleString()}B)`
      })
    return files.length > 0 ? files.join('\n') : '저장된 파일 없음'
  }

  return `알 수 없는 도구: ${name}`
}

// ─── Tool Use 루프 (multi-turn) ───────────────────────────────────────────────
export interface ToolCallRecord {
  name: string
  input: Record<string, string>
  result: string
}

export interface LLMToolsResult {
  text: string
  toolCalls: ToolCallRecord[]
  stopReason?: string | null
}

export async function runLLMWithTools(params: {
  apiKey: string
  model: string
  system: string
  messages: Anthropic.MessageParam[]
  maxTokens: number
}): Promise<LLMToolsResult> {
  const client = new Anthropic({ apiKey: params.apiKey })
  const toolCalls: ToolCallRecord[] = []
  const messages: Anthropic.MessageParam[] = [...params.messages]
  const MAX_ITERS = 5

  for (let i = 0; i < MAX_ITERS; i++) {
    const response = await client.messages.create({
      model: params.model,
      max_tokens: params.maxTokens,
      system: params.system,
      tools: AGENT_TOOLS,
      messages,
    })

    if (response.stop_reason !== 'tool_use') {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
      return { text, toolCalls, stopReason: response.stop_reason }
    }

    // 도구 호출 처리
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    )

    const toolResults: Anthropic.ToolResultBlockParam[] = []
    for (const block of toolUseBlocks) {
      const result = executeTool(block.name, block.input as Record<string, string>)
      toolCalls.push({ name: block.name, input: block.input as Record<string, string>, result })
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result })
    }

    // 다음 턴 메시지 구성
    messages.push({ role: 'assistant', content: response.content })
    messages.push({ role: 'user', content: toolResults })
  }

  return { text: '(최대 반복 도달)', toolCalls, stopReason: 'max_iters' }
}

// ─── 파일 목록 반환 (API용) ───────────────────────────────────────────────────
export interface OutputFileInfo {
  name: string
  size: number
  modifiedAt: string
}

export function listOutputFiles(): OutputFileInfo[] {
  ensureOutputDir()
  if (!fs.existsSync(OUTPUT_DIR)) return []
  return fs.readdirSync(OUTPUT_DIR)
    .filter((f) => fs.statSync(path.join(OUTPUT_DIR, f)).isFile())
    .map((f) => {
      const stat = fs.statSync(path.join(OUTPUT_DIR, f))
      return { name: f, size: stat.size, modifiedAt: stat.mtime.toISOString() }
    })
}

export function readOutputFile(filename: string): string | null {
  ensureOutputDir()
  const safe = sanitizeFilename(filename)
  const fullPath = path.join(OUTPUT_DIR, safe)
  // write_file과 동일한 경계 검사 — sanitizeFilename이 basename을 쓰지만 이중 방어
  if (!fullPath.startsWith(OUTPUT_DIR + path.sep)) return null
  if (!fs.existsSync(fullPath)) return null
  if (!fs.statSync(fullPath).isFile()) return null
  return fs.readFileSync(fullPath, 'utf8')
}

export function deleteOutputFile(filename: string): boolean {
  ensureOutputDir()
  const safe = sanitizeFilename(filename)
  const fullPath = path.join(OUTPUT_DIR, safe)
  if (!fullPath.startsWith(OUTPUT_DIR + path.sep)) return false
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) return false
  fs.unlinkSync(fullPath)
  return true
}
