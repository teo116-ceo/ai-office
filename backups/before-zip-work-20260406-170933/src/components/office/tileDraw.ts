import { T, TILE_SIZE } from './officeLayout'

const S = TILE_SIZE

// ─── 팔레트 ──────────────────────────────────────────────────────────────────
export const P = {
  // 바닥
  floorA: '#2a2a3c', floorB: '#242436', floorLine: '#32324a',
  floorCafeA: '#241c10', floorCafeB: '#1e1608',
  // 벽
  wallFace: '#1a1a2c', wallTop: '#44446a', wallBorder: '#52527a',
  // 책상
  deskTop: '#7a5c30', deskFace: '#5a3e18', deskShadow: '#3a2608', deskEdge: '#9a7840',
  deskItem1: '#c8d8e8', deskItem2: '#e8d0a0', // 모니터/서류
  // 의자
  chairBase: '#1e3a6a', chairSeat: '#2e5aaa', chairBack: '#243280', chairArm: '#162850',
  // 식물
  plantPot: '#6a3a1a', plantSoil: '#3a2010', plantGrn: '#245a14', plantLt: '#34801e', plantDrk: '#1a3e0c',
  // 책장
  shelfWood: '#4a3010', books: ['#e94560','#64ffda','#f77f00','#9b5de5','#fee440','#06d6a0','#f15bb5'],
  // 테이블
  tableTop: '#5a4a38', tableFace: '#3a2e20', tableLeg: '#2a1e10',
  // 컴퓨터
  pcBody: '#141e2e', pcBase: '#0e1620', screenBg: '#030a14',
  screenGlow: '#00d4ff', screenLine: '#00486a', screenText: '#00ff88',
  powerLed: '#00ff44',
  // 문
  doorWood: '#5a3e2a', doorDark: '#3a2010', doorKnob: '#ffd700', doorFrame: '#3a3050',
  // 소파
  sofaBase: '#2a1e58', sofaSeat: '#3e308a', sofaCushA: '#4e40a0', sofaCushB: '#5e50b0', sofaArm: '#1e1440',
  // 카페 카운터
  counterTop: '#7a5030', counterFace: '#5a3418', counterEdge: '#9a7050',
  machineBody: '#2a2030', machinePanel: '#1a1020', machineAccent: '#c8a020', machineLed: '#00ff88',
  coffeeWarm: '#3a1a08',
  // 화이트보드
  wbFrame: '#2a2a40', wbSurface: '#d8dce8', wbLine: '#b0b4c0', wbText: '#204080',
  // 회의실 테이블
  confL: '#1e2e10', confLedge: '#2e4818', confM: '#10202e', confMedge: '#183040', confSm: '#2e1040', confSmedge: '#481860',
  // 구분벽
  divider: '#1e1e30',
}

// 헬퍼 - 16진수 컬러에 alpha 적용
function rgba(hex: string, a: number) {
  const r = parseInt(hex.slice(1,3),16)
  const g = parseInt(hex.slice(3,5),16)
  const b = parseInt(hex.slice(5,7),16)
  return `rgba(${r},${g},${b},${a})`
}

