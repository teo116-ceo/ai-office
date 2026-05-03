import { FloorId, MeetingRoom } from '@/types'

export interface FloorAtmosphere {
  bg: string
  tint: string
  alpha: number
  accentColor: string
}

export const FLOOR_ATMOSPHERE: Record<FloorId, FloorAtmosphere> = {
  '11f': { bg: '#0e0b02', tint: '#ffd700', alpha: 0.07, accentColor: '#ffd700' },
  '10f': { bg: '#0d0608', tint: '#e94560', alpha: 0.05, accentColor: '#e94560' },
  '9f':  { bg: '#04050e', tint: '#9b5de5', alpha: 0.07, accentColor: '#9b5de5' },
  '8f':  { bg: '#080810', tint: '#8d99ae', alpha: 0.03, accentColor: '#8d99ae' },
  '7f':  { bg: '#03070e', tint: '#00b4d8', alpha: 0.06, accentColor: '#00b4d8' },
  '6f':  { bg: '#05090c', tint: '#fee440', alpha: 0.05, accentColor: '#fee440' },
  '5f':  { bg: '#06060e', tint: '#64ffda', alpha: 0.05, accentColor: '#64ffda' },
  '4f':  { bg: '#03080a', tint: '#06d6a0', alpha: 0.05, accentColor: '#06d6a0' },
  '3f':  { bg: '#0e050b', tint: '#f15bb5', alpha: 0.05, accentColor: '#f15bb5' },
  '2f':  { bg: '#0e0505', tint: '#ff6b6b', alpha: 0.05, accentColor: '#ff6b6b' },
  '1f':  { bg: '#060810', tint: '#a0b8d0', alpha: 0.04, accentColor: '#a0b8d0' },
}

export const T = {
  FLOOR: 0,
  WALL_H: 1,
  WALL_V: 2,
  CORNER: 3,
  DESK: 4,
  CHAIR: 5,
  PLANT: 6,
  SHELF: 7,
  TABLE: 8,
  DOOR: 9,
  WINDOW: 10,
  COMPUTER: 11,
  DIVIDER: 12,
  SOFA: 13,
  WHITEBOARD: 15,
  CONF_LARGE: 16,
  CONF_MED: 17,
  CONF_SMALL: 18,
} as const

export type TileType = typeof T[keyof typeof T]

export const TILE_SIZE = 40
export const MAP_COLS = 26
export const MAP_ROWS = 15

type TileCoord = [number, number]
type TilePlacement = [number, number, TileType]
type OfficeFloorId = Exclude<FloorId, '1f' | '11f'>

// Keep office-floor desk counts aligned with the 3D scene.
const OFFICE_DESK_LAYOUTS: Record<OfficeFloorId, TileCoord[]> = {
  '2f':  [[4, 2], [4, 7]],
  '3f':  [[4, 2], [10, 2], [4, 7], [4, 12], [10, 12]],
  '4f':  [[4, 2], [4, 7], [4, 12]],
  '5f':  [[4, 2], [4, 7]],
  '6f':  [[4, 2], [10, 2], [4, 7], [10, 7]],
  '7f':  [[4, 2], [10, 2], [4, 7], [10, 7]],
  '8f':  [[4, 2], [4, 7], [10, 7], [4, 12], [4, 17], [10, 12]],
  '9f':  [[4, 2], [10, 2], [4, 7]],
  '10f': [[4, 7], [10, 7]],
}

const LARGE_MEETING_ORDERED_CHAIR_COORDS: TileCoord[] = [
  [4, 18], [4, 19], [4, 20],
  [5, 17], [5, 21],
  [6, 17], [6, 21],
  [7, 18], [7, 19], [7, 20],
  [3, 18], [3, 20],
  [8, 18], [8, 20],
]

const LARGE_MEETING_TABLE_COORDS: TileCoord[] = [
  [5, 18], [5, 19], [5, 20],
  [6, 18], [6, 19], [6, 20],
]

const MEETING_ROOM_CHAIR_COORDS: Record<MeetingRoom, TileCoord[]> = {
  small: [
    [1, 3], [1, 4], [2, 2], [3, 2], [2, 5], [3, 5], [4, 3], [4, 4],
    [9, 3], [9, 4], [10, 2], [11, 2], [10, 5], [11, 5], [12, 3], [12, 4],
  ],
  medium: [
    [3, 8], [4, 8], [5, 8], [6, 8],
    [3, 13], [4, 13], [5, 13], [6, 13],
    [7, 9], [7, 10], [7, 11], [7, 12],
  ],
  large: LARGE_MEETING_ORDERED_CHAIR_COORDS,
}

