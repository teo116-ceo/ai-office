import { useAgentStore } from '@/store/agentStore'
import { DEPARTMENTS, type DepartmentId, type FloorId } from '@/types'
import { callLLM } from './multiProviderApi'
import { resolveByKeyword } from './taskRouting'

// ── 부서별 관련 부서 맵 ──────────────────────────────────────────────────────────
const RELATED_DEPTS: Partial<Record<DepartmentId, DepartmentId[]>> = {
  sales:       ['legal', 'finance'],
  b2g:         ['legal', 'compliance'],
  expertsales: ['sales', 'support'],
  global:      ['sales', 'legal'],
  marketing:   ['planning', 'sales'],
  presales:    ['sales', 'hr'],
  trend:       ['marketing', 'planning'],
  development: ['qa', 'devops'],
  qa:          ['development', 'devops'],
  devops:      ['development', 'qa'],
  security:    ['compliance', 'development'],
  planning:    ['development', 'sales'],
  compliance:  ['legal', 'development'],
  finance:     ['management', 'legal'],
  hr:          ['management', 'legal'],
  legal:       ['management', 'compliance'],
  management:  ['finance', 'hr'],
  support:     ['customer', 'hr'],
  customer:    ['support', 'sales'],
  ceo:         [],
  executive:   [],
}

// CEO LLM 라우팅: 사용자 메시지를 분석해 담당 부서 목록 반환
export async function routeByLLM(message: string): Promise<DepartmentId[]> {
  const store = useAgentStore.getState()
  const ceoAgent = store.agents.find((agent) => agent.departmentId === 'ceo')

  if (ceoAgent) {
    store.updateAgentStatus(ceoAgent.id, 'thinking', '요청을 분석해 담당 부서를 정하는 중...')
  }

  try {
    const deptDescriptions = [
      'ceo: 대표/총괄·우선순위·최종 통합·의사결정',
      'executive: 전략/비서·대표 일정·미팅·사업 포트폴리오',
      'security: R&D 관리·ICRU 기질진단·조직 진단·창업자 진단·문항/척도',
      'compliance: 데이터 관리·진단 결과·통계·리포트 자동화·기관 결과보고',
      'management: 경영지원·행정·계약 관리·사무용품·복리후생',
      'development: 자동화개발·리포트 자동화·데이터 파이프라인·내부 도구·API',
      'qa: 오류대응/검증·버그 재현·품질 분류·해결 트래킹',
      'devops: 운영자동화·서버·배포·백업·권한·알림·운영 프로세스',
      'planning: 제품기획·개인/기관/조직/창업자 진단 상품·로드맵·상용화',
      'support: 교육운영·전문 강사·강의 이력·자격증·자격 시험',
      'sales: 민간기업·스타트업·개인 대상 세일즈·리드 관리·B2B 제안서·파이프라인 (공공기관 제외)',
      'b2g: 공공기관·지자체·정부부처·공공 예산 사업 대상 영업·입찰·기관 제안서·공공 계약',
      'expertsales: 전문가 양성·수강생 모집·자격증 과정 세일즈·설명회',
      'presales: 리서치/인사이트·HR·창업·AI·경제/시사 트렌드 분석',
      'marketing: 마케팅·콘텐츠·캠페인·타겟 분석·브랜드·SNS 홍보',
      'finance: 재무·회계·정산·비용 분석·세무·손익',
      'hr: 인사·채용·계약서·온보딩·조직 관리·급여',
      'legal: 법무·계약서 검토·리스크 분석·특허·법적 의견',
      'customer: 고객서비스·문의 응대·불만 처리·진단 결과 해석 안내',
      'global: 해외사업·글로벌 파트너십·현지화·해외 시장 진출',
      'trend: 트렌드 분석·시장 동향·경쟁사 분석·기회 발굴',
    ].join('\n')

    const raw = await callLLM({
      model: ceoAgent?.model ?? 'claude-opus-4-6',
      maxTokens: 128,
      system: [
        '당신은 AI 오피스의 업무 라우팅 담당입니다.',
        '사용자 요청을 처리할 부서 ID를 JSON 배열로만 반환하세요. 설명 없이 배열만 출력합니다.',
        '각 부서 역할:\n' + deptDescriptions,
        '규칙: 요청과 직접 관련된 부서만 선택. 관련 없는 부서는 포함하지 마세요.',
      ].join('\n'),
      messages: [{
        role: 'user',
        content: `다음 요청을 처리할 부서를 선택하세요.\n\n${message}`,
      }],
    })

    const match = raw.match(/\[[\s\S]*?\]/)
    if (match) {
      const parsed: unknown = JSON.parse(match[0])
      if (Array.isArray(parsed) && parsed.length > 0) {
        const validDeptIds = new Set(Object.keys(DEPARTMENTS))
        const filtered = parsed.filter(
          (item): item is DepartmentId => typeof item === 'string' && validDeptIds.has(item),
        )
        if (filtered.length > 0) return filtered
      }
    }
  } catch {
    // 키워드 라우팅으로 대체
  }

  return resolveByKeyword(message)
}

/**
 * 관련 부서가 팀 채널에 짧게 반응하도록 비동기 트리거
 * 주담당 부서 응답 후 1~2개 관련 부서가 자신의 관점에서 2~3문장 코멘트
 */
export async function fireRelatedReactions(
  mainDeptId: DepartmentId,
  userMessage: string,
  mainResult: string,
  channelFloorId: FloorId,
  taskId: string,
): Promise<void> {
  const related = (RELATED_DEPTS[mainDeptId] ?? []).slice(0, 2)
  if (related.length === 0) return

  const store = useAgentStore.getState()

  for (const relDeptId of related) {
    await new Promise((r) => setTimeout(r, 1200))

    const relAgent = store.agents.find((a) => a.departmentId === relDeptId)
    if (!relAgent) continue

    const dept = DEPARTMENTS[relDeptId]
    const systemPrompt = `당신은 주식회사 지음과깃듬 ${dept.name}의 ${relAgent.name}입니다.
팀 채팅에서 동료 부서의 업무 결과를 보고 당신의 전문 영역 관점에서 짧게 코멘트합니다.
- 반드시 2~3문장 이내
- 구어체, 자연스러운 직장 동료 말투
- 불필요한 인사말 없이 바로 핵심만
- 필요하면 협조 요청이나 추가 확인 사항을 제안`

    const userPrompt = `[팀 채팅 상황]
사용자 요청: ${userMessage.slice(0, 300)}

[${DEPARTMENTS[mainDeptId].name}팀 응답 요약]
${mainResult.slice(0, 600)}

위 내용에 대해 ${dept.name} 입장에서 짧게 코멘트해주세요.`

    try {
      store.updateAgentStatus(relAgent.id, 'thinking', '채팅 내용 검토 중...')

      const comment = await callLLM({
        model: relAgent.model ?? 'claude-haiku-4-5-20251001',
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        maxTokens: 200,
      })

      if (comment.trim()) {
        store.addMessage({
          sender: relAgent.id,
          senderName: `${relAgent.name} (${dept.name})`,
          content: comment.trim(),
          type: 'result',
          taskId,
          departmentIds: [mainDeptId],
          channelFloorId,
        })
      }
    } catch (e) {
      console.warn(`[fireRelatedReactions] ${relDeptId} 반응 실패:`, e)
    } finally {
      store.updateAgentStatus(relAgent.id, 'idle')
    }
  }
}
