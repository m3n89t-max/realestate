'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Task } from '@/lib/types'
import toast from 'react-hot-toast'

export function useTasks(orgId?: string) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const fetchTasks = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select(`*, project:projects(address, property_type)`)
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error
      setTasks(data ?? [])
    } catch (err) {
      console.error('작업 로드 오류:', err)
    } finally {
      setLoading(false)
    }
  }, [orgId, supabase])

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  // Supabase Realtime으로 태스크 상태 실시간 구독
  useEffect(() => {
    if (!orgId) return

    const channel = supabase
      .channel(`tasks:org:${orgId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `org_id=eq.${orgId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setTasks(prev => [payload.new as Task, ...prev])
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as Task
            setTasks(prev => prev.map(t => t.id === updated.id ? updated : t))

            // 성공/실패 토스트 알림
            if (updated.status === 'success') {
              toast.success(`작업 완료: ${updated.type}`)
            } else if (updated.status === 'failed') {
              toast.error(`작업 실패: ${updated.error_message ?? updated.type}`)
            }
          } else if (payload.eventType === 'DELETE') {
            setTasks(prev => prev.filter(t => t.id !== payload.old.id))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [orgId, supabase])

  const createTask = async (data: Partial<Task>) => {
    try {
      const { data: created, error } = await supabase
        .from('tasks')
        .insert({ ...data, org_id: orgId })
        .select()
        .single()

      if (error) throw error
      return created
    } catch (err) {
      console.error('태스크 생성 오류:', err)
      toast.error('작업 생성에 실패했습니다')
      return null
    }
  }

  const retryTask = async (taskId: string) => {
    try {
      const { error } = await supabase
        .from('tasks')
        .update({
          status: 'pending',
          error_code: null,
          error_message: null,
          started_at: null,
          completed_at: null,
        })
        .eq('id', taskId)

      if (error) throw error
      toast.success('재시도를 요청했습니다')
    } catch (err) {
      console.error('재시도 오류:', err)
      toast.error('재시도 요청에 실패했습니다')
    }
  }

  const pendingCount = tasks.filter(t => ['pending', 'running', 'retrying'].includes(t.status)).length

  return { tasks, loading, pendingCount, refetch: fetchTasks, createTask, retryTask }
}
