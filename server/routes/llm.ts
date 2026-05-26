import { Router } from 'express'
import type { Request, Response } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { checkServerBudget, recordServerUsage } from '../serverBudget'
import { checkRateLimit } from '../rateLimiter'
import { runLLMWithTools } from '../agentTools'
import { getProvider, normalizeMaxTokens, validateLLMRequest } from '../llmUtils'
import type { LLMRequest } from '../llmUtils'

const router = Router()

// 세션 토큰당 분당 60회 호출 제한 (1초에 1회 평균)
// 하나의 복합 태스크가 여러 에이전트 호출을 하므로 너무 낮게 설정하면 안 됨
const LLM_RATE_LIMIT = { max: 60, windowMs: 60_000 }

function checkLLMRateLimit(req: Request, res: Response): boolean {
  const token = req.headers['x-session-token'] as string | undefined
  const key = `llm:${token ?? req.socket.remoteAddress ?? 'anon'}`
  if (!checkRateLimit(key, LLM_RATE_LIMIT.max, LLM_RATE_LIMIT.windowMs)) {
    res.status(429).json({ error: 'LLM 호출 빈도가 너무 높습니다. 잠시 후 다시 시도하세요.' })
    return false
  }
  return true
}

router.post('/llm', async (req: Request, res: Response) => {
  if (!checkLLMRateLimit(req, res)) return

  const { model, system, messages, maxTokens: rawTokens = 8000 }: LLMRequest = req.body

  if (!model || typeof model !== 'string') { res.status(400).json({ error: 'model 필드가 필요합니다.' }); return }
  if (!Array.isArray(messages) || messages.length === 0) { res.status(400).json({ error: 'messages 배열이 필요합니다.' }); return }

  const sessionToken = req.headers['x-session-token'] as string | undefined
  const validationError = validateLLMRequest(model, system, messages, sessionToken, req)
  if (validationError) { res.status(400).json({ error: validationError }); return }

  const maxTokens = normalizeMaxTokens(model, rawTokens)
  if (!checkServerBudget(maxTokens)) {
    res.status(429).json({ error: '서버 일별 토큰 예산이 소진되었습니다. 내일 다시 시도하거나 관리자에게 문의하세요.' })
    return
  }

  try {
    const prov = getProvider(model)

    if (prov === 'anthropic') {
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) { res.status(500).json({ error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다.' }); return }
      const client = new Anthropic({ apiKey })
      const response = await client.messages.create({ model, max_tokens: maxTokens, system, messages })
      const text = response.content[0].type === 'text' ? response.content[0].text : ''
      recordServerUsage(response.usage.input_tokens + response.usage.output_tokens)
      res.json({ text, usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens } })

    } else if (prov === 'openai') {
      const apiKey = process.env.OPENAI_API_KEY
      if (!apiKey) { res.status(500).json({ error: 'OPENAI_API_KEY가 설정되지 않았습니다.' }); return }
      const client = new OpenAI({ apiKey })
      const response = await client.chat.completions.create({
        model, max_tokens: maxTokens,
        messages: [{ role: 'system', content: system }, ...messages],
      })
      const inputTok = response.usage?.prompt_tokens ?? 0
      const outputTok = response.usage?.completion_tokens ?? 0
      recordServerUsage(inputTok + outputTok)
      res.json({ text: response.choices[0]?.message?.content ?? '', usage: { input_tokens: inputTok, output_tokens: outputTok } })

    } else {
      const apiKey = process.env.GEMINI_API_KEY
      if (!apiKey) { res.status(500).json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다.' }); return }
      const genAI = new GoogleGenerativeAI(apiKey)
      const geminiModel = genAI.getGenerativeModel({ model, systemInstruction: system })
      const history = messages.slice(0, -1).map((m) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      }))
      const last = messages[messages.length - 1]
      const chat = geminiModel.startChat({ history })
      const result = await chat.sendMessage(last.content)
      const usageMeta = result.response.usageMetadata
      recordServerUsage((usageMeta?.promptTokenCount ?? 0) + (usageMeta?.candidatesTokenCount ?? 0))
      res.json({
        text: result.response.text(),
        usage: { input_tokens: usageMeta?.promptTokenCount ?? 0, output_tokens: usageMeta?.candidatesTokenCount ?? 0 },
      })
    }
  } catch (err) {
    console.error('[LLM Proxy Error]', model, err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'LLM 호출 실패' })
  }
})

