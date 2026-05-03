import { FloorId } from '@/types'

// ─── 층별 분위기 설정 ─────────────────────────────────────────────────────────
export interface FloorAtmosphere {
  bg: string       // 캔버스 배경색
  tint: string     // 앰비언트 오버레이 색
  alpha: number    // 오버레이 강도
  accentColor: string  // 글로우·강조색
}

export const FLOOR_ATMOSPHERE: Record<FloorId, FloorAtmosphere> = {
  '12f': { bg: '#0e0b02', tint: '#ffd700', alpha: 0.07, accentColor: '#ffd700' }, // 대표실 - 골드
  '11f': { bg: '#0d0608', tint: '#e94560', alpha: 0.05, accentColor: '#e94560' }, // 임원실 - 레드
  '10f': { bg: '#04050e', tint: '#9b5de5', alpha: 0.07, accentColor: '#9b5de5' }, // 보안연구소 - 퍼플
  '9f':  { bg: '#080810', tint: '#8d99ae', alpha: 0.03, accentColor: '#8d99ae' }, // 컴플·경영 - 쿨그레이
  '8f':  { bg: '#03070e', tint: '#00b4d8', alpha: 0.06, accentColor: '#00b4d8' }, // 개발본부 - 블루
  '7f':  { bg: '#05090c', tint: '#fee440', alpha: 0.05, accentColor: '#fee440' }, // QA·DevOps - 옐로
  '6f':  { bg: '#06060e', tint: '#64ffda', alpha: 0.05, accentColor: '#64ffda' }, // 기획 - 민트
  '5f':  { bg: '#03080a', tint: '#06d6a0', alpha: 0.05, accentColor: '#06d6a0' }, // 기술지원 - 그린
  '4f':  { bg: '#0e050b', tint: '#f15bb5', alpha: 0.05, accentColor: '#f15bb5' }, // 영업 - 핑크
  '3f':  { bg: '#0e0505', tint: '#ff6b6b', alpha: 0.05, accentColor: '#ff6b6b' }, // 마케팅 - 로즈
  '2f':  { bg: '#060810', tint: '#a0b8d0', alpha: 0.04, accentColor: '#a0b8d0' }, // 회의실 - 쿨블루
  '1f':  { bg: '#0e0a02', tint: '#ff9f1c', alpha: 0.09, accentColor: '#ff9f1c' }, // 카페 - 웜오렌지
}

// ─── 타일 종류 ───────────────────────────────────────────────────────────────
export const T = {
  FLOOR:        0,
  WALL_H:       1,
  WALL_V:       2,
  CORNER:       3,
  DESK:         4,
  CHAIR:        5,
  PLANT:        6,
  SHELF:        7,
  TABLE:        8,   // 회의 테이블
  DOOR:         9,
  WINDOW:       10,
  COMPUTER:     11,
  DIVIDER:      12,  // 방 구분 벽
  SOFA:         13,  // 소파
  CAFE_COUNTER: 14,  // 카페 카운터
  WHITEBOARD:   15,  // 화이트보드
  CONF_LARGE:   16,  // 대회의실 테이블
  CONF_MED:     17,  // 중회의실 테이블
  CONF_SMALL:   18,  // 소회의실 테이블
} as const

export type TileType = typeof T[keyof typeof T]

export const TILE_SIZE = 40
export const MAP_COLS  = 26
export const MAP_ROWS  = 15

