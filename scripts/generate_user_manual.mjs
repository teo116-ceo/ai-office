import fs from "node:fs";
import path from "node:path";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  ImageRun,
  Packer,
  PageBreak,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

const OUTPUT_DIR = path.resolve("agent-output");
const OUTPUT_PATH = path.join(OUTPUT_DIR, "AI_오피스_사용설명서.docx");
const LOGO_PATH = path.resolve("public", "logo.png");
const TODAY = "2026-05-01";

const COLOR = {
  navy: "16324F",
  blue: "3E6FB6",
  mint: "2E9B8F",
  gold: "D58B22",
  pink: "C8668E",
  text: "1F2937",
  sub: "475569",
  line: "D7DFEA",
  panel: "F6F8FC",
  softBlue: "EAF2FF",
  softMint: "EAF8F5",
  softGold: "FFF4DE",
  softPink: "FFF0F5",
};

const logo = fs.existsSync(LOGO_PATH) ? fs.readFileSync(LOGO_PATH) : null;

function text(value, options = {}) {
  return new TextRun({
    text: value,
    font: "Malgun Gothic",
    size: options.size ?? 22,
    bold: options.bold ?? false,
    color: options.color ?? COLOR.text,
    italics: options.italics ?? false,
    break: options.break ?? 0,
  });
}

function para(children, options = {}) {
  return new Paragraph({
    children: Array.isArray(children) ? children : [children],
    spacing: {
      before: options.before ?? 0,
      after: options.after ?? 140,
      line: options.line ?? 320,
    },
    alignment: options.align ?? AlignmentType.LEFT,
    heading: options.heading,
    pageBreakBefore: options.pageBreakBefore ?? false,
    thematicBreak: options.thematicBreak ?? false,
  });
}

function bullet(value, level = 0) {
  return new Paragraph({
    children: [text(value, { size: 21, color: COLOR.text })],
    bullet: { level },
    spacing: { before: 0, after: 100, line: 300 },
  });
}

function sectionTitle(title, subtitle) {
  return [
    para(text(title, { size: 32, bold: true, color: COLOR.navy }), {
      heading: HeadingLevel.HEADING_1,
      before: 120,
      after: 60,
    }),
    para(text(subtitle, { size: 21, color: COLOR.sub }), { after: 220 }),
  ];
}

function subTitle(title) {
  return para(text(title, { size: 25, bold: true, color: COLOR.blue }), {
    heading: HeadingLevel.HEADING_2,
    before: 120,
    after: 80,
  });
}

function infoBox(title, body, fill = COLOR.softBlue) {
  const totalWidth = 9000;

  return new Table({
    width: { size: totalWidth, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    borders: boxBorders("FFFFFF"),
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: totalWidth, type: WidthType.DXA },
            shading: { fill },
            margins: cellMargins(),
            children: [
              para(text(title, { size: 22, bold: true, color: COLOR.navy }), { after: 70 }),
              para(text(body, { size: 21, color: COLOR.text }), { after: 20 }),
            ],
          }),
        ],
      }),
    ],
  });
}

function boxBorders(color = COLOR.line) {
  return {
    top: { style: BorderStyle.SINGLE, size: 1, color },
    bottom: { style: BorderStyle.SINGLE, size: 1, color },
    left: { style: BorderStyle.SINGLE, size: 1, color },
    right: { style: BorderStyle.SINGLE, size: 1, color },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color },
    insideVertical: { style: BorderStyle.SINGLE, size: 1, color },
  };
}

function cellMargins() {
  return { top: 120, bottom: 120, left: 140, right: 140 };
}

