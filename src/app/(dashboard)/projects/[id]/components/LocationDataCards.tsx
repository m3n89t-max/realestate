'use client'

import { Train, ShoppingCart, Hospital, GraduationCap, Coffee, MapPin, TrendingUp, Building2 } from 'lucide-react'
import type { POIItem, LandUseItem, RealPriceItem } from '@/lib/types'

const POI_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  subway:      { label: '지하철',  icon: <Train size={14} />,         color: 'text-blue-600 bg-blue-50' },
  mart:        { label: '대형마트', icon: <ShoppingCart size={14} />,  color: 'text-green-600 bg-green-50' },
  hospital:    { label: '병원',    icon: <Hospital size={14} />,       color: 'text-red-600 bg-red-50' },
  school:      { label: '학교',    icon: <GraduationCap size={14} />,  color: 'text-purple-600 bg-purple-50' },
  convenience: { label: '편의점',  icon: <Coffee size={14} />,         color: 'text-amber-600 bg-amber-50' },
  pharmacy:    { label: '약국',    icon: <MapPin size={14} />,         color: 'text-pink-600 bg-pink-50' },
  culture:     { label: '문화시설', icon: <Building2 size={14} />,     color: 'text-indigo-600 bg-indigo-50' },
  cafe:        { label: '카페',    icon: <Coffee size={14} />,         color: 'text-amber-500 bg-amber-50' },
  restaurant:  { label: '음식점',  icon: <MapPin size={14} />,         color: 'text-orange-600 bg-orange-50' },
}

const SHOW_CATEGORIES = ['subway', 'mart', 'hospital', 'school', 'convenience', 'pharmacy', 'culture']

function distanceLabel(m: number): string {
  if (m < 1000) return `${m}m`
  return `${(m / 1000).toFixed(1)}km`
}

function walkMin(m: number): number {
  return Math.round(m / 67) // 도보 4km/h 기준
}

// ── POI 카드 ──────────────────────────────────────────────────
interface POICardsProps {
  poi_data: Record<string, POIItem[]>
}

export function POICards({ poi_data }: POICardsProps) {
  const entries = SHOW_CATEGORIES
    .map(key => ({ key, cfg: POI_CONFIG[key], items: poi_data[key] ?? [] }))
    .filter(e => e.items.length > 0)

  if (entries.length === 0) return null

  return (
    <div className="card p-5">
      <h3 className="section-title mb-4 flex items-center gap-2">
        <MapPin size={16} className="text-brand-500" />
        주변 시설 (POI)
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {entries.map(({ key, cfg, items }) => {
          const nearest = items[0]
          return (
            <div key={key} className="border border-gray-100 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${cfg.color}`}>
                  {cfg.icon}
                </span>
                <span className="text-xs font-semibold text-gray-600">{cfg.label}</span>
                <span className="ml-auto text-xs text-gray-400">{items.length}개</span>
              </div>
              <p className="text-sm font-medium text-gray-800 truncate">{nearest.name}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {distanceLabel(nearest.distance_m)} · 도보 {walkMin(nearest.distance_m)}분
              </p>
              {items.length > 1 && (
                <div className="mt-1.5 space-y-0.5">
                  {items.slice(1, 3).map((it, i) => (
                    <p key={i} className="text-xs text-gray-400 truncate">
                      {it.name} <span className="text-gray-300">·</span> {distanceLabel(it.distance_m)}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── 토지이용규제 카드 ─────────────────────────────────────────
interface LandUseCardProps {
  land_use_data: LandUseItem[]
}

export function LandUseCard({ land_use_data }: LandUseCardProps) {
  if (!land_use_data.length) return null

  return (
    <div className="card p-5">
      <h3 className="section-title mb-4 flex items-center gap-2">
        <Building2 size={16} className="text-brand-500" />
        토지이용규제
      </h3>
      <div className="space-y-2">
        {land_use_data.slice(0, 8).map((item, i) => (
          <div key={i} className="flex items-start justify-between gap-2 text-sm border-b border-gray-50 pb-2 last:border-0">
            <span className="font-medium text-gray-800">{item.zone_name ?? '-'}</span>
            <span className="text-xs text-gray-400 text-right flex-shrink-0">
              {item.law_name ?? item.group_name ?? ''}
            </span>
          </div>
        ))}
      </div>
      {land_use_data[0]?.reg_date && (
        <p className="text-xs text-gray-400 mt-3">지정일: {land_use_data[0].reg_date}</p>
      )}
    </div>
  )
}

// ── 실거래가 카드 ─────────────────────────────────────────────
interface RealPriceCardProps {
  real_price_data: RealPriceItem[]
}

function formatAmount(amount: number | null): string {
  if (!amount) return '-'
  const eok = Math.floor(amount / 10000)
  const man = amount % 10000
  if (eok > 0 && man > 0) return `${eok}억 ${man.toLocaleString()}만`
  if (eok > 0) return `${eok}억`
  return `${man.toLocaleString()}만`
}

export function RealPriceCard({ real_price_data }: RealPriceCardProps) {
  if (!real_price_data.length) return null

  // 최근 거래 20건만 표시
  const recent = real_price_data.slice(0, 20)

  // 가격대 통계
  const amounts = recent.map(t => t.amount).filter((a): a is number => a !== null && a > 0)
  const avgAmount = amounts.length ? Math.round(amounts.reduce((s, a) => s + a, 0) / amounts.length) : null
  const maxAmount = amounts.length ? Math.max(...amounts) : null
  const minAmount = amounts.length ? Math.min(...amounts) : null

  return (
    <div className="card p-5">
      <h3 className="section-title mb-4 flex items-center gap-2">
        <TrendingUp size={16} className="text-brand-500" />
        최근 실거래가 (3개월)
      </h3>

      {/* 통계 요약 */}
      {avgAmount && (
        <div className="grid grid-cols-3 gap-3 mb-4 p-3 bg-gray-50 rounded-lg">
          <div className="text-center">
            <p className="text-xs text-gray-400 mb-0.5">평균</p>
            <p className="text-sm font-bold text-brand-700">{formatAmount(avgAmount)}</p>
          </div>
          <div className="text-center border-x border-gray-200">
            <p className="text-xs text-gray-400 mb-0.5">최고</p>
            <p className="text-sm font-bold text-red-600">{formatAmount(maxAmount)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-400 mb-0.5">최저</p>
            <p className="text-sm font-bold text-blue-600">{formatAmount(minAmount)}</p>
          </div>
        </div>
      )}

      {/* 거래 목록 */}
      <div className="space-y-1.5 max-h-48 overflow-y-auto">
        {recent.map((t, i) => (
          <div key={i} className="flex items-center justify-between text-xs py-1.5 border-b border-gray-50 last:border-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-gray-400 flex-shrink-0">{t.deal_ym?.slice(0, 4)}.{t.deal_ym?.slice(4, 6)}</span>
              <span className="font-medium text-gray-700 truncate">{t.name ?? t.dong ?? '-'}</span>
              {t.area && <span className="text-gray-400 flex-shrink-0">{t.area}㎡</span>}
              {t.floor && <span className="text-gray-400 flex-shrink-0">{t.floor}층</span>}
            </div>
            <span className="font-semibold text-gray-800 flex-shrink-0 ml-2">{formatAmount(t.amount)}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-400 mt-2">출처: 국토교통부 실거래가 공개시스템</p>
    </div>
  )
}