// ─── 1F 카페 ─────────────────────────────────────────────────────────────────
//  왼쪽: 카운터 + 커피머신 / 가운데: 테이블석 / 오른쪽: 소파 라운지
const CAFE_MAP: TileType[][] = [
  // row 0 - 상단 벽
  [3,1,1,1,1,1,1,1,1,1,1,1,1,1,3,  3,1,1,1,1,1,1,1,1,1,3],
  // row 1 - 카운터
  [2,14,14,14,14,14,14,0,0,0,0,0,0,0,2,  2,0,0,0,0,0,0,0,0,0,2],
  // row 2 - 카운터 뒤 선반
  [2,7,7,7,7,7,7,0,0,0,0,0,0,0,2,  2,0,0,0,0,0,0,0,0,0,2],
  // row 3 - 카운터 앞 공간 + 소파 시작
  [2,0,0,0,0,0,0,0,0,6,0,0,0,0,2,  2,0,13,13,0,0,13,13,0,0,2],
  // row 4 - 테이블석 줄 1
  [2,0,8,5,0,8,5,0,8,5,0,0,0,0,2,  2,0,13,0,0,0,0,13,0,0,2],
  // row 5 - 테이블석 줄 1 의자
  [2,0,5,0,0,5,0,0,5,0,0,0,0,0,2,  2,0,0,0,6,0,6,0,0,0,2],
  // row 6 - 통로
  [2,0,0,0,0,0,0,0,0,0,0,0,0,0,2,  2,0,0,0,0,0,0,0,0,0,2],
  // row 7 - 출입구
  [2,0,0,0,0,0,0,0,0,0,0,0,0,0,9,  9,0,0,0,0,0,0,0,0,0,2],
  // row 8 - 테이블석 줄 2
  [2,0,8,5,0,8,5,0,8,5,0,0,0,0,2,  2,0,0,0,0,0,0,0,0,0,2],
  // row 9 - 테이블석 줄 2 의자
  [2,0,5,0,0,5,0,0,5,0,0,0,0,0,2,  2,0,13,13,0,0,13,13,0,0,2],
  // row 10 - 창가 테이블
  [2,0,0,0,0,0,0,0,0,0,0,0,0,0,2,  2,0,13,0,0,0,0,13,0,0,2],
  // row 11
  [2,0,8,5,0,8,5,0,0,0,6,0,0,0,2,  2,0,0,0,0,0,0,0,0,0,2],
  // row 12
  [2,0,5,0,0,5,0,0,0,0,0,0,0,0,2,  2,0,0,0,0,6,0,0,0,0,2],
  // row 13
  [2,0,0,0,0,0,0,0,0,0,0,0,0,0,2,  2,0,0,0,0,0,0,0,0,0,2],
  // row 14 - 하단 벽
  [3,1,1,1,1,1,1,1,1,1,1,1,1,1,3,  3,1,1,1,1,1,1,1,1,1,3],
]

// ─── 2F 회의실 전용층 ─────────────────────────────────────────────────────────
//  왼쪽: 소회의실×2 / 가운데: 중회의실 / 오른쪽: 대회의실
const MEETING_MAP: TileType[][] = [
  // row 0
  [3,1,1,1,1,1,1,3,1,1,1,1,1,1,3,  3,1,1,1,1,1,1,1,1,1,3],
  // row 1 - 소회의실A 상단
  [2,7,18,18,0,15,0,12,0,15,17,17,17,7,2,  2,15,16,16,16,16,16,16,15,0,2],
  // row 2
  [2,0,18,18,0,0,0,12,0,0,17,17,17,0,2,  2,0,16,16,16,16,16,16,0,0,2],
  // row 3
  [2,0,5,5,0,6,0,12,0,5,17,17,5,0,2,  2,0,5,16,16,16,16,5,0,0,2],
  // row 4 - 소회의실A/B 사이
  [2,0,0,0,0,7,0,12,0,0,0,0,6,0,2,  2,0,0,16,16,16,16,0,7,0,2],
  // row 5 - 소회의실B 상단
  [2,7,18,18,0,15,0,12,0,15,0,15,0,0,2,  2,0,5,16,16,16,16,5,0,0,2],
  // row 6
  [2,0,18,18,0,6,0,12,0,0,0,0,7,0,2,  2,0,0,16,16,16,16,0,0,0,2],
  // row 7 - 복도 + 도어
  [2,9,0,0,0,0,0,12,9,0,0,0,9,0,2,  9,0,0,0,0,0,0,0,0,0,2],
  // row 8
  [2,13,13,0,8,15,0,12,0,15,15,15,0,0,2,  2,13,13,0,0,13,13,0,0,0,2],
  // row 9
  [2,13,0,0,5,0,6,12,0,8,8,0,6,0,2,  2,13,0,0,0,0,0,13,0,0,2],
  // row 10
  [2,0,0,0,0,7,0,12,0,0,0,0,7,0,2,  2,0,0,7,7,7,7,0,0,0,2],
  // row 11
  [2,0,0,0,0,7,0,12,0,0,0,0,7,0,2,  2,0,0,0,7,7,0,0,0,0,2],
  // row 12
  [2,0,0,0,15,0,6,12,0,15,0,15,0,0,2,  2,15,0,0,0,0,0,0,15,6,2],
  // row 13
  [2,0,0,0,0,0,0,12,0,0,0,0,0,0,2,  2,0,0,0,0,0,0,0,0,0,2],
  // row 14
  [3,1,1,1,1,1,1,3,1,1,1,1,1,1,3,  3,1,1,1,1,1,1,1,1,1,3],
]

