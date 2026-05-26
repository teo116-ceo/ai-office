import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, BorderStyle,
  AlignmentType, convertInchesToTwip, PageOrientation,
} from 'docx'
import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '../agent-output/AI_오피스_사용설명서.docx')

// ── 헬퍼 ────────────────────────────────────────────────────────────────────
const h1 = (text) => new Paragraph({ text, heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 200 } })
const h2 = (text) => new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 150 } })
const h3 = (text) => new Paragraph({ text, heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 100 } })
const p  = (text, opts = {}) => new Paragraph({ children: [new TextRun({ text, size: 22, ...opts })], spacing: { after: 120 } })
const li = (text) => new Paragraph({ children: [new TextRun({ text: `• ${text}`, size: 22 })], indent: { left: 360 }, spacing: { after: 80 } })
const li2= (text) => new Paragraph({ children: [new TextRun({ text: `  ◦ ${text}`, size: 22 })], indent: { left: 720 }, spacing: { after: 60 } })
const code=(text) => new Paragraph({ children: [new TextRun({ text, font: 'Courier New', size: 20, color: '444444' })], indent: { left: 360 }, spacing: { after: 60 } })
const gap = () => new Paragraph({ text: '', spacing: { after: 80 } })

const cell = (text, header = false) => new TableCell({
  children: [new Paragraph({ children: [new TextRun({ text, bold: header, size: header ? 20 : 19 })] })],
  margins: { top: 80, bottom: 80, left: 120, right: 120 },
})

const table = (headers, rows) => new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  rows: [
    new TableRow({ children: headers.map((h) => cell(h, true)), tableHeader: true }),
    ...rows.map((row) => new TableRow({ children: row.map((c) => cell(c)) })),
  ],
})