function simpleTable(headers, rows, columnWidths) {
  const totalWeight = columnWidths.reduce((sum, value) => sum + value, 0);
  const totalWidth = 9000;
  const widthFor = (weight) => Math.round((totalWidth * weight) / totalWeight);

  return new Table({
    width: { size: totalWidth, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    borders: boxBorders(),
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((header, index) =>
          new TableCell({
            width: { size: widthFor(columnWidths[index]), type: WidthType.DXA },
            shading: { fill: COLOR.navy },
            margins: cellMargins(),
            children: [para(text(header, { size: 20, bold: true, color: "FFFFFF" }), { after: 20 })],
          }),
        ),
      }),
      ...rows.map((row, rowIndex) =>
        new TableRow({
          children: row.map((value, index) =>
            new TableCell({
              width: { size: widthFor(columnWidths[index]), type: WidthType.DXA },
              shading: { fill: rowIndex % 2 === 0 ? "FFFFFF" : COLOR.panel },
              margins: cellMargins(),
              children: [para(text(value, { size: 20, color: COLOR.text }), { after: 20 })],
            }),
          ),
        }),
      ),
    ],
  });
}

const children = [];

if (logo) {
  children.push(
    para(
      new ImageRun({
        data: logo,
        type: "png",
        transformation: { width: 180, height: 44 },
      }),
      { align: AlignmentType.LEFT, after: 260 },
    ),
  );
}

children.push(
  para(text("AI 오피스 사용 설명서", { size: 44, bold: true, color: COLOR.navy }), { after: 100 }),
  para(text("비개발자를 위한 상세 운영 매뉴얼", { size: 26, color: COLOR.blue }), { after: 280 }),
  infoBox(
    "이 문서로 할 수 있는 일",
    "이 설명서는 처음 사용하는 분이 프로그램을 열고, 화면을 이해하고, 업무를 지시하고, 승인/반려를 처리하고, 결과 파일과 보고서를 저장하는 과정까지 혼자 따라할 수 있도록 만든 실무형 안내서입니다.",
    COLOR.softBlue,
  ),
  para(text("적용 기준일: 2026년 5월 1일", { size: 19, color: COLOR.sub }), { before: 180, after: 40 }),
  para(text("대상 프로그램: 지음과깃듬 AI 오피스", { size: 19, color: COLOR.sub }), { after: 40 }),
  para(text("권장 독자: 대표, 운영 담당자, 실무자, 관리자", { size: 19, color: COLOR.sub }), { after: 280 }),
  para(new PageBreak()),
);

children.push(
  ...sectionTitle("1. 프로그램 소개", "AI 오피스가 어떤 도구인지부터 먼저 이해합니다."),
  para(text("AI 오피스는 부서별 AI 에이전트를 하나의 조직처럼 운영하는 업무 시뮬레이터이자 협업 도구입니다.", { size: 21 }), { after: 100 }),
  para(text("단순히 질문 하나를 보내는 챗봇이 아니라, 대표실, 전략/비서, 연구개발, 데이터, 경영지원, 자동화개발, 교육운영, 세일즈, 리서치 같은 역할을 가진 에이전트가 각각의 업무를 맡아 움직이는 구조입니다.", { size: 21 }), { after: 120 }),
  bullet("대표는 전체 상황을 한눈에 보고, 필요한 부서에 업무를 지시할 수 있습니다."),
  bullet("실무자는 채팅이나 업무 요청을 통해 필요한 자료 정리, 보고서 작성, 검토, 자동화를 요청할 수 있습니다."),
  bullet("완료된 결과는 업무 목록, 채팅, 결과 파일, Notion, 외부 알림으로 이어질 수 있습니다."),
  bullet("설정 화면에서 승인 체계, 자동 전달, 브리핑, API 키, Notion, 웹훅, 백업까지 관리할 수 있습니다."),
  infoBox(
    "핵심 개념 세 가지",
    "첫째, 업무는 부서 단위로 흘러갑니다. 둘째, 채팅과 업무 목록은 서로 연결됩니다. 셋째, 설정에서 자동화 수준을 높이면 사람이 일일이 지시하지 않아도 다음 단계로 이어질 수 있습니다.",
    COLOR.softMint,
  ),
);