// ─── 일반 오피스층 (3F~12F 공통 베이스) ──────────────────────────────────────
const OFFICE_MAP: TileType[][] = [
  // row 0 - 상단 벽
  [3,1,1,1,1,1,1,1,1,1,1,1,1,1,3,  3,1,1,1,1,1,1,1,1,1,3],
  // row 1 - 책장 행
  [2,7,7,7,0,0,0,7,7,7,0,0,0,0,2,  2,0,0,0,0,0,0,0,0,0,2],
  // row 2
  [2,0,0,0,0,0,0,0,0,0,0,0,0,0,2,  2,0,0,0,0,0,0,0,0,0,2],
  // row 3 - 첫 번째 책상 줄
  [2,0,4,11,0,6,0,4,11,0,0,0,0,0,2,  2,0,0,5,5,5,5,0,0,0,2],
  // row 4
  [2,0,4,4,0,0,0,4,4,0,0,0,0,0,2,  2,0,0,5,8,8,5,0,0,0,2],
  // row 5
  [2,0,5,5,0,0,0,5,5,0,0,0,0,0,2,  2,0,0,5,8,8,5,0,0,0,2],
  // row 6
  [2,0,0,0,0,0,0,0,0,0,6,0,0,0,2,  2,0,0,5,5,5,5,0,0,0,2],
  // row 7 - 가운데 도어
  [2,6,0,0,0,0,0,0,0,0,0,0,0,0,9,  9,0,0,0,0,0,0,0,0,0,2],
  // row 8
  [2,0,0,0,0,0,0,0,0,0,0,0,0,0,2,  2,0,0,0,0,0,0,0,6,0,2],
  // row 9 - 두 번째 책상 줄
  [2,0,4,11,0,0,0,4,11,0,0,0,0,0,2,  2,0,0,0,0,0,0,0,0,0,2],
  // row 10
  [2,0,4,4,0,6,0,4,4,0,0,0,0,0,2,  2,0,0,0,0,0,0,0,0,0,2],
  // row 11
  [2,0,5,5,0,0,0,5,5,0,0,0,0,0,2,  2,0,0,0,0,0,0,0,0,0,2],
  // row 12
  [2,0,0,0,0,0,0,0,0,0,0,0,0,0,2,  2,0,0,0,0,0,0,0,0,0,2],
  // row 13
  [2,0,0,0,0,0,0,0,0,0,0,6,0,0,2,  2,0,6,0,0,0,0,0,0,0,2],
  // row 14 - 하단 벽
  [3,1,1,1,1,1,1,1,1,1,1,1,1,1,3,  3,1,1,1,1,1,1,1,1,1,3],
]

