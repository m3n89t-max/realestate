'use client'

import { useState } from 'react'
import { Wand2, Download, Share2, Image as ImageIcon, MapPin, TrendingUp, Home, Phone } from 'lucide-react'
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
  title: string
  body: string
  highlight?: string
  emoji?: string
  hashtags?: string[]
  points?: string[]
  cta?: string
}

const COLOR_THEMES = [
  { id: 'blue',   label: '블루',   accent: '#3b82f6', dark: '#1e3a8a' },
  { id: 'green',  label: '그린',   accent: '#10b981', dark: '#064e3b' },
  { id: 'purple', label: '퍼플',   accent: '#a855f7', dark: '#3b0764' },
  { id: 'orange', label: '오렌지', accent: '#f97316', dark: '#7c2d12' },
  { id: 'rose',   label: '로즈',   accent: '#f43f5e', dark: '#881337' },
  { id: 'slate',  label: '슬레이트', accent: '#64748b', dark: '#0f172a' },
]

// 카드 번호에 따라 사진 배분 (카테고리 우선, 없으면 순번)
function assignPhoto(order: number, assets: any[]): string | undefined {
  if (!assets.length) return undefined
  const cover = assets.find(a => a.is_cover) ?? assets[0]
  const rest = assets.filter(a => !a.is_cover)

  // 카테고리 기반 매핑
  const find = (cats: string[]) =>
    assets.find(a => cats.some(c => (a.category ?? '').toLowerCase().includes(c)))

  const exterior = find(['exterior', 'outside', 'front', '외부', '전경', '외관']) ?? cover
  const interior = find(['interior', 'inside', 'room', 'living', '내부', '거실', '방']) ?? rest[0] ?? cover
  const kitchen  = find(['kitchen', 'bath', 'toilet', 'facility', '주방', '욕실', '시설']) ?? rest[1] ?? interior

  const pool: Record<number, string | undefined> = {
    1: cover?.file_url,                      // 표지 — 대표사진
    2: exterior?.file_url,                   // 입지강점 — 외관/전경
    3: interior?.file_url,                   // 시설인프라 — 내부
    4: kitchen?.file_url,                    // 투자포인트 — 다른 실내
    5: (rest[rest.length - 1] ?? cover)?.file_url, // 실거주 — 마지막 사진
    6: cover?.file_url,                      // 문의안내 — 대표사진 재사용
  }
  return pool[order] ?? assets[(order - 1) % assets.length]?.file_url
}

// 카드별 오버레이 스타일
function overlayStyle(order: number): string {
  switch (order) {
    case 1: return 'bg-gradient-to-t from-black/80 via-black/30 to-transparent'
    case 2: return 'bg-gradient-to-br from-black/60 via-black/30 to-transparent'
    case 3: return 'bg-gradient-to-t from-black/75 via-black/20 to-black/10'
    case 4: return 'bg-gradient-to-t from-black/85 via-black/40 to-transparent'
    case 5: return 'bg-gradient-to-t from-black/70 via-black/20 to-transparent'
    case 6: return 'bg-gradient-to-b from-black/70 via-black/50 to-black/80'
    default: return 'bg-gradient-to-t from-black/75 via-black/20 to-transparent'
  }
}

