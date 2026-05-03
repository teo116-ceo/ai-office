import type { OrganizationDirective } from '@/types'
import { SectionCard } from './SettingsPrimitives'

interface Props {
  directives: OrganizationDirective[]
  clearDirectives: (kind?: 'meeting' | 'announcement') => void
}

export default function DirectivesSection({ directives, clearDirectives }: Props) {
  return (
    <SectionCard
      title="활성 전사 지시"
      description="현재 이후 업무와 에이전트 행동에 반영되는 공지와 지시입니다."
    >
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => clearDirectives('meeting')}
          className="rounded border border-office-panel/70 bg-office-panel px-4 py-2 text-sm text-office-text transition-colors hover:border-office-active hover:text-white"
        >
          회의 지시 해제
        </button>
        <button
          type="button"
          onClick={() => clearDirectives()}
          className="rounded border border-office-panel/70 bg-office-panel px-4 py-2 text-sm text-office-text transition-colors hover:border-office-active hover:text-white"
        >
          전체 공지 해제
        </button>
      </div>

      {directives.length > 0 ? (
        <div className="space-y-3">
          {[...directives].reverse().map((directive) => (
            <DirectiveCard key={directive.id} directive={directive} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-office-text/50">현재 적용 중인 전사 지시가 없습니다.</p>
      )}
    </SectionCard>
  )
}

function DirectiveCard({ directive }: { directive: OrganizationDirective }) {
  const dateStr = directive.createdAt.toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className="rounded-xl border border-office-panel/70 bg-office-panel/40 px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{directive.title}</p>
          <p className="mt-1 text-xs text-office-text/60">
            {directive.kind === 'meeting' ? '회의 지시' : '전사 공지'}
          </p>
        </div>
        <p className="text-xs text-office-text/40">{dateStr}</p>
      </div>
      <p className="mt-3 text-sm text-office-text">{directive.summary}</p>
      <p className="mt-2 text-xs text-office-text/60">{directive.behaviorInstruction}</p>
    </div>
  )
}
