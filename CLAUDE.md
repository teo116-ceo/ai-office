# AI 오피스 - 지음과깃듬 AI 에이전트 시스템

## 프로젝트 개요
주식회사 지음과깃듬의 각 부서를 AI 에이전트로 구현한 자율형 오피스 시뮬레이터.
픽셀 아트 기반 2D/3D 오피스 뷰 안에서 부서별 AI 에이전트가 실시간으로 업무를 수행한다.
사용자는 업무를 지시하고, 에이전트들이 협업·토론·자동 트리거를 통해 결과물을 생성한다.

## 기술 스택
- Vite + React + TypeScript
- Tailwind CSS + 커스텀 CSS 변수 (다크/라이트 테마)
- Zustand (전역 상태 관리)
- Multi-provider AI: Anthropic Claude, OpenAI GPT-4o, Google Gemini
- Three.js + React Three Fiber (3D 오피스 뷰)
- Express.js (백엔드 서버, 포트 3001)
- pixel-agents (픽셀 캐릭터 렌더링)
- docx (Word 문서 생성/보고서 출력)

## 폴더 구조
```
src/
├── components/
│   ├── layout/       # Sidebar, Header, CommunicationPanel, MobileTaskInputBar, MessageContent
│   ├── office/       # OfficeCanvas, Office3DView, AgentMeshes, FloorNav, FloorShells, EditorOverlay
│   ├── views/        # DashboardView, TasksView, TeamChatView, AgentsView, FilesView, SettingsView
│   └── ui/           # ToastContainer, ApiKeySetup
├── store/            # agentStore (Zustand), agentDefaults
├── services/         # AI 연동, 업무 실행, 스케줄러, 웹훅, Notion 등
├── types/            # index.ts — 전체 타입 및 상수 (FLOORS, DEPARTMENTS, DIVISIONS 등)
└── utils/            # dateFormat, taskTitle, webhookValidation, apiHeaders 등
server/               # Express.js 백엔드 (인증, SSE, 임베딩, 파일 저장)
```

## 부서 구성 (6개 본부, 21개 팀)

### 대표이사 (12F / 11F)
- `ceo` 대표실 — 강비서 (대표 비서)
- `executive` 전략·비서 — 윤전략, 한비서

### 제품·기술 본부
- `security` 진단개발팀 (10F) — 오연구, 이기질, 박창업
- `development` AI엔지니어링팀 (8F) — 송자동, 김리포, 최파이프, 배도구
- `compliance` 데이터분석팀 (9F) — 데이터
- `qa` QA·오류대응팀 (7F) — 강검증, 조추적
- `devops` 운영자동화팀 (7F) — 임운영, 류라이선스
- `planning` 제품기획팀 (6F) — 박제품, 최로드맵

### 경영지원 본부 (9F)
- `management` 경영지원 — 정운영
- `finance` 재무·회계팀 — 권재무, 김재무
- `hr` 인사·총무팀 — 이인사
- `legal` 법무·특허팀 — 박법무

### 교육·서비스 본부 (5F)
- `support` 강사양성·자격증운영팀 — 서교육, 문자격
- `customer` 고객서비스팀 — 정고객

### 세일즈·마케팅 본부 (4F / 3F)
- `sales` B2B세일즈팀 (4F) — 배세일즈, 송계약
- `b2g` B2G세일즈팀 (4F) — 최공공
- `expertsales` 전문가양성세일즈팀 (4F) — 한전문가
- `marketing` 콘텐츠마케팅팀 (3F) — 마콘텐츠
- `global` 글로벌사업팀 (4F) — 윤글로벌

### 리서치·인사이트 본부 (3F)
- `presales` HR리서치팀 — 황인사이트
- `trend` 트렌드분석팀 — 강트렌드

## 코딩 컨벤션
- 컴포넌트: PascalCase (예: AgentMeshes.tsx)
- 함수/변수: camelCase
- 타입/인터페이스: PascalCase, 접두사 T·I 없음 (예: Agent, Department)
- 상수: UPPER_SNAKE_CASE
- CSS: Tailwind 클래스 우선, 커스텀 CSS 최소화

## Do Not
- 사용자 허락 없이 기존 파일 삭제 또는 덮어쓰기 금지
- 모르는 에러 임의 추측 금지, 모른다고 먼저 말할 것
- API 키를 코드에 하드코딩 금지 (.env 사용)
- 한 컴포넌트에 300줄 이상 작성 금지 (분리할 것)
- `any` 타입 사용 금지 (`unknown` 또는 명시적 타입 사용)
