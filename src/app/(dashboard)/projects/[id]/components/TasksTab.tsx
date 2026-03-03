'use client'

import { useEffect, useState } from 'react'
import {
  MapPin, BarChart2, FileText, Map, BookOpen, Image,
  Instagram, MessageCircle, Video, Film, Upload, Youtube,
  CheckCircle, XCircle, Clock, Loader2, RefreshCw
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface Task {
  id: string
  type: string
  status: 'pending' | 'running' | 'success' | 'failed' | 'retrying'
  progress_pct?: number
  error_message?: string
  created_at: string
  updated_at: string
  started_at?: string
  completed_at?: string
}

const TASK_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  normalize_parcel:           { label: '주소 정규화',        icon: <MapPin size={14} /> },
  location_analyze:           { label: '입지 분석',          icon: <BarChart2 size={14} /> },
  download_building_register: { label: '건축물대장 다운로드', icon: <FileText size={14} /> },
  download_cadastral_map:     { label: '지적도 다운로드',    icon: <Map size={14} /> },
  summarize_documents:        { label: '서류 요약',          icon: <BookOpen size={14} /> },
  generate_blog:              { label: '블로그 생성',        icon: <BookOpen size={14} /> },
  generate_cards_instagram:   { label: '인스타 카드뉴스',   icon: <Instagram size={14} /> },
  generate_cards_kakao:       { label: '카카오 카드뉴스',   icon: <MessageCircle size={14} /> },
  generate_shorts_script:     { label: '쇼츠 스크립트',     icon: <Video size={14} /> },
  render_shorts_video:        { label: '쇼츠 영상 렌더',    icon: <Film size={14} /> },
  upload_naver_blog:          { label: '네이버 업로드',      icon: <Upload size={14} /> },
  upload_youtube:             { label: '유튜브 업로드',      icon: <Youtube size={14} /> },
}

const STATUS_CONFIG = {
  pending:  { label: '대기 중',  color: 'bg-gray-100 text-gray-500',  icon: <Clock size={12} /> },
  running:  { label: '실행 중',  color: 'bg-blue-100 text-blue-700',  icon: <Loader2 size={12} className="animate-spin" /> },
  retrying: { label: '재시도 중', color: 'bg-amber-100 text-amber-700', icon: <RefreshCw size={12} className="animate-spin" /> },
  success:  { label: '완료',     color: 'bg-green-100 text-green-700', icon: <CheckCircle size={12} /> },
  failed:   { label: '실패',     color: 'bg-red-100 text-red-700',    icon: <XCircle size={12} /> },
}

function formatDuration(start?: string, end?: string) {
  if (!start) return null
  const s = new Date(start).getTime()
  const e = end ? new Date(end).getTime() : Date.now()
  const sec = Math.round((e - s) / 1000)
  if (sec < 60) return `${sec}초`
  return `${Math.floor(sec / 60)}분 ${sec % 60}초`
}

interface TasksTabProps {
  projectId: string
}

export default function TasksTab({ projectId }: TasksTabProps) {
  const supabase = createClient()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 초기 로드
    supabase
      .from('tasks')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setTasks(data ?? [])
        setLoading(false)
      })

    // Realtime 구독
    const channel = supabase
      .channel(`tasks:${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setTasks(prev => [payload.new as Task, ...prev])
          } else if (payload.eventType === 'UPDATE') {
            setTasks(prev =>
              prev.map(t => t.id === payload.new.id ? payload.new as Task : t)
            )
          } else if (payload.eventType === 'DELETE') {
            setTasks(prev => prev.filter(t => t.id !== payload.old.id))
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [projectId])

  const running = tasks.filter(t => t.status === 'running' || t.status === 'retrying')
  const done = tasks.filter(t => t.status === 'success')
  const failed = tasks.filter(t => t.status === 'failed')

  if (loading) {
    return (
      <div className="card p-12 text-center">
        <Loader2 size={28} className="mx-auto text-brand-400 animate-spin mb-2" />
        <p className="text-sm text-gray-400">작업 목록을 불러오는 중...</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* 요약 */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: '전체', count: tasks.length, color: 'text-gray-700' },
          { label: '진행 중', count: running.length, color: 'text-blue-700' },
          { label: '실패', count: failed.length, color: 'text-red-600' },
        ].map(s => (
          <div key={s.label} className="card p-4 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.count}</p>
            <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* 실시간 표시 중 배너 */}
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        실시간으로 업데이트 중
      </div>

      {/* 작업 목록 */}
      {tasks.length === 0 ? (
        <div className="card p-12 text-center">
          <Clock size={36} className="mx-auto text-gray-200 mb-3" />
          <p className="text-gray-500 font-medium">아직 실행된 작업이 없습니다</p>
          <p className="text-sm text-gray-400 mt-1">개요 탭에서 &quot;자동화 실행&quot;을 눌러 시작하세요</p>
        </div>
      ) : (
        <div className="card divide-y divide-gray-50">
          {tasks.map(task => {
            const meta = TASK_LABELS[task.type]
            const statusCfg = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.pending
            const duration = formatDuration(task.started_at, task.completed_at)

            return (
              <div key={task.id} className="p-4">
                <div className="flex items-start gap-3">
                  {/* 아이콘 */}
                  <div className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5',
                    task.status === 'success' ? 'bg-green-50 text-green-600' :
                    task.status === 'failed' ? 'bg-red-50 text-red-500' :
                    task.status === 'running' ? 'bg-blue-50 text-blue-600' :
                    'bg-gray-100 text-gray-400'
                  )}>
                    {meta?.icon ?? <Clock size={14} />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-800">
                        {meta?.label ?? task.type}
                      </span>
                      <span className={cn(
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                        statusCfg.color
                      )}>
                        {statusCfg.icon}
                        {statusCfg.label}
                      </span>
                      {duration && (
                        <span className="text-xs text-gray-400">{duration}</span>
                      )}
                    </div>

                    {/* 진행바 */}
                    {task.status === 'running' && (
                      <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all duration-500"
                          style={{ width: `${task.progress_pct ?? 0}%` }}
                        />
                      </div>
                    )}

                    {/* 에러 메시지 */}
                    {task.status === 'failed' && task.error_message && (
                      <p className="text-xs text-red-500 mt-1.5">{task.error_message}</p>
                    )}

                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(task.created_at).toLocaleString('ko-KR', {
                        month: 'short', day: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                      })}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
