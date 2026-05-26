import { useEffect, useRef, useState } from 'react'
import { useAgentStore } from '@/store/agentStore'
import { useShallow } from 'zustand/react/shallow'
import { DEPARTMENTS, DIVISIONS, DepartmentId, Agent } from '@/types'
import { getAgentRoleCompactLabel, getAgentRoleSummary } from '@/utils/agentRoleMeta'

const MODEL_OPTIONS: Agent['model'][] = [
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
  'gpt-4o',
  'gpt-4o-mini',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
]

const MODEL_LABEL: Record<Agent['model'], string> = {
  'claude-opus-4-6': 'Claude Opus 4.6',
  'claude-sonnet-4-6': 'Claude Sonnet 4.6',
  'claude-haiku-4-5-20251001': 'Claude Haiku 4.5',
  'gpt-4o': 'GPT-4o',
  'gpt-4o-mini': 'GPT-4o mini',
  'gemini-2.5-pro': 'Gemini 2.5 Pro',
  'gemini-2.5-flash': 'Gemini 2.5 Flash',
}

type ModelRecommendation = { model: Agent['model']; reason: string }

const DEPT_RECOMMENDATION: Record<DepartmentId, ModelRecommendation> = {
  ceo: { model: 'claude-opus-4-6', reason: '사업 우선순위 통합과 최종 판단에는 깊은 추론이 필요합니다.' },
  executive: { model: 'gemini-2.5-pro', reason: '사업 포트폴리오, 일정, 전략 방향을 넓은 맥락에서 비교하기 좋습니다.' },
  management: { model: 'gpt-4o', reason: '행정과 운영 문서를 안정적으로 정리하고 체크리스트화하기 좋습니다.' },
  finance: { model: 'gpt-4o', reason: '회계와 세무 데이터를 정확하게 분류하고 정리하는 데 강점이 있습니다.' },
  hr: { model: 'gemini-2.5-flash', reason: '인사 공지, 채용 문안, 반복 커뮤니케이션을 빠르게 처리하기 좋습니다.' },
  legal: { model: 'gemini-2.5-pro', reason: '법무와 특허 문서의 조항을 넓은 맥락에서 비교하고 분석하기 좋습니다.' },
  security: { model: 'claude-opus-4-6', reason: '진단 도구와 문항 구조, 적용 기준을 판단하는 데 정교한 추론이 중요합니다.' },
  development: { model: 'claude-sonnet-4-6', reason: '자동화와 파이프라인 구현 설계를 균형 있게 처리하기 좋습니다.' },
  compliance: { model: 'gpt-4o', reason: '진단 데이터, 통계, 리포트 문장을 구조화하는 데 강점이 있습니다.' },
  qa: { model: 'claude-sonnet-4-6', reason: '오류 대응과 품질 검증 기준을 코드 관점에서 분석하는 데 강점이 있습니다.' },
  devops: { model: 'claude-sonnet-4-6', reason: '운영 절차, 백업, 권한, 자동화 흐름을 함께 다루기에 적합합니다.' },
  planning: { model: 'gemini-2.5-pro', reason: '진단 제품 방향, 비교, 아이디어, 로드맵 정리에 강점이 있습니다.' },
  support: { model: 'gpt-4o', reason: '교육 과정, 자격증, 강의 운영 문서를 안정적으로 작성하기 좋습니다.' },
  customer: { model: 'gpt-4o-mini', reason: '고객 문의 1차 안내와 사례 분류를 비용 효율적으로 처리하기 좋습니다.' },
  sales: { model: 'gpt-4o', reason: 'B2B 제안서와 고객 획득 문안의 완성도를 높이기 좋습니다.' },
  b2g: { model: 'gpt-4o', reason: '공공기관 제안서와 조사 서류를 구조적으로 정리하는 데 적합합니다.' },
  expertsales: { model: 'gpt-4o', reason: '전문가 양성 일정, 메시지, 설명 자료를 작성하기 좋습니다.' },
  marketing: { model: 'claude-sonnet-4-6', reason: '콘텐츠와 캠페인 문안을 자연스럽고 설득력 있게 작성하기 좋습니다.' },
  global: { model: 'gemini-2.5-pro', reason: '해외 시장 분석과 파트너십 전략을 넓은 맥락에서 다루기 좋습니다.' },
  presales: { model: 'claude-sonnet-4-6', reason: 'HR, 창업, AI 트렌드를 사업 인사이트로 연결하는 데 강점이 있습니다.' },
  trend: { model: 'claude-sonnet-4-6', reason: '트렌드 분석을 사업 기회 신호로 바꾸는 데 강점이 있습니다.' },
}

