import { cn, getStatusColor } from '@/lib/utils'

interface StatusBadgeProps {
  status: string
  label?: string
  size?: 'sm' | 'md'
}

const STATUS_LABELS: Record<string, string> = {
  draft: '작성중',
  active: '진행중',
  completed: '완료',
  archived: '보관',
  pending: '대기중',
  running: '진행중',
  success: '완료',
  failed: '실패',
  retrying: '재시도중',
  cancelled: '취소됨',
  online: '온라인',
  offline: '오프라인',
  busy: '작업중',
  free: 'Free',
  pro: 'Pro',
  premium: 'Premium',
}

export default function StatusBadge({ status, label, size = 'md' }: StatusBadgeProps) {
  const displayLabel = label ?? STATUS_LABELS[status] ?? status

  return (
    <span className={cn(
      'badge',
      getStatusColor(status),
      size === 'sm' && 'text-xs px-2 py-0.5'
    )}>
      {['pending', 'running', 'retrying'].includes(status) && (
        <span className={cn(
          'w-1.5 h-1.5 rounded-full mr-1.5',
          status === 'running' || status === 'retrying' ? 'bg-blue-500 animate-pulse' : 'bg-yellow-500'
        )} />
      )}
      {displayLabel}
    </span>
  )
}
