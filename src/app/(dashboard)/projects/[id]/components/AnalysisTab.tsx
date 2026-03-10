'use client'

import { useState } from 'react'
import {
  MapPin, TrendingUp, Building2, Target, FileText,
  Loader2, CheckCircle2, AlertCircle, RefreshCw, ChevronDown, ChevronUp,
  Train, ShoppingCart, Hospital, GraduationCap, Coffee, Pill, Landmark,
  ExternalLink
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

function distanceLabel(m: number) {
  return m < 1000 ? `${m}m` : `${(m / 1000).toFixed(1)}km`
}
function walkMin(m: number) {
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
function AIAnalysisReport({ analysis, projectId, hasCoords, hasPOI, hasRealPrice }: {
  analysis: any
  projectId: string
  hasCoords: boolean
  hasPOI: boolean
  hasRealPrice: boolean
}) {
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  // 선행 조건 체크
  const prereqs = [
    { label: '좌표 변환', done: hasCoords },
    { label: 'POI 수집',  done: hasPOI },
    { label: '부동산 데이터', done: hasRealPrice },
  ]
  const canAnalyze = prereqs.every(p => p.done)

  const runAnalysis = async () => {
    if (!canAnalyze) return
    setLoading(true)
    try {
      const { error } = await supabase.functions.invoke('analyze-location', {
        body: { project_id: projectId },
      })
      if (error) throw error
      toast.success('AI 입지 분석이 완료되었습니다')
      window.location.reload()
    } catch {
      toast.error('분석에 실패했습니다')
    } finally {
      setLoading(false)
    }
  }

  if (!analysis) {
    return (
      <div className="card p-8 text-center border-2 border-dashed border-gray-200">
        <MapPin size={36} className="mx-auto text-gray-300 mb-3" />
        <p className="font-medium text-gray-600 mb-1">AI 입지 분석 미실행</p>
        <p className="text-sm text-gray-400 mb-3">좌표 변환 → POI 수집 → 부동산 데이터 수집 완료 후 실행 가능합니다</p>

        {/* 선행 조건 체크리스트 */}
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
            미완료 항목: {prereqs.filter(p => !p.done).map(p => p.label).join(', ')}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 종합 분석 */}
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

      {/* 입지 장점 */}
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

      {/* 추천 타겟 + 토지이용/실거래가 요약 */}
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
                <TrendingUp size={12} /> 실거래가 동향
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
    .map(key => ({ key, cfg: POI_CONFIG[key], items: poi_data[key] ?? [] }))
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
              {distanceLabel(nearest.distance_m)} · 도보 {walkMin(nearest.distance_m)}분
            </p>
            {items.length > 1 && (
              <div className="mt-1.5 space-y-0.5">
                {items.slice(1, 3).map((it, i) => (
                  <p key={i} className="text-xs text-gray-400 truncate">
                    {it.name} · {distanceLabel(it.distance_m)}
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

// ── 지도 + 주변시설/시세 섹션 ────────────────────────────────
function MapSection({
  lat, lng, poi_data, real_price_data,
}: {
  lat: number | null
  lng: number | null
  poi_data: Record<string, POIItem[]> | null
  real_price_data: RealPriceItem[] | null
}) {
  if (!lat || !lng) return (
    <div className="text-center py-6 text-gray-400 text-sm">좌표 없음</div>
  )

  // POI 요약: 6개 카테고리 중 가장 가까운 것
  const poiSummary = SHOW_POI.slice(0, 6).map(key => {
    const items = poi_data?.[key] ?? []
    const nearest = items[0]
    return nearest ? { key, cfg: POI_CONFIG[key], nearest } : null
  }).filter(Boolean) as { key: string; cfg: typeof POI_CONFIG[string]; nearest: POIItem }[]

  // 실거래가 요약
  const amounts = (real_price_data ?? []).map(t => t.amount).filter((a): a is number => a !== null && a > 0)
  const avgPrice = amounts.length ? Math.round(amounts.reduce((s, a) => s + a, 0) / amounts.length) : null
  const maxPrice = amounts.length ? Math.max(...amounts) : null

  return (
    <div className="space-y-3">
      {/* 카카오 지도 (JS SDK, 핀 표시) */}
      <div className="rounded-xl overflow-hidden border border-gray-100 relative">
        <KakaoMap lat={lat} lng={lng} level={4} style={{ width: '100%', height: 260 }} />
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

      {/* POI 요약 */}
      {poiSummary.length > 0 && (
        <div className="grid grid-cols-2 gap-1.5">
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

      {/* 주변 시세 */}
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
function RealPriceSection({ real_price_data }: { real_price_data: RealPriceItem[] }) {
  const [showAll, setShowAll] = useState(false)
  if (!real_price_data.length) return (
    <div className="text-center py-6 text-gray-400 text-sm">실거래가 데이터 없음</div>
  )
  const amounts = real_price_data.map(t => t.amount).filter((a): a is number => a !== null && a > 0)
  const avg = amounts.length ? Math.round(amounts.reduce((s, a) => s + a, 0) / amounts.length) : null
  const max = amounts.length ? Math.max(...amounts) : null
  const min = amounts.length ? Math.min(...amounts) : null
  const list = showAll ? real_price_data.slice(0, 50) : real_price_data.slice(0, 10)

  return (
    <div>
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
      <p className="text-xs text-gray-400 mt-2">출처: 국토교통부 실거래가 공개시스템</p>
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
  const hasPOI       = project.poi_data != null && Object.keys(project.poi_data).length > 0
  // 빈 배열이어도 수집 시도된 것으로 간주 (해당 지역 데이터 없음)
const hasRealPrice = project.real_price_data != null
  const hasAnalysis  = !!locationAnalysis

  const workflowSteps = [
    { label: '좌표 변환',   done: !!(project.lat && project.lng) },
    { label: 'POI 수집',    done: hasPOI },
    { label: '부동산 데이터', done: hasRealPrice },
    { label: '입지 분석',   done: hasAnalysis },
  ]

  return (
    <div className="space-y-6">
      {/* 워크플로우 진행 상태 */}
      <div className="card p-4">
        <p className="text-xs text-gray-400 mb-3 font-medium uppercase tracking-wide">데이터 수집 현황</p>
        <WorkflowStatus steps={workflowSteps} />
        {(!hasPOI || !hasRealPrice) && (
          <div className="flex items-center gap-2 mt-3 p-2.5 bg-amber-50 rounded-lg">
            <AlertCircle size={13} className="text-amber-500 flex-shrink-0" />
            <p className="text-xs text-amber-700">
              일부 데이터가 수집되지 않았습니다. 새 매물 등록 시 주소를 다시 입력하면 재수집됩니다.
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
        hasRealPrice={hasRealPrice}
      />

      {/* 수집 데이터 3단 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* POI */}
        <div className="card p-5">
          <h3 className="section-title mb-4 flex items-center gap-2">
            <MapPin size={15} className="text-brand-500" />
            주변 시설 (POI)
          </h3>
          {hasPOI
            ? <POISection poi_data={project.poi_data} />
            : <div className="text-center py-6 text-gray-400 text-sm">데이터 없음</div>
          }
        </div>

        {/* 지도 */}
        <div className="card p-5">
          <h3 className="section-title mb-4 flex items-center gap-2">
            <MapPin size={15} className="text-brand-500" />
            매물 위치
          </h3>
          <MapSection
            lat={project.lat}
            lng={project.lng}
            poi_data={project.poi_data}
            real_price_data={project.real_price_data}
          />
        </div>

        {/* 실거래가 */}
        <div className="card p-5">
          <h3 className="section-title mb-4 flex items-center gap-2">
            <TrendingUp size={15} className="text-brand-500" />
            부동산 데이터 (실거래가)
          </h3>
          {hasRealPrice
            ? <RealPriceSection real_price_data={project.real_price_data} />
            : <div className="text-center py-6 text-gray-400 text-sm">데이터 없음</div>
          }
        </div>
      </div>
    </div>
  )
}