const AGENT_RECOMMENDATION_OVERRIDE: Partial<Record<string, ModelRecommendation>> = {
  'exec-coo': { model: 'gpt-4o', reason: '일정, 회의록, 실행 우선순위 정리를 안정적으로 처리하기 좋습니다.' },
  'sec-01': { model: 'gpt-4o', reason: '진단 도구 이용법과 리포트 구조를 검증 목록으로 정리하는 데 강점이 있습니다.' },
  'sec-02': { model: 'gemini-2.5-pro', reason: '조직과 창업자 진단 흐름을 넓은 지표로 비교 분석하기 좋습니다.' },
  'mgmt-hr': { model: 'gemini-2.5-flash', reason: '행정 공지와 반복 커뮤니케이션을 빠르게 처리하기 좋습니다.' },
  'dev-01': { model: 'claude-sonnet-4-6', reason: '리포트 자동화 코드 작성과 로직 오류 분석을 정확하게 처리하기 좋습니다.' },
  'dev-02': { model: 'claude-sonnet-4-6', reason: '데이터 파이프라인 구조 설계와 구현을 균형 있게 처리하기 좋습니다.' },
  'qa-01': { model: 'gemini-2.5-flash', reason: '오류 사례 확장과 반복 응답 초안을 빠르게 작성하기 좋습니다.' },
  'ops-01': { model: 'gpt-4o-mini', reason: '운영 체크리스트와 라이선스 안내를 비용 효율적으로 처리하기 좋습니다.' },
  'plan-01': { model: 'gpt-4o', reason: '진단 제품 요구사항을 명세와 사용 기준으로 구조화하는 데 강점이 있습니다.' },
  'sup-01': { model: 'gemini-2.5-flash', reason: '교육 운영 후속 안내와 요약 메시지를 빠르게 작성하기 좋습니다.' },
  'sal-01': { model: 'gemini-2.5-flash', reason: '세일즈 문안 A/B안과 맞춤형 첫 접점을 빠르게 생성하기 좋습니다.' },
}

const STATUS_LABEL: Record<Agent['status'], string> = {
  idle: '대기',
  working: '작업 중',
  thinking: '생각 중',
  debating: '토론 중',
  moving: '회의 대기',
}

function getRecommendedModel(agent: Agent): ModelRecommendation {
  return AGENT_RECOMMENDATION_OVERRIDE[agent.id] ?? DEPT_RECOMMENDATION[agent.departmentId]
}