// ─── 12F 대표실 전용 맵 ───────────────────────────────────────────────────────
//  왼쪽: 대형 임원 책상 + 책장 + 소파 라운지
//  오른쪽: 소규모 접견용 회의 테이블 + 화분
const CEO_MAP: TileType[][] = [
  // row 0 - 상단 벽
  [3,1,1,1,1,1,1,1,1,1,1,1,1,1,3,  3,1,1,1,1,1,1,1,1,1,3],
  // row 1 - 상단 책장 (전면)
  [2,7,7,7,7,7,7,7,7,7,0,0,6,0,2,  2,0,6,0,7,7,0,0,6,0,2],
  // row 2 - 여백
  [2,0,0,0,0,0,0,0,0,0,0,0,0,0,2,  2,0,0,0,0,0,0,0,0,0,2],
  // row 3 - 대형 임원 책상 (3칸 너비)
  [2,6,0,0,0,0,4,11,4,0,0,0,6,0,2,  2,0,5,17,17,17,17,5,0,0,2],
  // row 4 - 책상 중심 (CEO 대기 위치)
  [2,0,0,0,0,0,4,11,4,0,0,0,0,0,2,  2,0,0,17,17,17,17,0,0,0,2],
  // row 5 - 책상 하단
  [2,0,0,0,0,0,4,4,4,0,0,0,0,0,2,  2,0,5,17,17,17,17,5,0,0,2],
  // row 6 - 책상 앞 의자
  [2,0,0,0,0,0,5,5,5,0,0,0,0,0,2,  2,0,0,0,0,0,0,0,7,7,2],
  // row 7 - 복도 + 문
  [2,0,0,0,6,0,0,0,0,0,0,0,0,0,9,  9,0,0,0,0,0,0,0,0,0,2],
  // row 8 - 여백
  [2,0,0,0,0,0,0,0,0,0,0,0,0,0,2,  2,0,0,0,0,0,0,0,6,0,2],
  // row 9 - 소파 라운지
  [2,0,13,13,8,8,13,13,0,0,0,0,0,0,2,  2,0,0,0,0,0,0,0,0,0,2],
  // row 10 - 소파 라운지
  [2,0,13,13,8,8,13,13,0,0,6,0,0,0,2,  2,0,0,7,7,7,7,0,0,0,2],
  // row 11 - 여백
  [2,0,0,0,0,0,0,0,0,0,0,0,0,0,2,  2,0,0,7,7,7,7,0,6,0,2],
  // row 12
  [2,0,0,0,0,0,0,0,0,0,0,0,0,0,2,  2,0,0,0,0,6,0,0,0,0,2],
  // row 13 - 하단 화분
  [2,6,0,0,0,0,0,0,0,0,0,0,0,6,2,  2,0,6,0,0,0,0,0,6,0,2],
  // row 14 - 하단 벽
  [3,1,1,1,1,1,1,1,1,1,1,1,1,1,3,  3,1,1,1,1,1,1,1,1,1,3],
]

// ─── 층별 맵 매핑 ─────────────────────────────────────────────────────────────
function cloneMap(map: TileType[][]): TileType[][] {
  return map.map((row) => [...row])
}

function fillArea(
  map: TileType[][],
  rowStart: number,
  rowEnd: number,
  colStart: number,
  colEnd: number,
  type: TileType,
) {
  for (let row = rowStart; row <= rowEnd; row += 1) {
    for (let col = colStart; col <= colEnd; col += 1) {
      map[row][col] = type
    }
  }
}

function placeTiles(map: TileType[][], tiles: Array<[number, number, TileType]>) {
  tiles.forEach(([row, col, type]) => {
    map[row][col] = type
  })
}

function resetOfficeInterior(map: TileType[][]) {
  for (let row = 1; row < MAP_ROWS - 1; row += 1) {
    for (let col = 1; col < MAP_COLS - 1; col += 1) {
      const tile = map[row][col]
      if (tile === T.WALL_H || tile === T.WALL_V || tile === T.CORNER || tile === T.DOOR) {
        continue
      }
      map[row][col] = T.FLOOR
    }
  }
}

function addShelfRun(map: TileType[][], row: number, colStart: number, count: number) {
  for (let offset = 0; offset < count; offset += 1) {
    map[row][colStart + offset] = T.SHELF
  }
}

function addWhiteboards(map: TileType[][], positions: Array<[number, number]>) {
  placeTiles(map, positions.map(([row, col]) => [row, col, T.WHITEBOARD]))
}

function addPlants(map: TileType[][], positions: Array<[number, number]>) {
  placeTiles(map, positions.map(([row, col]) => [row, col, T.PLANT]))
}

function addWorkstation(map: TileType[][], topRow: number, leftCol: number) {
  placeTiles(map, [
    [topRow, leftCol, T.DESK],
    [topRow, leftCol + 1, T.COMPUTER],
    [topRow + 1, leftCol, T.DESK],
    [topRow + 1, leftCol + 1, T.DESK],
    [topRow + 2, leftCol, T.CHAIR],
    [topRow + 2, leftCol + 1, T.CHAIR],
  ])
}

function addWorkstationRow(map: TileType[][], topRow: number, leftCols: number[]) {
  leftCols.forEach((leftCol) => addWorkstation(map, topRow, leftCol))
}

function addMeetingZone(map: TileType[][], topRow: number, leftCol: number, width: number) {
  fillArea(map, topRow, topRow + 1, leftCol, leftCol + width - 1, T.TABLE)

  const chairCols = width >= 5 ? [leftCol + 1, leftCol + width - 2] : [leftCol, leftCol + width - 1]
  chairCols.forEach((col) => {
    if (topRow - 1 >= 1) map[topRow - 1][col] = T.CHAIR
    if (topRow + 2 <= MAP_ROWS - 2) map[topRow + 2][col] = T.CHAIR
  })

  if (leftCol - 1 >= 1) {
    map[topRow][leftCol - 1] = T.CHAIR
    map[topRow + 1][leftCol - 1] = T.CHAIR
  }
  if (leftCol + width <= MAP_COLS - 2) {
    map[topRow][leftCol + width] = T.CHAIR
    map[topRow + 1][leftCol + width] = T.CHAIR
  }
}

