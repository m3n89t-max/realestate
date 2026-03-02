'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Project } from '@/lib/types'
import toast from 'react-hot-toast'

export function useProjects(orgId?: string) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const fetchProjects = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('org_id', orgId)
        .neq('status', 'archived')
        .order('created_at', { ascending: false })

      if (error) throw error
      setProjects(data ?? [])
    } catch (err) {
      console.error('프로젝트 로드 오류:', err)
      toast.error('프로젝트를 불러오는데 실패했습니다')
    } finally {
      setLoading(false)
    }
  }, [orgId, supabase])

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  const createProject = async (data: Partial<Project>) => {
    try {
      const { data: created, error } = await supabase
        .from('projects')
        .insert({ ...data, org_id: orgId })
        .select()
        .single()

      if (error) throw error
      setProjects(prev => [created, ...prev])
      toast.success('프로젝트가 생성되었습니다')
      return created
    } catch (err) {
      console.error('프로젝트 생성 오류:', err)
      toast.error('프로젝트 생성에 실패했습니다')
      return null
    }
  }

  const updateProject = async (id: string, data: Partial<Project>) => {
    try {
      const { error } = await supabase
        .from('projects')
        .update(data)
        .eq('id', id)

      if (error) throw error
      setProjects(prev => prev.map(p => p.id === id ? { ...p, ...data } : p))
      toast.success('저장되었습니다')
    } catch (err) {
      console.error('프로젝트 업데이트 오류:', err)
      toast.error('저장에 실패했습니다')
    }
  }

  const deleteProject = async (id: string) => {
    try {
      const { error } = await supabase
        .from('projects')
        .update({ status: 'archived' })
        .eq('id', id)

      if (error) throw error
      setProjects(prev => prev.filter(p => p.id !== id))
      toast.success('프로젝트가 보관되었습니다')
    } catch (err) {
      console.error('프로젝트 삭제 오류:', err)
      toast.error('삭제에 실패했습니다')
    }
  }

  return { projects, loading, refetch: fetchProjects, createProject, updateProject, deleteProject }
}
