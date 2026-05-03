import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { GoogleGenerativeAI } from '@google/generative-ai'

const app = express()
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:4173'] }))
app.use(express.json({ limit: '4mb' }))

interface LLMMessage {
  role: 'user' | 'assistant'
  content: string
}

interface LLMRequest {
  model: string
  system: string
  messages: LLMMessage[]
  maxTokens?: number
}

function getProvider(model: string): 'anthropic' | 'openai' | 'gemini' {
  if (model.startsWith('claude-')) return 'anthropic'
  if (model.startsWith('gpt-')) return 'openai'
  return 'gemini'
}

app.post('/api/llm', async (req, res) => {
  const { model, system, messages, maxTokens = 1024 }: LLMRequest = req.body

  try {
    const prov = getProvider(model)

    if (prov === 'anthropic') {
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) { res.status(500).json({ error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다.' }); return }
      const client = new Anthropic({ apiKey })
      const response = await client.messages.create({ model, max_tokens: maxTokens, system, messages })
      const text = response.content[0].type === 'text' ? response.content[0].text : ''
      res.json({
        text,
        usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
      })

    } else if (prov === 'openai') {
      const apiKey = process.env.OPENAI_API_KEY
      if (!apiKey) { res.status(500).json({ error: 'OPENAI_API_KEY가 설정되지 않았습니다.' }); return }
      const client = new OpenAI({ apiKey })
      const response = await client.chat.completions.create({
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'system', content: system }, ...messages],
      })
      res.json({
        text: response.choices[0]?.message?.content ?? '',
        usage: {
          input_tokens: response.usage?.prompt_tokens ?? 0,
          output_tokens: response.usage?.completion_tokens ?? 0,
        },
      })

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
      res.json({
        text: result.response.text(),
        usage: {
          input_tokens: usageMeta?.promptTokenCount ?? 0,
          output_tokens: usageMeta?.candidatesTokenCount ?? 0,
        },
      })
    }
  } catch (err) {
    console.error('[LLM Proxy Error]', model, err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'LLM 호출 실패' })
  }
})

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))

const PORT = 3001
app.listen(PORT, () => {
  console.log(`[AI 오피스 서버] http://localhost:${PORT}`)
})
