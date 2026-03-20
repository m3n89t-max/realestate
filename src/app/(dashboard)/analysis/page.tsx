export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { PROPERTY_TYPE_LABELS } from '@/lib/types'
import { MapPin, Plus, ArrowRight } from 'lucide-react'
import Link from 'next/link'

export default async function AnalysisPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: membership } = await supabase
    .from('memberships')
    .select('org_id')
    .eq('user_id', user!.id)
    .not('joined_at', 'is', null)
    .limit(1)
    .single()

  const orgId = membership?.org_id

  const { data: projects } = await supabase
    .from('projects')
    .select('id, address, property_type, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  const { data: analyses } = await supabase
    .from('location_analyses')
    .select('project_id, created_at')
    .in('project_id', projects?.map(p => p.id) ?? [])

  const analysisMap = new Map((analyses ?? []).map(a => [a.project_id, a.created_at]))

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">입지분석</h1>
          <p className="text-sm text-gray-500 mt-0.5">전체 매물의 입지 분석 현황을 확인합니다</p>
        </div>
        <Link href="/projects/new" className="btn-primary">
          <Plus size={16} />
          새 매물 등록
        </Link>
      </div>

      {(!projects || projects.length === 0) ? (
        <div className="card p-16 text-center">
          <MapPin size={48} className="mx-auto text-gray-200 mb-4" />
          <p className="text-gray-600 font-medium">아직 없습니다</p>
          <p className="text-sm text-gray-400 mt-1.5">매물을 등록하면 입지분석을 시작할 수 있습니다</p>
          <Link href="/projects" className="btn-primary mt-6 inline-flex">
            매물 목록 보기
          </Link>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="divide-y divide-gray-50">
            {projects.map(project => {
              const analyzedAt = analysisMap.get(project.id)
              const isDone = Boolean(analyzedAt)
              const propertyLabel = project.property_type
                ? PROPERTY_TYPE_LABELS[project.property_type as keyof typeof PROPERTY_TYPE_LABELS] ?? project.property_type
                : '-'

              return (
                <div key={project.id} className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                      <MapPin size={16} className="text-blue-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{project.address}</p>
                      <p className="text-xs text-gray-400">{propertyLabel}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {isDone ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        완료
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                        미분석
                      </span>
                    )}
                    <Link
                      href={`/projects/${project.id}${isDone ? '#analysis' : ''}`}
                      className="flex items-center gap-1 text-xs text-brand-600 hover:underline font-medium"
                    >
                      {isDone ? '결과 보기' : '분석 시작'}
                      <ArrowRight size={12} />
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
