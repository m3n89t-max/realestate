export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { RefreshCw, AlertCircle, CheckCircle, Clock, XCircle, Loader2 } from 'lucide-react'
import StatusBadge from '@/components/ui/StatusBadge'
import { formatRelativeTime } from '@/lib/utils'
import type { TaskType } from '@/lib/types'

const TASK_TYPE_LABELS: Record<TaskType, string> = {
  naver_upload: '네이버 업로드',
  youtube_upload: '유튜브 업로드',
  building_register: '건축물대장 수집',
  seumteo_api: '세움터 조회',
  video_render: '영상 렌더링',
  pdf_merge: 'PDF 패키지 생성',
}

const ERROR_GUIDES: Record<string, string> = {
  LOGIN_EXPIRED: '네이버/정부24 로그인이 만료되었습니다. 에이전트 설정에서 재로그인하세요.',
  CAPTCHA_DETECTED: '자동화가 차단(캡차 감지)되었습니다. 잠시 후 다시 시도하거나 수동으로 처리하세요.',
  ELEMENT_NOT_FOUND: '화면 구조가 변경되었습니다. 에이전트 업데이트가 필요합니다.',
  DOWNLOAD_BLOCKED: '파일 다운로드가 차단되었습니다. 팝업 차단 설정을 확인하세요.',
  AGENT_OFFLINE: '로컬 에이전트가 오프라인 상태입니다. PC를 확인하세요.',
}

export default async function TasksPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: membership } = await supabase
    .from('memberships')
    .select('org_id')
    .eq('user_id', user!.id)
    .not('joined_at', 'is', null)
    .limit(1)
    .single()

  const { data: tasks } = await supabase
    .from('tasks')
    .select(`*, project:projects(address)`)
    .eq('org_id', membership?.org_id)
    .order('created_at', { ascending: false })
    .limit(100)

  const pendingCount = (tasks ?? []).filter(t => ['pending', 'running', 'retrying'].includes(t.status)).length
  const failedCount = (tasks ?? []).filter(t => t.status === 'failed').length

  const StatusIcon = ({ status }: { status: string }) => {
    switch (status) {
      case 'success': return <CheckCircle size={16} className="text-green-500" />
      case 'failed': return <XCircle size={16} className="text-red-500" />
      case 'running': return <Loader2 size={16} className="text-blue-500 animate-spin" />
      case 'pending': return <Clock size={16} className="text-yellow-500" />
      case 'retrying': return <RefreshCw size={16} className="text-orange-500" />
      default: return <Clock size={16} className="text-gray-400" />
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="text-xl font-bold text-gray-900">작업 로그</h1>
          <p className="text-sm text-gray-500">로컬 에이전트 자동화 작업 현황</p>
        </div>
        <form>
          <button type="submit" className="btn-secondary">
            <RefreshCw size={14} />
            새로고침
          </button>
        </form>
      </div>

      {/* 요약 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: '전체', count: (tasks ?? []).length, color: 'text-gray-600' },
          { label: '진행중', count: pendingCount, color: 'text-blue-600' },
          { label: '실패', count: failedCount, color: 'text-red-600' },
          { label: '완료', count: (tasks ?? []).filter(t => t.status === 'success').length, color: 'text-green-600' },
        ].map(s => (
          <div key={s.label} className="card p-4 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.count}</p>
            <p className="text-sm text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* 실패한 작업 안내 */}
      {failedCount > 0 && (
        <div className="card p-4 bg-red-50 border-red-200">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle size={16} className="text-red-600" />
            <p className="text-sm font-medium text-red-800">{failedCount}개 작업이 실패했습니다</p>
          </div>
          <p className="text-xs text-red-600">각 작업의 &quot;재시도&quot; 버튼을 눌러 다시 시도하거나, 에러 원인을 확인하세요.</p>
        </div>
      )}

      {/* 작업 목록 */}
      <div className="card overflow-hidden">
        {!tasks || tasks.length === 0 ? (
          <div className="p-12 text-center">
            <Clock size={40} className="mx-auto text-gray-200 mb-3" />
            <p className="text-gray-500">아직 작업 내역이 없습니다</p>
          </div>
        ) : (
          <>
            <div className="hidden md:grid grid-cols-[1fr_120px_100px_120px_80px] gap-4 px-5 py-3 bg-gray-50 border-b border-gray-100 text-xs font-medium text-gray-500 uppercase">
              <span>작업 정보</span>
              <span>유형</span>
              <span>상태</span>
              <span>등록 시간</span>
              <span>액션</span>
            </div>

            <div className="divide-y divide-gray-50">
              {tasks.map(task => (
                <div key={task.id} className="grid grid-cols-1 md:grid-cols-[1fr_120px_100px_120px_80px] gap-4 items-start px-5 py-4">
                  {/* 작업 정보 */}
                  <div className="flex items-start gap-3">
                    <StatusIcon status={task.status} />
                    <div>
                      <p className="text-sm font-medium text-gray-800">
                        {task.project?.address ?? '(프로젝트 없음)'}
                      </p>
                      {task.error_code && (
                        <div className="mt-1.5 p-2 bg-red-50 rounded text-xs text-red-600">
                          <p className="font-medium">{task.error_code}</p>
                          <p className="mt-0.5 text-red-500">
                            {ERROR_GUIDES[task.error_code] ?? task.error_message ?? '알 수 없는 오류'}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 유형 */}
                  <span className="hidden md:block text-sm text-gray-600">
                    {TASK_TYPE_LABELS[task.type as TaskType] ?? task.type}
                  </span>

                  {/* 상태 */}
                  <div className="hidden md:block">
                    <StatusBadge status={task.status} size="sm" />
                    {task.retry_count > 0 && (
                      <p className="text-xs text-gray-400 mt-0.5">{task.retry_count}번 재시도</p>
                    )}
                  </div>

                  {/* 시간 */}
                  <span className="hidden md:block text-xs text-gray-400">
                    {formatRelativeTime(task.created_at)}
                  </span>

                  {/* 재시도 버튼 */}
                  <div className="hidden md:block">
                    {task.status === 'failed' && task.retry_count < task.max_retries && (
                      <form action={`/api/tasks/${task.id}/retry`} method="POST">
                        <button type="submit" className="text-xs text-brand-600 hover:underline flex items-center gap-1">
                          <RefreshCw size={12} />
                          재시도
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