function addBreakoutLounge(map: TileType[][], topRow: number, leftCol: number) {
  placeTiles(map, [
    [topRow, leftCol, T.SOFA],
    [topRow, leftCol + 1, T.SOFA],
    [topRow + 1, leftCol, T.SOFA],
    [topRow + 1, leftCol + 1, T.SOFA],
    [topRow, leftCol + 4, T.SOFA],
    [topRow, leftCol + 5, T.SOFA],
    [topRow + 1, leftCol + 4, T.SOFA],
    [topRow + 1, leftCol + 5, T.SOFA],
    [topRow, leftCol + 2, T.TABLE],
    [topRow, leftCol + 3, T.TABLE],
    [topRow + 1, leftCol + 2, T.TABLE],
    [topRow + 1, leftCol + 3, T.TABLE],
  ])
}

function addArchiveShelves(map: TileType[][], topRow: number, leftCol: number, width: number, height = 2) {
  fillArea(map, topRow, topRow + height - 1, leftCol, leftCol + width - 1, T.SHELF)
}

function addDividerColumn(map: TileType[][], col: number, rowStart: number, rowEnd: number) {
  fillArea(map, rowStart, rowEnd, col, col, T.DIVIDER)
}

function applySharedOfficeLayout(map: TileType[][]) {
  resetOfficeInterior(map)

  addShelfRun(map, 1, 1, 3)
  addShelfRun(map, 1, 7, 3)
  addWorkstationRow(map, 3, [2, 7])
  addWorkstationRow(map, 9, [2, 7])
  addPlants(map, [
    [3, 5],
    [7, 1],
    [8, 10],
    [10, 5],
    [13, 11],
  ])
}

function applyCreativeOfficeLayout(map: TileType[][]) {
  applySharedOfficeLayout(map)
  addWhiteboards(map, [[1, 16], [1, 20], [12, 22]])
  addMeetingZone(map, 3, 17, 5)
  addBreakoutLounge(map, 9, 17)
  addPlants(map, [[2, 24], [12, 24]])
}

function applyClientOfficeLayout(map: TileType[][]) {
  applySharedOfficeLayout(map)
  addWhiteboards(map, [[1, 17], [1, 21]])
  addMeetingZone(map, 3, 18, 4)
  addBreakoutLounge(map, 9, 16)
  addPlants(map, [[3, 24], [11, 24]])
}

function applySupportOfficeLayout(map: TileType[][]) {
  applySharedOfficeLayout(map)
  addArchiveShelves(map, 1, 16, 4, 1)
  addWhiteboards(map, [[1, 21], [1, 23], [6, 18]])
  addWorkstationRow(map, 3, [16, 19, 22])
  addMeetingZone(map, 9, 18, 4)
  addPlants(map, [[12, 23]])
}

function applyPlanningOfficeLayout(map: TileType[][]) {
  applySharedOfficeLayout(map)
  addWhiteboards(map, [[1, 16], [1, 20], [2, 23]])
  addMeetingZone(map, 3, 17, 5)
  addBreakoutLounge(map, 9, 16)
}

function applyOpsOfficeLayout(map: TileType[][]) {
  applySharedOfficeLayout(map)
  addArchiveShelves(map, 1, 16, 3, 1)
  addWhiteboards(map, [[1, 20], [1, 23]])
  addWorkstationRow(map, 3, [16, 19, 22])
  addWorkstationRow(map, 9, [16, 19, 22])
  addDividerColumn(map, 24, 2, 12)
  addPlants(map, [[13, 21]])
}

function applyDevelopmentOfficeLayout(map: TileType[][]) {
  applySharedOfficeLayout(map)
  addWhiteboards(map, [[1, 16], [1, 20], [12, 23]])
  addWorkstationRow(map, 3, [16, 19, 22])
  addWorkstationRow(map, 9, [16, 19, 22])
  fillArea(map, 12, 12, 18, 20, T.TABLE)
  addPlants(map, [[13, 23]])
}