const MEETING_ROOM_OVERFLOW_COORDS: Record<MeetingRoom, TileCoord[]> = {
  small: [[6, 2], [6, 3], [6, 4], [6, 5]],
  medium: [
    [9, 9], [9, 10], [9, 11], [9, 12],
    [10, 10], [10, 11],
  ],
  large: [],
}

function resolveLargeMeetingChairCoords(participantCount?: number): TileCoord[] {
  const count = participantCount == null
    ? LARGE_MEETING_ORDERED_CHAIR_COORDS.length
    : Math.max(0, Math.min(participantCount, LARGE_MEETING_ORDERED_CHAIR_COORDS.length))

  return LARGE_MEETING_ORDERED_CHAIR_COORDS.slice(0, count)
}

export function resolveLargeMeetingChairPositions(participantCount?: number) {
  return toTilePositions(resolveLargeMeetingChairCoords(participantCount))
}

export function resolveLargeMeetingTablePlacements(participantCount?: number): TilePlacement[] {
  void participantCount
  return LARGE_MEETING_TABLE_COORDS.map(([row, col]) => [row, col, T.CONF_LARGE])
}

const MEETING_ROOM_TABLE_TILES: TilePlacement[] = [
  [2, 3, T.CONF_SMALL], [2, 4, T.CONF_SMALL], [3, 3, T.CONF_SMALL], [3, 4, T.CONF_SMALL],
  [10, 3, T.CONF_SMALL], [10, 4, T.CONF_SMALL], [11, 3, T.CONF_SMALL], [11, 4, T.CONF_SMALL],
  [3, 9, T.CONF_MED], [3, 12, T.CONF_MED],
  [4, 9, T.CONF_MED], [4, 12, T.CONF_MED],
  [5, 9, T.CONF_MED], [5, 12, T.CONF_MED],
  [6, 9, T.CONF_MED], [6, 10, T.CONF_MED], [6, 11, T.CONF_MED], [6, 12, T.CONF_MED],
  ...resolveLargeMeetingTablePlacements(),
]

const MEETING_ROOM_DECOR_TILES: TilePlacement[] = [
  [1, 1, T.SHELF], [1, 5, T.WHITEBOARD], [5, 1, T.WHITEBOARD], [6, 5, T.PLANT], [8, 1, T.SHELF], [12, 5, T.WHITEBOARD],
  [1, 9, T.WHITEBOARD], [1, 12, T.WHITEBOARD], [1, 13, T.SHELF], [11, 9, T.WHITEBOARD], [11, 12, T.WHITEBOARD], [12, 8, T.PLANT],
  [1, 16, T.SHELF], [1, 17, T.WHITEBOARD], [1, 22, T.WHITEBOARD], [1, 24, T.SHELF], [12, 17, T.PLANT], [12, 23, T.PLANT],
]

function toTilePositions(tiles: TileCoord[]) {
  return tiles.map(([row, col]) => ({ col, row }))
}

export const MEETING_ROOM_CHAIR_POSITIONS: Record<MeetingRoom, Array<{ col: number; row: number }>> = {
  small: toTilePositions(MEETING_ROOM_CHAIR_COORDS.small),
  medium: toTilePositions(MEETING_ROOM_CHAIR_COORDS.medium),
  large: resolveLargeMeetingChairPositions(),
}

export const MEETING_ROOM_OVERFLOW_POSITIONS: Record<MeetingRoom, Array<{ col: number; row: number }>> = {
  small: toTilePositions(MEETING_ROOM_OVERFLOW_COORDS.small),
  medium: toTilePositions(MEETING_ROOM_OVERFLOW_COORDS.medium),
  large: toTilePositions(MEETING_ROOM_OVERFLOW_COORDS.large),
}

export const MEETING_ROOM_POSITIONS: Record<MeetingRoom, Array<{ col: number; row: number }>> = {
  small: [...MEETING_ROOM_CHAIR_POSITIONS.small, ...MEETING_ROOM_OVERFLOW_POSITIONS.small],
  medium: [...MEETING_ROOM_CHAIR_POSITIONS.medium, ...MEETING_ROOM_OVERFLOW_POSITIONS.medium],
  large: [...MEETING_ROOM_CHAIR_POSITIONS.large, ...MEETING_ROOM_OVERFLOW_POSITIONS.large],
}

