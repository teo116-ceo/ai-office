import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'
import { DEPARTMENTS } from '@/types'
import type { DepartmentId, Message, Task } from '@/types'

// ─── 색상 상수 ───────────────────────────────────────────────────────────────
const COLOR = {
  PRIMARY: '1E3A5F',    // 헤더 배경 (짙은 네이비)
  ACCENT: '2563EB',     // 강조색 (블루)
  HEADER_BG: 'EFF6FF',  // 연한 파란 배경
  ROW_ALT: 'F8FAFF',    // 테이블 홀수행 배경
  BORDER: 'BFDBFE',     // 테이블 테두리
  TEXT_MAIN: '1E293B',  // 본문 텍스트
  TEXT_MUTED: '64748B', // 보조 텍스트
  GREEN: '16A34A',      // 완료
  ORANGE: 'EA580C',     // 진행 중
  RED: 'DC2626',        // 실패
  GRAY: '6B7280',       // 대기
  YELLOW: 'D97706',     // 승인 대기
  WHITE: 'FFFFFF',
}

const STATUS_LABEL: Record<Task['status'], string> = {
  completed: '완료',
  in_progress: '진행 중',
  awaiting_approval: '승인 대기',
  pending: '대기',
  failed: '실패',
}

const STATUS_COLOR: Record<Task['status'], string> = {
  completed: COLOR.GREEN,
  in_progress: COLOR.ORANGE,
  awaiting_approval: COLOR.YELLOW,
  pending: COLOR.GRAY,
  failed: COLOR.RED,
}

// ─── 날짜 포맷 ───────────────────────────────────────────────────────────────
function formatKo(date: Date): string {
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  })
}

function formatDatetime(date: Date): string {
  return date.toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatDateFilename(date: Date): string {
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).replace(/\. /g, '-').replace('.', '')
}

// ─── 공통 테두리 ─────────────────────────────────────────────────────────────
function makeBorder() {
  const b = { style: BorderStyle.SINGLE, size: 1, color: COLOR.BORDER }
  return { top: b, bottom: b, left: b, right: b }
}

// ─── 헤더 셀 ─────────────────────────────────────────────────────────────────
function headerCell(text: string, width: number): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: makeBorder(),
    shading: { fill: COLOR.PRIMARY, type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text, bold: true, color: COLOR.WHITE, size: 18, font: 'Arial' })],
      }),
    ],
  })
}

// ─── 데이터 셀 ───────────────────────────────────────────────────────────────
function dataCell(
  text: string,
  width: number,
  opts: { bold?: boolean; color?: string; center?: boolean; shade?: string } = {}
): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: makeBorder(),
    shading: opts.shade ? { fill: opts.shade, type: ShadingType.CLEAR } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [
      new Paragraph({
        alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
        children: [
          new TextRun({
            text,
            bold: opts.bold,
            color: opts.color ?? COLOR.TEXT_MAIN,
            size: 18,
            font: 'Arial',
          }),
        ],
      }),
    ],
  })
}

// ─── 섹션 제목 단락 ──────────────────────────────────────────────────────────
function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 360, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR.ACCENT, space: 4 } },
    children: [new TextRun({ text, bold: true, size: 26, color: COLOR.PRIMARY, font: 'Arial' })],
  })
}

// ─── 요약 카드 테이블 (2 x 2) ────────────────────────────────────────────────
function buildSummaryTable(tasks: Task[]): Table {
  const completed = tasks.filter((t) => t.status === 'completed').length
  const inProgress = tasks.filter((t) => t.status === 'in_progress').length
  const failed = tasks.filter((t) => t.status === 'failed').length
  const awaiting = tasks.filter((t) => t.status === 'awaiting_approval').length

  const cardWidth = 2250 // 총 9000 / 4

  function statCell(label: string, value: string, valueColor: string): TableCell {
    return new TableCell({
      width: { size: cardWidth, type: WidthType.DXA },
      borders: makeBorder(),
      shading: { fill: COLOR.HEADER_BG, type: ShadingType.CLEAR },
      margins: { top: 160, bottom: 160, left: 200, right: 200 },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: value, bold: true, size: 48, color: valueColor, font: 'Arial' })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 60 },
          children: [new TextRun({ text: label, size: 18, color: COLOR.TEXT_MUTED, font: 'Arial' })],
        }),
      ],
    })
  }

  return new Table({
    width: { size: 9000, type: WidthType.DXA },
    columnWidths: [cardWidth, cardWidth, cardWidth, cardWidth],
    rows: [
      new TableRow({
        children: [
          statCell('총 업무', String(tasks.length), COLOR.PRIMARY),
          statCell('완료', String(completed), COLOR.GREEN),
          statCell('진행 중', String(inProgress), COLOR.ORANGE),
          statCell('실패 / 대기', `${failed} / ${awaiting}`, COLOR.RED),
        ],
      }),
    ],
  })
}

