import type { AgentMemory } from '@/types'
import { SectionCard, OptionRow, ToggleButton } from './SettingsPrimitives'

interface Props {
  memoryEnabled: boolean
  memories: AgentMemory[]
  setMemoryEnabled: (enabled: boolean) => void
  clearMemories: () => void
}

export default function MemorySection({ memoryEnabled, memories, setMemoryEnabled, clearMemories }: Props) {
  return (
    <SectionCard
      title="업무 메모리"
      description="완료된 업무 결과를 AI가 자동으로 요약해 저장합니다. 이후 관련 업무 요청 시 과거 맥락을 참고할 수 있습니다."
    >
      <OptionRow
        label="메모리 사용"
        description={memoryEnabled
          ? `활성화됨 — 현재 ${memories.length}개의 업무 메모리가 저장되어 있습니다.`
          : '비활성화됨 — 과거 업무를 자동 참고하지 않습니다.'}
        actions={
          <div className="flex gap-2">
            <ToggleButton active={memoryEnabled} label="켜기" onClick={() => setMemoryEnabled(true)} />
            <ToggleButton active={!memoryEnabled} label="끄기" onClick={() => setMemoryEnabled(false)} />
          </div>
        }
      />

      {memories.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-office-panel/70 bg-office-panel/40 px-4 py-4">
            <div>
              <p className="text-sm font-semibold text-white">저장된 메모리 관리</p>
              <p className="mt-1 text-xs text-office-text/60">
                {memories.length}개 저장됨 · 가장 오래된 항목부터 자동 삭제됩니다 (최대 200개).
              </p>
              <div className="mt-2 flex max-h-20 flex-wrap gap-1.5 overflow-y-auto">
                {memories.slice(-6).reverse().map((memory) => (
                  <span key={memory.id} className="rounded-full border border-office-panel/60 bg-office-panel/40 px-2 py-0.5 text-[11px] text-office-text/70">
                    {memory.title.slice(0, 20)}
                  </span>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={clearMemories}
              className="shrink-0 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400 transition-colors hover:bg-red-500/20"
            >
              전체 삭제
            </button>
          </div>

          <EmbeddingStatus memories={memories} />
        </div>
      ) : null}
    </SectionCard>
  )
}

function EmbeddingStatus({ memories }: { memories: AgentMemory[] }) {
  const withEmbedding = memories.filter((memory) => memory.embedding && memory.embedding.length > 0).length
  const withoutEmbedding = memories.length - withEmbedding
  const pct = Math.round((withEmbedding / memories.length) * 100)

  return (
    <div className="rounded-xl border border-office-panel/70 bg-office-panel/40 px-4 py-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-white">스마트 검색</p>
          <p className="mt-0.5 text-[11px] text-office-text/50">서로 비슷한 과거 업무를 자동으로 찾아줍니다.</p>
        </div>
        <span className={`text-xs font-semibold ${
          withEmbedding === memories.length
            ? 'text-green-400'
            : withEmbedding > 0
              ? 'text-yellow-400'
              : 'text-office-text/50'
        }`}>
          {withEmbedding === memories.length ? '전체 준비됨' : withEmbedding > 0 ? '일부 준비됨' : '미준비'}
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full rounded-full bg-office-panel">
        <div className="h-1.5 rounded-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1.5 text-[11px] text-office-text/50">
        {withEmbedding}/{memories.length}개 준비 완료
        {withoutEmbedding > 0
          ? ` · 나머지 ${withoutEmbedding}개는 기본 키워드 검색 사용 (OpenAI 키 연결 시 스마트 검색 가능)`
          : ' · 모든 메모리가 스마트 검색 가능합니다.'}
      </p>
    </div>
  )
}