export default function AgentsView() {
  const { agents, updateAgent, setActiveView } = useAgentStore(
    useShallow((s) => ({
      agents: s.agents,
      updateAgent: s.updateAgent,
      setActiveView: s.setActiveView,
    }))
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editRole, setEditRole] = useState('')
  const [editModel, setEditModel] = useState<Agent['model']>('claude-sonnet-4-6')
  const [saved, setSaved] = useState(false)
  const [tooltip, setTooltip] = useState<string | null>(null)
  const [inlineEditId, setInlineEditId] = useState<string | null>(null)
  const [inlineEditValue, setInlineEditValue] = useState('')
  const inlineInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (window.innerWidth >= 768 && selectedId === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedId(agents[0]?.id ?? null)
    }
  }, [agents, selectedId])

  const selectedAgent = agents.find((agent) => agent.id === selectedId) ?? null
  const isDirty = selectedAgent !== null && (
    editName !== selectedAgent.name ||
    editRole !== selectedAgent.role ||
    editModel !== selectedAgent.model
  )

  useEffect(() => {
    if (!selectedAgent) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEditName(selectedAgent.name)
    setEditRole(selectedAgent.role)
    setEditModel(selectedAgent.model)
  }, [selectedAgent])

  const groupedByDivision = Object.values(DIVISIONS)
    .map((division) => ({
      division,
      depts: division.departments
        .map((deptId) => ({
          dept: DEPARTMENTS[deptId],
          agents: agents.filter((agent) => agent.departmentId === deptId),
        }))
        .filter((group) => group.agents.length > 0),
    }))
    .filter((group) => group.depts.length > 0)

  function selectAgent(agent: Agent) {
    setSelectedId(agent.id)
    setSaved(false)
    setTooltip(null)
    setInlineEditId(null)
  }

  function startInlineEdit(agent: Agent, event: React.MouseEvent) {
    event.stopPropagation()
    setInlineEditId(agent.id)
    setInlineEditValue(agent.name)
    setTimeout(() => inlineInputRef.current?.select(), 0)
  }

  function commitInlineEdit(agentId: string) {
    const trimmed = inlineEditValue.trim()
    if (trimmed) {
      updateAgent(agentId, { name: trimmed })
      if (agentId === selectedId) setEditName(trimmed)
    }
    setInlineEditId(null)
  }

  function handleInlineKeyDown(event: React.KeyboardEvent, agentId: string) {
    if (event.key === 'Enter') commitInlineEdit(agentId)
    if (event.key === 'Escape') setInlineEditId(null)
  }

  function handleSave() {
    if (!selectedId) return
    updateAgent(selectedId, { name: editName.trim(), role: editRole.trim(), model: editModel })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const recommendation = selectedAgent ? getRecommendedModel(selectedAgent) : null
  const showDetail = selectedId !== null

  return (
    <section className="flex flex-1 overflow-hidden bg-office-bg">
      <div className={`${showDetail ? 'hidden md:flex' : 'flex'} w-full flex-col overflow-y-auto border-r border-office-panel bg-office-sidebar p-4 md:w-72 md:shrink-0`}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-office-active">에이전트</p>
            <h2 className="mt-0.5 text-lg font-semibold text-white">조직 구성</h2>
          </div>
          <button
            type="button"
            onClick={() => setActiveView('dashboard')}
            className="rounded border border-office-panel/70 bg-office-panel px-2 py-1 text-xs text-office-text transition-colors hover:border-office-active hover:text-white"
          >
            대시보드로
          </button>
        </div>

        <div className="space-y-5">
          {groupedByDivision.map(({ division, depts }) => (
            <div key={division.id}>
              <div className="mb-2 flex items-center gap-2 border-b border-office-panel/50 pb-1">
                <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: division.color }} />
                <p className="text-[11px] font-bold tracking-wide" style={{ color: division.color }}>
                  {division.name}
                </p>
              </div>

              <div className="space-y-3 pl-1">
                {depts.map(({ dept, agents: deptAgents }) => (
                  <div key={dept.id}>
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-office-text/50">
                      {dept.name}
                    </p>
                    <div className="space-y-1">
                      {deptAgents.map((agent) => {
                        const rec = getRecommendedModel(agent)
                        const isOnRecommended = agent.model === rec.model
                        return (
                          <div
                            key={agent.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => selectAgent(agent)}
                            onKeyDown={(event) => event.key === 'Enter' && selectAgent(agent)}
                            className={`w-full cursor-pointer rounded-lg border px-3 py-2 text-left transition-colors ${
                              selectedId === agent.id
                                ? 'border-office-active bg-office-active/20'
                                : 'border-office-panel/50 bg-office-panel/30 hover:border-office-active/50'
                            }`}
                          >
                            {inlineEditId === agent.id ? (
                              <input
                                ref={inlineInputRef}
                                type="text"
                                value={inlineEditValue}
                                onChange={(event) => setInlineEditValue(event.target.value)}
                                onBlur={() => commitInlineEdit(agent.id)}
                                onKeyDown={(event) => handleInlineKeyDown(event, agent.id)}
                                onClick={(event) => event.stopPropagation()}
                                className="w-full rounded bg-office-bg px-1.5 py-0.5 text-sm font-semibold text-white outline-none ring-1 ring-office-active"
                              />
                            ) : (
                              <div className="flex items-center justify-between gap-1">
                                <p className="text-sm font-semibold text-white">{agent.name}</p>
                                {selectedId === agent.id ? (
                                  <button
                                    type="button"
                                    onClick={(event) => startInlineEdit(agent, event)}
                                    className="shrink-0 rounded p-0.5 text-office-text/30 transition-colors hover:text-office-active"
                                    title="이름 수정"
                                  >
                                    <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
                                      <path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.468-.325z" />
                                    </svg>
                                  </button>
                                ) : null}
                              </div>
                            )}
                            <p className="truncate text-[11px] text-office-text/50" title={agent.role}>
                              {getAgentRoleCompactLabel(agent)}
                            </p>
                            <div className="mt-0.5 flex items-center gap-1.5">
                              <p className="text-[10px] text-office-active/70">{MODEL_LABEL[agent.model]}</p>
                              {!isOnRecommended ? (
                                <span className="rounded bg-yellow-500/20 px-1 py-0.5 text-[9px] font-semibold text-yellow-400">
                                  비추천
                                </span>
                              ) : null}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={`${!showDetail ? 'hidden md:flex' : 'flex'} flex-1 flex-col overflow-y-auto`}>
        {selectedAgent ? (
          <div className="mx-auto w-full max-w-2xl space-y-6 p-4 md:p-6">
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="flex items-center gap-1 text-sm text-office-text/60 transition-colors hover:text-white md:hidden"
            >
              목록으로
            </button>

            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: DEPARTMENTS[selectedAgent.departmentId].color }} />
                  <p className="text-sm text-office-text/60">
                    {DIVISIONS[DEPARTMENTS[selectedAgent.departmentId].divisionId].name}
                    {' · '}
                    {DEPARTMENTS[selectedAgent.departmentId].name}
                  </p>
                </div>
                <h3 className="mt-1 text-2xl font-semibold text-white">{selectedAgent.name}</h3>
                {getAgentRoleSummary(selectedAgent) ? (
                  <p className="mt-2 text-sm leading-relaxed text-office-text/70">
                    {getAgentRoleSummary(selectedAgent)}
                  </p>
                ) : null}
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  selectedAgent.status === 'idle'
                    ? 'bg-office-panel text-office-text/60'
                    : 'bg-office-active/20 text-office-active'
                }`}
              >
                {STATUS_LABEL[selectedAgent.status]}
              </span>
            </div>

            <div className="space-y-5 rounded-2xl border border-office-panel bg-office-sidebar p-6">
              <p className="text-sm font-semibold text-white">에이전트 설정</p>

              <div>
                <label htmlFor="agent-name" className="mb-1 block text-xs text-office-text/60">이름</label>
                <input
                  id="agent-name"
                  type="text"
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  className="w-full rounded border border-office-panel/50 bg-office-panel px-3 py-2 text-sm text-white focus:border-office-active focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="agent-role" className="mb-1 block text-xs text-office-text/60">역할</label>
                <input
                  id="agent-role"
                  type="text"
                  value={editRole}
                  onChange={(event) => setEditRole(event.target.value)}
                  className="w-full rounded border border-office-panel/50 bg-office-panel px-3 py-2 text-sm text-white focus:border-office-active focus:outline-none"
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-xs text-office-text/60">AI 모델</label>
                  {recommendation ? (
                    <span className="text-[10px] text-office-text/40">
                      추천: <span className="text-office-active/80">{MODEL_LABEL[recommendation.model]}</span>
                    </span>
                  ) : null}
                </div>
                <div className="relative grid grid-cols-2 gap-2">
                  {MODEL_OPTIONS.map((model) => {
                    const isRecommended = recommendation?.model === model
                    const isSelected = editModel === model
                    return (
                      <div key={model} className="relative">
                        <button
                          type="button"
                          onClick={() => setEditModel(model)}
                          onMouseEnter={() => setTooltip(isRecommended ? model : null)}
                          onMouseLeave={() => setTooltip(null)}
                          className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                            isSelected
                              ? 'border-office-active bg-office-active/20 text-office-active'
                              : isRecommended
                                ? 'border-emerald-500/50 bg-emerald-500/5 text-office-text hover:border-emerald-500/80'
                                : 'border-office-panel/50 bg-office-panel/40 text-office-text hover:border-office-active/50'
                          }`}
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span className="leading-tight">{MODEL_LABEL[model]}</span>
                            {isRecommended ? (
                              <span className="shrink-0 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400">
                                추천
                              </span>
                            ) : null}
                          </span>
                        </button>

                        {isRecommended && tooltip === model ? (
                          <div className="absolute bottom-full left-0 z-10 mb-2 w-56 rounded-lg border border-emerald-500/30 bg-office-sidebar px-3 py-2 shadow-xl">
                            <p className="mb-0.5 text-[11px] font-semibold text-emerald-400">이 에이전트에게 추천하는 이유</p>
                            <p className="text-[11px] leading-relaxed text-office-text/80">{recommendation?.reason}</p>
                            <div className="absolute -bottom-1.5 left-4 h-2.5 w-2.5 rotate-45 border-b border-r border-emerald-500/30 bg-office-sidebar" />
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!isDirty}
                  className="rounded border border-office-active/40 bg-office-active/10 px-5 py-2 text-sm font-semibold text-office-active transition-colors hover:bg-office-active/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  저장
                </button>
                {recommendation && editModel !== recommendation.model && !saved ? (
                  <span className="text-[11px] text-yellow-400/80">
                    추천 모델({MODEL_LABEL[recommendation.model]})과 다릅니다.
                  </span>
                ) : null}
                {isDirty && editModel === recommendation?.model && !saved ? (
                  <span className="text-xs text-yellow-400">저장되지 않은 변경 사항이 있습니다.</span>
                ) : null}
                {saved ? <span className="text-sm text-office-active">저장되었습니다.</span> : null}
              </div>
            </div>

            <div className="rounded-2xl border border-office-panel bg-office-sidebar p-6">
              <p className="mb-3 text-sm font-semibold text-white">현재 상태</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-office-text/60">부서</span>
                  <span className="text-white">{DEPARTMENTS[selectedAgent.departmentId].name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-office-text/60">상태</span>
                  <span className="text-white">{STATUS_LABEL[selectedAgent.status]}</span>
                </div>
                {selectedAgent.message ? (
                  <div className="flex justify-between gap-4">
                    <span className="shrink-0 text-office-text/60">메시지</span>
                    <span className="text-right text-office-text">{selectedAgent.message}</span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-office-text/50">
            에이전트를 선택해 주세요.
          </div>
        )}
      </div>
    </section>
  )
}