children.push(
  ...sectionTitle("2. 가장 먼저 알아둘 사용 흐름", "프로그램을 처음 열었을 때 무엇부터 해야 하는지 빠르게 정리한 순서입니다."),
  simpleTable(
    ["순서", "해야 할 일", "설명"],
    [
      ["1", "API 키 확인", "설정 > 외부 연동에서 Claude, GPT, Gemini 중 필요한 AI 서비스 키가 연결되어 있는지 먼저 확인합니다."],
      ["2", "현재 층 확인", "AI 오피스 화면에서 현재 선택된 층과 해당 층의 업무 분위기를 확인합니다."],
      ["3", "업무 입력", "AI 오피스의 채팅창 또는 팀 채팅에서 요청 문장을 입력합니다. 필요하면 파일도 같이 붙입니다."],
      ["4", "업무 추적", "작업 관리 화면에서 진행 중, 승인 대기, 완료 상태를 확인합니다."],
      ["5", "결과 확인", "결과는 작업 상세, 팀 채팅, 결과 파일 화면에서 다시 열어볼 수 있습니다."],
      ["6", "보고/저장", "필요하면 Word 보고서 생성, 파일 다운로드, Notion 저장, 웹훅 알림을 사용합니다."],
    ],
    [10, 24, 66],
  ),
  para(text("처음에는 아래 세 화면만 익혀도 실제 사용이 가능합니다: AI 오피스, 작업 관리, 설정.", { size: 21, color: COLOR.sub }), {
    before: 150,
    after: 40,
  }),
);

children.push(
  ...sectionTitle("3. 화면 전체 구조", "왼쪽 메뉴, 위쪽 도구줄, 중앙 작업 영역이 각각 무엇을 하는지 설명합니다."),
  subTitle("3-1. 왼쪽 사이드바"),
  simpleTable(
    ["메뉴", "용도", "언제 쓰면 좋은가"],
    [
      ["대시보드", "전체 현황을 요약해서 보는 화면", "현재 어느 층이 바쁜지, 최근 대화와 실행 로그를 빠르게 확인할 때"],
      ["AI 오피스", "층별 조직 관제실", "각 층의 운영 상태, 공간 현황, 인원 상태를 볼 때"],
      ["작업 관리", "업무 목록과 상세 결과", "업무 진행 상태 확인, 승인/반려, 수정 요청을 할 때"],
      ["팀 채팅", "부서별 대화 채널", "특정 부서와 직접 대화하거나 공지를 전파할 때"],
      ["에이전트", "에이전트 프로필 관리", "이름, 역할, AI 모델 추천값을 확인하거나 바꿀 때"],
      ["결과 파일", "산출물 보관함", "생성된 문서, 이미지, 텍스트 파일을 미리 보거나 다운로드할 때"],
      ["설정", "전체 운영 정책", "테마, 승인, 자동화, 연동, 백업을 바꿀 때"],
    ],
    [16, 34, 50],
  ),
  subTitle("3-2. 위쪽 헤더"),
  bullet("빠른 이동: 층 이동, 화면 전환, 테마 변경을 빠르게 여는 메뉴입니다."),
  bullet("검색창: 층, 에이전트, 대화 내용을 찾아 바로 이동할 수 있습니다."),
  bullet("테마 전환 버튼: 저장된 테마 프리셋을 순서대로 바꿉니다."),
  bullet("알림 센터: 최근 업무와 메시지 알림을 모아서 보여주고, 클릭하면 관련 화면으로 이동합니다."),
  bullet("설정 버튼: 언제든 설정 화면으로 바로 들어갑니다."),
  subTitle("3-3. 중앙 작업 영역"),
  para(text("중앙은 현재 선택한 메뉴의 본문입니다. AI 오피스에서는 층별 관제실이, 작업 관리에서는 업무 상세가, 팀 채팅에서는 채널 대화가 이 영역에 표시됩니다.", { size: 21 })),
);

