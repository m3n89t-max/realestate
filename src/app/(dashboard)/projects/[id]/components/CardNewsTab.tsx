'use client'

import { useState } from 'react'
import { Wand2, Download, Share2, Image as ImageIcon } from 'lucide-react'
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
  subtitle?: string
  hashtags?: string[]
  points?: string[]
  cta?: string
}

const COLOR_THEMES = [
  { id: 'blue',   label: '블루',   from: '#1d4ed8', to: '#3b82f6', accent: '#93c5fd' },
  { id: 'green',  label: '그린',   from: '#065f46', to: '#10b981', accent: '#6ee7b7' },
  { id: 'purple', label: '퍼플',   from: '#581c87', to: '#a855f7', accent: '#d8b4fe' },
  { id: 'orange', label: '오렌지', from: '#92400e', to: '#f97316', accent: '#fed7aa' },
  { id: 'dark',   label: '다크',   from: '#0f172a', to: '#334155', accent: '#94a3b8' },
  { id: 'rose',   label: '로즈',   from: '#9f1239', to: '#f43f5e', accent: '#fda4af' },
]

function CardPreview({ card, theme, photo }: { card: CardSlide; theme: typeof COLOR_THEMES[0]; photo?: string }) {
  const isFirst = card.order === 1
  const isLast = card.order >= 6

  return (
    <div
      className="relative aspect-square rounded-2xl overflow-hidden shadow-lg flex flex-col"
      style={{ background: `linear-gradient(135deg, ${theme.from}, ${theme.to})` }}
    >
      {/* 배경 사진 (1번 카드에 반투명) */}
      {photo && isFirst && (
        <img
          src={photo}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-20"
        />
      )}

      {/* 장식 원 */}
      <div
        className="absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-10"
        style={{ background: theme.accent }}
      />
      <div
        className="absolute -bottom-6 -left-6 w-24 h-24 rounded-full opacity-10"
        style={{ background: theme.accent }}
      />

      {/* 카드 번호 뱃지 */}
      <div className="absolute top-3 left-3">
        <span
          className="text-xs font-bold px-2 py-0.5 rounded-full"
          style={{ background: 'rgba(255,255,255,0.2)', color: 'white' }}
        >
          {String(card.order).padStart(2, '0')}
        </span>
      </div>

      {/* 컨텐츠 */}
      <div className="relative flex flex-col items-center justify-center h-full p-5 text-center text-white gap-2">
        {card.emoji && (
          <span className="text-3xl drop-shadow">{card.emoji}</span>
        )}

        <h3 className="font-extrabold text-base leading-tight drop-shadow-sm">
          {card.title}
        </h3>

        {card.highlight && (
          <div
            className="text-xs font-semibold px-3 py-1 rounded-full"
            style={{ background: 'rgba(255,255,255,0.25)' }}
          >
            {card.highlight}
          </div>
        )}

        {card.body && (
          <p className="text-xs opacity-90 leading-relaxed line-clamp-3 max-w-[90%]">
            {card.body}
          </p>
        )}

        {/* points (카카오 스타일) */}
        {card.points && card.points.length > 0 && (
          <ul className="text-xs space-y-0.5 text-left w-full px-2">
            {card.points.slice(0, 3).map((p, i) => (
              <li key={i} className="flex items-start gap-1 opacity-90">
                <span style={{ color: theme.accent }}>✓</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        )}

        {/* 해시태그 */}
        {isLast && card.hashtags && card.hashtags.length > 0 && (
          <div className="flex flex-wrap justify-center gap-1 mt-1">
            {card.hashtags.slice(0, 4).map((tag, i) => (
              <span key={i} className="text-[10px] opacity-70">
                {tag.startsWith('#') ? tag : `#${tag}`}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 하단 그라데이션 바 */}
      <div
        className="absolute bottom-0 left-0 right-0 h-0.5"
        style={{ background: theme.accent, opacity: 0.5 }}
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
    body: c.body ?? '',
    highlight: c.subtitle ?? c.price ?? c.highlight,
    emoji: c.emoji,
    points: Array.isArray(c.points) ? c.points : undefined,
    hashtags: Array.isArray(c.hashtags) ? c.hashtags : undefined,
    cta: c.cta,
  }))

  const theme = COLOR_THEMES.find(t => t.id === colorTheme) ?? COLOR_THEMES[0]
  const coverPhoto = assets.find((a: any) => a.is_cover)?.file_url ?? assets[0]?.file_url

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

          {/* 색상 테마 */}
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
                      ? 'ring-2 ring-brand-500 border-transparent'
                      : 'border-gray-200 hover:border-gray-300'
                  )}
                >
                  <div
                    className="w-full h-4 rounded mb-1"
                    style={{ background: `linear-gradient(to right, ${t.from}, ${t.to})` }}
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

        {/* 매물 사진 현황 */}
        {assets.length > 0 && (
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
              <ImageIcon size={14} />
              매물 사진 ({assets.length}장)
            </h3>
            <div className="grid grid-cols-3 gap-1">
              {assets.slice(0, 6).map((a: any, i) => (
                <img
                  key={i}
                  src={a.file_url}
                  alt=""
                  className="aspect-square rounded object-cover"
                />
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-2">1번 카드에 대표 사진이 적용됩니다</p>
          </div>
        )}

        {/* 버전 목록 */}
        {contents.length > 0 && (
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              생성 기록 ({contents.length})
            </h3>
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
            <p className="text-sm text-gray-400 mt-1">SNS/카카오톡 공유용 이미지 세트가 자동 생성됩니다</p>
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
                  photo={card.order === 1 ? coverPhoto : undefined}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
