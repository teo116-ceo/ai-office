import { useCallback, useEffect, useMemo, useState } from 'react'
import { Task } from '@/types'
import { resolveDepartmentFloor } from '@/services/directives'
import { useTaskActions } from '@/hooks/useTaskActions'
import { useAgentStore } from '@/store/agentStore'
import { useShallow } from 'zustand/react/shallow'
import { type TaskFilter } from './tasks/taskConstants'
import { TaskListPanel } from './tasks/TaskListPanel'
import { TaskDetail } from './tasks/TaskDetail'

export default function TasksView() {
  const {
    tasks,
    setActiveView,
    setCurrentFloor,
  } = useAgentStore(
    useShallow((s) => ({
      tasks: s.tasks,
      setActiveView: s.setActiveView,
      setCurrentFloor: s.setCurrentFloor,
    }))
  )
  const [filter, setFilter] = useState<TaskFilter>('all')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const { approve, reject } = useTaskActions()

  const rootTasks = useMemo(() => tasks.filter((t) => !t.revisionOf), [tasks])

  const statusCounts = useMemo(() => {
    const c: Record<Task['status'], number> = { pending: 0, in_progress: 0, awaiting_approval: 0, completed: 0, failed: 0 }
    for (const t of rootTasks) c[t.status] = (c[t.status] ?? 0) + 1
    return c
  }, [rootTasks])

  const filteredTasks = useMemo(() => {
    const sorted = [...rootTasks].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    return filter === 'all' ? sorted : sorted.filter((t) => t.status === filter)
  }, [filter, rootTasks])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (filteredTasks.length === 0) { setSelectedTaskId(null); return }
    if (!selectedTaskId || !filteredTasks.some((t) => t.id === selectedTaskId)) {
      setSelectedTaskId(filteredTasks[0].id)
    }
  }, [filteredTasks, selectedTaskId])

  const selectedTask = filteredTasks.find((t) => t.id === selectedTaskId) ?? null

  const revisionsByRoot = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const t of tasks) {
      if (!t.revisionOf) continue
      const list = map.get(t.revisionOf) ?? []
      list.push(t)
      map.set(t.revisionOf, list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()))
    }
    return map
  }, [tasks])

  const approvalTasks = useMemo(() => (
    rootTasks
      .filter((task) => task.status === 'awaiting_approval')
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
  ), [rootTasks])

  const selectedRevisions = useMemo(
    () => selectedTask ? (revisionsByRoot.get(selectedTask.id) ?? []) : [],
    [selectedTask, revisionsByRoot],
  )

  const handleBack = useCallback(() => setSelectedTaskId(null), [])
  const handleOpenOffice = useCallback(() => {
    if (!selectedTask) return
    const [firstDept] = selectedTask.assignedTo
    if (firstDept) setCurrentFloor(resolveDepartmentFloor(firstDept))
    setActiveView('dashboard')
  }, [selectedTask, setCurrentFloor, setActiveView])
  const handleOpenChat = useCallback(() => setActiveView('chat'), [setActiveView])
  const handleApprove = useCallback(() => { if (selectedTask) approve(selectedTask.id) }, [selectedTask, approve])
  const handleReject = useCallback((reason?: string) => { if (selectedTask) reject(selectedTask.id, reason) }, [selectedTask, reject])

  return (
    <section className="flex flex-1 overflow-hidden bg-office-bg">
      <TaskListPanel
        filter={filter}
        onFilterChange={setFilter}
        selectedTaskId={selectedTaskId}
        onSelectTask={setSelectedTaskId}
        filteredTasks={filteredTasks}
        statusCounts={statusCounts}
        revisionsByRoot={revisionsByRoot}
        approvalTasks={approvalTasks}
      />

      <div className={`flex-1 overflow-y-auto p-6 flex flex-col ${!selectedTask ? 'hidden md:flex' : ''}`}>
        {selectedTask ? (
          <TaskDetail
            task={selectedTask}
            revisions={selectedRevisions}
            onBack={handleBack}
            onOpenOffice={handleOpenOffice}
            onOpenChat={handleOpenChat}
            onApprove={handleApprove}
            onReject={handleReject}
          />
        ) : (
          <div className="flex w-full h-full flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-office-panel/70 bg-office-sidebar">
            <p className="text-sm text-office-text/50">표시할 업무가 없습니다.</p>
            <button
              type="button"
              onClick={() => setActiveView('dashboard')}
              className="rounded border border-office-active/40 bg-office-active/10 px-4 py-2 text-sm text-office-active transition-colors hover:bg-office-active/20"
            >
              대시보드에서 첫 업무 시작하기
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