children.push(
  ...sectionTitle("4. AI 오피스 화면 자세히 보기", "층별 운영 상황을 보는 메인 화면입니다."),
  para(text("AI 오피스는 현재 층의 사람 수, 활성 인원 수, 업무 요약, 공간 현황, 부서 상태, 최근 메시지, 인원 현황을 한 화면에서 보여주는 조직 관제실입니다.", { size: 21 }), { after: 100 }),
  bullet("화면 상단에는 현재 층 이름, 요약 설명, 현재 인원, 활성 인원, 채팅창 열기 버튼이 있습니다."),
  bullet("운영 요약 카드에서는 해당 층의 전체 상태를 숫자로 봅니다."),
  bullet("바로 확인할 일 영역에서는 승인 대기, 멈춘 업무, 급히 움직이는 인원 같은 주의 포인트를 보여줍니다."),
  bullet("공간 현황은 층 안의 주요 구역이 얼마나 바쁜지 보여주는 보드입니다."),
  bullet("부서 상태 패널은 해당 층 부서별 인원, 메시지 수, 활성 상태를 요약합니다."),
  bullet("업무 목록 패널과 최근 대화 패널은 세부 화면으로 넘어가기 전에 빠르게 확인하는 용도입니다."),
  infoBox(
    "AI 오피스를 가장 잘 쓰는 방법",
    "대표나 운영 담당자는 이 화면을 기본 홈 화면처럼 쓰는 것이 좋습니다. 어느 층이 바쁜지 보고, 문제가 보이는 카드가 있으면 바로 작업 관리나 팀 채팅으로 이동하면 됩니다.",
    COLOR.softGold,
  ),
  subTitle("4-1. 층 구성 안내"),
  simpleTable(
    ["층", "주요 역할", "설명"],
    [
      ["11F", "대표실", "대표 판단, 최종 통합, 대표 직속 비서 업무를 다룹니다."],
      ["10F", "전략·비서", "사업 우선순위, 일정 조율, 회의 운영을 맡습니다."],
      ["9F", "R&D 관리", "진단 구조, 연구개발, 주제 관리 쪽 판단을 맡습니다."],
      ["8F", "경영지원·데이터", "경영지원, 재무, 인사, 법무, 데이터 정리 업무가 모여 있습니다."],
      ["7F", "자동화개발", "리포트 자동화, 내부 도구, 파이프라인 개발을 담당합니다."],
      ["6F", "오류대응·운영자동화", "오류 확인, 운영 안정화, 백업·배포 성격의 업무를 맡습니다."],
      ["5F", "제품기획", "진단 상품, 기능 방향, 제품화 아이디어를 다룹니다."],
      ["4F", "교육·고객지원", "강사 운영, 교육 운영, 고객 응대를 담당합니다."],
      ["3F", "세일즈", "기업/기관 세일즈, 전문과정 영업, 글로벌 사업을 다룹니다."],
      ["2F", "마케팅·리서치", "콘텐츠, 시장 조사, 트렌드, 사전 리서치를 다룹니다."],
      ["1F", "회의층", "회의 일정, 회의실 운영, 브리핑과 공유 성격의 활동이 모입니다."],
    ],
    [12, 25, 63],
  ),
  subTitle("4-2. 채팅창 열기"),
  para(text("AI 오피스 상단의 채팅창 열기 버튼을 누르면 현재 층과 연결된 대화 패널을 오른쪽에서 열 수 있습니다. 이 패널에서는 현재 층에 관련된 대화만 추려서 볼 수 있습니다.", { size: 21 })),
);

