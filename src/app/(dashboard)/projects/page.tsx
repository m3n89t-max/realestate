export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import type { PropertyType } from '@/lib/types'
import ProjectsListView from './ProjectsListView'

interface SearchParams {
  status?: string
  type?: string
  q?: string
  sort?: string
  view?: string
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: membership } = await supabase
    .from('memberships')
    .select('org_id')
    .eq('user_id', user!.id)
    .not('joined_at', 'is', null)
    .limit(1)
    .single()

  let query = supabase
    .from('projects')
    .select('*')
    .eq('org_id', membership?.org_id)
    .order('created_at', { ascending: false })

  if (params.status) query = query.eq('status', params.status)
  if (params.type) query = query.eq('property_type', params.type)
  if (params.q) query = query.ilike('address', `%${params.q}%`)

  // 정렬
  if (params.sort === 'price_asc') {
    query = query.order('price', { ascending: true, nullsFirst: false })
  } else if (params.sort === 'price_desc') {
    query = query.order('price', { ascending: false, nullsFirst: false })
  }

  const { data: projects } = await query

  // 사진 정보 가져오기
  const projectIds = (projects ?? []).map(p => p.id)
  let assets: Record<string, string[]> = {}
  if (projectIds.length > 0) {
    const { data: assetData } = await supabase
      .from('assets')
      .select('project_id, file_url')
      .in('project_id', projectIds)
      .eq('type', 'image')
      .order('sort_order', { ascending: true })

    if (assetData) {
      assets = assetData.reduce((acc, a) => {
        if (!acc[a.project_id]) acc[a.project_id] = []
        acc[a.project_id].push(a.file_url)
        return acc
      }, {} as Record<string, string[]>)
    }
  }

  const projectsWithImages = (projects ?? []).map(p => ({
    ...p,
    images: assets[p.id] ?? [],
  }))

  return (
    <div className="animate-fade-in">
      <ProjectsListView
        projects={projectsWithImages}
        searchParams={params}
      />
    </div>
  )
}