const MEETING_MAP_V2: TileType[][] = createMeetingMap()



const OFFICE_MAP: TileType[][] = createOfficeMap()

const CEO_MAP: TileType[][] = [
  // row 0 - 상단 벽  [3,1,1,1,1,1,1,1,1,1,1,1,1,1,3,  3,1,1,1,1,1,1,1,1,1,3],
  // row 1 - 대표실 서가 / 비서석 일정 보드 + 파일함  [2,7,7,7,7,7,7,0,0,0,0,6,0,0,2,  2,15,15,7,7,7,0,0,6,0,2],
  // row 2 - 중앙 통로
  [2,0,0,0,0,0,0,0,0,0,0,0,0,0,2,  2,0,0,0,0,0,0,0,0,0,2],
  // row 3 - 대표 책상 / 비서 좌석 A
  [2,6,0,0,0,0,0,0,0,0,0,0,7,0,2,  2,0,0,0,0,15,0,7,0,0,2],
  // row 4 - 책상 중앙 (CEO 대기 위치) / 비서 좌석 A
  [2,0,0,0,0,0,0,11,0,0,0,0,0,0,2,  2,0,0,0,0,0,0,0,0,0,2],
  // row 5 - 책상 하단 / 비서 좌석 의자
  [2,0,0,0,0,0,0,5,0,0,0,0,0,0,2,  2,0,0,0,0,0,6,0,0,0,2],
  // row 6 - 대표실 방문 좌석 / 비서석 캐비닛  [2,0,0,0,0,0,5,5,5,0,0,0,6,0,2,  2,0,0,0,0,7,7,0,15,0,2],
  // row 7 - 복도 + 문  [2,0,0,0,6,0,0,0,0,0,0,0,0,0,9,  9,0,0,0,0,0,0,0,0,0,2],
  // row 8 - 비서석 대기 라운지
  [2,0,0,0,0,0,0,0,0,0,0,0,0,0,2,  2,0,13,13,8,8,13,13,0,0,2],
  // row 9 - 대표실 맞은편 라운지 / 비서 좌석 B
  [2,0,13,13,8,8,13,13,0,0,0,0,0,0,2,  2,0,0,0,0,0,0,7,0,0,2],
  // row 10 - 대표실 맞은편 라운지 / 비서 좌석 B
  [2,0,13,13,8,8,13,13,0,0,6,0,0,0,2,  2,0,11,0,0,15,0,7,0,6,2],
  // row 11 - 하단 복도
  [2,0,0,0,0,0,0,0,0,0,0,0,7,0,2,  2,0,5,0,0,0,0,7,0,0,2],
  // row 12 - 보조 보드 + 화분
  [2,0,0,0,0,0,0,0,0,0,0,0,0,0,2,  2,0,0,0,15,0,0,0,6,0,2],
  // row 13 - 하단 화분
  [2,6,0,0,0,0,0,0,0,0,0,0,0,6,2,  2,0,6,0,0,0,0,0,6,0,2],
  // row 14 - 하단 벽  [3,1,1,1,1,1,1,1,1,1,1,1,1,1,3,  3,1,1,1,1,1,1,1,1,1,3],
]

// 층별 맵 매핑
function createMeetingMap(): TileType[][] {
  const map: TileType[][] = Array.from({ length: MAP_ROWS }, (_, row) =>
    Array.from({ length: MAP_COLS }, (_, col): TileType => {
      const onTopOrBottomEdge = row === 0 || row === MAP_ROWS - 1
      const onOuterWall = col === 0 || col === MAP_COLS - 1
      const onDivider = col === 7 || col === 14

      if (onTopOrBottomEdge) {
        return col === 0 || col === 7 || col === 14 || col === MAP_COLS - 1
          ? T.CORNER
          : T.WALL_H
      }

      if (onOuterWall) {
        return T.WALL_V
      }

      if (onDivider) {
        return T.DIVIDER
      }

      return T.FLOOR
    }),
  )

  map[7][1] = T.DOOR
  map[7][8] = T.DOOR
  map[7][14] = T.DOOR

  placeTiles(map, MEETING_ROOM_TABLE_TILES)
  placeTiles(map, MEETING_ROOM_DECOR_TILES)

  const chairTiles: TilePlacement[] = [
    ...MEETING_ROOM_CHAIR_POSITIONS.small.map(({ row, col }) => [row, col, T.CHAIR] as TilePlacement),
    ...MEETING_ROOM_CHAIR_POSITIONS.medium.map(({ row, col }) => [row, col, T.CHAIR] as TilePlacement),
    ...MEETING_ROOM_CHAIR_POSITIONS.large.map(({ row, col }) => [row, col, T.CHAIR] as TilePlacement),
  ]
  placeTiles(map, chairTiles)

  return map
}

