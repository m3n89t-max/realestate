'use client'

import { useState } from 'react'
import {
  Wand2, Download, Share2, Image as ImageIcon, MapPin, TrendingUp,
  Home, Phone, Sparkles, Loader2, Building2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { GeneratedContent } from '@/lib/types'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'

interface CardNewsTabProps {
  projectId: string
  contents: GeneratedContent[]
  assets: any[]
}

interface CardSlide {
  order: number
  layout: string
  title: string
  subtitle?: string
  body?: string
  highlight?: string
  price_badge?: string
  address?: string
  checkpoints?: string[]
  spec_grid?: { label: string; value: string }[]
  points?: string[]
  emoji?: string
  hashtags?: string[]
  cta?: string
  image_prompt?: string
}

const COLOR_THEMES = [
  { id: 'emerald', label: '에메랄드', accent: '#10b981', dark: '#064e3b', light: '#d1fae5', mid: '#059669' },
  { id: 'blue',    label: '블루',     accent: '#3b82f6', dark: '#1e3a8a', light: '#dbeafe', mid: '#2563eb' },
  { id: 'orange',  label: '오렌지',   accent: '#f97316', dark: '#7c2d12', light: '#fed7aa', mid: '#ea580c' },
  { id: 'purple',  label: '퍼플',     accent: '#a855f7', dark: '#3b0764', light: '#f3e8ff', mid: '#9333ea' },
  { id: 'rose',    label: '로즈',     accent: '#f43f5e', dark: '#881337', light: '#ffe4e6', mid: '#e11d48' },
  { id: 'slate',   label: '슬레이트', accent: '#64748b', dark: '#0f172a', light: '#f1f5f9', mid: '#475569' },
]
type Theme = typeof COLOR_THEMES[0]

function layoutFromOrder(order: number): string {
  const map: Record<number, string> = {
    1: 'cover', 2: 'location', 3: 'composition',
    4: 'investment', 5: 'interior', 6: 'cta',
  }
  return map[order] ?? 'cover'
}

function assignPhoto(order: number, assets: any[]): string | undefined {
  if (!assets.length) return undefined
  const cover = assets.find(a => a.is_cover) ?? assets[0]
  const rest = assets.filter(a => !a.is_cover)
  const find = (cats: string[]) =>
    assets.find(a => cats.some(c => (a.category ?? '').toLowerCase().includes(c)))
  const exterior = find(['exterior', 'outside', 'front', '외부', '전경', '외관']) ?? cover
  const interior = find(['interior', 'inside', 'room', 'living', '내부', '거실', '방']) ?? rest[0] ?? cover
  const kitchen  = find(['kitchen', 'bath', 'toilet', 'facility', '주방', '욕실', '시설']) ?? rest[1] ?? interior
  const pool: Record<number, string | undefined> = {
    1: cover?.file_url,
    2: exterior?.file_url,
    3: interior?.file_url,
    4: kitchen?.file_url,
    5: (rest[rest.length - 1] ?? cover)?.file_url,
    6: cover?.file_url,
  }
  return pool[order] ?? assets[(order - 1) % assets.length]?.file_url
}

// ── Card 1: Cover ──────────────────────────────────────────────
function CoverCard({ card, theme, photo }: { card: CardSlide; theme: Theme; photo?: string }) {
  return (
    <div className="relative aspect-square rounded-2xl overflow-hidden shadow-xl">
      {photo
        ? <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover" />
        : <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${theme.dark}, ${theme.accent})` }} />
      }
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
      <div className="absolute top-0 left-0 right-0 h-1" style={{ background: theme.accent }} />

      <div className="absolute inset-x-0 bottom-0 p-4 text-white">
        {card.checkpoints && card.checkpoints.length > 0 && (
          <div className="mb-2.5 space-y-1">
            {card.checkpoints.slice(0, 3).map((pt, i) => (
              <div key={i} className="flex items-start gap-1.5 text-[11px]">
                <span className="font-bold mt-0.5 flex-shrink-0" style={{ color: theme.accent }}>✓</span>
                <span className="opacity-90">{pt}</span>
              </div>
            ))}
          </div>
        )}
        <h2 className="font-black text-[22px] leading-tight drop-shadow-lg whitespace-pre-line mb-2">
          {card.title}
        </h2>
        {card.subtitle && (
          <p className="text-[11px] opacity-75 mb-2.5">{card.subtitle}</p>
        )}
        {card.price_badge && (
          <div className="inline-block text-sm font-black px-4 py-1.5 rounded-full shadow-lg" style={{ background: theme.accent }}>
            {card.price_badge}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Card 2: Location ────────────────────────────────────────────
function LocationCard({ card, theme, photo }: { card: CardSlide; theme: Theme; photo?: string }) {
  return (
    <div className="relative aspect-square rounded-2xl overflow-hidden shadow-xl">
      {photo
        ? <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover" />
        : <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${theme.dark}, ${theme.accent})` }} />
      }
      <div className="absolute inset-0 bg-gradient-to-b from-black/75 via-black/20 to-black/65" />

      {/* Top banner */}
      <div className="absolute top-0 left-0 right-0 p-3" style={{ background: `${theme.accent}e0` }}>
        <div className="flex items-center gap-1.5 text-white">
          <MapPin size={13} />
          <span className="font-bold text-sm">{card.title}</span>
        </div>
        {card.address && (
          <p className="text-white/90 text-[11px] mt-0.5 font-medium">{card.address}</p>
        )}
      </div>

      {/* Checkpoints */}
      <div className="absolute inset-x-0 bottom-0 p-4 text-white">
        {card.checkpoints && card.checkpoints.length > 0 && (
          <div className="space-y-2 mb-2">
            {card.checkpoints.map((pt, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 shadow" style={{ background: theme.accent }}>
                  <span className="text-white text-[9px] font-bold">✓</span>
                </div>
                <span className="text-[12px] leading-tight">{pt}</span>
              </div>
            ))}
          </div>
        )}
        {card.body && <p className="text-[11px] opacity-70">{card.body}</p>}
      </div>
    </div>
  )
}

