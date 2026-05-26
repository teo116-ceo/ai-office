// 서버(server/)와 클라이언트(src/) 양쪽이 공유하는 LLM API 계약 타입
// 변경 시 서버/클라이언트 양쪽 동작에 영향을 미치므로 신중하게 수정할 것

export interface LLMApiMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface LLMApiRequest {
  model: string
  system: string
  messages: LLMApiMessage[]
  maxTokens?: number
}

export interface LLMApiResponse {
  text: string
  usage: { input_tokens: number; output_tokens: number }
}
