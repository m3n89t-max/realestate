export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import {
  FolderOpen, Wand2, FileText, CheckCircle,
  TrendingUp, Plus, ArrowRight, Wifi, WifiOff
} from 'lucide-react'
import Link from 'next/link'
import StatusBadge from '@/components/ui/StatusBadge'
import { formatRelativeTime, getPropertyTypeLabel, formatPrice } from '@/lib/utils'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: membership } = await supabase
    .from('memberships')
    .select('org_id, role, organization:organizations(*)')
    .eq('user_id', user!.id)
    .not('joined_at', 'is', null)
    .limit(1)
    .single()

  const orgId = membership?.org_id

  // 병렬로 데이터 로드
  const [projectsResult, usageResult, tasksResult, agentResult] = await Promise.all([
    supabase.from('projects').select('*').eq('org_id', orgId).neq('status', 'archived')
      .order('created_at', { ascending: false }).limit(8),
    supabase.rpc('get_org_usage', { p_org_id: orgId }).single(),
    supabase.from('tasks').select('status').eq('org_id', orgId)
      .in('status', ['pending', 'running', 'retrying']),
    supabase.from('agent_connections').select('status').eq('org_id', orgId).limit(1).single(),
  ])

  const projects = projectsResult.data ?? []
  const usage = usageResult.data as Record<string, number> | null
  const pendingTasks = (tasksResult.data ?? []).length
  const agentStatus = agentResult.data?.status ?? 'offline'

  const org = membership?.organization as { name?: string; plan_type?: string; monthly_project_limit?: number } | null

  const stats = [
    {
      label: '총 프로젝트',
      value: projects.length,
      icon: <FolderOpen size={20} className="text-blue-500" />,
      bg: 'bg-blue-50',
    },
    {
      label: '이번 달 생성',
      value: usage?.generation_count ?? 0,
      icon: <Wand2 size={20} className="text-purple-500" />,
      bg: 'bg-purple-50',
    },
    {
      label: '서류 수집',
      value: usage?.doc_download_count ?? 0,
      icon: <FileText size={20} className="text-green-500" />,
      bg: 'bg-green-50',
    },
    {
      label: '완료된 작업',
      value: '—',
      icon: <CheckCircle size={20} className="text-brand-500" />,
      bg: 'bg-brand-50',
    },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">대시보드</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {org?.name ?? '내 조직'} · <StatusBadge status={org?.plan_type ?? 'free'} size="sm" />
          </p>
        </div>
        <Link href="/projects/new" className="btn-primary">
          <Plus size={16} />
          새 매물 등록
        </Link>
      </div>

      {/* 에이전트 상태 배너 */}
      {agentStatus === 'offline' && (
        <div className="card p-4 bg-amber-50 border-amber-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <WifiOff size={18} className="text-amber-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800">로컬 에이전트가 연결되지 않았습니다</p>
              <p className="text-xs text-amber-600">네이버 업로드, 건축물대장 수집 등 자동화 기능을 사용하려면 에이전트를 설치하세요</p>
            </div>
          </div>
          <Link href="/settings" className="text-sm text-amber-700 font-medium hover:underline flex-shrink-0">
            설치 안내 →
          </Link>
        </div>
      )}
      {agentStatus === 'online' && (
        <div className="card p-3 bg-green-50 border-green-200 flex items-center gap-3">
          <Wifi size={16} className="text-green-600" />
          <p className="text-sm text-green-700 font-medium">에이전트 연결됨 · 자동화 기능 사용 가능</p>
        </div>
      )}

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="card p-4">
            <div className={`w-10 h-10 rounded-xl ${stat.bg} flex items-center justify-center mb-3`}>
              {stat.icon}
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
            </p>
            <p className="text-sm text-gray-500 mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* 이번 달 사용량 */}
      {usage && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-title">이번 달 사용량</h2>
            <Link href="/usage" className="text-sm text-brand-600 hover:underline flex items-center gap-1">
              상세보기 <ArrowRight size={14} />
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: '프로젝트', val: usage.project_count, max: org?.monthly_project_limit ?? 20 },
              { label: 'AI 생성', val: usage.generation_count, max: -1 },
              { label: '영상 렌더', val: usage.video_render_count, max: -1 },
              { label: '서류 수집', val: usage.doc_download_count, max: -1 },
            ].map(item => (
              <div key={item.label} className="text-center">
                <p className="text-xl font-bold text-gray-900">{(item.val ?? 0).toLocaleString()}</p>
                <p className="text-xs text-gray-500">
                  {item.label}
                  {item.max > 0 && ` / ${item.max}`}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 최근 프로젝트 */}
      <div className="card">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="section-title">최근 프로젝트</h2>
          <Link href="/projects" className="text-sm text-brand-600 hover:underline flex items-center gap-1">
            전체보기 <ArrowRight size={14} />
          </Link>
        </div>

        {projects.length === 0 ? (
          <div className="p-12 text-center">
            <FolderOpen size={40} className="mx-auto text-gray-200 mb-3" />
            <p className="text-gray-500 text-sm">아직 등록된 매물이 없습니다</p>
            <Link href="/projects/new" className="btn-primary mt-4 inline-flex">
              <Plus size={16} /> 첫 매물 등록하기
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {projects.map(project => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 bg-brand-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <FolderOpen size={16} className="text-brand-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{project.address}</p>
                    <p className="text-xs text-gray-400">
                      {getPropertyTypeLabel(project.property_type ?? '')}
                      {project.price && ` · ${formatPrice(project.price)}`}
                      {' · '}{formatRelativeTime(project.created_at)}
                    </p>
                  </div>
                </div>
                <StatusBadge status={project.status} size="sm" />
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* 대기 중인 작업 */}
      {pendingTasks > 0 && (
        <div className="card p-4 bg-blue-50 border-blue-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp size={16} className="text-blue-600" />
              <p className="text-sm font-medium text-blue-800">
                {pendingTasks}개 작업이 진행 중입니다
              </p>
            </div>
            <Link href="/tasks" className="text-sm text-blue-600 hover:underline">
              확인하기
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