// ─── 부서별 업무 테이블 ───────────────────────────────────────────────────────
function buildTasksTable(tasks: Task[]): Table {
  // 열 너비: 번호 360 / 제목 3600 / 담당 부서 1800 / 상태 900 / 생성 시각 2340
  const COL = [360, 3600, 1800, 900, 2340]

  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      headerCell('#', COL[0]),
      headerCell('업무 제목', COL[1]),
      headerCell('담당 부서', COL[2]),
      headerCell('상태', COL[3]),
      headerCell('생성 시각', COL[4]),
    ],
  })

  const sorted = [...tasks].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

  const dataRows = sorted.map((task, idx) => {
    const deptNames = task.assignedTo.map((id) => DEPARTMENTS[id]?.name ?? id).join(', ')
    const shade = idx % 2 === 1 ? COLOR.ROW_ALT : COLOR.WHITE

    return new TableRow({
      children: [
        dataCell(String(idx + 1), COL[0], { center: true, shade }),
        dataCell(task.title, COL[1], { shade }),
        dataCell(deptNames || '미배정', COL[2], { shade }),
        dataCell(STATUS_LABEL[task.status], COL[3], {
          bold: true,
          color: STATUS_COLOR[task.status],
          center: true,
          shade,
        }),
        dataCell(formatDatetime(task.createdAt), COL[4], { color: COLOR.TEXT_MUTED, shade }),
      ],
    })
  })

  return new Table({
    width: { size: 9000, type: WidthType.DXA },
    columnWidths: COL,
    rows: [headerRow, ...dataRows],
  })
}

// ─── 일일 브리핑 메시지 추출 ─────────────────────────────────────────────────
function extractBriefingMessages(messages: Message[]): Message[] {
  return messages.filter(
    (msg) => msg.type === 'system' && msg.senderName.includes('브리핑')
  )
}

// ─── 최근 대화 요약 테이블 ────────────────────────────────────────────────────
function buildMessagesTable(messages: Message[]): Table {
  const COL = [1440, 5760, 1800]

  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      headerCell('발신자', COL[0]),
      headerCell('내용 요약', COL[1]),
      headerCell('시각', COL[2]),
    ],
  })

  const recent = [...messages]
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, 20)

  const dataRows = recent.map((msg, idx) => {
    const shade = idx % 2 === 1 ? COLOR.ROW_ALT : COLOR.WHITE
    const summary = msg.content.replace(/\n+/g, ' ').slice(0, 120) + (msg.content.length > 120 ? '...' : '')

    return new TableRow({
      children: [
        dataCell(msg.senderName, COL[0], { bold: true, shade }),
        dataCell(summary, COL[1], { shade }),
        dataCell(formatDatetime(msg.timestamp), COL[2], { color: COLOR.TEXT_MUTED, shade }),
      ],
    })
  })

  return new Table({
    width: { size: 9000, type: WidthType.DXA },
    columnWidths: COL,
    rows: [headerRow, ...dataRows],
  })
}

