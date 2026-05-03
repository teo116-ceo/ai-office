// Server-side daily token budget — prevents client-side bypass

let usedToday = 0
let resetDate = ''

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

function maybeReset(): void {
  const today = todayKey()
  if (resetDate !== today) {
    usedToday = 0
    resetDate = today
  }
}

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
}

export function getServerBudgetStatus(): { used: number; limit: number; date: string } {
  maybeReset()
  return {
    used: usedToday,
    limit: parseInt(process.env.SERVER_DAILY_TOKEN_LIMIT ?? '0', 10),
    date: resetDate,
  }
}