function applyGovernanceOfficeLayout(map: TileType[][]) {
  applySharedOfficeLayout(map)
  addArchiveShelves(map, 1, 16, 4, 2)
  addWhiteboards(map, [[1, 21], [1, 23], [6, 22]])
  addMeetingZone(map, 9, 18, 4)
  addPlants(map, [[12, 16], [12, 23]])
}

function applySecurityOfficeLayout(map: TileType[][]) {
  applySharedOfficeLayout(map)
  addWhiteboards(map, [[1, 16], [1, 19], [6, 17]])
  addWorkstationRow(map, 3, [16, 19])
  addArchiveShelves(map, 2, 22, 2, 4)
  addMeetingZone(map, 9, 17, 4)
  addDividerColumn(map, 21, 2, 12)
  addPlants(map, [[12, 24]])
}

function applyExecutiveOfficeLayout(map: TileType[][]) {
  applySharedOfficeLayout(map)
  addWhiteboards(map, [[1, 17], [1, 21]])
  addMeetingZone(map, 3, 17, 5)
  addArchiveShelves(map, 8, 16, 2, 2)
  addBreakoutLounge(map, 9, 18)
}

const MARKETING_MAP = cloneMap(OFFICE_MAP)
fillArea(MARKETING_MAP, 3, 5, 16, 20, T.TABLE)
fillArea(MARKETING_MAP, 8, 10, 16, 20, T.SOFA)
placeTiles(MARKETING_MAP, [
  [1, 15, T.WHITEBOARD],
  [1, 20, T.WHITEBOARD],
  [2, 17, T.PLANT],
  [2, 19, T.PLANT],
  [10, 10, T.WHITEBOARD],
  [11, 4, T.SHELF],
  [11, 9, T.SHELF],
])

const SALES_MAP = cloneMap(OFFICE_MAP)
fillArea(SALES_MAP, 3, 6, 16, 20, T.SOFA)
fillArea(SALES_MAP, 9, 11, 15, 20, T.TABLE)
placeTiles(SALES_MAP, [
  [1, 15, T.WHITEBOARD],
  [1, 19, T.WHITEBOARD],
  [3, 10, T.PLANT],
  [9, 10, T.PLANT],
  [12, 3, T.TABLE],
  [12, 4, T.CHAIR],
  [12, 8, T.TABLE],
  [12, 9, T.CHAIR],
])

const SUPPORT_MAP = cloneMap(OFFICE_MAP)
fillArea(SUPPORT_MAP, 3, 5, 15, 20, T.COMPUTER)
fillArea(SUPPORT_MAP, 9, 11, 15, 20, T.TABLE)
placeTiles(SUPPORT_MAP, [
  [1, 16, T.SHELF],
  [1, 17, T.SHELF],
  [1, 18, T.SHELF],
  [1, 19, T.SHELF],
  [6, 17, T.WHITEBOARD],
  [6, 18, T.WHITEBOARD],
  [12, 16, T.SOFA],
  [12, 17, T.SOFA],
  [12, 19, T.PLANT],
])

const PLANNING_MAP = cloneMap(OFFICE_MAP)
fillArea(PLANNING_MAP, 3, 6, 15, 19, T.TABLE)
fillArea(PLANNING_MAP, 9, 10, 15, 19, T.WHITEBOARD)
placeTiles(PLANNING_MAP, [
  [1, 3, T.WHITEBOARD],
  [1, 8, T.WHITEBOARD],
  [2, 17, T.PLANT],
  [2, 18, T.PLANT],
  [11, 16, T.SOFA],
  [11, 17, T.SOFA],
  [11, 18, T.SOFA],
])

const QA_DEVOPS_MAP = cloneMap(OFFICE_MAP)
fillArea(QA_DEVOPS_MAP, 3, 5, 15, 18, T.COMPUTER)
fillArea(QA_DEVOPS_MAP, 9, 11, 15, 18, T.COMPUTER)
fillArea(QA_DEVOPS_MAP, 3, 11, 20, 20, T.DIVIDER)
placeTiles(QA_DEVOPS_MAP, [
  [1, 15, T.SHELF],
  [1, 16, T.SHELF],
  [1, 17, T.SHELF],
  [1, 18, T.SHELF],
  [6, 16, T.WHITEBOARD],
  [6, 18, T.WHITEBOARD],
  [12, 16, T.TABLE],
  [12, 17, T.CHAIR],
  [12, 18, T.CHAIR],
])