function createOfficeMap(): TileType[][] {
  return Array.from({ length: MAP_ROWS }, (_, row) =>
    Array.from({ length: MAP_COLS }, (_, col): TileType => {
      const onTopOrBottomEdge = row === 0 || row === MAP_ROWS - 1
      const onOuterWall = col === 0 || col === MAP_COLS - 1
      const onCorner = (
        (row === 0 || row === MAP_ROWS - 1) &&
        (col === 0 || col === MAP_COLS - 1)
      )

      if (onCorner) {
        return T.CORNER
      }

      if (onTopOrBottomEdge) {
        return T.WALL_H
      }

      if (onOuterWall) {
        return T.WALL_V
      }

      return T.FLOOR
    }),
  )
}

function cloneTileMap(map: TileType[][]): TileType[][] {
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

function addWhiteboards(map: TileType[][], positions: Array<[number, number]>) {
  placeTiles(map, positions.map(([row, col]) => [row, col, T.WHITEBOARD]))
}

function addPlants(map: TileType[][], positions: Array<[number, number]>) {
  placeTiles(map, positions.map(([row, col]) => [row, col, T.PLANT]))
}

function addWorkstation(map: TileType[][], topRow: number, leftCol: number) {
  placeTiles(map, [
    [topRow + 1, leftCol, T.COMPUTER],
    [topRow + 2, leftCol, T.CHAIR],
  ])
}

function addDeskAnchors(map: TileType[][], anchors: TileCoord[]) {
  anchors.forEach(([row, col]) => addWorkstation(map, row - 1, col))
}

function addMeetingZone(map: TileType[][], row: number, leftCol: number, width: number) {
  const tableWidth = width >= 5 ? 3 : 2
  fillArea(map, row, row, leftCol, leftCol + tableWidth - 1, T.TABLE)

  if (width >= 5) {
    if (row - 1 >= 1) {
      map[row - 1][leftCol] = T.CHAIR
      map[row - 1][leftCol + tableWidth - 1] = T.CHAIR
    }
    if (row + 1 <= MAP_ROWS - 2) {
      map[row + 1][leftCol] = T.CHAIR
      map[row + 1][leftCol + tableWidth - 1] = T.CHAIR
    }
    return
  }

  if (row - 1 >= 1) {
    map[row - 1][leftCol] = T.CHAIR
  }
  if (row + 1 <= MAP_ROWS - 2) {
    map[row + 1][leftCol + tableWidth - 1] = T.CHAIR
  }
}

function addMeetingZoneCentered(map: TileType[][], centerRow: number, centerCol: number, width: number) {
  const tableWidth = width >= 5 ? 3 : 2
  addMeetingZone(map, centerRow, centerCol - Math.floor(tableWidth / 2), width)
}

function addBreakoutLounge(map: TileType[][], topRow: number, leftCol: number) {
  placeTiles(map, [
    [topRow, leftCol, T.SOFA],
    [topRow, leftCol + 1, T.SOFA],
    [topRow, leftCol + 3, T.SOFA],
    [topRow, leftCol + 4, T.SOFA],
    [topRow, leftCol + 2, T.TABLE],
  ])
}

function addBreakoutLoungeCentered(map: TileType[][], centerRow: number, centerCol: number) {
  addBreakoutLounge(map, centerRow - 1, centerCol - 2)
}

function addArchiveShelves(map: TileType[][], topRow: number, leftCol: number, width: number, height = 2) {
  fillArea(map, topRow, topRow + height - 1, leftCol, leftCol + width - 1, T.SHELF)
}

function addArchiveBlock(map: TileType[][], topRow: number, leftCol: number) {
  addArchiveShelves(map, topRow, leftCol, 2, 2)
}

function addDividerColumn(map: TileType[][], col: number, rowStart: number, rowEnd: number) {
  fillArea(map, rowStart, rowEnd, col, col, T.DIVIDER)
}

function addDividerRow(map: TileType[][], row: number, colStart: number, colEnd: number) {
  fillArea(map, row, row, colStart, colEnd, T.DIVIDER)
}

function addWhiteboardRun(map: TileType[][], row: number, colStart: number, count: number) {
  addWhiteboards(map, Array.from({ length: count }, (_, index) => [row, colStart + index] as [number, number]))
}

function addStorageCredenza(map: TileType[][], row: number, centerCol: number, width = 3) {
  fillArea(map, row, row, centerCol - Math.floor(width / 2), centerCol - Math.floor(width / 2) + width - 1, T.SHELF)
}

function addPresentationIsland(map: TileType[][], row: number, col: number) {
  placeTiles(map, [
    [row, col, T.TABLE],
    [row, col + 1, T.TABLE],
  ])
}

function addStandingHub(map: TileType[][], row: number, col: number) {
  placeTiles(map, [
    [row, col, T.TABLE],
    [row, col - 1, T.CHAIR],
    [row, col + 1, T.CHAIR],
  ])
}

function addServerTowerRun(map: TileType[][], row: number, colStart: number, count: number) {
  placeTiles(map, Array.from({ length: count }, (_, index) => [row, colStart + index, T.COMPUTER] as TilePlacement))
}

function addLinearDesks(map: TileType[][], row: number, colStart: number, count: number) {
  placeTiles(map, Array.from({ length: count }, (_, index) => [row, colStart + index, T.COMPUTER] as TilePlacement))
  placeTiles(map, Array.from({ length: count }, (_, index) => [row + 1, colStart + index, T.CHAIR] as TilePlacement))
}

function addBoardWall(map: TileType[][], row: number, colStart: number, count: number) {
  addWhiteboardRun(map, row, colStart, count)
}

function addGalleryPlants(map: TileType[][]) {
  addPlants(map, [[2, 2], [2, 23], [12, 2], [12, 23]])
}

function applySharedOfficeLayout(map: TileType[][], deskAnchors: TileCoord[]) {
  resetOfficeInterior(map)
  addDeskAnchors(map, deskAnchors)
}

function applyCreativeOfficeLayout(map: TileType[][]) {
  applySharedOfficeLayout(map, OFFICE_DESK_LAYOUTS['2f'])
  addBoardWall(map, 2, 18, 5)
  addPresentationIsland(map, 5, 13)
  addMeetingZoneCentered(map, 6, 21, 4)
  addBreakoutLoungeCentered(map, 11, 17)
  addStorageCredenza(map, 12, 7, 3)
  addGalleryPlants(map)
}

function applyClientOfficeLayout(map: TileType[][]) {
  applySharedOfficeLayout(map, OFFICE_DESK_LAYOUTS['3f'])
  addStorageCredenza(map, 2, 4, 4)
  addDividerColumn(map, 15, 2, 12)
  addBoardWall(map, 2, 19, 4)
  addMeetingZoneCentered(map, 6, 21, 4)
  addStandingHub(map, 6, 15)
  addBreakoutLoungeCentered(map, 11, 20)
  addPlants(map, [[12, 2], [3, 24], [12, 24]])
}

function applySupportOfficeLayout(map: TileType[][]) {
  applySharedOfficeLayout(map, OFFICE_DESK_LAYOUTS['4f'])
  addDividerRow(map, 3, 13, 22)
  addArchiveBlock(map, 2, 18)
  addArchiveBlock(map, 2, 21)
  addBoardWall(map, 5, 14, 3)
  addMeetingZoneCentered(map, 8, 21, 4)
  addBreakoutLoungeCentered(map, 12, 14)
  addArchiveBlock(map, 10, 22)
  addPlants(map, [[12, 2], [6, 24]])
}

function applyPlanningOfficeLayout(map: TileType[][]) {
  applySharedOfficeLayout(map, OFFICE_DESK_LAYOUTS['5f'])
  addBoardWall(map, 2, 17, 6)
  addDividerRow(map, 5, 12, 22)
  addMeetingZoneCentered(map, 8, 20, 5)
  addPresentationIsland(map, 4, 13)
  addStandingHub(map, 11, 15)
  addPlants(map, [[2, 24], [12, 24]])
}

function applyOpsOfficeLayout(map: TileType[][]) {
  applySharedOfficeLayout(map, OFFICE_DESK_LAYOUTS['6f'])
  addStorageCredenza(map, 2, 4, 3)
  addDividerColumn(map, 17, 2, 12)
  addServerTowerRun(map, 3, 20, 4)
  addDividerRow(map, 5, 19, 23)
  addBoardWall(map, 8, 19, 4)
  addMeetingZoneCentered(map, 10, 14, 4)
  addPlants(map, [[12, 24]])
}

function applyDevelopmentOfficeLayout(map: TileType[][]) {
  applySharedOfficeLayout(map, OFFICE_DESK_LAYOUTS['7f'])
  addBoardWall(map, 2, 18, 5)
  addLinearDesks(map, 3, 13, 3)
  addMeetingZoneCentered(map, 8, 21, 5)
  addStandingHub(map, 7, 14)
  addDividerColumn(map, 23, 6, 10)
  addBreakoutLoungeCentered(map, 12, 18)
  addPlants(map, [[12, 2], [2, 24]])
}

function applyGovernanceOfficeLayout(map: TileType[][]) {
  applySharedOfficeLayout(map, OFFICE_DESK_LAYOUTS['8f'])
  addArchiveShelves(map, 2, 2, 4, 1)
  addArchiveShelves(map, 11, 2, 4, 1)
  addDividerColumn(map, 15, 2, 5)
  addDividerColumn(map, 15, 9, 12)
  addStorageCredenza(map, 3, 19, 4)
  addBoardWall(map, 2, 18, 5)
  addMeetingZoneCentered(map, 7, 20, 5)
  addArchiveShelves(map, 11, 18, 5, 1)
  addPlants(map, [[12, 24], [12, 2], [3, 24]])
}

function applySecurityOfficeLayout(map: TileType[][]) {
  applySharedOfficeLayout(map, OFFICE_DESK_LAYOUTS['9f'])
  addStorageCredenza(map, 2, 4, 4)
  addBoardWall(map, 2, 18, 4)
  addDividerColumn(map, 18, 3, 11)
  addServerTowerRun(map, 4, 21, 3)
  addServerTowerRun(map, 6, 21, 3)
  addDividerRow(map, 8, 19, 23)
  addMeetingZoneCentered(map, 10, 14, 4)
  addPlants(map, [[12, 24]])
}

function applyExecutiveOfficeLayout(map: TileType[][]) {
  applySharedOfficeLayout(map, OFFICE_DESK_LAYOUTS['10f'])
  addArchiveBlock(map, 2, 2)
  addStorageCredenza(map, 3, 13, 4)
  addBoardWall(map, 2, 18, 5)
  addDividerRow(map, 5, 17, 23)
  addMeetingZoneCentered(map, 8, 21, 5)
  addBreakoutLoungeCentered(map, 12, 15)
  addPlants(map, [[12, 24], [2, 24]])
}

const MARKETING_MAP = cloneTileMap(OFFICE_MAP)

const SALES_MAP = cloneTileMap(OFFICE_MAP)

const SUPPORT_MAP = cloneTileMap(OFFICE_MAP)

const PLANNING_MAP = cloneTileMap(OFFICE_MAP)

const QA_DEVOPS_MAP = cloneTileMap(OFFICE_MAP)

const DEVELOPMENT_MAP = cloneTileMap(OFFICE_MAP)

const MANAGEMENT_MAP = cloneTileMap(OFFICE_MAP)

const SECURITY_MAP = cloneTileMap(OFFICE_MAP)

const EXECUTIVE_MAP = cloneTileMap(OFFICE_MAP)

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
  '1f':  MEETING_MAP_V2,
  '2f':  MARKETING_MAP,
  '3f':  SALES_MAP,
  '4f':  SUPPORT_MAP,
  '5f':  PLANNING_MAP,
  '6f':  QA_DEVOPS_MAP,
  '7f':  DEVELOPMENT_MAP,
  '8f':  MANAGEMENT_MAP,
  '9f':  SECURITY_MAP,
  '10f': EXECUTIVE_MAP,
  '11f': CEO_MAP,
}