// ── 문서 내용 ────────────────────────────────────────────────────────────────
const doc = new Document({
  styles: {
    default: { document: { run: { font: 'Malgun Gothic', size: 22 } } },
  },
  sections: [{
    properties: {},
    children: [
      // 표지
      new Paragraph({ children: [new TextRun({ text: 'AI 오피스 사용설명서', bold: true, size: 56, color: '1a1a2e' })], alignment: AlignmentType.CENTER, spacing: { before: 1000, after: 200 } }),
      new Paragraph({ children: [new TextRun({ text: '지음과깃듬 AI Office', size: 28, color: '555555' })], alignment: AlignmentType.CENTER, spacing: { after: 800 } }),

      // 1. 프로그램 소개
      h1('1. 프로그램 소개'),
      p('AI 오피스는 AI 에이전트 기반 업무 자동화 시스템입니다.'),
      li('33명의 AI 에이전트가 11개 층 오피스에서 실제로 일합니다'),
      li('업무 요청을 하면 적절한 부서에 자동 배분되고, 에이전트들이 협업해서 결과물을 만들어냅니다'),
      li('Claude, GPT-4o, Gemini 등 여러 LLM을 동시에 사용합니다'),
      gap(),

      // 2. 화면 구성
      h1('2. 화면 구성'),
      h2('사이드바 (왼쪽)'),
      li('뷰 전환 버튼 7개: Dashboard / AI Office / Tasks / Team Chat / Agents / Files / Settings'),
      li('에이전트 목록: 33명 전체가 부서별로 나열됨. 클릭하면 해당 에이전트 선택'),
      li('접기/펼치기 버튼: 사이드바를 아이콘만 보이게 축소 가능'),
      h2('헤더 (상단)'),
      li('현재 뷰 이름 + 선택된 층 표시'),
      li('빠른 제어판 버튼: 층 이동(11개), 테마 전환, 뷰 전환'),
      li('검색창: 층/에이전트/메시지 내용으로 검색 → Enter로 해당 위치 이동'),
      li('알림 벨: 최근 12개 항목(업무+메시지) 표시'),
      li('테마 토글: 다크/라이트 모드 전환'),
      gap(),

      // 3. 워크스페이스 뷰
      h1('3. 워크스페이스 뷰 7가지'),

      h2('3-1. Dashboard (대시보드)'),
      h3('요약 카드 4개'),
      li('전체 에이전트 수'),
      li('진행 중인 업무 수'),
      li('전체 메시지 수'),
      li('현재 층'),
      h3('사업 지표 (Business KPI)'),
      li('업무 완료율: 완료/(완료+실패) 비율을 막대 그래프로 표시'),
      li('교차 검토율: 다른 부서의 검토를 받은 업무 비율'),
      li('부서별 처리량: 상위 6개 부서의 완료/전체 업무 수 및 비율'),
      h3('실행 로그'),
      li('최근 100개의 LLM 호출 / 도구 사용 / 메모리 검색 / 시스템 이벤트 실시간 표시'),
      h3('층별 현황 그리드'),
      li('11개 층 버튼에 에이전트 수 / 활성 수 / 메시지 수 표시, 클릭하면 해당 층 이동'),
      gap(),

      h2('3-2. AI Office (사무실)'),
      p('11개 층의 타일 기반 오피스입니다.'),
      table(
        ['층', '이름', '부서'],
        [
          ['11F', '대표실', 'CEO'],
          ['10F', '전략·비서', 'Executive'],
          ['9F', '연구개발 · 경영지원·데이터', 'R&D · Management'],
          ['8F', '자동화개발', 'Development'],
          ['6F', '운영·오류대응', 'QA + DevOps'],
          ['5F', '제품기획 · 교육·서비스', 'Planning + Support'],
          ['3F', '세일즈', 'Sales'],
          ['2F', '마케팅·리서치', 'Marketing'],
          ['1F', '회의층', '—'],
        ],
      ),
      gap(),
      h3('에이전트 상태'),
      li('idle — 대기 중'),
      li('working — 업무 처리 중'),
      li('thinking — 분석 중'),
      li('debating — 토론 중'),
      li('moving — 이동 중'),
      gap(),

      h2('3-3. Tasks (업무 관리)'),
      h3('업무 목록'),
      li('필터: 전체 / 대기 / 진행 중 / 승인 대기 / 완료 / 실패'),
      h3('업무 상세'),
      li('제목, 설명, 담당 부서, 상태 표시'),
      li('승인 이유 / 부서별 결과 / 첨부 파일'),
      li('승인·반려 버튼 (승인 대기 상태일 때 활성화)'),
      li('내보내기: 마크다운 파일로 저장'),
      gap(),

      h2('3-4. Team Chat (팀 채팅)'),
      li('CEO 채널: 전체 부서에 업무 요청 (자동 라우팅)'),
      li('개별 부서 채널: 해당 부서에만 직접 메시지'),
      li('파일 첨부 (📎), Enter 전송, Shift+Enter 줄바꿈'),
      gap(),

      h2('3-5. Agents (에이전트 관리)'),
      li('33명을 부서별로 확인, 이름·역할 수정'),
      li('LLM 모델 선택: Claude Opus/Sonnet/Haiku, GPT-4o/mini, Gemini 2.5 Pro/Flash'),
      gap(),

      h2('3-6. Files (파일 관리)'),
      li('에이전트 생성 파일 목록, 미리 보기, 다운로드'),
      gap(),

      h2('3-7. Settings (설정)'),
      h3('탭 1: 화면'),
      li('테마: 다크 / 라이트'),
      li('폰트 종류: System / Serif / Mono / Pixel'),
      li('폰트 크기: Small / Medium / Large'),
      li('응답 언어: AI 답변 언어 고정 (자동 / 한국어 / 영어 등)'),
      h3('탭 2: AI 동작'),
      li('메모리 시스템 켜기/끄기, 목록 보기, 삭제'),
      li('승인 정책: 5가지 트리거 개별 토글'),
      li('자동 트리거: 부서 간 연쇄 작업 설정'),
      li('지시사항: 공지/회의 목록 관리'),
      h3('탭 3: 연동'),
      li('웹훅: URL + 이벤트(완료/실패)'),
      li('Notion: API 토큰 + 데이터베이스 ID'),
      li('스케줄러: 켜기/끄기'),
      li('일일 토큰 예산: 한도 설정, 초과 시 차단'),
      h3('탭 4: 데이터'),
      li('토큰 사용량: Anthropic / OpenAI / Gemini 별도 표시'),
      li('백업/복원: JSON 내보내기·가져오기'),
      li('초기화: 전체 데이터 삭제 (되돌릴 수 없음)'),
      gap(),

      // 4. 에이전트 33명
      h1('4. AI 에이전트 33명'),
      table(
        ['이름', '층', '부서', '역할', '기본 모델'],
        [
          ['강비서',    '11F', 'CEO',          '대표 직속 비서',               'Claude Opus 4.6'],
          ['윤전략',    '10F', '전략·비서',     '사업전략 리드',                'Gemini 2.5 Pro'],
          ['한비서',    '10F', '전략·비서',     '운영 비서 / 일정 조율 매니저', 'GPT-4o'],
          ['오연구',    '9F',  '연구개발',      'R&D 관리 팀장',               'Claude Opus 4.6'],
          ['이기질',    '9F',  '연구개발',      'ICRU 기질진단 연구원',         'GPT-4o'],
          ['박창업',    '9F',  '연구개발',      '조직·창업자 진단 연구원',      'Gemini 2.5 Pro'],
          ['데이터',    '9F',  '경영지원·데이터','진단 데이터 관리 담당자',     'GPT-4o'],
          ['정운영',    '9F',  '경영지원·데이터','행정/인사 운영 매니저',       'Gemini 2.5 Flash'],
          ['권재무',    '9F',  '경영지원·데이터','회계/세무 데이터 담당자',     'GPT-4o'],
          ['김재무',    '9F',  '경영지원·데이터','재무·회계 담당자',            'GPT-4o'],
          ['이인사',    '9F',  '경영지원·데이터','인사·총무 담당자',            'Gemini 2.5 Flash'],
          ['박법무',    '9F',  '경영지원·데이터','법무·특허 담당자',            'Gemini 2.5 Pro'],
          ['송자동',    '8F',  '자동화개발',    '자동화개발 팀장',              'Claude Sonnet 4.6'],
          ['김리포',    '8F',  '자동화개발',    '리포트 자동화 개발자',         'Claude Sonnet 4.6'],
          ['최파이프',  '8F',  '자동화개발',    '데이터 파이프라인 개발자',     'Claude Sonnet 4.6'],
          ['배도구',    '8F',  '자동화개발',    '내부 도구 개발자',             'Claude Sonnet 4.6'],
          ['강검증',    '6F',  'QA',           '오류대응 리더',                'Claude Sonnet 4.6'],
          ['조추적',    '6F',  'QA',           '진단 오류 트래킹 담당자',      'Gemini 2.5 Flash'],
          ['임운영',    '6F',  'DevOps',       '운영자동화 팀장',              'Claude Sonnet 4.6'],
          ['류라이선스','6F',  'DevOps',       '라이선스/백업 운영 담당자',    'GPT-4o mini'],
          ['박제품',    '5F',  '제품기획',      '제품기획 리드',                'Gemini 2.5 Pro'],
          ['최로드맵',  '5F',  '제품기획',      '진단 제품 PM',                'GPT-4o'],
          ['서교육',    '5F',  '교육·서비스',   '교육운영 팀장',               'GPT-4o'],
          ['문자격',    '5F',  '교육·서비스',   '강사/자격증 운영 담당자',     'Gemini 2.5 Flash'],
          ['정고객',    '5F',  '교육·서비스',   '고객서비스 담당자',            'GPT-4o mini'],
          ['배세일즈',  '3F',  '세일즈',        '기관 라이선스 세일즈 리드',    'GPT-4o'],
          ['송계약',    '3F',  '세일즈',        '리드/계약 파이프라인 담당자',  'Gemini 2.5 Flash'],
          ['최공공',    '3F',  '세일즈',        'B2G 세일즈 담당자',           'GPT-4o'],
          ['한전문가',  '3F',  '세일즈',        '전문가양성 세일즈 담당자',     'GPT-4o'],
          ['황인사이트','2F',  '마케팅·리서치', 'HR·창업 리서치 분석가',       'Claude Sonnet 4.6'],
          ['마콘텐츠',  '2F',  '마케팅·리서치', '콘텐츠·캠페인 매니저',        'Claude Sonnet 4.6'],
          ['강트렌드',  '2F',  '마케팅·리서치', '트렌드분석 담당자',            'Claude Sonnet 4.6'],
          ['윤글로벌',  '2F',  '마케팅·리서치', '글로벌사업 담당자',            'Gemini 2.5 Pro'],
        ],
      ),
      gap(),

      // 5. 업무 요청
      h1('5. 업무 요청 방법'),
      h2('방법 1: CEO 채널 (전체 부서 협업)'),
      li('Team Chat 뷰 → CEO 채널 선택 → 메시지 입력 → Enter'),
      li('코디네이터가 부서 자동 배정 → 각 부서 협업 → 결과 통합'),
      h2('방법 2: 부서 채널 (직접 요청)'),
      li('원하는 부서 채널 선택 → 메시지 입력'),
      h2('파일 첨부'),
      li('📎 버튼 클릭: 텍스트, 바이너리, ZIP 지원'),
      li('ZIP은 구조/파일 수/크기를 자동 분석해 에이전트에 전달'),
      h2('업무 진행 흐름'),
      code('요청 입력 → 부서 배정 → 에이전트 실행 → 결과 통합'),
      code('→ 승인 판단 → [완료] or [승인 대기]'),
      code('→ 웹훅/Notion 발동 → 자동 트리거 연쇄'),
      h2('긴 결과와 자동 이어쓰기'),
      li('출력 한도 도달 시 자동으로 이어쓰기 요청을 보냄'),
      li('계속 한도에 도달하면 결과 끝에 [출력 중단 안내] 표시'),
      li('같은 스레드에서 "이어서 계속" 입력하면 남은 내용 수신'),
      gap(),

      // 6. 토론
      h1('6. 토론 기능'),
      p('메시지 앞에 @토론을 붙이면 두 부서가 주제를 놓고 토론합니다.'),
      code('@토론 새 인증 방식을 OAuth로 할지 자체 개발할지'),
      h2('진행 흐름'),
      li('관련 부서 2개 자동 선정'),
      li('각 부서 초기 의견 수집 (병렬)'),
      li('각 부서 반론 수집 (병렬)'),
      li('CEO 최종 요약 → 사용자 결정 대기'),
      gap(),

      // 7. 승인
      h1('7. 승인 시스템'),
      p('아래 5가지 중 해당 내용이 결과에 포함되면 승인 대기 상태가 됩니다.'),
      li('외부 이메일 발송, 고객 공지'),
      li('가격 견적, 할인 제안'),
      li('송금, 청구서 발행'),
      li('미팅 일정 확정, 데모 예약'),
      li('계약서, NDA 서명'),
      h2('처리 방법'),
      li('Tasks 뷰 → 승인 대기 필터 → 업무 선택 → 이유 확인'),
      li('승인 버튼: 완료 처리, 웹훅/Notion 발동'),
      li('반려 버튼: 피드백 입력 후 반려'),
      gap(),

      // 8. 메모리
      h1('8. 메모리 시스템'),
      li('업무 완료 시 제목·요약·핵심 포인트·태그·관련 부서 자동 저장 (최대 200개)'),
      li('새 업무 시작 시 관련 메모리 자동 검색 (최대 3개)'),
      li('의미적 유사도(임베딩) + 키워드 폴백 검색'),
      li('같은 부서 메모리에 가중치 부여'),
      li('관리: Settings → AI 동작 → 메모리 섹션'),
      gap(),

      // 9. 설정 옵션
      h1('9. 설정 옵션 전체'),
      table(
        ['항목', '경로', '기능'],
        [
          ['테마',       'Settings → 화면',    '다크/라이트'],
          ['폰트 종류',  'Settings → 화면',    'System / Serif / Mono / Pixel'],
          ['폰트 크기',  'Settings → 화면',    'Small / Medium / Large'],
          ['응답 언어',  'Settings → 화면',    'AI 답변 언어 고정'],
          ['메모리',     'Settings → AI 동작', '켜기/끄기/삭제'],
          ['승인 정책',  'Settings → AI 동작', '5가지 정책 개별 설정'],
          ['자동 트리거','Settings → AI 동작', '부서 간 연쇄 작업 설정'],
          ['지시사항',   'Settings → AI 동작', '공지/회의 관리'],
          ['웹훅',       'Settings → 연동',    'URL + 이벤트 설정'],
          ['Notion',     'Settings → 연동',    '토큰 + DB ID'],
          ['스케줄러',   'Settings → 연동',    '켜기/끄기'],
          ['토큰 예산',  'Settings → 연동',    '일일 한도 설정'],
          ['사용량',     'Settings → 데이터',  '제공자별 토큰 소비'],
          ['백업/복원',  'Settings → 데이터',  'JSON 내보내기/가져오기'],
          ['초기화',     'Settings → 데이터',  '전체 데이터 삭제'],
        ],
      ),
      gap(),

      // 10. 파일 관리
      h1('10. 파일 관리'),
      li('에이전트 생성 파일: Files 뷰에서 확인, agent-output/ 폴더에 저장'),
      li('자동 백업: 30분마다 agent-output/backups/에 저장'),
      li('업무 내보내기: Tasks 뷰 → 내보내기 → 마크다운'),
      li('채팅 내보내기: 커뮤니케이션 패널 → 내보내기 → 마크다운'),
      gap(),

      // 11. 단축키
      h1('11. 단축키'),
      table(
        ['단축키', '기능'],
        [
          ['Enter',       '메시지 전송'],
          ['Shift+Enter', '메시지 입력창에서 줄 바꿈'],
          ['Escape',      '커뮤니케이션 패널 닫기'],
        ],
      ),
      gap(),

      // 12. 지시사항
      h1('12. 지시사항(Directives) 시스템'),
      p('CEO 채널 또는 부서 채널에 자연어로 입력하면 자동 감지됩니다.'),

      h2('12-1. 전사 공지'),
      li('"전사 공지:", "전직원 공지:", "전체 공지:", "전사 지침:" 접두어로 시작'),
      li('모든 부서 에이전트에 즉시 적용, 이후 업무/토론에 지속 반영'),
      li('새 공지 등록 시 기존 공지 자동 교체'),
      li('해제: "공지 해제", "전사 공지 해제", "지침 해제"'),

      h2('12-2. 회의 소집'),
      table(
        ['규모', '장소', '상태 표시'],
        [
          ['대회의 (전부서)',   '1F 대회의실', '대회의실 집결 중'],
          ['중회의 (핵심 부서)','1F 중회의실', '중회의실 집결 중'],
          ['소회의 (1~3개 부서)','1F 소회의실','소회의실 협의 중'],
        ],
      ),
      gap(),
      li('소집 예: "전 팀 회의실로 모이세요", "중회의 시작합시다"'),
      li('해산: "회의 종료", "해산하세요", "원위치 복귀" 등'),

      h2('12-3. 관리'),
      li('Settings → AI 동작 → 지시사항 섹션에서 확인 및 삭제'),
    ],
  }],
})

const buffer = await Packer.toBuffer(doc)
writeFileSync(OUT, buffer)
console.log(`✅ 저장 완료: ${OUT}`)
