import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { resolveDepartmentFloor } from '@/services/directives'
import { exportTask, exportAllTasks } from '@/services/exportService'
import MessageContent from '@/components/layout/MessageContent'
import { useAgentStore } from '@/store/agentStore'
import { DEPARTMENTS, Task } from '@/types'

type TaskFilter = 'all' | Task['status']

const FILTERS: Array<{ id: TaskFilter; label: string }> = [
  { id: 'all', label: '전체' },
  { id: 'pending', label: '대기' },
  { id: 'in_progress', label: '진행 중' },
  { id: 'completed', label: '완료' },
  { id: 'failed', label: '실패' },
]

const STATUS_LABEL: Record<Task['status'], string> = {
  pending: '대기',
  in_progress: '진행 중',
  completed: '완료',
  failed: '실패',
}

export default function TasksView() {
  const { tasks, setActiveView, setCurrentFloor } = useAgentStore()
  const [filter, setFilter] = useState<TaskFilter>('all')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)

  const filteredTasks = useMemo(() => {
    const sorted = [...tasks].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    return filter === 'all' ? sorted : sorted.filter((task) => task.status === filter)
  }, [filter, tasks])

  useEffect(() => {
    if (filteredTasks.length === 0) {
      setSelectedTaskId(null)
      return
    }
    if (!selectedTaskId || !filteredTasks.some((task) => task.id === selectedTaskId)) {
      setSelectedTaskId(filteredTasks[0].id)
    }
  }, [filteredTasks, selectedTaskId])

  const selectedTask = filteredTasks.find((task) => task.id === selectedTaskId) ?? null

  return (
    <section className="flex flex-1 overflow-hidden bg-office-bg">
      <div className="w-[340px] shrink-0 border-r border-office-panel bg-office-sidebar p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-office-active">작업 관리</p>
            <h2 className="mt-1 text-xl font-semibold text-white">업무 목록</h2>
          </div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setActiveView('office')}
              className="rounded border border-office-panel/70 bg-office-panel px-3 py-2 text-xs text-office-text transition-colors hover:border-office-active hover:text-white"
            >
              AI 오피스
            </button>
            <button
              type="button"
              onClick={() => exportAllTasks(tasks)}
              disabled={tasks.length === 0}
              className="rounded border border-office-panel/70 bg-office-panel px-3 py-2 text-xs text-office-text transition-colors hover:border-office-active hover:text-white disabled:opacity-40"
              title="전체 작업 마크다운 내보내기"
            >
              전체 내보내기
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                filter === item.id
                  ? 'border-office-active bg-office-active/20 text-office-active'
                  : 'border-office-panel/70 bg-office-panel text-office-text hover:border-office-active hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-3 overflow-y-auto pr-1" style={{ maxHeight: 'calc(100vh - 240px)' }}>
          {filteredTasks.length > 0 ? filteredTasks.map((task) => (
            <button
              key={task.id}
              type="button"
              onClick={() => setSelectedTaskId(task.id)}
              className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                selectedTaskId === task.id
                  ? 'border-office-active bg-office-active/20'
                  : 'border-office-panel/70 bg-office-panel/50 hover:border-office-active hover:bg-office-panel/80'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-sm font-semibold text-white">{task.title}</p>
                <span className="text-[11px] text-office-active">{STATUS_LABEL[task.status]}</span>
              </div>
              <p className="mt-2 text-xs text-office-text/60">
                {task.createdAt.toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </p>
              <p className="mt-2 text-xs text-office-text/50">
                담당: {task.assignedTo.length > 0 ? task.assignedTo.map((deptId) => DEPARTMENTS[deptId].name).join(', ') : '미배정'}
              </p>
            </button>
          )) : (
            <div className="rounded-xl border border-dashed border-office-panel/70 bg-office-panel/30 px-4 py-8 text-center text-sm text-office-text/50">
              조건에 맞는 업무가 없습니다.
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {selectedTask ? (
          <TaskDetail
            task={selectedTask}
            onOpenOffice={() => {
              const [firstDepartment] = selectedTask.assignedTo
              if (firstDepartment) {
                setCurrentFloor(resolveDepartmentFloor(firstDepartment))
              }
              setActiveView('office')
            }}
            onOpenChat={() => setActiveView('chat')}
          />
        ) : (
          <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-office-panel/70 bg-office-sidebar text-office-text/50">
            표시할 업무가 없습니다.
          </div>
        )}
      </div>
    </section>
  )
}

function TaskDetail({
  task,
  onOpenOffice,
  onOpenChat,
}: {
  task: Task
  onOpenOffice: () => void
  onOpenChat: () => void
}) {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="rounded-2xl border border-office-panel bg-office-sidebar p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-office-active">{STATUS_LABEL[task.status]}</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">{task.title}</h3>
            <p className="mt-2 text-sm text-office-text/60">
              생성 시각 {task.createdAt.toLocaleString('ko-KR')}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onOpenOffice}
              className="rounded border border-office-panel/70 bg-office-panel px-3 py-2 text-sm text-office-text transition-colors hover:border-office-active hover:text-white"
            >
              AI 오피스에서 보기
            </button>
            <button
              type="button"
              onClick={onOpenChat}
              className="rounded border border-office-panel/70 bg-office-panel px-3 py-2 text-sm text-office-text transition-colors hover:border-office-active hover:text-white"
            >
              팀 채팅 열기
            </button>
            <button
              type="button"
              onClick={() => exportTask(task)}
              className="rounded border border-office-active/40 bg-office-active/10 px-3 py-2 text-sm text-office-active transition-colors hover:bg-office-active/20"
            >
              MD 내보내기
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {task.assignedTo.map((deptId) => (
            <span
              key={deptId}
              className="rounded-full border border-office-panel/70 bg-office-panel/50 px-3 py-1 text-xs text-office-text"
            >
              {DEPARTMENTS[deptId].name}
            </span>
          ))}
        </div>
      </div>

      <SectionCard title="요청 설명">
        <pre className="whitespace-pre-wrap font-inherit text-sm text-office-text">{task.description}</pre>
      </SectionCard>

      <SectionCard title="첨부 파일">
        {task.attachments && task.attachments.length > 0 ? (
          <div className="space-y-2">
            {task.attachments.map((attachment) => (
              <div key={attachment.id} className="rounded-xl border border-office-panel/70 bg-office-panel/40 px-4 py-3">
                <p className="text-sm font-semibold text-white">{attachment.name}</p>
                <p className="mt-1 text-xs text-office-text/60">{attachment.summary}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-office-text/50">첨부 파일이 없습니다.</p>
        )}
      </SectionCard>

      <SectionCard title="실행 결과">
        {task.result ? (
          <div className="max-h-[520px] overflow-y-auto text-sm">
            <MessageContent content={task.result} />
          </div>
        ) : (
          <p className="text-sm text-office-text/50">
            아직 결과가 기록되지 않았습니다.
          </p>
        )}
      </SectionCard>
    </div>
  )
}

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-office-panel bg-office-sidebar p-6">
      <p className="text-sm font-semibold text-white">{title}</p>
      <div className="mt-4">{children}</div>
    </div>
  )
}