// 에이전트 초기 대기 위치 (col, row)
export const DESK_TILE_POSITIONS: Record<string, { col: number; row: number }> = {
  'ceo-sec': { col: 17, row: 10 },
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
  'sal-lead': { col: 2,  row: 4 },
  'sal-01':   { col: 2,  row: 10 },
  'exp-01':   { col: 7,  row: 4 },
  'b2g-01':   { col: 12, row: 4 },
  'glb-01':   { col: 12, row: 10 },
  'pre-01':   { col: 7,  row: 4 },
  'mkt-01':   { col: 2,  row: 4 },
  'trd-01':   { col: 7,  row: 4 },
  'cust-01':  { col: 12, row: 4 },
  'fin-01':   { col: 12, row: 4 },
  'hr-01':    { col: 17, row: 4 },
  'leg-01':   { col: 12, row: 10 },
}

export const AGENT_TILE_POSITIONS: Record<string, { col: number; row: number }> = {
  // 대표실 11F
  'ceo-sec':    { col: 17, row: 12 },

  // 전략·비서 10F
  'exec-cto':  { col: 7, row: 6 },
  'exec-coo':  { col: 7, row: 12 },

  // 연구개발 9F
  'sec-lead':  { col: 2,  row: 6 },
  'sec-01':    { col: 7,  row: 6 },
  'sec-02':    { col: 2,  row: 12 },

  // 경영지원·데이터 8F
  'com-01':    { col: 2,  row: 6 },
  'mgmt-hr':   { col: 7,  row: 6 },
  'mgmt-fin':  { col: 7,  row: 12 },
  'fin-01':    { col: 12, row: 6 },
  'hr-01':     { col: 17, row: 6 },
  'leg-01':    { col: 12, row: 12 },

  // 자동화개발 7F
  'dev-lead':  { col: 2,  row: 6 },
  'dev-01':    { col: 7,  row: 6 },
  'dev-02':    { col: 2,  row: 12 },
  'dev-03':    { col: 7,  row: 12 },

  // 운영·오류대응 6F
  'qa-lead':   { col: 2,  row: 6 },
  'qa-01':     { col: 2,  row: 12 },
  'ops-lead':  { col: 7,  row: 6 },
  'ops-01':    { col: 7,  row: 12 },

  // 제품기획 5F
  'plan-lead': { col: 2,  row: 6 },
  'plan-01':   { col: 7,  row: 6 },

  // 교육·서비스 4F
  'sup-lead':  { col: 2,  row: 6 },
  'sup-01':    { col: 7,  row: 6 },
  'cust-01':   { col: 12, row: 6 },

  // 세일즈 3F
  'sal-lead':  { col: 2,  row: 6 },
  'sal-01':    { col: 2,  row: 12 },
  'exp-01':    { col: 7,  row: 6 },
  'b2g-01':    { col: 12, row: 6 },
  'glb-01':    { col: 12, row: 12 },

  // 마케팅·리서치 2F
  'pre-01':    { col: 7,  row: 6 },
  'mkt-01':    { col: 2,  row: 6 },
  'trd-01':    { col: 7,  row: 6 },
}