const DEVELOPMENT_MAP = cloneMap(OFFICE_MAP)
fillArea(DEVELOPMENT_MAP, 3, 5, 15, 20, T.COMPUTER)
fillArea(DEVELOPMENT_MAP, 9, 11, 15, 20, T.COMPUTER)
placeTiles(DEVELOPMENT_MAP, [
  [1, 16, T.WHITEBOARD],
  [1, 19, T.WHITEBOARD],
  [6, 17, T.TABLE],
  [6, 18, T.TABLE],
  [12, 16, T.SOFA],
  [12, 17, T.SOFA],
  [12, 19, T.PLANT],
])

const MANAGEMENT_MAP = cloneMap(OFFICE_MAP)
fillArea(MANAGEMENT_MAP, 3, 5, 15, 19, T.SHELF)
fillArea(MANAGEMENT_MAP, 9, 11, 15, 19, T.TABLE)
placeTiles(MANAGEMENT_MAP, [
  [1, 16, T.PLANT],
  [1, 18, T.PLANT],
  [5, 17, T.WHITEBOARD],
  [5, 18, T.WHITEBOARD],
  [12, 16, T.SOFA],
  [12, 17, T.SOFA],
  [12, 18, T.SOFA],
])

const SECURITY_MAP = cloneMap(OFFICE_MAP)
fillArea(SECURITY_MAP, 3, 5, 15, 20, T.COMPUTER)
fillArea(SECURITY_MAP, 9, 11, 15, 20, T.COMPUTER)
fillArea(SECURITY_MAP, 2, 12, 19, 19, T.DIVIDER)
placeTiles(SECURITY_MAP, [
  [1, 15, T.SHELF],
  [1, 16, T.SHELF],
  [1, 17, T.SHELF],
  [1, 18, T.SHELF],
  [1, 20, T.WHITEBOARD],
  [12, 16, T.TABLE],
  [12, 17, T.CHAIR],
  [12, 18, T.CHAIR],
])

const EXECUTIVE_MAP = cloneMap(OFFICE_MAP)
fillArea(EXECUTIVE_MAP, 3, 5, 15, 19, T.TABLE)
fillArea(EXECUTIVE_MAP, 9, 11, 15, 20, T.SOFA)
placeTiles(EXECUTIVE_MAP, [
  [1, 15, T.WHITEBOARD],
  [1, 19, T.WHITEBOARD],
  [2, 16, T.PLANT],
  [2, 18, T.PLANT],
  [6, 17, T.SHELF],
  [6, 18, T.SHELF],
])

applyCreativeOfficeLayout(MARKETING_MAP)
applyClientOfficeLayout(SALES_MAP)
applySupportOfficeLayout(SUPPORT_MAP)
applyPlanningOfficeLayout(PLANNING_MAP)
applyOpsOfficeLayout(QA_DEVOPS_MAP)
applyDevelopmentOfficeLayout(DEVELOPMENT_MAP)
applyGovernanceOfficeLayout(MANAGEMENT_MAP)
applySecurityOfficeLayout(SECURITY_MAP)
applyExecutiveOfficeLayout(EXECUTIVE_MAP)

export const FLOOR_MAPS: Record<FloorId, TileType[][]> = {
  '1f':  CAFE_MAP,
  '2f':  MEETING_MAP,
  '3f':  MARKETING_MAP,
  '4f':  SALES_MAP,
  '5f':  SUPPORT_MAP,
  '6f':  PLANNING_MAP,
  '7f':  QA_DEVOPS_MAP,
  '8f':  DEVELOPMENT_MAP,
  '9f':  MANAGEMENT_MAP,
  '10f': SECURITY_MAP,
  '11f': EXECUTIVE_MAP,
  '12f': CEO_MAP,
}