// ─── 브리핑 내용 단락 ────────────────────────────────────────────────────────
function buildBriefingParagraphs(briefings: Message[]): Paragraph[] {
  if (briefings.length === 0) {
    return [
      new Paragraph({
        spacing: { before: 80 },
        children: [
          new TextRun({ text: '오늘 생성된 일일 브리핑이 없습니다.', color: COLOR.TEXT_MUTED, size: 18, font: 'Arial' }),
        ],
      }),
    ]
  }

  return briefings.flatMap((msg) => {
    const lines = msg.content.split('\n').filter((l) => l.trim() !== '')
    return [
      new Paragraph({
        spacing: { before: 120, after: 60 },
        children: [
          new TextRun({ text: `[${formatDatetime(msg.timestamp)}] ${msg.senderName}`, bold: true, size: 18, color: COLOR.ACCENT, font: 'Arial' }),
        ],
      }),
      ...lines.map((line) =>
        new Paragraph({
          spacing: { before: 40 },
          children: [new TextRun({ text: line, size: 18, color: COLOR.TEXT_MAIN, font: 'Arial' })],
        })
      ),
    ]
  })
}

// ─── 공통 문서 스타일/넘버링 ──────────────────────────────────────────────────
function makeDocStyles() {
  return {
    default: {
      document: { run: { font: 'Arial', size: 20, color: COLOR.TEXT_MAIN } },
    },
    paragraphStyles: [
      {
        id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 40, bold: true, color: COLOR.PRIMARY, font: 'Arial' },
        paragraph: { spacing: { before: 480, after: 240 }, outlineLevel: 0 },
      },
      {
        id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 26, bold: true, color: COLOR.PRIMARY, font: 'Arial' },
        paragraph: { spacing: { before: 360, after: 120 }, outlineLevel: 1 },
      },
    ],
  }
}

function makeDocNumbering() {
  return {
    config: [
      {
        reference: 'bullets',
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: '•',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          },
        ],
      },
    ],
  }
}

function makePageSection(headerText: string): { properties: object; headers: object; footers: object } {
  return {
    properties: {
      page: {
        size: { width: 11906, height: 16838 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      },
    },
    headers: {
      default: new Header({
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR.ACCENT, space: 4 } },
            children: [new TextRun({ text: headerText, size: 16, color: COLOR.TEXT_MUTED, font: 'Arial' })],
          }),
        ],
      }),
    },
    footers: {
      default: new Footer({
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            border: { top: { style: BorderStyle.SINGLE, size: 2, color: COLOR.BORDER, space: 4 } },
            children: [
              new TextRun({ text: 'Page ', size: 16, color: COLOR.TEXT_MUTED, font: 'Arial' }),
              new TextRun({ children: [PageNumber.CURRENT], size: 16, color: COLOR.TEXT_MUTED, font: 'Arial' }),
              new TextRun({ text: '  |  Generated by AI Office', size: 16, color: COLOR.TEXT_MUTED, font: 'Arial' }),
            ],
          }),
        ],
      }),
    },
  }
}

function noDataParagraph(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 80 },
    children: [new TextRun({ text, color: COLOR.TEXT_MUTED, size: 18, font: 'Arial' })],
  })
}

// ─── 부서별 업무 결과 상세 섹션 ───────────────────────────────────────────────
function buildDeptResultsSection(tasks: Task[], deptId: DepartmentId): Array<Paragraph | Table> {
  const tasksWithResult = tasks.filter((t) =>
    t.departmentResults?.some((r) => r.deptId === deptId)
  )

  if (tasksWithResult.length === 0) {
    return [noDataParagraph('이 부서의 업무 결과물이 없습니다.')]
  }

  return tasksWithResult.flatMap((task) => {
    const dr = task.departmentResults!.find((r) => r.deptId === deptId)!
    const preview = dr.content.slice(0, 1000)
    const lines = preview.split('\n').filter((l) => l.trim() !== '')

    return [
      new Paragraph({
        spacing: { before: 240, after: 80 },
        border: { left: { style: BorderStyle.SINGLE, size: 8, color: COLOR.ACCENT, space: 8 } },
        children: [
          new TextRun({ text: task.title, bold: true, size: 20, color: COLOR.PRIMARY, font: 'Arial' }),
          new TextRun({ text: `  ·  ${STATUS_LABEL[task.status]}`, size: 18, color: STATUS_COLOR[task.status], font: 'Arial' }),
        ],
      }),
      new Paragraph({
        spacing: { before: 40, after: 80 },
        children: [new TextRun({ text: `작성: ${dr.agentName}`, size: 16, color: COLOR.TEXT_MUTED, font: 'Arial' })],
      }),
      ...lines.map((line) =>
        new Paragraph({
          spacing: { before: 40 },
          children: [new TextRun({ text: line, size: 18, color: COLOR.TEXT_MAIN, font: 'Arial' })],
        })
      ),
      ...(dr.content.length > 1000
        ? [new Paragraph({
            spacing: { before: 40 },
            children: [new TextRun({ text: '... (이하 생략)', size: 16, color: COLOR.TEXT_MUTED, font: 'Arial', italics: true })],
          })]
        : []
      ),
    ]
  })
}

