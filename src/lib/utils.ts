import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { formatPriceOrUnknown } from './price-source'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 원 단위 금액 표기. 포맷터는 src/lib/price-source.ts 한 곳에만 둔다.
 *
 * 이전 구현은 falsy 값을 모두 영(零) 금액 문자열로 돌려줬기 때문에
 * 미입력(NULL/undefined)이 금액 주장으로 바뀌었다.
 * 이제 미입력은 PRICE_UNKNOWN_TEXT 로, 실제로 입력된 0 만 영 금액으로 나간다.
 */
export function formatPrice(priceInWon: number | null | undefined): string {
  return formatPriceOrUnknown(priceInWon)
}

export {
  PRICE_UNKNOWN_TEXT,
  formatKeyMoney,
  formatPriceOrUnknown,
  formatWon,
  isPriceEntered,
} from './price-source'

export function formatArea(area: number): string {
  const pyeong = (area / 3.3058).toFixed(1)
  return `${area}㎡ (${pyeong}평)`
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function formatRelativeTime(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const diff = now.getTime() - date.getTime()

  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return '방금 전'
  if (minutes < 60) return `${minutes}분 전`
  if (hours < 24) return `${hours}시간 전`
  if (days < 7) return `${days}일 전`
  return formatDate(dateStr)
}

export function getPropertyTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    apartment: '아파트',
    officetel: '오피스텔',
    villa: '빌라/다세대',
    commercial: '상가/사무실',
    land: '토지',
    house: '단독주택',
  }
  return labels[type] ?? type
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700',
    active: 'bg-blue-100 text-blue-700',
    completed: 'bg-green-100 text-green-700',
    archived: 'bg-gray-100 text-gray-500',
    queued: 'bg-yellow-100 text-yellow-700',
    running: 'bg-blue-100 text-blue-700',
    success: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
    retrying: 'bg-orange-100 text-orange-700',
    cancelled: 'bg-gray-100 text-gray-500',
    online: 'bg-green-100 text-green-700',
    offline: 'bg-gray-100 text-gray-500',
    busy: 'bg-yellow-100 text-yellow-700',
  }
  return colors[status] ?? 'bg-gray-100 text-gray-700'
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength) + '...'
}
