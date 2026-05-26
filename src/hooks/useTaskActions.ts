import { useCallback, useState } from 'react'
import { runTask, runChannelMessage, approveAndFinalize, rejectAndNotify } from '@/services/agentOrchestrator'
import type { DepartmentId, UploadedFile } from '@/types'

export function useTaskActions() {
  const [isRunning, setIsRunning] = useState(false)

  const submitTask = useCallback(async (
    message: string,
    attachments: UploadedFile[] = [],
    threadId?: string,
    options?: { revisionOf?: string },
  ) => {
    setIsRunning(true)
    try {
      await runTask(message, attachments, threadId, options)
    } finally {
      setIsRunning(false)
    }
  }, [])

  const submitChannelMessage = useCallback(async (
    deptId: DepartmentId,
    message: string,
    attachments: UploadedFile[] = [],
  ) => {
    setIsRunning(true)
    try {
      await runChannelMessage(deptId, message, attachments)
    } finally {
      setIsRunning(false)
    }
  }, [])

  const approve = useCallback((taskId: string) => {
    void approveAndFinalize(taskId)
  }, [])

  const reject = useCallback((taskId: string, reason?: string) => {
    void rejectAndNotify(taskId, reason)
  }, [])

  return { submitTask, submitChannelMessage, approve, reject, isRunning }
}