export function drawTile(
  ctx: CanvasRenderingContext2D,
  type: number,
  x: number,
  y: number,
  tick: number,
  isCafe: boolean,
  accentColor: string,
) {
  ctx.save()
  ctx.translate(x, y)

  const fa = isCafe ? P.floorCafeA : P.floorA
  const fb = isCafe ? P.floorCafeB : P.floorB

  switch (type) {
    // ── 바닥 ───────────────────────────────────────────────────────────────
    case T.FLOOR: {
      const even = (Math.floor(x/S) + Math.floor(y/S)) % 2 === 0
      ctx.fillStyle = even ? fa : fb
      ctx.fillRect(0, 0, S, S)
      ctx.strokeStyle = P.floorLine
      ctx.lineWidth = 0.4
      ctx.strokeRect(0.5, 0.5, S-1, S-1)
      if ((Math.floor(x / S) + Math.floor(y / S)) % 5 === 0) {
        ctx.fillStyle = rgba(accentColor, 0.09)
        ctx.fillRect(0, 0, S, 3)
      }
      // 약한 빛 반사
      ctx.fillStyle = rgba('#ffffff', 0.02)
      ctx.fillRect(1, 1, S-2, S/2)
      break
    }

    // ── 벽 ────────────────────────────────────────────────────────────────
    case T.WALL_H: case T.WALL_V: case T.CORNER: case T.DIVIDER: {
      const isDiv = type === T.DIVIDER
      ctx.fillStyle = isDiv ? P.divider : P.wallFace
      ctx.fillRect(0, 0, S, S)
      if (!isDiv) {
        ctx.fillStyle = P.wallTop
        if (type === T.WALL_V) {
          ctx.fillRect(0, 0, 10, S)
          ctx.fillStyle = P.wallBorder; ctx.fillRect(10, 0, 1, S)
        } else {
          ctx.fillRect(0, 0, S, 12)
          ctx.fillStyle = P.wallBorder; ctx.fillRect(0, 12, S, 1)
        }
        if (type === T.CORNER) {
          ctx.fillStyle = P.wallTop
          ctx.fillRect(0, 0, S, 12)
          ctx.fillRect(0, 0, 10, S)
        }
        ctx.fillStyle = rgba(accentColor, 0.14)
        if (type === T.WALL_V) {
          ctx.fillRect(0, 0, 3, S)
        } else {
          ctx.fillRect(0, 0, S, 3)
        }
        // 벽 텍스처 줄
        ctx.fillStyle = rgba('#ffffff', 0.03)
        ctx.fillRect(0, 0, S, 2)
      }
      break
    }

    // ── 책상 ──────────────────────────────────────────────────────────────
    case T.DESK: {
      ctx.fillStyle = fa; ctx.fillRect(0, 0, S, S)
      // 책상 몸체
      ctx.fillStyle = P.deskShadow; ctx.fillRect(3, 12, S-6, S-14)
      ctx.fillStyle = P.deskFace;   ctx.fillRect(3, 13, S-6, S-16)
      ctx.fillStyle = P.deskEdge;   ctx.fillRect(3, 13, S-6, 4)
      ctx.fillStyle = P.deskTop;    ctx.fillRect(4, 17, S-8, S-20)
      // 나무결 선
      ctx.strokeStyle = rgba(P.deskShadow, 0.4); ctx.lineWidth = 0.5
      for (let lx = 6; lx < S-6; lx += 5) {
        ctx.beginPath(); ctx.moveTo(lx, 18); ctx.lineTo(lx, S-5); ctx.stroke()
      }
      // 서류
      ctx.fillStyle = P.deskItem2; ctx.fillRect(6, 18, 10, 8)
      ctx.fillStyle = rgba('#000', 0.2); ctx.fillRect(7, 19, 8, 1); ctx.fillRect(7, 21, 6, 1)
      break
    }

    // ── 컴퓨터 ────────────────────────────────────────────────────────────
    case T.COMPUTER: {
      ctx.fillStyle = fa; ctx.fillRect(0, 0, S, S)
      // 책상
      ctx.fillStyle = P.deskShadow; ctx.fillRect(3, 12, S-6, S-14)
      ctx.fillStyle = P.deskFace;   ctx.fillRect(3, 13, S-6, S-16)
      ctx.fillStyle = P.deskEdge;   ctx.fillRect(3, 13, S-6, 4)
      ctx.fillStyle = P.deskTop;    ctx.fillRect(4, 17, S-8, S-20)
      // 모니터 받침
      ctx.fillStyle = P.pcBase;  ctx.fillRect(14, 14, 4, 5)
      ctx.fillStyle = P.pcBase;  ctx.fillRect(11, 19, 10, 2)
      // 모니터 프레임
      ctx.fillStyle = P.pcBody;  ctx.fillRect(7, 5, S-14, 14)
      ctx.fillStyle = P.pcBase;  ctx.fillRect(8, 6, S-16, 12)
      // 화면 - 깜빡이는 글로우
      const glowA = 0.5 + Math.sin(tick * 0.04) * 0.15
      ctx.fillStyle = P.screenBg; ctx.fillRect(9, 7, S-18, 10)
      // 코드 줄 시뮬레이션
      const lineColors = [P.screenText, P.screenGlow, P.screenLine, P.screenText]
      for (let li = 0; li < 3; li++) {
        const lw = 4 + ((tick + li * 3) % 8)
        ctx.fillStyle = rgba(lineColors[li % lineColors.length], 0.6 + Math.sin(tick * 0.03 + li) * 0.2)
        ctx.fillRect(10, 8 + li * 3, lw, 1.5)
      }
      // 화면 글로우
      ctx.fillStyle = rgba(P.screenGlow, glowA * 0.15)
      ctx.fillRect(9, 7, S-18, 10)
      // 전원 LED
      ctx.fillStyle = P.powerLed
      ctx.beginPath(); ctx.arc(S-9, 18, 1.5, 0, Math.PI*2); ctx.fill()
      break
    }

    // ── 의자 ──────────────────────────────────────────────────────────────
    case T.CHAIR: {
      ctx.fillStyle = fa; ctx.fillRect(0, 0, S, S)
      // 팔걸이
      ctx.fillStyle = P.chairArm
      ctx.fillRect(7, 14, 3, 12); ctx.fillRect(S-10, 14, 3, 12)
      // 등받이
      ctx.fillStyle = P.chairBack; ctx.fillRect(8, 8, S-16, 10)
      ctx.fillStyle = rgba('#ffffff', 0.07); ctx.fillRect(9, 9, S-18, 3)
      // 방석
      ctx.fillStyle = P.chairBase; ctx.fillRect(8, 18, S-16, S-22)
      ctx.fillStyle = P.chairSeat; ctx.fillRect(8, 18, S-16, 5)
      ctx.fillStyle = rgba('#ffffff', 0.07); ctx.fillRect(9, 19, S-18, 2)
      break
    }

    // ── 식물 ──────────────────────────────────────────────────────────────
    case T.PLANT: {
      ctx.fillStyle = fa; ctx.fillRect(0, 0, S, S)
      // 화분
      ctx.fillStyle = P.plantPot; ctx.fillRect(12, S-14, 16, 11)
      ctx.fillStyle = P.plantSoil; ctx.fillRect(13, S-14, 14, 3)
      ctx.fillStyle = rgba('#000', 0.3); ctx.fillRect(12, S-4, 16, 1)
      // 잎
      ctx.fillStyle = P.plantDrk; ctx.fillRect(9, 10, 8, 18); ctx.fillRect(22, 12, 8, 14)
      ctx.fillStyle = P.plantGrn; ctx.fillRect(11, 8, 10, 16); ctx.fillRect(20, 12, 8, 12)
      ctx.fillStyle = P.plantLt; ctx.fillRect(14, 5, 12, 14)
      ctx.fillStyle = rgba(P.plantLt, 0.5); ctx.fillRect(16, 4, 6, 5)
      break
    }

    // ── 책장 ──────────────────────────────────────────────────────────────
    case T.SHELF: {
      ctx.fillStyle = P.wallFace; ctx.fillRect(0, 0, S, S)
      ctx.fillStyle = P.shelfWood; ctx.fillRect(2, 3, S-4, S-6)
      // 선반 판자
      ctx.fillStyle = rgba('#000', 0.3)
      ctx.fillRect(2, 3, S-4, 2)
      ctx.fillRect(2, S/2-1, S-4, 2)
      // 책들
      let bx = 4
      const books = P.books
      for (let bi = 0; bi < 8 && bx < S-6; bi++) {
        const bw = 3 + (bi % 3)
        const bh = 6 + (bi % 4)
        ctx.fillStyle = books[bi % books.length]
        ctx.fillRect(bx, S/2 - bh - 2, bw, bh)
        ctx.fillStyle = rgba('#000', 0.2); ctx.fillRect(bx, S/2 - bh - 2, 1, bh)
        bx += bw + 1
      }
      bx = 4
      for (let bi = 0; bi < 6 && bx < S-6; bi++) {
        const bw = 4 + (bi % 2)
        const bh = 5 + (bi % 3)
        ctx.fillStyle = books[(bi+3) % books.length]
        ctx.fillRect(bx, S - bh - 5, bw, bh)
        bx += bw + 2
      }
      break
    }

    // ── 회의 테이블 ───────────────────────────────────────────────────────
    case T.TABLE: {
      ctx.fillStyle = fa; ctx.fillRect(0, 0, S, S)
      ctx.fillStyle = P.tableLeg; ctx.fillRect(5, 5, 3, S-10); ctx.fillRect(S-8, 5, 3, S-10)
      ctx.fillStyle = P.tableFace; ctx.fillRect(3, 6, S-6, S-12)
      ctx.fillStyle = P.tableTop; ctx.fillRect(3, 6, S-6, 6)
      ctx.fillStyle = rgba('#ffffff', 0.06); ctx.fillRect(4, 7, S-8, 2)
      break
    }

    // ── 문 ────────────────────────────────────────────────────────────────
    case T.DOOR: {
      ctx.fillStyle = fa; ctx.fillRect(0, 0, S, S)
      ctx.fillStyle = P.doorFrame; ctx.fillRect(5, 2, S-10, S-4)
      ctx.fillStyle = P.doorDark; ctx.fillRect(6, 3, S-12, S-6)
      ctx.fillStyle = P.doorWood; ctx.fillRect(7, 4, S-14, S-8)
      // 문 패널
      ctx.fillStyle = rgba('#000', 0.2)
      ctx.fillRect(9, 6, S-18, (S-14)/2)
      ctx.fillRect(9, 6 + (S-14)/2 + 2, S-18, (S-14)/2)
      // 손잡이
      ctx.fillStyle = P.doorKnob
      ctx.beginPath(); ctx.arc(S-12, S/2, 2.5, 0, Math.PI*2); ctx.fill()
      ctx.fillStyle = rgba(P.doorKnob, 0.5); ctx.fillRect(S-14, S/2-0.5, 4, 1)
      break
    }

    // ── 소파 ──────────────────────────────────────────────────────────────
    case T.SOFA: {
      ctx.fillStyle = isCafe ? P.floorCafeA : fa; ctx.fillRect(0, 0, S, S)
      // 팔걸이
      ctx.fillStyle = P.sofaArm; ctx.fillRect(3, 8, 5, S-12); ctx.fillRect(S-8, 8, 5, S-12)
      // 등받이
      ctx.fillStyle = P.sofaBase; ctx.fillRect(3, 8, S-6, 12)
      ctx.fillStyle = rgba('#ffffff', 0.05); ctx.fillRect(4, 9, S-8, 3)
      // 방석
      ctx.fillStyle = P.sofaSeat; ctx.fillRect(8, 20, S-16, S-24)
      ctx.fillStyle = P.sofaCushA; ctx.fillRect(8, 20, (S-20)/2, S-24)
      ctx.fillStyle = P.sofaCushB; ctx.fillRect(8 + (S-20)/2 + 2, 20, (S-20)/2, S-24)
      ctx.fillStyle = rgba('#ffffff', 0.08); ctx.fillRect(9, 21, (S-22)/2, 2)
      break
    }

    // ── 카페 카운터 ───────────────────────────────────────────────────────
    case T.CAFE_COUNTER: {
      ctx.fillStyle = P.floorCafeA; ctx.fillRect(0, 0, S, S)
      // 카운터 몸체
      ctx.fillStyle = P.counterFace; ctx.fillRect(2, 10, S-4, S-12)
      ctx.fillStyle = P.counterEdge; ctx.fillRect(2, 10, S-4, 4)
      ctx.fillStyle = P.counterTop;  ctx.fillRect(2, 10, S-4, 2)
      // 에스프레소 머신
      ctx.fillStyle = P.machineBody; ctx.fillRect(6, 2, 18, 10)
      ctx.fillStyle = P.machinePanel; ctx.fillRect(8, 3, 14, 7)
      // 머신 패널 디테일
      ctx.fillStyle = P.machineAccent; ctx.fillRect(9, 4, 12, 2)
      const ledPulse = 0.6 + Math.sin(tick * 0.06) * 0.4
      ctx.fillStyle = rgba(P.machineLed, ledPulse)
      ctx.beginPath(); ctx.arc(21, 7, 1.5, 0, Math.PI*2); ctx.fill()
      // 커피 추출구
      ctx.fillStyle = P.machineBody; ctx.fillRect(11, 9, 4, 3); ctx.fillRect(19, 9, 4, 3)
      // 김 (랜덤하게 올라가는 효과)
      if (tick % 30 < 20) {
        ctx.fillStyle = rgba('#ffffff', 0.08)
        ctx.fillRect(12, 6, 2, 3); ctx.fillRect(20, 6, 2, 3)
      }
      break
    }

    // ── 화이트보드 ────────────────────────────────────────────────────────
    case T.WHITEBOARD: {
      ctx.fillStyle = fa; ctx.fillRect(0, 0, S, S)
      ctx.fillStyle = P.wbFrame; ctx.fillRect(2, 3, S-4, S-8)
      ctx.fillStyle = P.wbSurface; ctx.fillRect(4, 5, S-8, S-12)
      // 마커 선
      ctx.strokeStyle = P.wbText; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(7, 10); ctx.lineTo(16, 10); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(7, 14); ctx.lineTo(20, 14); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(7, 18); ctx.lineTo(13, 18); ctx.stroke()
      // 차트 박스
      ctx.strokeStyle = rgba(P.wbText, 0.5); ctx.lineWidth = 0.5
      ctx.strokeRect(22, 8, 10, 10)
      ctx.beginPath(); ctx.moveTo(22,18); ctx.lineTo(25,12); ctx.lineTo(28,15); ctx.lineTo(32,9); ctx.stroke()
      // 마커 트레이
      ctx.fillStyle = P.wbFrame; ctx.fillRect(4, S-7, S-8, 3)
      break
    }

    // ── 대회의실 테이블 ───────────────────────────────────────────────────
    case T.CONF_LARGE: {
      ctx.fillStyle = fa; ctx.fillRect(0, 0, S, S)
      ctx.fillStyle = P.confL; ctx.fillRect(2, 2, S-4, S-4)
      ctx.fillStyle = P.confLedge; ctx.fillRect(2, 2, S-4, 5)
      ctx.fillStyle = rgba('#ffffff', 0.04); ctx.fillRect(3, 3, S-6, 2)
      // 반사
      ctx.fillStyle = rgba('#ffffff', 0.03)
      ctx.beginPath(); ctx.ellipse(S/2, S/2, S/3, 3, 0, 0, Math.PI*2); ctx.fill()
      break
    }

    // ── 중회의실 테이블 ───────────────────────────────────────────────────
    case T.CONF_MED: {
      ctx.fillStyle = fa; ctx.fillRect(0, 0, S, S)
      ctx.fillStyle = P.confM; ctx.fillRect(3, 3, S-6, S-6)
      ctx.fillStyle = P.confMedge; ctx.fillRect(3, 3, S-6, 5)
      ctx.fillStyle = rgba('#ffffff', 0.04); ctx.fillRect(4, 4, S-8, 2)
      break
    }

    // ── 소회의실 테이블 ───────────────────────────────────────────────────
    case T.CONF_SMALL: {
      ctx.fillStyle = fa; ctx.fillRect(0, 0, S, S)
      ctx.fillStyle = P.confSm; ctx.fillRect(4, 4, S-8, S-8)
      ctx.fillStyle = P.confSmedge; ctx.fillRect(4, 4, S-8, 5)
      ctx.fillStyle = rgba('#ffffff', 0.04); ctx.fillRect(5, 5, S-10, 2)
      break
    }

    default: {
      ctx.fillStyle = fa; ctx.fillRect(0, 0, S, S)
    }
  }

  // 컴퓨터 타일 주변 화면 글로우 (바닥에 반사되는 느낌)
  if (type === T.COMPUTER) {
    ctx.fillStyle = rgba(accentColor, 0.04 + Math.sin(tick * 0.04) * 0.02)
    ctx.fillRect(0, 0, S, S)
  }

  ctx.restore()
}
