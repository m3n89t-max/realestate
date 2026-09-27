export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { ArrowRight, Bot, CheckCircle2, FolderOpen, Plus, Sparkles, Wifi, WifiOff } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { redirect } from 'next/navigation'
import StatusBadge from '@/components/ui/StatusBadge'
import { createClient } from '@/lib/supabase/server'
import { formatPrice, formatRelativeTime, getPropertyTypeLabel } from '@/lib/utils'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: membership } = await supabase.from('memberships').select('org_id, role, organization:organizations(*)').eq('user_id', user.id).not('joined_at', 'is', null).limit(1).single()
  const orgId = membership?.org_id
  const [projectsResult, usageResult, tasksResult, agentResult, completedTasksResult] = await Promise.all([
    supabase.from('projects').select('*').eq('org_id', orgId).neq('status', 'archived').order('created_at', { ascending: false }).limit(8),
    supabase.rpc('get_org_usage', { p_org_id: orgId }).single(),
    supabase.from('tasks').select('status').eq('org_id', orgId).in('status', ['queued', 'running', 'retrying']),
    supabase.from('agent_connections').select('status, last_seen_at').eq('org_id', orgId).limit(1).single(),
    supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'success'),
  ])
  const projects = projectsResult.data ?? []
  const usage = usageResult.error ? null : usageResult.data as Record<string, number> | null
  const pendingTasks = (tasksResult.data ?? []).length
  const completedTasks = completedTasksResult.count ?? 0
  const org = membership?.organization as { name?: string; plan_type?: string; monthly_project_limit?: number } | null
  const now = new Date().getTime()
  const freshAgent = agentResult.data?.last_seen_at && (now - new Date(agentResult.data.last_seen_at).getTime()) / 60000 < 2
  const agentStatus = freshAgent ? agentResult.data?.status as 'online' | 'offline' | 'busy' : 'offline'
  const metrics: Array<{ label: string; value: number | string; icon: LucideIcon }> = [
    { label: '등록 매물', value: projects.length, icon: FolderOpen },
    { label: '처리 중 알림', value: pendingTasks, icon: Bot },
    { label: '이번 달 홍보물', value: usage ? usage.generation_count ?? 0 : '—', icon: Sparkles },
    { label: '처리 완료', value: completedTasks, icon: CheckCircle2 },
  ]

  return <div className="space-y-6 animate-fade-in">
    <section className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-sm text-slate-500">{org?.name ?? '내 사무소'}</p><div className="mt-1 flex items-center gap-2"><h2 className="text-2xl font-bold tracking-[-0.035em] text-slate-950">오늘 할 일</h2><StatusBadge status={org?.plan_type ?? 'free'} size="sm" /></div></div>
      {projects.length > 0 && <Link href="/projects/new" className="btn-primary"><Plus size={17} />매물 추가</Link>}
    </section>

    {projects.length === 0 && <section className="rounded-xl border-2 border-brand-200 bg-brand-50 p-6"><div className="flex items-baseline justify-between"><h3 className="text-xl font-bold text-slate-950">처음 시작하기</h3><span className="text-lg font-bold text-brand-800">0/3</span></div><p className="mt-2 text-sm text-slate-700">첫 매물을 등록하면 다음 일을 차례로 안내해 드려요.</p><ol className="mt-5 space-y-3 text-sm text-slate-800"><li>1. 매물 기본정보 입력</li><li>2. 사진 추가</li><li>3. 첫 홍보물 만들기</li></ol><Link href="/projects/new" className="btn-primary mt-6"><Plus size={17} />매물 기본정보 입력하기</Link></section>}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="운영 요약">
      {metrics.map(({ label, value, icon: MetricIcon }) => <div key={label} className="border-l-2 border-brand-600 bg-white px-4 py-3.5"><div className="flex items-center justify-between"><p className="text-xs font-semibold text-slate-500">{label}</p><MetricIcon size={16} className="text-brand-600" /></div><p className="mt-2 text-2xl font-bold tabular-nums tracking-[-0.04em] text-slate-950">{typeof value === 'number' ? value.toLocaleString() : value}</p></div>)}
    </section>

    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="card overflow-hidden"><div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h3 className="font-bold text-slate-900">최근 등록 매물</h3><p className="mt-0.5 text-xs text-slate-500">최근 작업한 매물을 바로 이어서 관리하세요.</p></div><Link href="/projects" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-800">전체 매물 <ArrowRight size={15} /></Link></div>
        {projects.length === 0 ? <div className="px-5 py-14 text-center"><FolderOpen size={26} className="mx-auto text-slate-300" /><p className="mt-3 text-sm font-medium text-slate-700">아직 등록된 매물이 없습니다.</p><Link href="/projects/new" className="btn-primary mt-4">첫 매물 등록</Link></div> : <div className="divide-y divide-slate-100">{projects.map(project => <Link key={project.id} href={`/projects/${project.id}`} className="flex min-h-[72px] items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-slate-50"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{project.address}</p><p className="mt-1 truncate text-xs text-slate-500">{getPropertyTypeLabel(project.property_type ?? '')}{project.price ? ` · ${formatPrice(project.price)}` : ''}<span className="mx-1.5 text-slate-300">·</span>{formatRelativeTime(project.created_at)}</p></div><StatusBadge status={project.status} size="sm" /></Link>)}</div>}
      </section>

      <aside className="space-y-4">
        <section className="card p-5"><div className="flex items-center gap-2"><span className={`grid size-8 place-items-center rounded-lg ${agentStatus === 'offline' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{agentStatus === 'offline' ? <WifiOff size={16} /> : <Wifi size={16} />}</span><div><h3 className="text-sm font-bold text-slate-900">자동화 연결</h3><p className="text-xs text-slate-500">{agentStatus === 'offline' ? '연결이 필요해요' : agentStatus === 'busy' ? '자동화 작업 진행 중' : '정상 연결됨'}</p></div></div><Link href="/settings" className="mt-4 inline-flex text-sm font-semibold text-brand-700 hover:underline">{agentStatus === 'offline' ? '설치 안내 보기' : '에이전트 설정'} <ArrowRight size={14} className="ml-1" /></Link></section>
        <section className="card p-5"><div className="flex items-center justify-between"><h3 className="font-bold text-slate-900">이번 달 사용량</h3><Link href="/usage" className="text-xs font-semibold text-brand-700 hover:underline">상세</Link></div>{usage ? <dl className="mt-4 space-y-3 text-sm">{[['프로젝트', usage.project_count ?? 0, org?.monthly_project_limit ? ` / ${org.monthly_project_limit}` : ''], ['AI 생성', usage.generation_count ?? 0, ''], ['영상 렌더', usage.video_render_count ?? 0, ''], ['서류 수집', usage.doc_download_count ?? 0, '']].map(([label, value, suffix]) => <div key={label as string} className="flex items-center justify-between"><dt className="text-slate-500">{label as string}</dt><dd className="font-semibold tabular-nums text-slate-900">{(value as number).toLocaleString()}<span className="font-normal text-slate-500">{suffix as string}</span></dd></div>)}</dl> : <p role="status" className="mt-4 text-sm leading-6 text-slate-600">사용량 정보를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.</p>}</section>
        <Link href="/tasks" className="flex min-h-11 items-center justify-between border border-brand-200 bg-brand-50 px-4 text-sm font-semibold text-brand-800">처리 알림 확인 <ArrowRight size={16} /></Link>
      </aside>
    </div>
  </div>
}
