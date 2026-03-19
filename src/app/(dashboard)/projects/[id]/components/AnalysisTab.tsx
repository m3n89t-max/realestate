'use client'

import { useState } from 'react'
import {
  MapPin, TrendingUp, Building2, Target, FileText,
  Loader2, CheckCircle2, AlertCircle, RefreshCw, ChevronDown, ChevronUp,
  Train, ShoppingCart, Hospital, GraduationCap, Coffee, Pill, Landmark,
  ExternalLink, Store, BarChart3, UtensilsCrossed, BookOpen, Home as HomeIcon
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import type { POIItem, RealPriceItem } from '@/lib/types'
import KakaoMap from '@/components/KakaoMap'

// ── POI 아이콘 맵 ─────────────────────────────────────────────
const POI_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  subway:      { label: '지하철',   icon: <Train size={14} />,        color: 'text-blue-600 bg-blue-50' },
  mart:        { label: '대형마트', icon: <ShoppingCart size={14} />, color: 'text-green-600 bg-green-50' },
  hospital:    { label: '병원',     icon: <Hospital size={14} />,     color: 'text-red-600 bg-red-50' },
  school:      { label: '학교',     icon: <GraduationCap size={14} />,color: 'text-purple-600 bg-purple-50' },
  convenience: { label: '편의점',   icon: <Coffee size={14} />,       color: 'text-amber-600 bg-amber-50' },
  pharmacy:    { label: '약국',     icon: <Pill size={14} />,         color: 'text-pink-600 bg-pink-50' },
  culture:     { label: '문화시설', icon: <Landmark size={14} />,     color: 'text-indigo-600 bg-indigo-50' },
  bank:        { label: '은행',     icon: <Building2 size={14} />,    color: 'text-sky-600 bg-sky-50' },
  cafe:        { label: '카페',     icon: <Coffee size={14} />,       color: 'text-amber-500 bg-amber-50' },
}
const SHOW_POI = ['subway', 'mart', 'hospital', 'school', 'convenience', 'pharmacy', 'culture']

function distanceLabel(m: number | null | undefined) {
  if (!m) return '거리 미상'
  return m < 1000 ? `${m}m` : `${(m / 1000).toFixed(1)}km`
}
function walkMin(m: number | null | undefined) {
  if (!m) return '?'
  return Math.round(m / 67)
}
function formatAmount(amount: number | null): string {
  if (!amount) return '-'
  const eok = Math.floor(amount / 10000)
  const man = amount % 10000
  if (eok > 0 && man > 0) return `${eok}억 ${man.toLocaleString()}만`
  if (eok > 0) return `${eok}억`
  return `${man.toLocaleString()}만`
}

