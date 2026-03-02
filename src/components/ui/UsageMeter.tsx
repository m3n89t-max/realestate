'use client'

import { cn } from '@/lib/utils'

interface UsageMeterProps {
  label: string
  current: number
  limit: number
  unit?: string
  className?: string
}

export default function UsageMeter({ label, current, limit, unit = '건', className }: UsageMeterProps) {
  const isUnlimited = limit === -1
  const percentage = isUnlimited ? 0 : Math.min((current / limit) * 100, 100)
  const isWarning = percentage >= 80
  const isDanger = percentage >= 100

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-600">{label}</span>
        <span className={cn(
          'font-medium',
          isDanger ? 'text-red-600' : isWarning ? 'text-amber-600' : 'text-gray-900'
        )}>
          {current.toLocaleString()}
          {!isUnlimited && ` / ${limit.toLocaleString()}`}
          {unit && ` ${unit}`}
          {isUnlimited && ' (무제한)'}
        </span>
      </div>
      {!isUnlimited && (
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              isDanger ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-brand-500'
            )}
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
      {isDanger && (
        <p className="text-xs text-red-600">한도에 도달했습니다. 요금제를 업그레이드하세요.</p>
      )}
    </div>
  )
}