router.post('/llm/stream', async (req: Request, res: Response) => {
  if (!checkLLMRateLimit(req, res)) return

  const { model, system, messages, maxTokens: rawTokens = 8000 }: LLMRequest = req.body

  if (!model || typeof model !== 'string') { res.status(400).json({ error: 'model 필드가 필요합니다.' }); return }
  if (!Array.isArray(messages) || messages.length === 0) { res.status(400).json({ error: 'messages 배열이 필요합니다.' }); return }

  const sessionToken = req.headers['x-session-token'] as string | undefined
  const streamValidationError = validateLLMRequest(model, system, messages, sessionToken, req)
  if (streamValidationError) { res.status(400).json({ error: streamValidationError }); return }

  const maxTokens = normalizeMaxTokens(model, rawTokens)
  if (!checkServerBudget(maxTokens)) {
    res.status(429).json({ error: '서버 일별 토큰 예산이 소진되었습니다.' })
    return
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const write = (event: string, data: unknown) =>
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)

  try {
    const prov = getProvider(model)

    if (prov === 'anthropic') {
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) { write('error', { error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다.' }); res.end(); return }
      const client = new Anthropic({ apiKey })
      const stream = client.messages.stream({ model, max_tokens: maxTokens, system, messages })
      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta')
          write('delta', { text: chunk.delta.text })
      }
      const final = await stream.finalMessage()
      recordServerUsage(final.usage.input_tokens + final.usage.output_tokens)
      write('done', {
        usage: { input_tokens: final.usage.input_tokens, output_tokens: final.usage.output_tokens },
        stopReason: final.stop_reason,
      })

    } else if (prov === 'openai') {
      const apiKey = process.env.OPENAI_API_KEY
      if (!apiKey) { write('error', { error: 'OPENAI_API_KEY가 설정되지 않았습니다.' }); res.end(); return }
      const client = new OpenAI({ apiKey })
      const stream = await client.chat.completions.create({
        model, max_tokens: maxTokens,
        messages: [{ role: 'system', content: system }, ...messages],
        stream: true, stream_options: { include_usage: true },
      })
      let inputTokens = 0, outputTokens = 0, finishReason: string | null = null
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content
        if (delta) write('delta', { text: delta })
        finishReason = chunk.choices[0]?.finish_reason ?? finishReason
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens ?? 0
          outputTokens = chunk.usage.completion_tokens ?? 0
        }
      }
      recordServerUsage(inputTokens + outputTokens)
      write('done', { usage: { input_tokens: inputTokens, output_tokens: outputTokens }, stopReason: finishReason })

    } else {
      const apiKey = process.env.GEMINI_API_KEY
      if (!apiKey) { write('error', { error: 'GEMINI_API_KEY가 설정되지 않았습니다.' }); res.end(); return }
      const genAI = new GoogleGenerativeAI(apiKey)
      const geminiModel = genAI.getGenerativeModel({ model, systemInstruction: system })
      const history = messages.slice(0, -1).map((m) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      }))
      const last = messages[messages.length - 1]
      const chat = geminiModel.startChat({ history })
      const result = await chat.sendMessageStream(last.content)
      for await (const chunk of result.stream) {
        const text = chunk.text()
        if (text) write('delta', { text })
      }
      const finalRes = await result.response
      const usageMeta = finalRes.usageMetadata
      recordServerUsage((usageMeta?.promptTokenCount ?? 0) + (usageMeta?.candidatesTokenCount ?? 0))
      write('done', {
        usage: { input_tokens: usageMeta?.promptTokenCount ?? 0, output_tokens: usageMeta?.candidatesTokenCount ?? 0 },
        stopReason: finalRes.candidates?.[0]?.finishReason,
      })
    }
  } catch (err) {
    console.error('[LLM Stream Error]', model, err)
    write('error', { error: err instanceof Error ? err.message : 'LLM 스트리밍 실패' })
  } finally {
    res.end()
  }
})

router.post('/embeddings', async (req, res) => {
  const { texts } = req.body as { texts: string[] }
  if (!Array.isArray(texts) || texts.length === 0) {
    res.status(400).json({ error: '텍스트 배열이 필요합니다.' }); return
  }
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) { res.status(503).json({ error: 'OPENAI_API_KEY 미설정 — 시맨틱 검색 비활성화' }); return }
  try {
    const client = new OpenAI({ apiKey })
    const response = await client.embeddings.create({ model: 'text-embedding-3-small', input: texts })
    const embeddings = response.data.sort((a, b) => a.index - b.index).map((d) => d.embedding)
    res.json({ embeddings })
  } catch (err) {
    console.error('[Embeddings Error]', err)
    res.status(500).json({ error: err instanceof Error ? err.message : '임베딩 생성 실패' })
  }
})

router.post('/llm-tools', async (req, res) => {
  const { model, system, messages, maxTokens: rawToolTokens = 2048 } = req.body
  const maxTokens = normalizeMaxTokens(model, rawToolTokens)
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) { res.status(500).json({ error: 'ANTHROPIC_API_KEY 미설정' }); return }
  if (!model.startsWith('claude-')) { res.status(400).json({ error: 'Tool Use는 Claude 모델에서만 지원됩니다.' }); return }
  try {
    const result = await runLLMWithTools({ apiKey, model, system, messages, maxTokens })
    res.json(result)
  } catch (err) {
    console.error('[Tool Use Error]', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Tool Use 실패' })
  }
})

export default router
