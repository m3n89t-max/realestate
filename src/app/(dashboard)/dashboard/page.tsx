export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { ArrowRight, Bot, CheckCircle2, FolderOpen, Plus, Wifi, WifiOff } from 'lucide-react'
import { redirect } from 'next/navigation'
import StatusBadge from '@/components/ui/StatusBadge'
import { createClient } from '@/lib/supabase/server'
import { formatRelativeTime, getPropertyTypeLabel } from '@/lib/utils'
import {
  FLOW_STAGES,
  resolveProjectStage,
  stageHref,
  summarizeFlow,
  type ProjectFlowSnapshot,
} from '@/lib/jipporter-flow'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: membership } = await supabase.from('memberships').select('org_id, role, organization:organizations(*)').eq('user_id', user.id).not('joined_at', 'is', null).limit(1).single()
  const orgId = membership?.org_id

  const { data: projectRows } = await supabase
    .from('projects')
    .select('id, address, property_type, features, status, created_at')
    .eq('org_id', orgId)
    .neq('status', 'archived')
    .order('created_at', { ascending: false })
    .limit(12)

  const projects = projectRows ?? []
  const projectIds = projects.map((project) => project.id)

  const [assetsResult, contentsResult, agentResult] = await Promise.all([
    projectIds.length
      ? supabase.from('assets').select('project_id').in('project_id', projectIds)
      : Promise.resolve({ data: [] as { project_id: string }[] }),
    projectIds.length
      ? supabase.from('generated_contents').select('project_id, is_published').in('project_id', projectIds)
      : Promise.resolve({ data: [] as { project_id: string; is_published: boolean }[] }),
    supabase.from('agent_connections').select('status, last_seen_at').eq('org_id', orgId).limit(1).single(),
  ])

  const photoCounts = new Map<string, number>()
  for (const asset of assetsResult.data ?? []) {
    photoCounts.set(asset.project_id, (photoCounts.get(asset.project_id) ?? 0) + 1)
  }

  const contentCounts = new Map<string, number>()
  const approvedCounts = new Map<string, number>()
  for (const content of contentsResult.data ?? []) {
    contentCounts.set(content.project_id, (contentCounts.get(content.project_id) ?? 0) + 1)
    if (content.is_published) {
      approvedCounts.set(content.project_id, (approvedCounts.get(content.project_id) ?? 0) + 1)
    }
  }

  const snapshotOf = (project: typeof projects[number]): ProjectFlowSnapshot => ({
    address: project.address ?? '',
    photoCount: photoCounts.get(project.id) ?? 0,
    featureCount: (project.features ?? []).length,
    contentCount: contentCounts.get(project.id) ?? 0,
    approvedContentCount: approvedCounts.get(project.id) ?? 0,
    // 채널 등록 자료 준비 집계는 채널 연동 단계에서 들어온다. 아직 사실값이 없으므로 0을 쓴다.
    preparedChannelCount: 0,
  })

  const tracked = projects.map((project) => ({ project, stage: resolveProjectStage(snapshotOf(project)) }))
  const summary = summarizeFlow(projects.map(snapshotOf))

  const org = membership?.organization as { name?: string; plan_type?: string } | null
  const now = new Date().getTime()
  const freshAgent = agentResult.data?.last_seen_at && (now - new Date(agentResult.data.last_seen_at).getTime()) / 60000 < 2
  const agentStatus = freshAgent ? agentResult.data?.status as 'online' | 'offline' | 'busy' : 'offline'

  const waiting = tracked.filter(({ stage }) => !stage.done)
  const nextUp = waiting[0]

  return <div className="space-y-7 animate-fade-in">
    <section className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-sm text-slate-500">{org?.name ?? '내 사무소'}</p>
        <div className="mt-1 flex items-center gap-2">
          <h2 className="text-2xl font-bold tracking-[-0.035em] text-slate-950">오늘 할 일</h2>
          <StatusBadge status={org?.plan_type ?? 'free'} size="sm" />
        </div>
      </div>
      {projects.length > 0 && <Link href="/projects/new" className="btn-primary"><Plus size={17} />매물 추가</Link>}
    </section>

    {projects.length === 0 ? (
      <section className="rounded-xl border-2 border-brand-200 bg-brand-50 p-6">
        <h3 className="text-xl font-bold text-slate-950">주소·사진·특징만 넣으면 시작됩니다</h3>
        <p className="mt-2 text-sm leading-6 text-slate-700">가격이나 면적은 아직 몰라도 됩니다. 주소만 있으면 첫 매물을 만들 수 있어요.</p>
        <Link href="/projects/new" className="btn-primary mt-6"><Plus size={17} />첫 매물 입력하기</Link>
      </section>
    ) : nextUp ? (
      <section className="rounded-xl border-2 border-brand-200 bg-brand-50 p-6">
        <p className="text-xs font-bold text-brand-700">{nextUp.stage.number} {nextUp.stage.title}</p>
        <h3 className="mt-2 truncate text-xl font-bold text-slate-950">{nextUp.project.address}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-700">{nextUp.stage.description}</p>
        <Link href={stageHref(nextUp.stage, nextUp.project.id)} className="btn-primary mt-6">
          {nextUp.stage.nextAction}<ArrowRight size={16} />
        </Link>
      </section>
    ) : (
      <section className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-6">
        <div className="flex items-center gap-2"><CheckCircle2 size={20} className="text-emerald-700" /><h3 className="text-xl font-bold text-slate-950">기다리는 일이 없습니다</h3></div>
        <p className="mt-2 text-sm leading-6 text-slate-700">등록된 매물의 발행 준비가 모두 끝났습니다.</p>
      </section>
    )}

    <section aria-label="단계별 매물 수">
      <h3 className="text-sm font-bold text-slate-500">단계별 매물</h3>
      <ol className="mt-3 grid list-none gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {FLOW_STAGES.map((flowStage) => {
          const count = summary[flowStage.id]
          return <li key={flowStage.id} className="border-l-2 border-brand-600 bg-white px-4 py-3.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500">{flowStage.number} {flowStage.title}</p>
              <span className="text-xs font-bold text-brand-700">{count > 0 ? '대기' : '없음'}</span>
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums tracking-[-0.04em] text-slate-950">{count.toLocaleString()}</p>
          </li>
        })}
      </ol>
    </section>

    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="font-bold text-slate-900">매물별 다음 할 일</h3>
            <p className="mt-0.5 text-xs text-slate-500">각 매물이 어느 단계에 있는지와 바로 할 행동을 보여줍니다.</p>
          </div>
          <Link href="/projects" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-800">전체 매물 <ArrowRight size={15} /></Link>
        </div>
        {projects.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <FolderOpen size={26} className="mx-auto text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-700">아직 등록된 매물이 없습니다.</p>
            <Link href="/projects/new" className="btn-primary mt-4">첫 매물 입력</Link>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {tracked.map(({ project, stage: projectStage }) => (
              <li key={project.id}>
                <Link href={stageHref(projectStage, project.id)} className="flex min-h-[76px] items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-slate-50">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{project.address}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {getPropertyTypeLabel(project.property_type ?? '')}
                      <span className="mx-1.5 text-slate-300">·</span>
                      {formatRelativeTime(project.created_at)}
                    </p>
                    <p className="mt-1.5 truncate text-xs font-semibold text-brand-700">
                      {projectStage.done ? '발행 준비 완료' : projectStage.nextAction}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700">
                    {projectStage.number} {projectStage.title}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside className="space-y-4">
        <section className="card p-5">
          <div className="flex items-center gap-2">
            <span className={`grid size-8 place-items-center rounded-lg ${agentStatus === 'offline' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
              {agentStatus === 'offline' ? <WifiOff size={16} /> : <Wifi size={16} />}
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-900">로컬 앱 연결</h3>
              <p className="text-xs text-slate-500">{agentStatus === 'offline' ? '연결이 필요해요' : agentStatus === 'busy' ? '작업 진행 중' : '정상 연결됨'}</p>
            </div>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-600">채널 계정은 웹에 저장하지 않고 로컬 앱의 운영체제 보호 저장소에만 보관합니다.</p>
          <Link href="/settings" className="mt-4 inline-flex text-sm font-semibold text-brand-700 hover:underline">
            {agentStatus === 'offline' ? '설치 안내 보기' : '로컬 앱 설정'} <ArrowRight size={14} className="ml-1" />
          </Link>
        </section>

        <section className="card p-5">
          <h3 className="font-bold text-slate-900">집포터 흐름</h3>
          <ol className="mt-4 space-y-3">
            {FLOW_STAGES.map((flowStage) => (
              <li key={flowStage.id} className="flex gap-3">
                <span className="text-xs font-black text-brand-700">{flowStage.number}</span>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{flowStage.title}</p>
                  <p className="mt-0.5 text-xs leading-5 text-slate-500">{flowStage.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <Link href="/tasks" className="flex min-h-11 items-center justify-between border border-brand-200 bg-brand-50 px-4 text-sm font-semibold text-brand-800">
          <span className="inline-flex items-center gap-2"><Bot size={16} />처리 알림 확인</span>
          <ArrowRight size={16} />
        </Link>
      </aside>
    </div>
  </div>
}