// ── 워크플로우 상태 표시 ──────────────────────────────────────
interface WorkflowStep {
  label: string
  done: boolean
  sub?: string
}
function WorkflowStatus({ steps }: { steps: WorkflowStep[] }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {steps.map((step, i) => (
        <div key={i} className="flex items-center gap-1 flex-shrink-0">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
            step.done ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
          }`}>
            {step.done
              ? <CheckCircle2 size={12} />
              : <div className="w-3 h-3 rounded-full border-2 border-current opacity-40" />
            }
            {step.label}
          </div>
          {i < steps.length - 1 && (
            <div className={`w-5 h-0.5 flex-shrink-0 ${step.done ? 'bg-green-300' : 'bg-gray-200'}`} />
          )}
        </div>
      ))}
    </div>
  )
}

// ── AI 분석 보고서 섹션 ───────────────────────────────────────
function AIAnalysisReport({ analysis, projectId, hasCoords, hasPOI, hasData, isCommercial, hasKakaoDensity }: {
  analysis: any
  projectId: string
  hasCoords: boolean
  hasPOI: boolean
  hasData: boolean
  isCommercial: boolean
  hasKakaoDensity: boolean
}) {
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const prereqs = [
    { label: '좌표 변환', done: hasCoords },
    { label: 'POI 수집',  done: hasPOI },
    { label: isCommercial ? '상권 데이터' : '부동산 데이터', done: hasData },
    { label: '업종 밀집도', done: hasKakaoDensity },
  ]
  // 모든 데이터가 수집되어야 분석 가능 (사용자 요청)
  const canAnalyze = prereqs.every(p => p.done)

  const runAnalysis = async () => {
    if (!canAnalyze) return
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const { data, error } = await supabase.functions.invoke('analyze-location', {
        body: { project_id: projectId },
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : undefined,
      })
      if (error) throw new Error(error.message ?? '분석 실패')
      toast.success('AI 입지 분석이 완료되었습니다')
      window.location.reload()
    } catch (err: any) {
      toast.error(err.message ?? '분석에 실패했습니다')
    } finally {
      setLoading(false)
    }
  }

  if (!analysis || !analysis.analysis_text) {
    return (
      <div className="card p-8 text-center border-2 border-dashed border-gray-200">
        <MapPin size={36} className="mx-auto text-gray-300 mb-3" />
        <p className="font-medium text-gray-600 mb-1">AI 입지 분석 미실행</p>
        <p className="text-sm text-gray-400 mb-3">모든 선행 데이터를 수집한 후 분석을 실행하세요. 종합적인 정보를 바탕으로 분석합니다.</p>

        <div className="flex items-center justify-center gap-3 mb-5">
          {prereqs.map((p, i) => (
            <div key={i} className="flex items-center gap-1.5">
              {p.done
                ? <CheckCircle2 size={13} className="text-green-500" />
                : <div className="w-3 h-3 rounded-full border-2 border-gray-300" />
              }
              <span className={`text-xs ${p.done ? 'text-green-600 font-medium' : 'text-gray-400'}`}>{p.label}</span>
              {i < prereqs.length - 1 && <span className="text-gray-200 ml-1">→</span>}
            </div>
          ))}
        </div>

        <button
          onClick={runAnalysis}
          disabled={loading || !canAnalyze}
          className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
          title={!canAnalyze ? '선행 데이터 수집이 필요합니다' : undefined}
        >
          {loading ? <><Loader2 size={14} className="animate-spin" /> 분석 중...</> : <><RefreshCw size={14} /> AI 분석 실행</>}
        </button>
        {!canAnalyze && (
          <p className="text-xs text-amber-600 mt-2">
            주소 좌표가 없습니다. 매물 주소를 확인하세요.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {analysis.analysis_text && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="section-title flex items-center gap-2">
              <FileText size={16} className="text-brand-500" />
              AI 입지 분석 보고서
            </h3>
            <button onClick={runAnalysis} disabled={loading} className="btn-secondary py-1.5 text-xs">
              {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              재분석
            </button>
          </div>
          <p className="text-sm text-gray-700 leading-relaxed bg-brand-50 rounded-lg p-4 border border-brand-100">
            {analysis.analysis_text}
          </p>
        </div>
      )}

      {analysis.advantages?.length > 0 && (
        <div className="card p-5">
          <h3 className="section-title mb-4 flex items-center gap-2">
            <CheckCircle2 size={16} className="text-green-500" />
            입지 장점
          </h3>
          <ul className="space-y-2">
            {analysis.advantages.map((adv: string, i: number) => (
              <li key={i} className="flex items-start gap-2.5 text-sm">
                <span className="w-5 h-5 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <span className="text-gray-700">{adv}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {analysis.recommended_targets?.length > 0 && (
          <div className="card p-5">
            <h3 className="section-title mb-4 flex items-center gap-2">
              <Target size={16} className="text-brand-500" />
              추천 고객 타겟
            </h3>
            <div className="space-y-3">
              {analysis.recommended_targets.map((t: any, i: number) => (
                <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <span className="w-6 h-6 bg-brand-100 text-brand-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {t.priority ?? i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{t.type}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{t.reason}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-4">
          {analysis.land_use_summary && (
            <div className="card p-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Building2 size={12} /> 토지이용 요약
              </h3>
              <p className="text-sm text-gray-700 leading-relaxed">{analysis.land_use_summary}</p>
            </div>
          )}
          {analysis.price_trend && (
            <div className="card p-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <TrendingUp size={12} /> {isCommercial ? '상권 현황' : '실거래가 동향'}
              </h3>
              <p className="text-sm text-gray-700 leading-relaxed">{analysis.price_trend}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── POI 섹션 ─────────────────────────────────────────────────
function POISection({ poi_data }: { poi_data: Record<string, POIItem[]> }) {
  const entries = SHOW_POI
    .map(key => ({
      key,
      cfg: POI_CONFIG[key],
      items: (poi_data[key] ?? []).filter(item => (item.distance_m ?? 0) <= 500),
    }))
    .filter(e => e.items.length > 0)

  if (entries.length === 0) return (
    <div className="text-center py-6 text-gray-400 text-sm">POI 데이터 없음</div>
  )

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
      {entries.map(({ key, cfg, items }) => {
        const nearest = items[0]
        return (
          <div key={key} className="border border-gray-100 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${cfg.color}`}>
                {cfg.icon}
              </span>
              <span className="text-xs font-semibold text-gray-600">{cfg.label}</span>
              <span className="ml-auto text-xs text-gray-400">{items.length}개</span>
            </div>
            <p className="text-sm font-medium text-gray-800 truncate">{nearest.name}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {nearest.distance_m ? `${distanceLabel(nearest.distance_m)} · 도보 ${walkMin(nearest.distance_m)}분` : '위치 정보 없음'}
            </p>
            {items.length > 1 && (
              <div className="mt-1.5 space-y-0.5">
                {items.slice(1, 3).map((it, i) => (
                  <p key={i} className="text-xs text-gray-400 truncate">
                    {it.name}{it.distance_m ? ` · ${distanceLabel(it.distance_m)}` : ''}
                  </p>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── 카카오 업종 밀집도 분석 ──────────────────────────────────
const KAKAO_CAT_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  CE7: { label: '카페',        icon: <Coffee size={14} />,          color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200' },
  FD6: { label: '음식점',      icon: <UtensilsCrossed size={14} />, color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200' },
  HP8: { label: '병원',        icon: <Hospital size={14} />,        color: 'text-red-700',    bg: 'bg-red-50 border-red-200' },
  AC5: { label: '학원',        icon: <BookOpen size={14} />,        color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200' },
  CS2: { label: '편의점',      icon: <ShoppingCart size={14} />,    color: 'text-green-700',  bg: 'bg-green-50 border-green-200' },
  AG2: { label: '부동산',      icon: <HomeIcon size={14} />,        color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200' },
  PM9: { label: '약국',        icon: <Pill size={14} />,            color: 'text-pink-700',   bg: 'bg-pink-50 border-pink-200' },
}

function densityScore(counts: { total_count: number }[]): { score: number; label: string; color: string } {
  const total = counts.reduce((s, c) => s + c.total_count, 0)
  if (total >= 200) return { score: total, label: '매우 높음', color: 'text-red-600' }
  if (total >= 100) return { score: total, label: '높음',     color: 'text-orange-600' }
  if (total >= 50)  return { score: total, label: '보통',     color: 'text-yellow-600' }
  return             { score: total, label: '낮음',     color: 'text-gray-500' }
}

function KakaoDensityPanel({ kakao_density, projectId, lat, lng }: {
  kakao_density: any
  projectId: string
  lat: number | null
  lng: number | null
}) {
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const analyze = async () => {
    if (!lat || !lng) { toast.error('좌표가 없습니다'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/kakao-poi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '분석 실패')
      toast.success('업종 밀집도 분석이 완료되었습니다')
      window.location.reload()
    } catch (e: any) {
      toast.error(e.message ?? '분석 실패')
    } finally {
      setLoading(false)
    }
  }

  if (!kakao_density) {
    return (
      <div className="flex flex-col items-center justify-center py-5 text-center gap-2">
        <BarChart3 size={28} className="text-gray-200" />
        <p className="text-xs text-gray-400">반경 500m 업종 밀집도 미분석</p>
        <button onClick={analyze} disabled={loading || !lat} className="btn-secondary text-xs py-1.5 px-3">
          {loading ? <><Loader2 size={12} className="animate-spin" />분석 중...</> : <><BarChart3 size={12} />업종 밀집도 분석</>}
        </button>
      </div>
    )
  }

  const { categories, radius_m = 500, collected_at } = kakao_density
  const catEntries = Object.entries(KAKAO_CAT_CONFIG).map(([code, cfg]) => ({
    code, cfg,
    data: categories?.[code] ?? { label: cfg.label, total_count: 0, items: [] },
  }))
  const density = densityScore(catEntries.map(e => e.data))
  const maxCount = Math.max(...catEntries.map(e => e.data.total_count), 1)
  const collectedDate = collected_at ? new Date(collected_at).toISOString().slice(0, 10).replace(/-/g, '.') : ''

  return (
    <div className="space-y-3">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 size={14} className="text-brand-500" />
          <span className="text-xs font-semibold text-gray-600">반경 {radius_m}m 업종 밀집도</span>
          <span className={`text-xs font-bold ${density.color}`}>{density.label}</span>
        </div>
        <button onClick={analyze} disabled={loading} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
          {loading ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
          재분석
        </button>
      </div>

      {/* 업종 카드 그리드 */}
      <div className="grid grid-cols-4 gap-1.5">
        {catEntries.map(({ code, cfg, data }) => (
          <button
            key={code}
            onClick={() => setExpanded(expanded === code ? null : code)}
            className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-center transition-all ${cfg.bg} ${expanded === code ? 'ring-2 ring-brand-300' : ''}`}
          >
            <span className={cfg.color}>{cfg.icon}</span>
            <span className="text-xs text-gray-600">{cfg.label}</span>
            <span className={`text-base font-bold ${cfg.color}`}>{data.total_count.toLocaleString()}</span>
            <span className="text-xs text-gray-400">개</span>
          </button>
        ))}
      </div>

      {/* 바 차트 */}
      <div className="space-y-1">
        {catEntries.sort((a, b) => b.data.total_count - a.data.total_count).map(({ code, cfg, data }) => (
          <div key={code} className="flex items-center gap-2 text-xs">
            <span className={`w-12 flex-shrink-0 text-right ${cfg.color}`}>{cfg.label}</span>
            <div className="flex-1 bg-gray-100 rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full ${cfg.bg.split(' ')[0].replace('bg-', 'bg-').replace('50', '400')}`}
                style={{ width: `${(data.total_count / maxCount) * 100}%` }}
              />
            </div>
            <span className="w-8 text-right text-gray-500">{data.total_count}</span>
          </div>
        ))}
      </div>

      {/* 선택 업종 상세 목록 */}
      {expanded && categories?.[expanded]?.items?.length > 0 && (
        <div className="border border-gray-100 rounded-lg p-3 bg-gray-50">
          <p className="text-xs font-semibold text-gray-600 mb-2">
            {KAKAO_CAT_CONFIG[expanded]?.label} 가까운 순
          </p>
          <div className="space-y-1.5">
            {categories[expanded].items.slice(0, 8).map((item: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-gray-700 truncate flex-1">{item.name}</span>
                <span className="text-gray-400 flex-shrink-0 ml-2">{item.distance_m}m</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {collectedDate && (
        <p className="text-xs text-gray-300 text-right">카카오맵 기준 · {collectedDate}</p>
      )}
    </div>
  )
}

// ── 지도 섹션 ─────────────────────────────────────────────────
function MapSection({
  lat, lng, poi_data, real_price_data, projectId,
}: {
  lat: number | null
  lng: number | null
  poi_data: Record<string, POIItem[]> | null
  real_price_data: RealPriceItem[] | null
  projectId: string
}) {
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const geocode = async () => {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const { error } = await supabase.functions.invoke('analyze-location', {
        body: { project_id: projectId },
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : undefined,
      })
      if (error) throw new Error('실패')
      toast.success('분석 완료')
      window.location.reload()
    } catch {
      toast.error('분석 실패')
    } finally {
      setLoading(false)
    }
  }

  if (!lat || !lng) return (
    <div className="text-center py-8 space-y-3">
      <MapPin size={32} className="mx-auto text-gray-200" />
      <p className="text-sm text-gray-400">좌표 없음</p>
      <button onClick={geocode} disabled={loading} className="btn-secondary text-xs py-1.5">
        {loading ? <><Loader2 size={12} className="animate-spin" /> 수집 중...</> : <><RefreshCw size={12} /> 좌표 재수집</>}
      </button>
    </div>
  )

  const poiSummary = SHOW_POI.map(key => {
    const items = (poi_data?.[key] ?? []).filter(item => (item.distance_m ?? 0) <= 500)
    const nearest = items[0]
    return nearest ? { key, cfg: POI_CONFIG[key], nearest } : null
  }).filter(Boolean) as { key: string; cfg: typeof POI_CONFIG[string]; nearest: POIItem }[]

  const amounts = (real_price_data ?? []).map(t => t.amount).filter((a): a is number => a !== null && a > 0)
  const avgPrice = amounts.length ? Math.round(amounts.reduce((s, a) => s + a, 0) / amounts.length) : null
  const maxPrice = amounts.length ? Math.max(...amounts) : null

  return (
    <div className="space-y-3">
      <div className="rounded-xl overflow-hidden border border-gray-100 relative">
        <KakaoMap lat={lat} lng={lng} level={4} style={{ width: '100%', height: 380 }} />
        <a
          href={`https://map.kakao.com/link/map/${lat},${lng}`}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute bottom-2 right-2 flex items-center gap-1 bg-white/90 backdrop-blur-sm text-xs text-gray-600 px-2 py-1 rounded-full shadow hover:bg-white z-10"
        >
          <ExternalLink size={10} />
          카카오지도
        </a>
      </div>

      {poiSummary.length > 0 && (
        <div className="grid grid-cols-4 gap-1.5">
          {poiSummary.map(({ key, cfg, nearest }) => (
            <div key={key} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
              <span className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${cfg.color}`}>
                {cfg.icon}
              </span>
              <div className="min-w-0">
                <p className="text-xs text-gray-400">{cfg.label}</p>
                <p className="text-xs font-semibold text-gray-700">{distanceLabel(nearest.distance_m)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {avgPrice && (
        <div className="flex items-center gap-2 p-2.5 bg-brand-50 rounded-lg border border-brand-100">
          <TrendingUp size={12} className="text-brand-500 flex-shrink-0" />
          <span className="text-xs text-gray-500">주변 시세 {amounts.length}건</span>
          <span className="ml-auto text-sm font-bold text-brand-700">{formatAmount(avgPrice)}</span>
          <span className="text-xs text-gray-400">·</span>
          <span className="text-sm font-bold text-red-600">{formatAmount(maxPrice)}</span>
        </div>
      )}
    </div>
  )
}

// ── 실거래가 섹션 ─────────────────────────────────────────────
function RealPriceSection({ real_price_data, projectId, legalDong }: { real_price_data: RealPriceItem[], projectId: string, legalDong?: string | null }) {
  const [showAll, setShowAll] = useState(false)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const collect = async () => {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const { error } = await supabase.functions.invoke('collect-real-price', {
        body: { project_id: projectId },
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : undefined,
      })
      if (error) throw error
      toast.success('실거래가 수집이 완료되었습니다')
      window.location.reload()
    } catch {
      toast.error('실거래가 수집에 실패했습니다')
    } finally {
      setLoading(false)
    }
  }

  if (!real_price_data.length) return (
    <div className="text-center py-6 space-y-3">
      <TrendingUp size={32} className="mx-auto text-gray-200" />
      <p className="text-sm text-gray-400">실거래가 데이터 없음</p>
      <button onClick={collect} disabled={loading} className="btn-primary text-xs py-1.5">
        {loading ? <><Loader2 size={12} className="animate-spin" /> 수집 중...</> : <><RefreshCw size={12} /> 실거래가 수집</>}
      </button>
    </div>
  )
  const amounts = real_price_data.map(t => t.amount).filter((a): a is number => a !== null && a > 0)
  const avg = amounts.length ? Math.round(amounts.reduce((s, a) => s + a, 0) / amounts.length) : null
  const max = amounts.length ? Math.max(...amounts) : null
  const min = amounts.length ? Math.min(...amounts) : null
  const list = showAll ? real_price_data.slice(0, 50) : real_price_data.slice(0, 10)

  // 현재 데이터의 동 분포 파악
  const dongs = [...new Set(real_price_data.map(t => t.dong).filter(Boolean))]
  const singleDong = dongs.length === 1 ? dongs[0] : null

  return (
    <div>
      {/* 동 필터 안내 */}
      {legalDong && (
        <div className="flex items-center gap-1.5 mb-3 text-xs">
          <MapPin size={11} className="text-brand-500 flex-shrink-0" />
          <span className="text-gray-500">
            {singleDong
              ? <><span className="font-medium text-brand-700">{singleDong}</span> 인근 거래 {real_price_data.length}건</>
              : <><span className="font-medium text-gray-700">{legalDong}</span> 주변 거래 {real_price_data.length}건</>
            }
          </span>
        </div>
      )}
      {avg && (
        <div className="grid grid-cols-3 gap-3 mb-4 p-3 bg-gray-50 rounded-lg">
          <div className="text-center">
            <p className="text-xs text-gray-400 mb-0.5">평균</p>
            <p className="text-sm font-bold text-brand-700">{formatAmount(avg)}</p>
          </div>
          <div className="text-center border-x border-gray-200">
            <p className="text-xs text-gray-400 mb-0.5">최고</p>
            <p className="text-sm font-bold text-red-600">{formatAmount(max)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-400 mb-0.5">최저</p>
            <p className="text-sm font-bold text-blue-600">{formatAmount(min)}</p>
          </div>
        </div>
      )}
      <div className="space-y-1.5">
        {list.map((t, i) => (
          <div key={i} className="flex items-center justify-between text-xs py-1.5 border-b border-gray-50 last:border-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-gray-400 flex-shrink-0">
                {t.deal_ym?.slice(0, 4)}.{t.deal_ym?.slice(4, 6)}
              </span>
              <span className="font-medium text-gray-700 truncate">{t.name ?? t.dong ?? '-'}</span>
              {t.area && <span className="text-gray-400 flex-shrink-0">{t.area}㎡</span>}
              {t.floor && <span className="text-gray-400 flex-shrink-0">{t.floor}층</span>}
            </div>
            <span className="font-semibold text-gray-800 flex-shrink-0 ml-2">{formatAmount(t.amount)}</span>
          </div>
        ))}
      </div>
      {real_price_data.length > 10 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full mt-3 text-xs text-gray-400 hover:text-gray-600 flex items-center justify-center gap-1"
        >
          {showAll ? <><ChevronUp size={12} /> 접기</> : <><ChevronDown size={12} /> 전체 {real_price_data.length}건 보기</>}
        </button>
      )}
      <button
        onClick={collect}
        disabled={loading}
        className="w-full mt-3 text-xs text-gray-400 hover:text-gray-600 flex items-center justify-center gap-1"
      >
        {loading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
        데이터 갱신
      </button>
      <p className="text-xs text-gray-400 mt-1">출처: 국토교통부 실거래가 공개시스템</p>
    </div>
  )
}

// ── 상권 분석 섹션 (상가/사무실용) ────────────────────────────
function CommercialSection({ commercial_data, projectId }: {
  commercial_data: any
  projectId: string
}) {
  const [loading, setLoading] = useState(false)
  const [expandedCat, setExpandedCat] = useState<string | null>(null)
  const [expandedMid, setExpandedMid] = useState<string | null>(null)
  const [showAllCats, setShowAllCats] = useState(false)
  const supabase = createClient()

  const fetchData = async () => {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const { error } = await supabase.functions.invoke('analyze-commercial', {
        body: { project_id: projectId },
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : undefined,
      })
      if (error) throw error
      toast.success('상권 데이터 수집이 완료되었습니다')
      window.location.reload()
    } catch {
      toast.error('상권 데이터 수집에 실패했습니다')
    } finally {
      setLoading(false)
    }
  }

  if (!commercial_data) {
    return (
      <div className="text-center py-6 space-y-3">
        <Store size={32} className="mx-auto text-gray-200" />
        <p className="text-sm text-gray-400">상권 데이터 없음</p>
        <button onClick={fetchData} disabled={loading} className="btn-primary text-xs py-1.5">
          {loading ? <><Loader2 size={12} className="animate-spin" /> 수집 중...</> : <><RefreshCw size={12} /> 상권 데이터 수집</>}
        </button>
      </div>
    )
  }

  const {
    zones = [],
    store_count_by_category = {},
    stores = [],
    radius_m = 500,
  } = commercial_data

  const totalStores: number = stores.length
  const categories = Object.entries(store_count_by_category as Record<string, number>)
    .sort((a, b) => b[1] - a[1])

  // 대분류 → 중분류 → 소분류 드릴다운 데이터 구성
  function getMidBreakdown(lcls: string): { name: string; count: number; scls: { name: string; count: number }[] }[] {
    const midMap: Record<string, Record<string, number>> = {}
    for (const s of stores as any[]) {
      if ((s.indsLclsNm ?? '기타') !== lcls) continue
      const mid = s.indsMclsNm ?? '기타'
      const scl = s.indsSclsNm ?? '기타'
      if (!midMap[mid]) midMap[mid] = {}
      midMap[mid][scl] = (midMap[mid][scl] ?? 0) + 1
    }
    return Object.entries(midMap)
      .map(([name, sclsMap]) => ({
        name,
        count: Object.values(sclsMap).reduce((a, b) => a + b, 0),
        scls: Object.entries(sclsMap)
          .map(([n, c]) => ({ name: n, count: c }))
          .sort((a, b) => b.count - a.count),
      }))
      .sort((a, b) => b.count - a.count)
  }

  return (
    <div className="space-y-4">
      {/* 요약 수치 */}
      <div className="grid grid-cols-2 gap-2">
        <div className="p-3 bg-brand-50 rounded-lg text-center">
          <p className="text-xs text-gray-500 mb-0.5">반경 {radius_m}m 상가</p>
          <p className="text-xl font-bold text-brand-700">{totalStores}개</p>
        </div>
        <div className="p-3 bg-orange-50 rounded-lg text-center">
          <p className="text-xs text-gray-500 mb-0.5">인근 상권</p>
          <p className="text-xl font-bold text-orange-600">{zones.length}개</p>
        </div>
      </div>

      {/* 업종별 분포 (클릭 시 중분류/소분류 드릴다운) */}
      {categories.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-2">업종별 분포 <span className="font-normal text-gray-400">(클릭 시 세분화)</span></p>
          <div className="space-y-1">
            {(showAllCats ? categories : categories.slice(0, 8)).map(([cat, count]) => {
              const pct = totalStores > 0 ? Math.round((count / totalStores) * 100) : 0
              const isOpen = expandedCat === cat
              const midBreakdown = isOpen ? getMidBreakdown(cat) : []

              return (
                <div key={cat} className="rounded-lg overflow-hidden border border-transparent hover:border-gray-100">
                  {/* 대분류 행 */}
                  <button
                    onClick={() => {
                      setExpandedCat(isOpen ? null : cat)
                      setExpandedMid(null)
                    }}
                    className="w-full flex items-center gap-2 text-xs px-2 py-1.5 hover:bg-gray-50 transition-colors"
                  >
                    <span className="w-20 text-gray-600 truncate flex-shrink-0 text-left">{cat}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                      <div className="bg-brand-500 h-2 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-gray-500 w-10 text-right flex-shrink-0">{count}개</span>
                    <span className="text-gray-300 flex-shrink-0">
                      {isOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                    </span>
                  </button>

                  {/* 중분류 드릴다운 */}
                  {isOpen && (
                    <div className="ml-3 mb-1 border-l-2 border-brand-100 pl-2 space-y-0.5">
                      {midBreakdown.map((mid) => {
                        const midOpen = expandedMid === `${cat}::${mid.name}`
                        return (
                          <div key={mid.name}>
                            <button
                              onClick={() => setExpandedMid(midOpen ? null : `${cat}::${mid.name}`)}
                              className="w-full flex items-center gap-2 text-xs px-1.5 py-1 hover:bg-brand-50 rounded transition-colors"
                            >
                              <span className="flex-1 text-gray-600 text-left truncate">{mid.name}</span>
                              <span className="text-brand-600 font-medium flex-shrink-0">{mid.count}개</span>
                              {mid.scls.length > 1 && (
                                <span className="text-gray-300 flex-shrink-0">
                                  {midOpen ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                                </span>
                              )}
                            </button>

                            {/* 소분류 드릴다운 */}
                            {midOpen && mid.scls.length > 1 && (
                              <div className="ml-2 border-l border-gray-100 pl-2 mb-1 space-y-0.5">
                                {mid.scls.map((scl) => (
                                  <div key={scl.name} className="flex items-center gap-2 text-xs px-1.5 py-0.5">
                                    <span className="flex-1 text-gray-500 truncate">{scl.name}</span>
                                    <span className="text-gray-400 flex-shrink-0">{scl.count}개</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          {categories.length > 8 && (
            <button
              onClick={() => setShowAllCats(!showAllCats)}
              className="w-full mt-1.5 text-xs text-gray-400 hover:text-gray-600 flex items-center justify-center gap-1"
            >
              {showAllCats
                ? <><ChevronUp size={11} /> 접기</>
                : <><ChevronDown size={11} /> 전체 {categories.length}개 업종 보기</>
              }
            </button>
          )}
        </div>
      )}

      {/* 인근 상권 목록 */}
      {zones.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-2">인근 상권</p>
          <div className="space-y-1.5">
            {zones.slice(0, 5).map((zone: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-xs p-2 bg-gray-50 rounded-lg">
                <span className="font-medium text-gray-700 truncate">{zone.mainTrarNm}</span>
                <span className="text-gray-400 flex-shrink-0 ml-2">
                  {zone.signguNm ?? ''}
                  {zone.trarArea ? ` · ${Math.round(zone.trarArea / 10000)}만㎡` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={fetchData}
        disabled={loading}
        className="w-full mt-1 text-xs text-gray-400 hover:text-gray-600 flex items-center justify-center gap-1"
      >
        {loading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
        데이터 갱신
      </button>
      <p className="text-xs text-gray-400">출처: 소상공인시장진흥공단</p>
    </div>
  )
}

// ── 메인 ─────────────────────────────────────────────────────
interface AnalysisTabProps {
  projectId: string
  project: any
  locationAnalysis: any
}

export default function AnalysisTab({ projectId, project, locationAnalysis }: AnalysisTabProps) {
  const isCommercial = project.property_type === 'commercial'

  const hasPOI        = project.poi_data != null && Object.keys(project.poi_data).length > 0
  const hasRealPrice  = project.real_price_data != null
  const hasCommercial = project.commercial_data != null
  const hasData       = isCommercial ? hasCommercial : hasRealPrice
  const hasAnalysis   = !!locationAnalysis

  const workflowSteps = [
    { label: '좌표 변환', done: !!(project.lat && project.lng) },
    { label: 'POI 수집',  done: hasPOI },
    { label: isCommercial ? '상권 데이터' : '부동산 데이터', done: hasData },
    { label: '입지 분석', done: hasAnalysis },
  ]

  return (
    <div className="space-y-6">
      {/* 워크플로우 진행 상태 */}
      <div className="card p-4">
        <p className="text-xs text-gray-400 mb-3 font-medium uppercase tracking-wide">데이터 수집 현황</p>
        <WorkflowStatus steps={workflowSteps} />
        {(!hasPOI || !hasData) && (
          <div className="flex items-center gap-2 mt-3 p-2.5 bg-amber-50 rounded-lg">
            <AlertCircle size={13} className="text-amber-500 flex-shrink-0" />
            <p className="text-xs text-amber-700">
              일부 데이터가 수집되지 않았습니다. {isCommercial ? '상권 데이터 수집 버튼을 눌러 수집하세요.' : '새 매물 등록 시 주소를 다시 입력하면 재수집됩니다.'}
            </p>
          </div>
        )}
      </div>

      {/* AI 분석 보고서 */}
      <AIAnalysisReport
        analysis={locationAnalysis}
        projectId={projectId}
        hasCoords={!!(project.lat && project.lng)}
        hasPOI={hasPOI}
        hasData={hasData}
        isCommercial={isCommercial}
        hasKakaoDensity={!!project.kakao_density}
      />

      {/* 수집 데이터 - Row 1: POI + 상권분석 (2열) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* POI */}
        <div className="card p-5">
          <h3 className="section-title mb-4 flex items-center gap-2">
            <MapPin size={15} className="text-brand-500" />
            주변 시설 (POI)
            <span className="ml-auto text-xs text-gray-400 font-normal">반경 500m</span>
          </h3>
          {hasPOI
            ? <POISection poi_data={project.poi_data} />
            : <div className="text-center py-6 text-gray-400 text-sm">데이터 없음</div>
          }
        </div>

        {/* 상권분석 + 업종 밀집도 */}
        <div className="card p-5 space-y-5">
          <div>
            <h3 className="section-title mb-4 flex items-center gap-2">
              {isCommercial
                ? <><Store size={15} className="text-orange-500" /> 상권 분석</>
                : <><TrendingUp size={15} className="text-brand-500" /> 부동산 데이터 (실거래가)</>
              }
            </h3>
            {isCommercial
              ? <CommercialSection commercial_data={project.commercial_data} projectId={projectId} />
              : <RealPriceSection real_price_data={project.real_price_data ?? []} projectId={projectId} legalDong={project.legal_dong} />
            }
          </div>

          <div className="border-t pt-4">
            <h3 className="section-title mb-3 flex items-center gap-2">
              <BarChart3 size={15} className="text-brand-500" />
              업종 밀집도 분석
              <span className="ml-auto text-xs text-gray-400 font-normal">반경 500m · 카카오맵</span>
            </h3>
            <KakaoDensityPanel
              kakao_density={project.kakao_density}
              projectId={projectId}
              lat={project.lat}
              lng={project.lng}
            />
          </div>
        </div>
      </div>

      {/* Row 2: 지도 (전체 폭, 확대) */}
      <div className="card p-5">
        <h3 className="section-title mb-4 flex items-center gap-2">
          <MapPin size={15} className="text-brand-500" />
          매물 위치
        </h3>
        <MapSection
          lat={project.lat}
          lng={project.lng}
          poi_data={project.poi_data}
          real_price_data={isCommercial ? null : project.real_price_data}
          projectId={projectId}
        />
      </div>
    </div>
  )
}
