// Server-side daily token budget — prevents client-side bypass
// 서버 재시작 후에도 당일 사용량을 유지하기 위해 파일에 영속화합니다.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

interface BudgetState {
  usedToday: number
  resetDate: string
}

const BUDGET_FILE = join(process.cwd(), 'server-budget.json')

let usedToday = 0
let resetDate = ''
let persistTimer: ReturnType<typeof setTimeout> | null = null

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

function loadBudget(): void {
  try {
    if (!existsSync(BUDGET_FILE)) return
    const data = JSON.parse(readFileSync(BUDGET_FILE, 'utf-8')) as BudgetState
    if (data.resetDate === todayKey()) {
      usedToday = data.usedToday ?? 0
      resetDate = data.resetDate
    }
  } catch { /* 파일 손상 시 무시 — 당일 사용량 0으로 시작 */ }
}

function schedulePersist(): void {
  if (persistTimer) return
  persistTimer = setTimeout(() => {
    try {
      writeFileSync(BUDGET_FILE, JSON.stringify({ usedToday, resetDate }), 'utf-8')
    } catch { /* 저장 실패 시 무시 */ }
    persistTimer = null
  }, 500)
}

function maybeReset(): void {
  const today = todayKey()
  if (resetDate !== today) {
    usedToday = 0
    resetDate = today
    schedulePersist()
  }
}

// 앱 시작 시 당일 사용량 복원
loadBudget()

// Returns false if the budget (from env SERVER_DAILY_TOKEN_LIMIT) would be exceeded.
// If SERVER_DAILY_TOKEN_LIMIT is not set, no server-side cap is applied.
export function checkServerBudget(tokensToAdd: number): boolean {
  const limit = parseInt(process.env.SERVER_DAILY_TOKEN_LIMIT ?? '0', 10)
  if (!limit) return true  // no limit configured → allow

  maybeReset()
  return usedToday + tokensToAdd <= limit
}

export function recordServerUsage(tokens: number): void {
  maybeReset()
  usedToday += tokens
  schedulePersist()
}

export function getServerBudgetStatus(): { used: number; limit: number; date: string } {
  maybeReset()
  return {
    used: usedToday,
    limit: parseInt(process.env.SERVER_DAILY_TOKEN_LIMIT ?? '0', 10),
    date: resetDate,
  }
}
