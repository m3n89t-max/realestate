export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { Building2, Users, Key, CreditCard, Copy, Plus } from 'lucide-react'
import StatusBadge from '@/components/ui/StatusBadge'
import UsageMeter from '@/components/ui/UsageMeter'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: membership } = await supabase
    .from('memberships')
    .select('*, organization:organizations(*)')
    .eq('user_id', user!.id)
    .not('joined_at', 'is', null)
    .limit(1)
    .single()

  const org = membership?.organization as {
    id: string; name: string; phone?: string; plan_type: string; monthly_project_limit: number
  } | null

  const { data: members } = await supabase
    .from('memberships')
    .select('*, user:users(email, full_name)')
    .eq('org_id', org?.id ?? '')
    .not('joined_at', 'is', null)
    .order('invited_at', { ascending: true })

  const { data: agents } = await supabase
    .from('agent_connections')
    .select('*')
    .eq('org_id', org?.id ?? '')

  const { data: usage } = await supabase
    .rpc('get_org_usage', { p_org_id: org?.id })
    .single()

  const usageData = usage as {
    project_count: number; generation_count: number; video_render_count: number;
    doc_download_count: number; monthly_project_limit: number
  } | null

  const PLAN_FEATURES: Record<string, string[]> = {
    free: ['월 20개 프로젝트', 'AI 블로그 생성', 'AI 카드뉴스 생성', '기본 입지 분석'],
    pro: ['월 100개 프로젝트', '자동 네이버 업로드', '건축물대장 자동화', '세움터 연동', '우선 지원'],
    premium: ['무제한 프로젝트', '설계도면 AI 분석', '거래 서류팩', '리스크 분석 엔진', '전담 지원'],
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <h1 className="text-xl font-bold text-gray-900">설정</h1>

      {/* 조직 정보 */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Building2 size={18} className="text-brand-500" />
          <h2 className="section-title">조직 정보</h2>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-400 text-xs mb-1">사무소명</p>
            <p className="font-medium text-gray-800">{org?.name ?? '—'}</p>
          </div>
          <div>
            <p className="text-gray-400 text-xs mb-1">연락처</p>
            <p className="font-medium text-gray-800">{org?.phone ?? '—'}</p>
          </div>
          <div>
            <p className="text-gray-400 text-xs mb-1">요금제</p>
            <StatusBadge status={org?.plan_type ?? 'free'} />
          </div>
          <div>
            <p className="text-gray-400 text-xs mb-1">내 역할</p>
            <p className="font-medium text-gray-800">
              {membership?.role === 'owner' ? '소유자' : membership?.role === 'admin' ? '관리자' : membership?.role === 'editor' ? '편집자' : '뷰어'}
            </p>
          </div>
        </div>
      </div>

      {/* 사용량 */}
      {usageData && (
        <div className="card p-5">
          <h2 className="section-title mb-4">이번 달 사용량</h2>
          <div className="space-y-4">
            <UsageMeter
              label="프로젝트"
              current={usageData.project_count}
              limit={usageData.monthly_project_limit}
            />
            <UsageMeter
              label="AI 콘텐츠 생성"
              current={usageData.generation_count}
              limit={org?.plan_type === 'free' ? 50 : org?.plan_type === 'pro' ? 500 : -1}
            />
            <UsageMeter
              label="영상 렌더링"
              current={usageData.video_render_count}
              limit={org?.plan_type === 'free' ? 5 : org?.plan_type === 'pro' ? 50 : -1}
            />
          </div>
        </div>
      )}

      {/* 요금제 */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <CreditCard size={18} className="text-brand-500" />
          <h2 className="section-title">요금제</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(['free', 'pro', 'premium'] as const).map(plan => (
            <div key={plan} className={`rounded-xl border-2 p-4 ${
              org?.plan_type === plan ? 'border-brand-500 bg-brand-50' : 'border-gray-200'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <StatusBadge status={plan} />
                {org?.plan_type === plan && (
                  <span className="text-xs text-brand-600 font-medium">현재</span>
                )}
              </div>
              <ul className="space-y-1 mt-3">
                {PLAN_FEATURES[plan].map((f, i) => (
                  <li key={i} className="text-xs text-gray-600 flex items-center gap-1.5">
                    <span className="w-1 h-1 bg-gray-400 rounded-full" />
                    {f}
                  </li>
                ))}
              </ul>
              {org?.plan_type !== plan && (
                <button className="btn-secondary w-full mt-3 text-xs py-1.5 justify-center">
                  업그레이드
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 멤버 관리 */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-brand-500" />
            <h2 className="section-title">멤버 관리</h2>
          </div>
          {['owner', 'admin'].includes(membership?.role ?? '') && (
            <button className="btn-secondary text-xs py-1.5">
              <Plus size={12} />
              멤버 초대
            </button>
          )}
        </div>
        <div className="space-y-2">
          {(members ?? []).map(m => {
            const member = m as { user: { email: string; full_name?: string }; role: string; joined_at: string }
            return (
              <div key={m.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                <div>
                  <p className="text-sm font-medium text-gray-800">
                    {member.user?.full_name ?? member.user?.email}
                  </p>
                  <p className="text-xs text-gray-400">{member.user?.email}</p>
                </div>
                <StatusBadge status={member.role} size="sm" />
              </div>
            )
          })}
        </div>
      </div>

      {/* 로컬 에이전트 */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Key size={18} className="text-brand-500" />
          <h2 className="section-title">로컬 에이전트</h2>
        </div>

        <div className="bg-amber-50 rounded-xl p-4 mb-4">
          <p className="text-sm font-medium text-amber-800 mb-1">로컬 에이전트란?</p>
          <p className="text-xs text-amber-700">
            네이버 업로드, 건축물대장 자동 수집 등 로그인이 필요한 자동화 작업을 처리하는
            Windows PC 설치형 프로그램입니다. 아이디/비밀번호는 서버에 저장되지 않습니다.
          </p>
        </div>

        {(agents ?? []).length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-gray-500 mb-3">연결된 에이전트가 없습니다</p>
            <button className="btn-primary">
              에이전트 다운로드 및 설치
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {(agents ?? []).map(agent => (
              <div key={agent.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-200">
                <div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={agent.status} size="sm" />
                    <p className="text-sm font-medium text-gray-800">{agent.name ?? '에이전트'}</p>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {agent.platform} · v{agent.version}
                    {agent.last_seen_at && ` · 마지막 연결: ${new Date(agent.last_seen_at).toLocaleDateString('ko-KR')}`}
                  </p>
                </div>
                <button className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
                  <Copy size={12} />
                  연결키 복사
                </button>
              </div>
            ))}
            <button className="btn-secondary text-xs w-full justify-center py-2 mt-2">
              <Plus size={12} />
              새 에이전트 연결키 발급
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
