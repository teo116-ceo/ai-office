import { MAP_COLS, MAP_ROWS } from './officeLayout'

type WalkableFn = (col: number, row: number) => boolean

// BFS 경로 탐색 - isWalkable을 외부에서 주입받아 층별로 동작
export function bfsPath(
  startCol: number, startRow: number,
  goalCol: number, goalRow: number,
  isWalkable: WalkableFn,
): Array<{ col: number; row: number }> {
  if (startCol === goalCol && startRow === goalRow) return []

  const visited = new Set<string>()
  const queue: Array<{ col: number; row: number; path: Array<{ col: number; row: number }> }> = []
  const key = (c: number, r: number) => `${c},${r}`

  visited.add(key(startCol, startRow))
  queue.push({ col: startCol, row: startRow, path: [] })

  const dirs = [{ dc: 0, dr: -1 }, { dc: 0, dr: 1 }, { dc: -1, dr: 0 }, { dc: 1, dr: 0 }]

  while (queue.length > 0) {
    const { col, row, path } = queue.shift()!
    for (const { dc, dr } of dirs) {
      const nc = col + dc
      const nr = row + dr
      const nk = key(nc, nr)
      const newPath = [...path, { col: nc, row: nr }]
      const isGoal = nc === goalCol && nr === goalRow
      if ((!isGoal && !isWalkable(nc, nr)) || visited.has(nk)) continue
      if (nc === goalCol && nr === goalRow) return newPath
      visited.add(nk)
      queue.push({ col: nc, row: nr, path: newPath })
    }
  }
  return []
}

// 랜덤 걸을 수 있는 타일 선택
export function randomWalkableTile(isWalkable: WalkableFn): { col: number; row: number } {
  const candidates: Array<{ col: number; row: number }> = []
  for (let r = 0; r < MAP_ROWS; r++) {
    for (let c = 0; c < MAP_COLS; c++) {
      if (isWalkable(c, r)) candidates.push({ col: c, row: r })
    }
  }
  if (candidates.length === 0) return { col: 5, row: 7 }
  return candidates[Math.floor(Math.random() * candidates.length)]
}