// ─── 에이전트 초기 타일 위치 (col, row) ──────────────────────────────────────
export const DESK_TILE_POSITIONS: Record<string, { col: number; row: number }> = {
  'ceo-01': { col: 7, row: 4 },
  'exec-cto': { col: 7, row: 4 },
  'exec-coo': { col: 7, row: 10 },
  'sec-lead': { col: 2, row: 4 },
  'sec-01': { col: 7, row: 4 },
  'sec-02': { col: 2, row: 10 },
  'com-01': { col: 2, row: 4 },
  'mgmt-hr': { col: 7, row: 4 },
  'mgmt-fin': { col: 7, row: 10 },
  'dev-lead': { col: 2, row: 4 },
  'dev-01': { col: 7, row: 4 },
  'dev-02': { col: 2, row: 10 },
  'dev-03': { col: 7, row: 10 },
  'qa-lead': { col: 2, row: 4 },
  'qa-01': { col: 2, row: 10 },
  'ops-lead': { col: 7, row: 4 },
  'ops-01': { col: 7, row: 10 },
  'plan-lead': { col: 2, row: 4 },
  'plan-01': { col: 7, row: 4 },
  'sup-lead': { col: 2, row: 4 },
  'sup-01': { col: 7, row: 4 },
  'sal-lead': { col: 2, row: 4 },
  'sal-01': { col: 2, row: 10 },
  'pre-01': { col: 7, row: 4 },
  'mkt-01': { col: 2, row: 4 },
}

export const AGENT_TILE_POSITIONS: Record<string, { col: number; row: number }> = {
  // 대표실 12F - 대형 책상 중앙 (CEO_MAP col 7, row 4)
  'ceo-01':    { col: 7, row: 7 },

  // 임원실 11F
  'exec-cto':  { col: 7, row: 6 },
  'exec-coo':  { col: 7, row: 12 },

  // 보안연구소 10F
  'sec-lead':  { col: 2,  row: 6 },
  'sec-01':    { col: 7,  row: 6 },
  'sec-02':    { col: 2,  row: 12 },

  // 컴플라이언스·경영지원 9F
  'com-01':    { col: 2,  row: 6 },
  'mgmt-hr':   { col: 7,  row: 6 },
  'mgmt-fin':  { col: 7,  row: 12 },

  // 개발본부 8F
  'dev-lead':  { col: 2,  row: 6 },
  'dev-01':    { col: 7,  row: 6 },
  'dev-02':    { col: 2,  row: 12 },
  'dev-03':    { col: 7,  row: 12 },

  // QA·DevOps 7F
  'qa-lead':   { col: 2,  row: 6 },
  'qa-01':     { col: 2,  row: 12 },
  'ops-lead':  { col: 7,  row: 6 },
  'ops-01':    { col: 7,  row: 12 },

  // 제품기획/PM 6F
  'plan-lead': { col: 2,  row: 6 },
  'plan-01':   { col: 7,  row: 6 },

  // 기술지원·고객성공 5F
  'sup-lead':  { col: 2,  row: 6 },
  'sup-01':    { col: 7,  row: 6 },

  // 영업·프리세일즈 4F
  'sal-lead':  { col: 2,  row: 6 },
  'sal-01':    { col: 2,  row: 12 },
  'pre-01':    { col: 7,  row: 6 },

  // 마케팅 3F
  'mkt-01':    { col: 2,  row: 6 },
}

export const WORK_SEAT_TILE_POSITIONS: Record<string, { col: number; row: number }> = {
  'ceo-01':    { col: 7,  row: 6 },
  'exec-cto':  { col: 7,  row: 5 },
  'exec-coo':  { col: 7,  row: 11 },
  'sec-lead':  { col: 2,  row: 5 },
  'sec-01':    { col: 7,  row: 5 },
  'sec-02':    { col: 2,  row: 11 },
  'com-01':    { col: 2,  row: 5 },
  'mgmt-hr':   { col: 7,  row: 5 },
  'mgmt-fin':  { col: 7,  row: 11 },
  'dev-lead':  { col: 2,  row: 5 },
  'dev-01':    { col: 7,  row: 5 },
  'dev-02':    { col: 2,  row: 11 },
  'dev-03':    { col: 7,  row: 11 },
  'qa-lead':   { col: 2,  row: 5 },
  'qa-01':     { col: 2,  row: 11 },
  'ops-lead':  { col: 7,  row: 5 },
  'ops-01':    { col: 7,  row: 11 },
  'plan-lead': { col: 2,  row: 5 },
  'plan-01':   { col: 7,  row: 5 },
  'sup-lead':  { col: 2,  row: 5 },
  'sup-01':    { col: 7,  row: 5 },
  'sal-lead':  { col: 2,  row: 5 },
  'sal-01':    { col: 2,  row: 11 },
  'pre-01':    { col: 7,  row: 5 },
  'mkt-01':    { col: 2,  row: 5 },
}