children.push(
  ...sectionTitle("5. 작업 관리 화면", "업무를 가장 자세하게 추적하는 화면입니다."),
  bullet("왼쪽에는 업무 목록이 있고, 오른쪽에는 선택한 업무의 상세 내용이 열립니다."),
  bullet("상태 필터는 전체, 대기, 진행 중, 승인 대기, 완료, 실패로 나뉩니다."),
  bullet("업무 카드를 누르면 설명, 첨부 파일, 부서별 결과, 토론 기록, 수정 버전을 확인할 수 있습니다."),
  bullet("완료된 결과는 텍스트 파일로 내보내거나 보고서로 묶을 수 있습니다."),
  subTitle("5-1. 승인과 반려"),
  para(text("승인이 필요한 업무는 상단에 별도 안내가 표시됩니다. 이때 선택지는 세 가지입니다.", { size: 21 }), { after: 80 }),
  bullet("승인: 결과를 최종 완료 처리합니다."),
  bullet("거절: 실패 처리하고 사유를 남깁니다."),
  bullet("수정 요청: 반려 사유를 바탕으로 새 수정 버전을 다시 돌립니다."),
  infoBox(
    "실무 팁",
    "중요한 제안서, 대외 메시지, 가격·결제·법무 관련 내용은 승인 체계를 켜두고 사용하는 것이 안전합니다. 승인 없이 자동 완료되면 편하지만, 실수도 같이 빨라집니다.",
    COLOR.softPink,
  ),
  subTitle("5-2. 보고서 만들기"),
  bullet("전체 업무 내보내기: 현재까지의 업무 기록을 한 번에 저장합니다."),
  bullet("일일 보고서: 하루 단위 요약 보고서를 Word 형식으로 만듭니다."),
  bullet("부서 보고서: 특정 부서만 골라 Word 보고서를 생성합니다."),
  subTitle("5-3. 수정 버전 보기"),
  para(text("한 업무에서 수정 요청이 반복되면 버전 히스토리가 생깁니다. v1은 원본, v2 이후는 수정본입니다. 버전별 상태와 생성 시각이 같이 보이므로, 어떤 결과가 최종안인지 헷갈리지 않게 관리할 수 있습니다.", { size: 21 })),
);

children.push(
  ...sectionTitle("6. 팀 채팅 화면", "부서별로 직접 대화할 때 쓰는 화면입니다."),
  bullet("왼쪽에는 부서 채널 목록이 있습니다."),
  bullet("오른쪽에는 선택한 부서의 채팅 내역과 입력창이 있습니다."),
  bullet("메시지 종류는 업무, 결과, 토론, 시스템으로 표시됩니다."),
  bullet("파일을 첨부해서 보낼 수 있으며, 텍스트 외에 이미지와 일부 이진 파일도 함께 다룰 수 있습니다."),
  subTitle("6-1. 대표 채널의 특징"),
  para(text("대표 채널은 일반 부서 채널과 다르게 공지 성격으로 사용할 수 있습니다. 대표가 여기서 요청하거나 공지하면 다른 부서로 연결되는 흐름의 시작점이 되기 쉽습니다.", { size: 21 })),
  subTitle("6-2. 파일 첨부"),
  bullet("파일 첨부 버튼으로 여러 파일을 동시에 붙일 수 있습니다."),
  bullet("텍스트 파일은 내용 분석에 바로 활용되고, 압축 파일은 구조 요약과 트리 정보가 같이 붙습니다."),
  bullet("이미지와 PDF 같은 파일은 결과 파일 화면에서 다시 열어 확인하는 것이 편합니다."),
  subTitle("6-3. 입력 요령"),
  simpleTable(
    ["상황", "권장 입력 방식"],
    [
      ["간단한 요청", "한 문장으로 목적과 원하는 결과를 바로 씁니다."],
      ["검토 요청", "무엇을 검토해야 하는지와 판단 기준을 같이 적습니다."],
      ["문서 작성", "대상 독자, 분량, 톤, 마감 형식을 같이 적습니다."],
      ["수정 요청", "무엇이 문제였는지와 어떻게 바꾸길 원하는지 구체적으로 씁니다."],
    ],
    [22, 78],
  ),
);

