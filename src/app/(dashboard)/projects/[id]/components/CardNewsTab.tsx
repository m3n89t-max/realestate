'use client'

import { useState } from 'react'
import { Wand2, Download, Share2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { GeneratedContent } from '@/lib/types'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'

interface CardNewsTabProps {
  projectId: string
  contents: GeneratedContent[]
}

interface CardSlide {
  order: number
  title: string
  body: string
  highlight?: string
  emoji?: string
  background?: string
}

const CARD_COUNT_OPTIONS = [6, 8] as const
const COLOR_THEMES = [
  { id: 'blue', label: '블루', colors: ['from-blue-600', 'to-blue-400'] },
  { id: 'green', label: '그린', colors: ['from-emerald-600', 'to-emerald-400'] },
  { id: 'purple', label: '퍼플', colors: ['from-purple-600', 'to-purple-400'] },
  { id: 'orange', label: '오렌지', colors: ['from-orange-500', 'to-orange-400'] },
]

function CardPreview({ card, theme }: { card: CardSlide; theme: string }) {
  const themeObj = COLOR_THEMES.find(t => t.id === theme) ?? COLOR_THEMES[0]

  return (
    <div className={cn(
      'aspect-square rounded-xl bg-gradient-to-br flex flex-col items-center justify-center p-4 text-white text-center shadow-md',
      themeObj.colors[0], themeObj.colors[1]
    )}>
      {card.emoji && <span className="text-3xl mb-2">{card.emoji}</span>}
      <p className="text-xs font-bold opacity-60 mb-1">0{card.order}</p>
      <h3 className="font-bold text-sm leading-tight">{card.title}</h3>
      {card.highlight && (
        <p className="text-xs bg-white/20 rounded-full px-2 py-0.5 mt-2 font-medium">
          {card.highlight}
        </p>
      )}
      <p className="text-xs opacity-80 mt-2 line-clamp-3">{card.body}</p>
    </div>
  )
}

export default function CardNewsTab({ projectId, contents }: CardNewsTabProps) {
  const supabase = createClient()
  const [generating, setGenerating] = useState(false)
  const [cardCount, setCardCount] = useState<6 | 8>(6)
  const [colorTheme, setColorTheme] = useState('blue')
  const [selectedId, setSelectedId] = useState<string | null>(contents[0]?.id ?? null)

  const selected = contents.find(c => c.id === selectedId)
  const slides: CardSlide[] = selected?.content ? JSON.parse(selected.content) : []

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const { data, error } = await supabase.functions.invoke('generate-card-news', {
        body: { project_id: projectId, card_count: cardCount, color_theme: colorTheme },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      if (error) throw error
      toast.success('카드뉴스가 생성되었습니다!')
      window.location.reload()
    } catch (err) {
      toast.error('생성에 실패했습니다')
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

          {/* 카드 수 */}
          <div className="mb-3">
            <label className="label text-xs">카드 수</label>
            <div className="grid grid-cols-2 gap-1.5">
              {CARD_COUNT_OPTIONS.map(n => (
                <button
                  key={n}
                  onClick={() => setCardCount(n)}
                  className={cn(
                    'py-2 text-sm rounded-lg border font-medium transition-colors',
                    cardCount === n
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'border-gray-200 text-gray-600 hover:border-brand-300'
                  )}
                >
                  {n}장
                </button>
              ))}
            </div>
          </div>

          {/* 색상 테마 */}
          <div className="mb-4">
            <label className="label text-xs">색상 테마</label>
            <div className="grid grid-cols-2 gap-1.5">
              {COLOR_THEMES.map(theme => (
                <button
                  key={theme.id}
                  onClick={() => setColorTheme(theme.id)}
                  className={cn(
                    'py-1.5 text-xs rounded-lg border font-medium transition-all',
                    colorTheme === theme.id
                      ? 'ring-2 ring-brand-500 border-transparent'
                      : 'border-gray-200'
                  )}
                >
                  <div className={cn(
                    'w-full h-4 rounded mb-1 bg-gradient-to-r',
                    theme.colors[0], theme.colors[1]
                  )} />
                  {theme.label}
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
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {slides.map(card => (
                <CardPreview key={card.order} card={card} theme={colorTheme} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
