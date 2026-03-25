export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AppShell from '@/components/ui/AppShell'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // 조직 정보 조회
  const { data: membership } = await supabase
    .from('memberships')
    .select('*, organization:organizations(name, plan_type)')
    .eq('user_id', user.id)
    .not('joined_at', 'is', null)
    .limit(1)
    .single()

  // 에이전트 상태 조회
  const { data: agent } = await supabase
    .from('agent_connections')
    .select('status, last_seen_at')
    .eq('org_id', membership?.org_id ?? '')
    .limit(1)
    .single()

  // 마지막 활동 시간이 2분 이상 경과했으면 오프라인으로 간주
  let effectiveStatus: 'online' | 'offline' | 'busy' = 'offline'
  if (agent?.last_seen_at) {
    const lastSeen = new Date(agent.last_seen_at).getTime()
    const now = new Date().getTime()
    const diffMin = (now - lastSeen) / 1000 / 60

    if (diffMin < 2) {
      effectiveStatus = agent.status as any
    }
  }

  return (
    <AppShell
      orgName={membership?.organization?.name ?? ''}
      agentStatus={effectiveStatus}
      userRole={membership?.role ?? 'viewer'}
    >
      {children}
    </AppShell>
  )
}