children.push(
  ...sectionTitle("7. 에이전트 화면", "조직 구성원별 역할과 AI 모델을 관리합니다."),
  bullet("왼쪽 목록에서 에이전트를 선택하면 오른쪽에 상세 정보가 열립니다."),
  bullet("이름, 역할, 사용 모델을 직접 바꿀 수 있습니다."),
  bullet("일부 에이전트는 추천 모델이 따로 표시됩니다."),
  bullet("강비서는 대표 보좌, 한비서는 회의·일정 운영처럼 역할 구분이 화면에 반영됩니다."),
  subTitle("7-1. 이 화면을 언제 써야 하나"),
  bullet("같은 부서라도 문체나 역할을 더 명확히 나누고 싶을 때"),
  bullet("특정 에이전트의 기본 모델을 바꾸고 싶을 때"),
  bullet("누가 무엇을 맡는지 조직표처럼 확인하고 싶을 때"),
  subTitle("7-2. 추천 모델 표시"),
  para(text("추천 모델은 해당 역할에 가장 잘 맞는 기본값입니다. 예를 들어 판단과 통합이 중요한 역할은 더 강한 모델이, 반복 응대나 빠른 분류가 중요한 역할은 더 가벼운 모델이 추천될 수 있습니다.", { size: 21 })),
);

children.push(
  ...sectionTitle("8. 결과 파일 화면", "AI가 만든 산출물을 다시 보는 보관함입니다."),
  bullet("파일 목록은 최근 수정 순으로 정렬됩니다."),
  bullet("텍스트 파일은 화면에서 바로 내용을 볼 수 있습니다."),
  bullet("이미지 파일은 미리보기가 됩니다."),
  bullet("PDF, DOCX, XLSX 같은 이진 파일은 바로 내용 미리보기 대신 다운로드 중심으로 다룹니다."),
  bullet("필요 없는 파일은 개별 삭제할 수 있습니다."),
  infoBox(
    "중요",
    "결과가 마음에 들어도 바로 닫지 말고, 결과 파일 화면에서 다시 열어 최종본을 한 번 더 확인하는 습관이 좋습니다. 특히 외부 제출용 Word 파일이나 이미지 결과물은 여기서 검수 후 배포하세요.",
    COLOR.softBlue,
  ),
);

children.push(
  ...sectionTitle("9. 설정 화면", "프로그램 운영 정책을 바꾸는 곳입니다."),
  subTitle("9-1. 화면"),
  simpleTable(
    ["항목", "무엇을 바꾸는가"],
    [
      ["테마", "화면 색상 프리셋을 바꿉니다."],
      ["글꼴", "앱 전체 기본 글꼴을 바꿉니다."],
      ["글자 크기", "앱 전체 텍스트 크기를 조절합니다."],
    ],
    [24, 76],
  ),
  subTitle("9-2. AI 동작"),
  simpleTable(
    ["항목", "설명"],
    [
      ["응답 언어", "자동, 한국어, 영어 중 하나로 고정할 수 있습니다."],
      ["업무 메모리", "완료된 업무 결과를 요약 저장해 다음 요청 때 참고하게 합니다."],
      ["사전 승인 체계", "AI 결과를 바로 끝낼지, 사람이 먼저 검토할지 정합니다."],
      ["고위험 업무별 승인", "외부 커뮤니케이션, 가격 약속, 결제, 일정 약속, 법무 성격 업무만 골라 승인하게 할 수 있습니다."],
      ["활성 전사 지시", "현재 조직 전체에 반영되는 공지나 지시를 확인합니다."],
      ["3 AI 토론 분석", "복잡한 요청일 때 여러 모델이 토론하듯 분석하게 합니다."],
      ["자동 전달", "한 부서 업무가 끝나면 조건에 따라 다음 부서로 자동 전달합니다."],
      ["일일 브리핑 스케줄러", "정해진 시간에 자동 브리핑을 만들게 합니다."],
    ],
    [28, 72],
  ),
  subTitle("9-3. 외부 연동"),
  simpleTable(
    ["항목", "설명"],
    [
      ["AI API 키", "Claude, GPT, Gemini 키를 입력하거나 교체합니다."],
      ["알림 설정", "브라우저 알림, Discord/Slack 웹훅 알림을 관리합니다."],
      ["부서별 웹훅", "부서마다 다른 채널로 알림을 보내게 할 수 있습니다."],
      ["Notion 연동", "완료된 업무를 Notion 데이터베이스에 자동 저장합니다."],
    ],
    [28, 72],
  ),
  subTitle("9-4. 데이터"),
  simpleTable(
    ["항목", "설명"],
    [
      ["일별 사용량 한도", "하루 최대 토큰 사용량을 제한합니다."],
      ["AI 사용량 현황", "현재 세션 기준 요청 수와 입력/출력/총 토큰을 봅니다."],
      ["데이터 백업/복원", "현재 데이터를 파일로 저장하거나 복원합니다."],
      ["기록 정리", "대화와 업무 기록을 개별 삭제합니다."],
      ["인수인계 초기화", "웹훅, Notion, API 키, 대화, 업무를 넘기기 전 한 번에 초기화합니다."],
    ],
    [28, 72],
  ),
);