// ── Card 3: Composition / Spec ──────────────────────────────────
function CompositionCard({ card, theme, photo }: { card: CardSlide; theme: Theme; photo?: string }) {
  return (
    <div className="relative aspect-square rounded-2xl overflow-hidden shadow-xl" style={{ background: theme.light }}>
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 p-3" style={{ background: theme.accent }}>
        <div className="flex items-center gap-1.5 text-white">
          <Building2 size={13} />
          <span className="font-bold text-sm">{card.title}</span>
        </div>
      </div>

      {/* Spec grid */}
      <div className="absolute top-[52px] inset-x-3 bottom-3">
        {card.spec_grid && card.spec_grid.length > 0 ? (
          <div className={`grid gap-2 h-full ${card.spec_grid.length >= 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {card.spec_grid.slice(0, 2).map((spec, i) => (
              <div
                key={i}
                className="rounded-xl p-3 flex flex-col"
                style={{ background: i === 0 ? `${theme.accent}25` : `${theme.mid}18` }}
              >
                <p className="text-xs font-black mb-1.5 pb-1 border-b" style={{ color: theme.dark, borderColor: `${theme.accent}50` }}>
                  {spec.label}
                </p>
                <p className="text-xs leading-relaxed flex-1 whitespace-pre-line" style={{ color: theme.dark }}>
                  {spec.value}
                </p>
              </div>
            ))}
          </div>
        ) : card.points && card.points.length > 0 ? (
          <div className="mt-2 space-y-2">
            {card.points.map((pt, i) => (
              <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg" style={{ background: `${theme.accent}18` }}>
                <span style={{ color: theme.accent }} className="flex-shrink-0 font-bold">●</span>
                <span className="text-xs" style={{ color: theme.dark }}>{pt}</span>
              </div>
            ))}
          </div>
        ) : card.body ? (
          /* 구 형식 fallback — body 텍스트를 카드처럼 표시 */
          <div className="mt-2 p-3 rounded-xl h-[calc(100%-8px)]" style={{ background: `${theme.accent}18` }}>
            <p className="text-xs leading-relaxed" style={{ color: theme.dark }}>{card.body}</p>
          </div>
        ) : (
          <div className="mt-4 text-center">
            <p className="text-xs opacity-50" style={{ color: theme.dark }}>카드뉴스를 재생성하면<br/>상세 구성이 표시됩니다</p>
          </div>
        )}
      </div>

      {/* Small photo bottom-right */}
      {photo && (
        <div className="absolute bottom-3 right-3 w-14 h-14 rounded-lg overflow-hidden opacity-65 shadow-md">
          <img src={photo} alt="" className="w-full h-full object-cover" />
        </div>
      )}
    </div>
  )
}

// ── Card 4: Investment / Rental ─────────────────────────────────
function InvestmentCard({ card, theme, photo }: { card: CardSlide; theme: Theme; photo?: string }) {
  return (
    <div className="relative aspect-square rounded-2xl overflow-hidden shadow-xl">
      {photo
        ? <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover" />
        : <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${theme.dark}, ${theme.accent})` }} />
      }
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/55" />

      {/* Top banner */}
      <div className="absolute top-0 left-0 right-0 p-3" style={{ background: `${theme.dark}cc` }}>
        <div className="flex items-center gap-1.5 text-white">
          <TrendingUp size={13} style={{ color: theme.accent }} />
          <span className="font-bold text-sm">{card.title}</span>
        </div>
      </div>

      {/* Content */}
      <div className="absolute inset-x-0 bottom-0 p-4 text-white">
        {card.highlight && (
          <div className="inline-block px-3 py-1.5 rounded-lg text-sm font-black mb-2 shadow" style={{ background: theme.accent }}>
            {card.highlight}
          </div>
        )}
        {card.body && <p className="text-sm font-medium mb-2">{card.body}</p>}
        {card.points && card.points.length > 0 && (
          <div className="space-y-1">
            {card.points.slice(0, 2).map((pt, i) => (
              <div key={i} className="flex items-start gap-1.5 text-[11px] opacity-90">
                <span style={{ color: theme.accent }} className="flex-shrink-0">●</span>
                <span>{pt}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Card 5: Interior / Living ───────────────────────────────────
function InteriorCard({ card, theme, photo }: { card: CardSlide; theme: Theme; photo?: string }) {
  return (
    <div className="relative aspect-square rounded-2xl overflow-hidden shadow-xl">
      {photo
        ? <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover" />
        : <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${theme.dark}, ${theme.accent})` }} />
      }
      <div className="absolute inset-0 bg-gradient-to-t from-black/88 via-black/25 to-transparent" />

      <div className="absolute top-3 left-3">
        <div className="w-8 h-8 rounded-full flex items-center justify-center shadow-lg" style={{ background: `${theme.accent}dd` }}>
          <Home size={15} className="text-white" />
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 p-4 text-white">
        <h3 className="font-black text-sm mb-2">{card.title}</h3>
        {card.checkpoints && card.checkpoints.length > 0 && (
          <div className="space-y-1.5">
            {card.checkpoints.slice(0, 4).map((pt, i) => (
              <div key={i} className="flex items-start gap-1.5 text-[11px]">
                {i < 3
                  ? <span className="font-bold flex-shrink-0 mt-0.5" style={{ color: theme.accent }}>✓</span>
                  : <span className="flex-shrink-0">⭐</span>
                }
                <span className="opacity-90">{pt}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Card 6: CTA ─────────────────────────────────────────────────
function CtaCard({ card, theme, photo }: { card: CardSlide; theme: Theme; photo?: string }) {
  return (
    <div className="relative aspect-square rounded-2xl overflow-hidden shadow-xl">
      {photo
        ? <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover" />
        : <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${theme.dark}, ${theme.accent})` }} />
      }
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-black/88" />
      <div className="absolute top-0 left-0 right-0 h-1" style={{ background: theme.accent }} />

      <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center text-white">
        <div className="mb-1">
          <Phone size={18} style={{ color: theme.accent }} className="mx-auto" />
        </div>
        <h2 className="font-black text-lg leading-tight whitespace-pre-line mb-2.5 drop-shadow">
          {card.title}
        </h2>
        {card.price_badge && (
          <div className="inline-block text-sm font-black px-4 py-1.5 rounded-full mb-3 shadow-lg" style={{ background: theme.accent }}>
            {card.price_badge}
          </div>
        )}
        {card.cta && (
          <div className="border border-white/50 rounded-lg px-4 py-2 text-xs font-bold backdrop-blur-sm mb-3">
            {card.cta}
          </div>
        )}
        {card.hashtags && card.hashtags.length > 0 && (
          <p className="text-[10px] opacity-55 leading-relaxed">
            {card.hashtags.slice(0, 5).map(t => t.startsWith('#') ? t : `#${t}`).join(' ')}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Dispatcher ──────────────────────────────────────────────────
function CardPreview({
  card, theme, photo, aiPhoto, onGenerateAI, aiLoading,
}: {
  card: CardSlide
  theme: Theme
  photo?: string
  aiPhoto?: string
  onGenerateAI?: () => void
  aiLoading?: boolean
}) {
  const bg = aiPhoto || photo
  const props = { card, theme, photo: bg }

  let content: React.ReactNode
  switch (card.layout) {
    case 'cover':       content = <CoverCard {...props} />; break
    case 'location':    content = <LocationCard {...props} />; break
    case 'composition': content = <CompositionCard {...props} />; break
    case 'investment':  content = <InvestmentCard {...props} />; break
    case 'interior':    content = <InteriorCard {...props} />; break
    case 'cta':         content = <CtaCard {...props} />; break
    default:            content = <CoverCard {...props} />
  }

  return (
    <div className="relative group">
      {content}
      {/* AI 배경 버튼 — hover 시 표시 */}
      {onGenerateAI && (
        <button
          onClick={onGenerateAI}
          disabled={aiLoading}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full shadow-lg bg-white/92 text-gray-700 hover:bg-white disabled:opacity-60"
          title="DALL-E로 AI 배경 이미지 생성"
        >
          {aiLoading
            ? <Loader2 size={10} className="animate-spin" />
            : <Sparkles size={10} className="text-purple-500" />
          }
          AI 배경
        </button>
      )}
      {aiPhoto && (
        <div className="absolute bottom-2 left-2 flex items-center gap-1 text-[9px] bg-purple-600/80 text-white px-1.5 py-0.5 rounded-full backdrop-blur-sm">
          <Sparkles size={8} /> AI
        </div>
      )}
    </div>
  )
}

// ── Main ────────────────────────────────────────────────────────
export default function CardNewsTab({ projectId, contents, assets }: CardNewsTabProps) {
  const supabase = createClient()
  const [generating, setGenerating] = useState(false)
  const [colorTheme, setColorTheme] = useState('emerald')
  const [selectedId, setSelectedId] = useState<string | null>(contents[0]?.id ?? null)
  const [aiPhotos, setAiPhotos] = useState<Record<number, string>>({})
  const [aiLoading, setAiLoading] = useState<Record<number, boolean>>({})

  const selected = contents.find(c => c.id === selectedId)
  const rawContent = selected?.content ? JSON.parse(selected.content) : null
  const rawCards = Array.isArray(rawContent) ? rawContent : (rawContent?.cards ?? [])

  const slides: CardSlide[] = rawCards.map((c: any, i: number) => {
    const order = c.order ?? c.card_number ?? (i + 1)
    return {
      order,
      layout: c.layout ?? layoutFromOrder(order),
      title: c.title ?? c.headline ?? `카드 ${i + 1}`,
      subtitle: c.subtitle,
      body: c.body ?? '',
      highlight: c.highlight ?? c.price ?? undefined,
      price_badge: c.price_badge,
      address: c.address,
      checkpoints: Array.isArray(c.checkpoints) ? c.checkpoints : undefined,
      spec_grid: Array.isArray(c.spec_grid) ? c.spec_grid : undefined,
      points: Array.isArray(c.points) ? c.points : undefined,
      emoji: c.emoji,
      hashtags: Array.isArray(c.hashtags) ? c.hashtags : undefined,
      cta: c.cta,
      image_prompt: c.image_prompt,
    }
  })

  const theme = COLOR_THEMES.find(t => t.id === colorTheme) ?? COLOR_THEMES[0]

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const { data, error } = await supabase.functions.invoke('generate-card-news', {
        body: { project_id: projectId },
      })
      if (error) throw new Error(error.message ?? '생성 실패')
      toast.success('카드뉴스가 생성되었습니다!')
      window.location.reload()
    } catch (err: any) {
      toast.error(err.message ?? '생성에 실패했습니다')
    } finally {
      setGenerating(false)
    }
  }

  const handleGenerateAI = async (card: CardSlide) => {
    setAiLoading(prev => ({ ...prev, [card.order]: true }))
    try {
      const res = await fetch(`/api/generate-card-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_prompt: card.image_prompt ?? `Real estate property photo, professional, high quality`,
          project_id: projectId,
          card_number: card.order,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'AI 이미지 생성 실패')
      setAiPhotos(prev => ({ ...prev, [card.order]: json.image_url }))
      toast.success(`카드 ${card.order} AI 배경 생성 완료`)
    } catch (err: any) {
      toast.error(err.message ?? 'AI 이미지 생성에 실패했습니다')
    } finally {
      setAiLoading(prev => ({ ...prev, [card.order]: false }))
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      {/* 컨트롤 패널 */}
      <div className="space-y-4">
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">카드뉴스 설정</h3>

          <div className="mb-4">
            <label className="label text-xs">색상 테마</label>
            <div className="grid grid-cols-3 gap-1.5">
              {COLOR_THEMES.map(t => (
                <button
                  key={t.id}
                  onClick={() => setColorTheme(t.id)}
                  className={cn(
                    'py-1.5 text-xs rounded-lg border font-medium transition-all',
                    colorTheme === t.id
                      ? 'ring-2 ring-offset-1 border-transparent'
                      : 'border-gray-200 hover:border-gray-300'
                  )}
                  style={colorTheme === t.id ? { '--tw-ring-color': t.accent } as React.CSSProperties : {}}
                >
                  <div className="w-full h-4 rounded mb-1" style={{ background: `linear-gradient(to right, ${t.dark}, ${t.accent})` }} />
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <button onClick={handleGenerate} disabled={generating} className="btn-primary w-full justify-center">
            {generating
              ? <><Loader2 size={14} className="animate-spin" /> 생성중...</>
              : <><Wand2 size={15} /> 카드뉴스 생성</>
            }
          </button>
        </div>

        {/* 매물 사진 */}
        {assets.length > 0 && (
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
              <ImageIcon size={14} />
              매물 사진 ({assets.length}장)
            </h3>
            <div className="grid grid-cols-3 gap-1">
              {assets.slice(0, 6).map((a: any, i) => (
                <img key={i} src={a.file_url} alt="" className="aspect-square rounded object-cover" />
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mt-2 leading-snug">
              카드별 자동 배치됨<br />
              <span className="text-purple-500">✦ 카드에 마우스 올리면 AI 배경 생성</span>
            </p>
          </div>
        )}

        {/* AI 이미지 안내 */}
        <div className="card p-3 bg-purple-50 border border-purple-100">
          <div className="flex items-start gap-2">
            <Sparkles size={13} className="text-purple-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-purple-700 mb-0.5">AI 배경 이미지 (옵션)</p>
              <p className="text-[11px] text-purple-600 leading-snug">
                카드에 마우스를 올려 "AI 배경" 버튼 클릭 시 DALL-E가 카드에 맞는 배경 이미지를 생성합니다.
              </p>
              <p className="text-[10px] text-purple-400 mt-1">카드당 약 $0.04 비용 발생</p>
            </div>
          </div>
        </div>

        {/* 버전 목록 */}
        {contents.length > 0 && (
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">생성 기록 ({contents.length})</h3>
            <div className="space-y-1.5">
              {contents.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={cn(
                    'w-full text-left p-2 rounded-lg border text-xs transition-colors',
                    selectedId === c.id
                      ? 'bg-brand-50 border-brand-200 text-brand-700'
                      : 'border-gray-100 hover:bg-gray-50 text-gray-600'
                  )}
                >
                  버전 {c.version} · {new Date(c.created_at).toISOString().slice(0, 10).replace(/-/g, '.')}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 미리보기 */}
      <div className="lg:col-span-3">
        {slides.length === 0 ? (
          <div className="card p-12 text-center">
            <Share2 size={40} className="mx-auto text-gray-200 mb-3" />
            <p className="text-gray-500 font-medium">카드뉴스를 생성해보세요</p>
            <p className="text-sm text-gray-400 mt-1">매물 분석 후 AI가 6장 레이아웃을 자동 구성합니다</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800">미리보기 ({slides.length}장)</h3>
              <button className="btn-secondary">
                <Download size={14} />
                PNG 다운로드
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {slides.map(card => (
                <CardPreview
                  key={card.order}
                  card={card}
                  theme={theme}
                  photo={assignPhoto(card.order, assets)}
                  aiPhoto={aiPhotos[card.order]}
                  onGenerateAI={() => handleGenerateAI(card)}
                  aiLoading={aiLoading[card.order]}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