export const WORK_SEAT_TILE_POSITIONS: Record<string, { col: number; row: number }> = {
  'ceo-sec':    { col: 17, row: 11 },
  'exec-cto':  { col: 7,  row: 5 },
  'exec-coo':  { col: 7,  row: 11 },
  'sec-lead':  { col: 2,  row: 5 },
  'sec-01':    { col: 7,  row: 5 },
  'sec-02':    { col: 2,  row: 11 },
  'com-01':    { col: 2,  row: 5 },
  'mgmt-hr':   { col: 7,  row: 5 },
  'mgmt-fin':  { col: 7,  row: 11 },
  'fin-01':    { col: 12, row: 5 },
  'hr-01':     { col: 17, row: 5 },
  'leg-01':    { col: 12, row: 11 },
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
  'cust-01':   { col: 12, row: 5 },
  'sal-lead':  { col: 2,  row: 5 },
  'sal-01':    { col: 2,  row: 11 },
  'exp-01':    { col: 7,  row: 5 },
  'b2g-01':    { col: 12, row: 5 },
  'glb-01':    { col: 12, row: 11 },
  'pre-01':    { col: 7,  row: 5 },
  'mkt-01':    { col: 2,  row: 5 },
  'trd-01':    { col: 7,  row: 5 },
}