children.push(
  ...sectionTitle("10. Notion, 알림, 백업 설정 가이드", "실무에서 많이 쓰는 연동 설정만 따로 모았습니다."),
  subTitle("10-1. Notion 연동 순서"),
  bullet("설정 > 외부 연동 > Notion 연동으로 이동합니다."),
  bullet("Notion 통합에서 토큰을 발급받습니다."),
  bullet("저장할 데이터베이스의 ID를 복사해 입력합니다."),
  bullet("필요한 자동 저장 옵션을 켠 뒤 연결 테스트를 합니다."),
  bullet("완료 업무가 실제로 페이지로 쌓이는지 확인합니다."),
  para(text("주의: 안내 문구 기준으로 토큰은 새로고침 후 다시 입력해야 할 수 있으니, 보안상 별도 보관 정책을 두는 것이 좋습니다.", { size: 21, color: COLOR.sub }), { after: 100 }),
  subTitle("10-2. Discord/Slack 알림"),
  bullet("전체 웹훅 URL을 넣으면 공통 채널로 알림을 보낼 수 있습니다."),
  bullet("부서별 웹훅을 열면 부서마다 다른 채널에 테스트 메시지를 보내볼 수 있습니다."),
  bullet("작업 완료, 실패, 승인 대기 등 필요한 알림 항목만 골라 켜는 것이 좋습니다."),
  subTitle("10-3. 백업과 복원"),
  bullet("내 컴퓨터에 저장: JSON 백업 파일을 바로 내려받습니다."),
  bullet("지금 서버에 저장: 서버에 즉시 백업을 남깁니다."),
  bullet("백업 파일로 복원: 저장한 JSON 파일을 다시 불러옵니다."),
  infoBox(
    "복원 전 주의",
    "복원은 현재 데이터를 백업 파일 내용으로 바꾸는 작업입니다. 실무 중이라면 먼저 현재 상태를 한 번 더 내 컴퓨터에 저장해 두는 것이 안전합니다.",
    COLOR.softGold,
  ),
);

children.push(
  ...sectionTitle("11. 대표와 운영 담당자를 위한 권장 사용 시나리오", "실제로 많이 쓰게 되는 흐름을 예시로 정리했습니다."),
  subTitle("11-1. 대표가 오전 업무를 점검하는 경우"),
  bullet("대시보드에서 활성 인원, 최근 대화, 실행 로그를 먼저 봅니다."),
  bullet("AI 오피스로 들어가 현재 가장 바쁜 층을 확인합니다."),
  bullet("문제가 있는 층이 보이면 채팅창을 열어 지시를 남기거나 작업 관리로 이동합니다."),
  bullet("승인 대기 업무가 있으면 작업 관리에서 먼저 승인/반려합니다."),
  bullet("필요하면 대표 채널에서 공지성 요청을 보냅니다."),
  subTitle("11-2. 운영 담당자가 회의 준비를 하는 경우"),
  bullet("AI 오피스에서 1F 회의층 상태를 먼저 확인합니다."),
  bullet("팀 채팅에서 관련 부서에 회의 자료 요청 메시지를 보냅니다."),
  bullet("작업 관리에서 각 부서 결과가 올라오는지 확인합니다."),
  bullet("최종본이 모이면 결과 파일에서 다운로드하거나 Word 보고서를 생성합니다."),
  subTitle("11-3. 실무자가 보고서 초안을 만드는 경우"),
  bullet("업무 요청 문장에 대상 독자, 길이, 제출 형식, 마감 시점을 함께 적습니다."),
  bullet("필요한 참고 파일을 첨부합니다."),
  bullet("초안이 나오면 작업 상세에서 내용을 검토하고, 부족하면 수정 요청을 남깁니다."),
  bullet("완성본은 결과 파일에서 다시 열어 최종 확인 후 저장합니다."),
);