// ─── 부서별 보고서 생성 ───────────────────────────────────────────────────────
export async function generateDepartmentReport(
  deptId: DepartmentId,
  tasks: Task[],
  messages: Message[],
): Promise<void> {
  const dept = DEPARTMENTS[deptId]
  const today = new Date()
  const todayLabel = formatKo(today)
  const generatedAt = formatDatetime(today)

  const startOfDay = new Date(today)
  startOfDay.setHours(0, 0, 0, 0)

  const deptTasks = tasks.filter((t) => t.assignedTo.includes(deptId))
  const todayDeptTasks = deptTasks.filter((t) => t.createdAt >= startOfDay)

  const deptMessages = messages
    .filter((m) =>
      (m.departmentIds?.includes(deptId) && m.type !== 'system') ||
      (m.type === 'system' && m.senderName.includes('브리핑'))
    )
    .filter((m) => m.timestamp >= startOfDay)
  const recentDeptMessages = [...deptMessages]
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, 20)

  const doc = new Document({
    styles: makeDocStyles(),
    numbering: makeDocNumbering(),
    sections: [
      {
        ...makePageSection(`AI 오피스  |  ${dept.name} 업무 보고서`),
        children: [
          // 표지
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { before: 720, after: 160 },
            children: [new TextRun({ text: dept.name, bold: true, size: 48, color: COLOR.PRIMARY, font: 'Arial' })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 120 },
            children: [new TextRun({ text: '업무 보고서', bold: true, size: 32, color: COLOR.ACCENT, font: 'Arial' })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 80 },
            children: [new TextRun({ text: todayLabel, size: 22, color: COLOR.TEXT_MUTED, font: 'Arial' })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 720 },
            children: [new TextRun({ text: `생성 시각: ${generatedAt}`, size: 18, color: COLOR.TEXT_MUTED, font: 'Arial' })],
          }),

          // 업무 현황 요약
          sectionHeading('업무 현황 요약'),
          new Paragraph({ spacing: { after: 160 }, children: [] }),
          buildSummaryTable(deptTasks),

          // 오늘 업무
          sectionHeading(`오늘의 업무 (${todayDeptTasks.length}건)`),
          ...(todayDeptTasks.length > 0
            ? [new Paragraph({ spacing: { after: 160 }, children: [] }), buildTasksTable(todayDeptTasks)]
            : [noDataParagraph('오늘 배정된 업무가 없습니다.')]
          ),

          // 전체 업무
          sectionHeading(`전체 배정 업무 (${deptTasks.length}건)`),
          ...(deptTasks.length > 0
            ? [new Paragraph({ spacing: { after: 160 }, children: [] }), buildTasksTable(deptTasks)]
            : [noDataParagraph('배정된 업무가 없습니다.')]
          ),

          // 업무 결과 상세
          sectionHeading('업무 결과 상세'),
          ...buildDeptResultsSection(deptTasks, deptId),

          // 관련 대화
          sectionHeading(`관련 대화 (${Math.min(recentDeptMessages.length, 20)}건)`),
          ...(recentDeptMessages.length > 0
            ? [new Paragraph({ spacing: { after: 160 }, children: [] }), buildMessagesTable(recentDeptMessages)]
            : [noDataParagraph('오늘 관련 대화 기록이 없습니다.')]
          ),
        ],
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `AI오피스_${dept.name}_보고서_${formatDateFilename(today)}.docx`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── 문서 생성 ───────────────────────────────────────────────────────────────
export async function generateDailyReport(tasks: Task[], messages: Message[]): Promise<void> {
  const today = new Date()
  const todayLabel = formatKo(today)
  const generatedAt = formatDatetime(today)

  // 오늘 날짜 기준 필터 (자정 ~ 현재)
  const startOfDay = new Date(today)
  startOfDay.setHours(0, 0, 0, 0)

  const todayTasks = tasks.filter((t) => t.createdAt >= startOfDay)
  const allTasks = tasks  // 전체 업무도 포함

  const briefingMessages = extractBriefingMessages(messages)
  const recentMessages = messages
    .filter((m) => m.type !== 'system' || m.senderName.includes('브리핑'))
    .filter((m) => m.timestamp >= startOfDay)

  const doc = new Document({
    styles: makeDocStyles(),
    numbering: makeDocNumbering(),
    sections: [
      {
        ...makePageSection('AI 오피스  |  일일 업무 보고서'),
        children: [
          // ── 표지 제목 ──────────────────────────────────────────────────────
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { before: 720, after: 240 },
            children: [
              new TextRun({ text: 'AI 오피스 일일 업무 보고서', bold: true, size: 48, color: COLOR.PRIMARY, font: 'Arial' }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 120 },
            children: [
              new TextRun({ text: todayLabel, size: 26, color: COLOR.ACCENT, font: 'Arial' }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 720 },
            children: [
              new TextRun({ text: `생성 시각: ${generatedAt}`, size: 18, color: COLOR.TEXT_MUTED, font: 'Arial' }),
            ],
          }),

          // ── 업무 현황 요약 ─────────────────────────────────────────────────
          sectionHeading('업무 현황 요약'),
          new Paragraph({ spacing: { after: 160 }, children: [] }),
          buildSummaryTable(allTasks),

          // ── 오늘 신규 업무 (오늘 생성된 것만) ─────────────────────────────
          sectionHeading(`오늘의 업무 목록 (${todayTasks.length}건)`),
          ...(todayTasks.length > 0
            ? [
                new Paragraph({ spacing: { after: 160 }, children: [] }),
                buildTasksTable(todayTasks),
              ]
            : [
                new Paragraph({
                  spacing: { before: 80 },
                  children: [new TextRun({ text: '오늘 생성된 업무가 없습니다.', color: COLOR.TEXT_MUTED, size: 18, font: 'Arial' })],
                }),
              ]
          ),

          // ── 전체 업무 목록 (상태별 요약) ───────────────────────────────────
          sectionHeading(`전체 업무 목록 (${allTasks.length}건)`),
          ...(allTasks.length > 0
            ? [
                new Paragraph({ spacing: { after: 160 }, children: [] }),
                buildTasksTable(allTasks),
              ]
            : [
                new Paragraph({
                  spacing: { before: 80 },
                  children: [new TextRun({ text: '등록된 업무가 없습니다.', color: COLOR.TEXT_MUTED, size: 18, font: 'Arial' })],
                }),
              ]
          ),

          // ── 일일 브리핑 ────────────────────────────────────────────────────
          sectionHeading('일일 브리핑'),
          ...buildBriefingParagraphs(briefingMessages),

          // ── 오늘의 대화 내역 ───────────────────────────────────────────────
          sectionHeading(`오늘의 주요 대화 (최근 ${Math.min(recentMessages.length, 20)}건)`),
          ...(recentMessages.length > 0
            ? [
                new Paragraph({ spacing: { after: 160 }, children: [] }),
                buildMessagesTable(recentMessages),
              ]
            : [
                new Paragraph({
                  spacing: { before: 80 },
                  children: [new TextRun({ text: '오늘 대화 기록이 없습니다.', color: COLOR.TEXT_MUTED, size: 18, font: 'Arial' })],
                }),
              ]
          ),
        ],
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `AI오피스_일일보고서_${formatDateFilename(today)}.docx`
  a.click()
  URL.revokeObjectURL(url)
}