function CardPreview({
  card, theme, photo,
}: {
  card: CardSlide
  theme: typeof COLOR_THEMES[0]
  photo?: string
}) {
  const isLast = card.order >= 6
  const overlay = overlayStyle(card.order)

  return (
    <div className="relative aspect-square rounded-2xl overflow-hidden shadow-xl group cursor-pointer">
      {/* 배경 */}
      {photo ? (
        <img
          src={photo}
          alt=""
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{ background: `linear-gradient(135deg, ${theme.dark}, ${theme.accent})` }}
        />
      )}

      {/* 오버레이 */}
      <div className={cn('absolute inset-0', overlay)} />

      {/* 카드 번호 + 테마 컬러 뱃지 */}
      <div className="absolute top-3 left-3 flex items-center gap-1.5">
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-white shadow"
          style={{ background: theme.accent }}
        >
          {card.order}
        </div>
      </div>

      {/* 카드별 아이콘 (우상단) */}
      <div className="absolute top-3 right-3 opacity-60">
        {card.order === 2 && <MapPin size={16} className="text-white" />}
        {card.order === 4 && <TrendingUp size={16} className="text-white" />}
        {card.order === 5 && <Home size={16} className="text-white" />}
        {card.order === 6 && <Phone size={16} className="text-white" />}
      </div>

      {/* 컨텐츠 — 카드 1: 중앙 정렬, 나머지: 하단 정렬 */}
      {card.order === 1 ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-5 text-center text-white">
          <h2 className="font-black text-xl leading-tight drop-shadow-lg mb-2">
            {card.title}
          </h2>
          {card.highlight && (
            <div
              className="text-xs font-bold px-3 py-1 rounded-full mb-2 backdrop-blur-sm"
              style={{ background: `${theme.accent}cc` }}
            >
              {card.highlight}
            </div>
          )}
          {card.body && (
            <p className="text-xs opacity-80 leading-relaxed line-clamp-2">{card.body}</p>
          )}
        </div>
      ) : (
        <div className="absolute inset-x-0 bottom-0 p-4 text-white">
          {/* 포인트 리스트 (카드 2,3,4,5) */}
          {card.points && card.points.length > 0 && (
            <ul className="mb-2 space-y-0.5">
              {card.points.slice(0, 3).map((p, i) => (
                <li key={i} className="flex items-start gap-1 text-[11px] opacity-90">
                  <span style={{ color: theme.accent }} className="mt-0.5 shrink-0">●</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          )}

          <h3 className="font-black text-sm leading-tight drop-shadow mb-1">
            {card.title}
          </h3>

          {card.body && !isLast && (
            <p className="text-[11px] opacity-80 leading-snug line-clamp-2">{card.body}</p>
          )}

          {/* 6번 카드: 문의 정보 */}
          {isLast && (
            <div className="mt-1">
              <p className="text-xs opacity-80">{card.body}</p>
              {card.hashtags && card.hashtags.length > 0 && (
                <p className="text-[10px] mt-1 opacity-60">
                  {card.hashtags.slice(0, 5).map(t => t.startsWith('#') ? t : `#${t}`).join(' ')}
                </p>
              )}
            </div>
          )}

          {/* 하이라이트 뱃지 */}
          {card.highlight && !isLast && (
            <div
              className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full mt-1"
              style={{ background: `${theme.accent}99` }}
            >
              {card.highlight}
            </div>
          )}
        </div>
      )}

      {/* 하단 컬러 라인 */}
      <div
        className="absolute bottom-0 left-0 right-0 h-0.5"
        style={{ background: theme.accent }}
      />
    </div>
  )
}

export default function CardNewsTab({ projectId, contents, assets }: CardNewsTabProps) {
  const supabase = createClient()
  const [generating, setGenerating] = useState(false)
  const [colorTheme, setColorTheme] = useState('blue')
  const [selectedId, setSelectedId] = useState<string | null>(contents[0]?.id ?? null)

  const selected = contents.find(c => c.id === selectedId)
  const rawContent = selected?.content ? JSON.parse(selected.content) : null
  const rawCards = Array.isArray(rawContent) ? rawContent : (rawContent?.cards ?? [])
  const slides: CardSlide[] = rawCards.map((c: any, i: number) => ({
    order: c.order ?? c.card_number ?? (i + 1),
    title: c.title ?? c.headline ?? `카드 ${i + 1}`,
    body: c.body ?? (Array.isArray(c.points) ? '' : ''),
    highlight: c.subtitle ?? c.price ?? c.highlight,
    emoji: c.emoji,
    points: Array.isArray(c.points) ? c.points : undefined,
    hashtags: Array.isArray(c.hashtags) ? c.hashtags : undefined,
    cta: c.cta,
  }))

  const theme = COLOR_THEMES.find(t => t.id === colorTheme) ?? COLOR_THEMES[0]

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-card-news`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ project_id: projectId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '생성 실패')
      toast.success('카드뉴스가 생성되었습니다!')
      window.location.reload()
    } catch (err: any) {
      toast.error(err.message ?? '생성에 실패했습니다')
      console.error(err)
    } finally {
      setGenerating(false)
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
                  <div
                    className="w-full h-4 rounded mb-1"
                    style={{ background: `linear-gradient(to right, ${t.dark}, ${t.accent})` }}
                  />
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={generating}
            className="btn-primary w-full justify-center"
          >
            {generating ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                생성중...
              </>
            ) : (
              <><Wand2 size={15} /> 카드뉴스 생성</>
            )}
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
              카드별로 사진이 자동 배치됩니다<br />
              (표지→전경→내부→시설→실거주→문의)
            </p>
          </div>
        )}

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
                  버전 {c.version} · {new Date(c.created_at).toLocaleDateString('ko-KR')}
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
            <p className="text-sm text-gray-400 mt-1">매물 사진이 카드별로 자동 배치됩니다</p>
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
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