children.push(
  ...sectionTitle("12. 자주 묻는 질문", "실사용 중 가장 자주 막히는 지점을 정리했습니다."),
  simpleTable(
    ["상황", "확인할 곳", "조치 방법"],
    [
      ["AI가 응답하지 않음", "설정 > 외부 연동", "API 키 연결 상태를 먼저 확인합니다."],
      ["업무가 바로 끝나지 않고 멈춘 것 같음", "작업 관리", "상태가 승인 대기인지, 실패인지 먼저 확인합니다."],
      ["알림이 오지 않음", "설정 > 알림 설정", "브라우저 권한, 웹훅 URL, 테스트 발송 결과를 차례로 확인합니다."],
      ["Notion에 저장되지 않음", "설정 > Notion 연동", "토큰, 데이터베이스 ID, 연동 활성화 여부를 확인합니다."],
      ["복원 후 화면이 이상함", "설정 > 데이터", "복원 직후 새로고침이 필요한지 확인합니다."],
      ["결과 파일이 안 보임", "결과 파일 화면", "목록 새로고침 후, 파일 형식이 미리보기 가능한지 확인합니다."],
    ],
    [24, 28, 48],
  ),
);

children.push(
  para(new PageBreak()),
  ...sectionTitle("13. 안전하게 쓰는 운영 원칙", "실무에 붙일 때 꼭 지켜야 하는 기준입니다."),
  bullet("외부 발송 전에는 승인 체계를 켜두는 것을 권장합니다."),
  bullet("대표 명의 문서, 가격, 결제, 법무 관련 문안은 자동 완료만 믿지 말고 사람이 한 번 더 검토하세요."),
  bullet("복원이나 초기화 전에 반드시 백업 파일을 먼저 받아두세요."),
  bullet("Notion이나 웹훅 같은 외부 연동은 테스트 발송까지 끝내야 실제 준비가 완료된 것입니다."),
  bullet("에이전트 이름과 역할을 너무 자주 바꾸면 운영자가 누가 무슨 일을 하는지 헷갈릴 수 있으니 기준을 정해두는 것이 좋습니다."),
  infoBox(
    "마지막 체크리스트",
    "업무를 맡기기 전에는 API 키 연결, 승인 정책, 알림, 백업 상태를 확인하고, 외부 제출 직전에는 결과 파일과 작업 상세를 다시 열어 최종 검수하세요.",
    COLOR.softMint,
  ),
  para(text("끝.", { size: 22, bold: true, color: COLOR.navy }), { before: 220, after: 0, align: AlignmentType.CENTER }),
);

const doc = new Document({
  styles: {
    default: {
      document: {
        run: {
          font: "Malgun Gothic",
          size: 21,
          color: COLOR.text,
        },
        paragraph: {
          spacing: { line: 320, after: 120 },
        },
      },
    },
  },
  sections: [
    {
      properties: {
        page: {
          margin: { top: 1000, right: 900, bottom: 900, left: 900 },
        },
      },
      footers: {
        default: new Footer({
          children: [
            para(
              [
                text("지음과깃듬 AI 오피스 사용 설명서", { size: 16, color: COLOR.sub }),
                text(`  |  기준일 ${TODAY}`, { size: 16, color: COLOR.sub }),
              ],
              { align: AlignmentType.CENTER, after: 0 },
            ),
          ],
        }),
      },
      children,
    },
  ],
});

await fs.promises.mkdir(OUTPUT_DIR, { recursive: true });
const buffer = await Packer.toBuffer(doc);
await fs.promises.writeFile(OUTPUT_PATH, buffer);
console.log(OUTPUT_PATH);
