import type { Agent } from '@/types'

type AgentRoleMeta = {
  compactLabel: string
  summary: string
}

const AGENT_ROLE_META: Partial<Record<string, AgentRoleMeta>> = {
  'ceo-sec': {
    compactLabel: '대표 보좌',
    summary: '대표 일정, 결재 준비, 대외 커뮤니케이션 초안을 정리합니다.',
  },
  'exec-coo': {
    compactLabel: '회의·일정 운영',
    summary: '회의 운영, 일정 조율, 후속 확인과 리마인드를 맡습니다.',
  },
}

export function getAgentRoleCompactLabel(agent: Pick<Agent, 'id' | 'role'>): string {
  return AGENT_ROLE_META[agent.id]?.compactLabel ?? agent.role
}

export function getAgentRoleSummary(agent: Pick<Agent, 'id' | 'role'>): string | null {
  return AGENT_ROLE_META[agent.id]?.summary ?? null
}

export function formatAgentDisplayName(agent: Pick<Agent, 'id' | 'name' | 'role'>): string {
  return `${agent.name} · ${getAgentRoleCompactLabel(agent)}`
}

export function formatSystemDisplayName(owner: string, purpose: string): string {
  return `${owner} · ${purpose}`
}
