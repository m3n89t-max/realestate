export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import {
  FolderOpen, Wand2, FileText, CheckCircle,
  TrendingUp, Plus, ArrowRight, Wifi, WifiOff,
  ChevronRight
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

  const [projectsResult, usageResult, tasksResult, agentResult, completedTasksResult] = await Promise.all([
    supabase.from('projects').select('*').eq('org_id', orgId).neq('status', 'archived')
      .order('created_at', { ascending: false }).limit(8),
    supabase.rpc('get_org_usage', { p_org_id: orgId }).single(),
    supabase.from('tasks').select('status').eq('org_id', orgId)
      .in('status', ['pending', 'running', 'retrying']),
    supabase.from('agent_connections').select('status, last_seen_at').eq('org_id', orgId).limit(1).single(),
    supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'success'),
  ])

  const projects = projectsResult.data ?? []
  const usage = usageResult.data as Record<string, number> | null
  const pendingTasks = (tasksResult.data ?? []).length
  const completedTasks = completedTasksResult.count ?? 0

  let agentStatus: 'online' | 'offline' | 'busy' = 'offline'
  if (agentResult.data?.last_seen_at) {
    const lastSeen = new Date(agentResult.data.last_seen_at).getTime()
    const now = new Date().getTime()
    const diffMin = (now - lastSeen) / 1000 / 60
    if (diffMin < 2) agentStatus = agentResult.data.status as any
  }

  const org = membership?.organization as { name?: string; plan_type?: string; monthly_project_limit?: number } | null

  const stats = [
    {
      label: '총 프로젝트',
      value: projects.length,
      icon: <FolderOpen size={18} className="text-brand-600" />,
      iconBg: 'bg-brand-50',
      topColor: 'border-t-brand-500',
    },
    {
      label: '이번 달 생성',
      value: usage?.generation_count ?? 0,
      icon: <Wand2 size={18} className="text-violet-600" />,
      iconBg: 'bg-violet-50',
      topColor: 'border-t-violet-500',
    },
    {
      label: '서류 수집',
      value: usage?.doc_download_count ?? 0,
      icon: <FileText size={18} className="text-emerald-600" />,
      iconBg: 'bg-emerald-50',
      topColor: 'border-t-emerald-500',
    },
    {
      label: '완료된 작업',
      value: completedTasks,
      icon: <CheckCircle size={18} className="text-amber-600" />,
      iconBg: 'bg-amber-50',
      topColor: 'border-t-amber-500',
    },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">대시보드</h1>
          <p className="text-sm text-slate-400 mt-0.5 flex items-center gap-1.5">
            {org?.name ?? '내 조직'}
            <span className="w-1 h-1 rounded-full bg-slate-300 inline-block" />
            <StatusBadge status={org?.plan_type ?? 'free'} size="sm" />
          </p>
        </div>
        <Link href="/projects/new" className="btn-primary">
          <Plus size={15} />
          새 매물 등록
        </Link>
      </div>

      {/* 에이전트 상태 배너 */}
      {agentStatus === 'offline' && (
        <div className="rounded-2xl p-4 bg-amber-50 border border-amber-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
              <WifiOff size={16} className="text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-800">로컬 에이전트가 연결되지 않았습니다</p>
              <p className="text-xs text-amber-600 mt-0.5">자동화 기능(네이버 업로드, 건축물대장 수집 등)을 사용하려면 에이전트를 설치하세요</p>
            </div>
          </div>
          <Link href="/settings" className="text-xs text-amber-700 font-semibold hover:underline shrink-0 ml-4">
            설치 안내 →
          </Link>
        </div>
      )}
      {agentStatus === 'online' && (
        <div className="rounded-2xl p-3.5 bg-emerald-50 border border-emerald-200 flex items-center gap-3">
          <div className="w-7 h-7 bg-emerald-100 rounded-lg flex items-center justify-center shrink-0">
            <Wifi size={14} className="text-emerald-600" />
          </div>
          <p className="text-sm text-emerald-700 font-medium">에이전트 연결됨 · 자동화 기능 사용 가능</p>
        </div>
      )}

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className={`card p-5 border-t-2 ${stat.topColor}`}>
            <div className={`w-9 h-9 rounded-xl ${stat.iconBg} flex items-center justify-center mb-4`}>
              {stat.icon}
            </div>
            <p className="text-2xl font-bold text-slate-900 tabular-nums">
              {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
            </p>
            <p className="text-xs text-slate-500 mt-1 font-medium">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* 이번 달 사용량 */}
      {usage && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="section-title">이번 달 사용량</h2>
            <Link href="/usage" className="text-xs text-brand-600 hover:text-brand-700 font-semibold flex items-center gap-0.5">
              상세보기 <ArrowRight size={12} />
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 divide-x divide-slate-100">
            {[
              { label: '프로젝트', val: usage.project_count, max: org?.monthly_project_limit ?? 20 },
              { label: 'AI 생성', val: usage.generation_count, max: -1 },
              { label: '영상 렌더', val: usage.video_render_count, max: -1 },
              { label: '서류 수집', val: usage.doc_download_count, max: -1 },
            ].map(item => (
              <div key={item.label} className="text-center px-2 first:pl-0 last:pr-0">
                <p className="text-2xl font-bold text-slate-900 tabular-nums">{(item.val ?? 0).toLocaleString()}</p>
                <p className="text-xs text-slate-400 mt-1">
                  {item.label}
                  {item.max > 0 && <span className="text-slate-300"> / {item.max}</span>}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 최근 프로젝트 */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="section-title">최근 프로젝트</h2>
          <Link href="/projects" className="text-xs text-brand-600 hover:text-brand-700 font-semibold flex items-center gap-0.5">
            전체보기 <ArrowRight size={12} />
          </Link>
        </div>

        {projects.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <FolderOpen size={22} className="text-slate-300" />
            </div>
            <p className="text-slate-400 text-sm">아직 등록된 매물이 없습니다</p>
            <Link href="/projects/new" className="btn-primary mt-4 inline-flex">
              <Plus size={15} /> 첫 매물 등록하기
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {projects.map(project => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 bg-brand-50 rounded-lg flex items-center justify-center flex-shrink-0">
                    <FolderOpen size={14} className="text-brand-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{project.address}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {getPropertyTypeLabel(project.property_type ?? '')}
                      {project.price && ` · ${formatPrice(project.price)}`}
                      {' · '}{formatRelativeTime(project.created_at)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={project.status} size="sm" />
                  <ChevronRight size={14} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* 대기 중인 작업 */}
      {pendingTasks > 0 && (
        <div className="rounded-2xl p-4 bg-brand-50 border border-brand-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-brand-100 rounded-xl flex items-center justify-center shrink-0">
              <TrendingUp size={15} className="text-brand-600" />
            </div>
            <p className="text-sm font-semibold text-brand-800">
              {pendingTasks}개 작업이 진행 중입니다
            </p>
          </div>
          <Link href="/tasks" className="text-xs text-brand-600 font-semibold hover:underline">
            확인하기
          </Link>
        </div>
      )}
    </div>
  )
}
