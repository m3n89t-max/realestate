export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import {
  Plus, Search, Filter, FolderOpen, MapPin, Calendar, ArrowUpRight
} from 'lucide-react'
import StatusBadge from '@/components/ui/StatusBadge'
import { formatPrice, formatRelativeTime, getPropertyTypeLabel } from '@/lib/utils'
import type { PropertyType, ProjectStatus } from '@/lib/types'

interface SearchParams {
  status?: string
  type?: string
  q?: string
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

  const { data: projects } = await query

  const statusTabs: { value: string; label: string }[] = [
    { value: '', label: '전체' },
    { value: 'draft', label: '작성중' },
    { value: 'active', label: '진행중' },
    { value: 'completed', label: '완료' },
  ]

  const propertyTypes: { value: PropertyType; label: string }[] = [
    { value: 'apartment', label: '아파트' },
    { value: 'officetel', label: '오피스텔' },
    { value: 'villa', label: '빌라' },
    { value: 'commercial', label: '상가' },
    { value: 'land', label: '토지' },
    { value: 'house', label: '단독주택' },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 헤더 */}
      <div className="page-header">
        <div>
          <h1 className="text-xl font-bold text-gray-900">프로젝트</h1>
          <p className="text-sm text-gray-500">총 {(projects ?? []).length}개 매물</p>
        </div>
        <Link href="/projects/new" className="btn-primary">
          <Plus size={16} />
          새 매물 등록
        </Link>
      </div>

      {/* 필터 */}
      <div className="card p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* 검색 */}
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-3 text-gray-400" />
            <form>
              <input
                name="q"
                defaultValue={params.q}
                placeholder="주소 검색..."
                className="input pl-9"
              />
            </form>
          </div>

          {/* 상태 필터 */}
          <div className="flex gap-1.5">
            {statusTabs.map(tab => (
              <Link
                key={tab.value}
                href={`/projects?status=${tab.value}${params.type ? `&type=${params.type}` : ''}`}
                className={`px-3 py-2 text-sm rounded-lg font-medium transition-colors ${
                  params.status === tab.value || (!params.status && tab.value === '')
                    ? 'bg-brand-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {tab.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* 테이블 */}
      <div className="card overflow-hidden">
        {!projects || projects.length === 0 ? (
          <div className="p-16 text-center">
            <FolderOpen size={48} className="mx-auto text-gray-200 mb-3" />
            <p className="text-gray-500 font-medium">매물이 없습니다</p>
            <p className="text-sm text-gray-400 mt-1">새 매물을 등록해보세요</p>
            <Link href="/projects/new" className="btn-primary mt-4 inline-flex">
              <Plus size={16} /> 매물 등록
            </Link>
          </div>
        ) : (
          <>
            {/* 테이블 헤더 */}
            <div className="hidden md:grid grid-cols-[1fr_100px_120px_100px_100px] gap-4 px-5 py-3 bg-gray-50 border-b border-gray-100 text-xs font-medium text-gray-500 uppercase tracking-wide">
              <span>매물 정보</span>
              <span>유형</span>
              <span>가격</span>
              <span>상태</span>
              <span>등록일</span>
            </div>

            {/* 테이블 바디 */}
            <div className="divide-y divide-gray-50">
              {projects.map(project => (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className="grid grid-cols-1 md:grid-cols-[1fr_100px_120px_100px_100px] gap-4 items-center px-5 py-4 hover:bg-gray-50 transition-colors group"
                >
                  {/* 주소 */}
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-brand-50 rounded-lg flex items-center justify-center flex-shrink-0">
                      <MapPin size={15} className="text-brand-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate group-hover:text-brand-600 transition-colors">
                        {project.address}
                      </p>
                      {project.area && (
                        <p className="text-xs text-gray-400">
                          {project.area}㎡{project.floor && ` · ${project.floor}층`}
                        </p>
                      )}
                    </div>
                    <ArrowUpRight size={14} className="text-gray-300 group-hover:text-brand-400 ml-auto flex-shrink-0 hidden md:block" />
                  </div>

                  {/* 유형 */}
                  <span className="hidden md:block text-sm text-gray-600">
                    {getPropertyTypeLabel(project.property_type ?? '')}
                  </span>

                  {/* 가격 */}
                  <span className="hidden md:block text-sm font-medium text-gray-800">
                    {project.price ? formatPrice(project.price) : '—'}
                  </span>

                  {/* 상태 */}
                  <div className="hidden md:block">
                    <StatusBadge status={project.status as ProjectStatus} size="sm" />
                  </div>

                  {/* 등록일 */}
                  <div className="hidden md:flex items-center gap-1 text-xs text-gray-400">
                    <Calendar size={12} />
                    {formatRelativeTime(project.created_at)}
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
