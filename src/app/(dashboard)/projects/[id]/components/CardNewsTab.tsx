'use client'

import { useState } from 'react'
import {
  Wand2, Download, ImageIcon, Sparkles, Loader2,
  ChevronLeft, ChevronRight, Copy, Check, RefreshCw, X,
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
  points?: string[]
  hashtags?: string[]
  cta?: string
  image_prompt?: string
}

const SLIDE_LABELS = ['커버', '입지', '구성', '투자', '내부', 'CTA']

function layoutFromOrder(order: number): string {
  return ({ 1: 'cover', 2: 'location', 3: 'composition', 4: 'investment', 5: 'interior', 6: 'cta' } as Record<number, string>)[order] ?? 'cover'
}

function assignPhoto(order: number, assets: any[]): string | undefined {
  if (!assets.length) return undefined
  const cover = assets.find((a: any) => a.is_cover) ?? assets[0]
  const rest = assets.filter((a: any) => !a.is_cover)
  const find = (cats: string[]) => assets.find((a: any) => cats.some(c => (a.category ?? '').toLowerCase().includes(c)))
  const exterior = find(['exterior', 'outside', 'front', '외부', '전경', '외관']) ?? cover
  const interior = find(['interior', 'inside', 'room', 'living', '내부', '거실', '방']) ?? rest[0] ?? cover
  const pool: Record<number, string | undefined> = {
    1: cover?.file_url, 2: exterior?.file_url, 3: interior?.file_url,
    4: (rest[1] ?? interior)?.file_url, 5: (rest[rest.length - 1] ?? cover)?.file_url, 6: cover?.file_url,
  }
  return pool[order] ?? assets[(order - 1) % assets.length]?.file_url
}

/* ── 이미지 미리보기 (생성 전 플레이스홀더 / 생성 후 결과) ── */
function CardImageDisplay({
  card, photo, aiPhoto, loading, onGenerate,
}: {
  card: CardSlide
  photo?: string
  aiPhoto?: string
  loading?: boolean
  onGenerate: () => void
}) {
  const hasAI = !!aiPhoto

  return (
    <div className="relative aspect-square rounded-2xl overflow-hidden bg-gray-100 shadow-xl group">
      {/* 이미지 표시 */}
      {hasAI ? (
        <img src={aiPhoto} alt={card.title} width={440} height={440} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
      ) : photo ? (
        <>
          <img src={photo} alt="" width={440} height={440} loading="lazy" className="absolute inset-0 w-full h-full object-cover opacity-60" />
          <div className="absolute inset-0 bg-black/40" />
          {/* 텍스트 오버레이 미리보기 */}
          <div className="absolute inset-0 flex flex-col justify-end p-6">
            {card.price_badge && (
              <span className="inline-block self-start text-xs font-bold px-3 py-1 rounded-full bg-white/20 text-white border border-white/30 mb-3">
                {card.price_badge}
              </span>
            )}
            <h2 className="text-white font-bold text-2xl leading-tight mb-1 drop-shadow-lg">{card.title}</h2>
            {card.subtitle && <p className="text-white/80 text-sm drop-shadow">{card.subtitle}</p>}
            {card.address && <p className="text-white/60 text-xs mt-1 drop-shadow">{card.address}</p>}
            {card.checkpoints && card.checkpoints.filter(Boolean).length > 0 && (
              <div className="mt-2 space-y-1">
                {card.checkpoints.filter(Boolean).slice(0, 3).map((pt, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs text-white/80">
                    <span className="text-yellow-400">✓</span>{pt}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <ImageIcon size={40} className="text-gray-300 mb-2" />
          <p className="text-sm text-gray-400">사진을 배정하면 미리보기가 표시됩니다</p>
        </div>
      )}

      {/* 카드 번호 */}
      <div className="absolute top-3 left-3 w-7 h-7 rounded-full bg-black/50 flex items-center justify-center text-white text-xs font-bold backdrop-blur-sm">
        {card.order}
      </div>

      {/* 생성 완료 배지 */}
      {hasAI && (
        <div className="absolute top-3 right-3 flex items-center gap-1 bg-yellow-400/90 text-yellow-900 text-[10px] font-bold px-2 py-0.5 rounded-full">
          🍌 생성됨
        </div>
      )}

      {/* 생성 버튼 오버레이 */}
      <button
        onClick={onGenerate}
        disabled={loading}
        className={cn(
          'absolute inset-0 flex flex-col items-center justify-center gap-2 transition-all',
          hasAI
            ? 'opacity-0 group-hover:opacity-100 bg-black/50'
            : photo
              ? 'opacity-0 group-hover:opacity-100 bg-black/20'
              : 'opacity-100 bg-black/10'
        )}
      >
        <div className={cn(
          'flex items-center gap-2 px-5 py-2.5 rounded-full font-bold text-sm shadow-lg transition-transform',
          'bg-yellow-400 text-yellow-900 hover:bg-yellow-300 active:scale-95',
          loading && 'opacity-70 cursor-not-allowed'
        )}>
          {loading
            ? <><Loader2 size={15} className="animate-spin" /> 생성 중…</>
            : <><span>🍌</span> {hasAI ? '재생성' : 'Nano Banana 생성'}</>
          }
        </div>
      </button>
    </div>
  )
}

/* ── 텍스트 편집 패널 ── */
function TextEditor({ card, onUpdate, onReset, hasEdits }: {
  card: CardSlide
  onUpdate: (field: keyof CardSlide, val: any) => void
  onReset: () => void
  hasEdits: boolean
}) {
  const inp = (label: string, field: keyof CardSlide) => (
    <div key={String(field)}>
      <label className="text-[10px] text-gray-400 mb-0.5 block">{label}</label>
      <input
        type="text"
        value={(card[field] as string) ?? ''}
        onChange={e => onUpdate(field, e.target.value)}
        className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-400"
      />
    </div>
  )

  const listInp = (label: string, field: keyof CardSlide, max: number) => {
    const items: string[] = (card[field] as string[]) ?? []
    return (
      <div key={String(field)} className="col-span-2">
        <label className="text-[10px] text-gray-400 mb-0.5 block">{label}</label>
        <div className="space-y-1">
          {Array.from({ length: max }, (_, i) => (
            <input
              key={i}
              type="text"
              value={items[i] ?? ''}
              placeholder={`항목 ${i + 1}`}
              onChange={e => {
                const next = [...items]
                next[i] = e.target.value
                onUpdate(field, next)
              }}
              className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-400"
            />
          ))}
        </div>
      </div>
    )
  }

  const { layout } = card
  let fields: React.ReactNode = null
  if (layout === 'cover') {
    fields = <><div className="col-span-2">{inp('제목', 'title')}</div>{inp('부제목', 'subtitle')}{inp('가격 배지', 'price_badge')}{listInp('핵심 포인트 (3개)', 'checkpoints', 3)}</>
  } else if (layout === 'location') {
    fields = <><div className="col-span-2">{inp('제목', 'title')}</div>{inp('주소', 'address')}{inp('본문', 'body')}{listInp('입지 포인트 (4개)', 'checkpoints', 4)}</>
  } else if (layout === 'composition') {
    fields = <><div className="col-span-2">{inp('제목', 'title')}</div>{listInp('구성 항목 (4개)', 'points', 4)}</>
  } else if (layout === 'investment') {
    fields = <><div className="col-span-2">{inp('제목', 'title')}</div>{inp('강조 문구', 'highlight')}{inp('본문', 'body')}{listInp('투자 포인트 (2개)', 'points', 2)}</>
  } else if (layout === 'interior') {
    fields = <><div className="col-span-2">{inp('제목', 'title')}</div>{listInp('내부 특징 (4개)', 'checkpoints', 4)}</>
  } else if (layout === 'cta') {
    fields = <><div className="col-span-2">{inp('제목', 'title')}</div>{inp('가격 배지', 'price_badge')}{inp('CTA 버튼', 'cta')}{listInp('해시태그 (# 포함, 5개)', 'hashtags', 5)}</>
  }

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-gray-700">
          ✏️ {SLIDE_LABELS[(card.order ?? 1) - 1] ?? `카드 ${card.order}`} 텍스트 편집
        </h4>
        {hasEdits && (
          <button onClick={onReset} className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1">
            <X size={11} /> 초기화
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">{fields}</div>
    </div>
  )
}

/* ══════════════════════ Main Component ══════════════════════ */

export default function CardNewsTab({ projectId, contents, assets }: CardNewsTabProps) {
  const supabase = createClient()

  // content에서 저장된 ai_image_url 복원
  const extractSavedImages = (contentId: string | null): Record<number, string> => {
    const c = contents.find(x => x.id === contentId)
    if (!c?.content) return {}
    try {
      const raw = JSON.parse(c.content)
      const cards: any[] = Array.isArray(raw) ? raw : Array.isArray(raw?.cards) ? raw.cards : []
      const photos: Record<number, string> = {}
      cards.forEach((card: any) => {
        const order = card.order ?? card.card_number
        if (order && card.ai_image_url) photos[order] = card.ai_image_url
      })
      return photos
    } catch { return {} }
  }

  const [generating, setGenerating] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(contents[0]?.id ?? null)
  const [editedCards, setEditedCards] = useState<Record<number, Partial<CardSlide>>>({})
  const [aiPhotos, setAiPhotos] = useState<Record<number, string>>(() => extractSavedImages(contents[0]?.id ?? null))
  const [aiLoading, setAiLoading] = useState<Record<number, boolean>>({})
  const [cardPhotos, setCardPhotos] = useState<Record<number, string>>({})
  const [activeSlide, setActiveSlide] = useState(0)
  const [nanoBananaLoading, setNanoBananaLoading] = useState(false)
  const [nanoBananaProgress, setNanoBananaProgress] = useState(0)
  const [photoPickerSlot, setPhotoPickerSlot] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)

  /* ── 슬라이드 데이터 ── */
  const selected = contents.find(c => c.id === selectedId)
  const rawContent = selected?.content ? JSON.parse(selected.content) : null
  const rawCards: any[] = Array.isArray(rawContent) ? rawContent
    : Array.isArray(rawContent?.cards) ? rawContent.cards : []

  /* ── DB에 ai_image_url 저장 (여러 장을 한 번에 병합 저장) ── */
  const persistImages = async (images: Record<number, string>) => {
    if (!selectedId || Object.keys(images).length === 0) return
    const updatedCards = rawCards.map((c: any) => {
      const order = c.order ?? c.card_number
      return images[order] ? { ...c, ai_image_url: images[order] } : c
    })
    const updatedContent = Array.isArray(rawContent)
      ? JSON.stringify(updatedCards)
      : JSON.stringify({ ...rawContent, cards: updatedCards })
    // .update()는 RLS 거부/에러 시에도 throw하지 않으므로 반환된 error를 반드시 확인
    const { error } = await supabase
      .from('generated_contents')
      .update({ content: updatedContent })
      .eq('id', selectedId)
    if (error) throw error
  }

  const saveImageUrl = (cardOrder: number, imageUrl: string) =>
    persistImages({ [cardOrder]: imageUrl })

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
      points: Array.isArray(c.points) ? c.points : undefined,
      hashtags: Array.isArray(c.hashtags) ? c.hashtags : undefined,
      cta: c.cta,
      image_prompt: c.image_prompt,
    }
  })

  const mergeCard = (card: CardSlide): CardSlide => ({ ...card, ...(editedCards[card.order] ?? {}) })
  const updateCard = (order: number, updates: Partial<CardSlide>) => {
    setEditedCards(prev => ({ ...prev, [order]: { ...(prev[order] ?? {}), ...updates } }))
  }
  const resetCard = (order: number) => {
    setEditedCards(prev => { const n = { ...prev }; delete n[order]; return n })
  }

  /* ── 텍스트 구조 생성 (Edge Function) ── */
  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { toast.error('로그인이 필요합니다'); return }
      const asset_urls = assets.slice(0, 4).map((a: any) => a.file_url).filter(Boolean)
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-card-news`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        },
        body: JSON.stringify({ project_id: projectId, asset_urls, platform: 'instagram' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `생성 실패 (${res.status})`)
      toast.success('카드뉴스 텍스트가 생성되었습니다! 이제 Nano Banana로 이미지를 생성하세요.')
      window.location.reload()
    } catch (err: any) {
      toast.error(err.message ?? '생성에 실패했습니다')
    } finally {
      setGenerating(false)
    }
  }

  /* ── Nano Banana 단일 카드 생성 ── */
  const handleGenerateAI = async (card: CardSlide) => {
    setAiLoading(prev => ({ ...prev, [card.order]: true }))
    try {
      const photo_url = cardPhotos[card.order] ?? assignPhoto(card.order, assets)
      const res = await fetch('/api/generate-card-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card: mergeCard(card), photo_url, project_id: projectId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Nano Banana 생성 실패')
      setAiPhotos(prev => ({ ...prev, [card.order]: json.image_url }))
      try {
        await saveImageUrl(card.order, json.image_url)
        toast.success(`카드 ${card.order} 생성 및 저장 완료`)
      } catch (saveErr: any) {
        toast.error(`카드 ${card.order} 생성됐지만 저장 실패: ${saveErr.message ?? saveErr}`)
      }
    } catch (err: any) {
      toast.error(err.message ?? 'Nano Banana 생성 실패')
    } finally {
      setAiLoading(prev => ({ ...prev, [card.order]: false }))
    }
  }

  /* ── Nano Banana 전체 생성 ── */
  const handleGenerateAllAI = async () => {
    if (!slides.length) { toast.error('텍스트 구조를 먼저 생성하세요'); return }
    setNanoBananaLoading(true)
    setNanoBananaProgress(0)
    const toastId = toast.loading('Nano Banana 이미지 생성 시작…')
    const newImages: Record<number, string> = {}
    try {
      for (let i = 0; i < slides.length; i++) {
        const card = slides[i]
        toast.loading(`카드 ${card.order}/${slides.length} 생성 중…`, { id: toastId })
        setNanoBananaProgress(i)
        setAiLoading(prev => ({ ...prev, [card.order]: true }))
        try {
          const photo_url = cardPhotos[card.order] ?? assignPhoto(card.order, assets)
          const res = await fetch('/api/generate-card-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ card: mergeCard(card), photo_url, project_id: projectId }),
          })
          const json = await res.json()
          if (res.ok && json.image_url) {
            setAiPhotos(prev => ({ ...prev, [card.order]: json.image_url }))
            newImages[card.order] = json.image_url
          } else {
            console.warn(`카드 ${card.order} 실패:`, json.error)
          }
        } catch (e) {
          console.warn(`카드 ${card.order} 오류:`, e)
        }
        setAiLoading(prev => ({ ...prev, [card.order]: false }))
      }
      setNanoBananaProgress(slides.length)
      // 생성된 모든 이미지를 한 번에 병합 저장 (루프 내 개별 저장 시 마지막 1장만 남던 버그 수정)
      const savedCount = Object.keys(newImages).length
      if (savedCount === 0) {
        toast.error('생성된 이미지가 없습니다', { id: toastId })
      } else {
        try {
          await persistImages(newImages)
          toast.success(`🍌 ${savedCount}장 생성 및 저장 완료!`, { id: toastId })
        } catch (saveErr: any) {
          toast.error(`이미지는 생성됐으나 저장 실패: ${saveErr.message ?? saveErr}`, { id: toastId })
        }
      }
    } catch (err: any) {
      toast.error(err.message ?? 'Nano Banana 생성 실패', { id: toastId })
    } finally {
      setNanoBananaLoading(false)
    }
  }

  /* ── 다운로드 ── */
  const handleDownload = () => {
    const card = slides[activeSlide]
    const url = card ? aiPhotos[card.order] : undefined
    if (!url) { toast.error('먼저 이미지를 생성하세요'); return }
    const a = document.createElement('a')
    a.href = url
    a.download = `card-${activeSlide + 1}-${SLIDE_LABELS[activeSlide] ?? ''}.jpg`
    a.click()
    toast.success('다운로드 완료')
  }

  const handleDownloadAll = async () => {
    const keys = Object.keys(aiPhotos)
    if (!keys.length) { toast.error('생성된 이미지가 없습니다'); return }
    for (const k of keys) {
      const a = document.createElement('a')
      a.href = aiPhotos[+k]
      a.download = `card-${k}-${SLIDE_LABELS[+k - 1] ?? ''}.jpg`
      a.click()
      await new Promise(r => setTimeout(r, 300))
    }
    toast.success(`${keys.length}장 다운로드 완료`)
  }

  const copyHashtags = async () => {
    const lastCard = slides.find(s => s.order === 6)
    const tags = ((editedCards[6]?.hashtags ?? lastCard?.hashtags) ?? []).join(' ')
    if (!tags) { toast.error('해시태그가 없습니다'); return }
    await navigator.clipboard.writeText(tags)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('해시태그 복사됨')
  }

  const prevSlide = () => setActiveSlide(s => Math.max(0, s - 1))
  const nextSlide = () => setActiveSlide(s => Math.min((slides.length || 1) - 1, s + 1))
  const generatedCount = Object.keys(aiPhotos).length

  /* ══════════ RENDER ══════════ */
  return (
    <div className="space-y-5">

      {/* ── 상단 바 ── */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-yellow-400 flex items-center justify-center text-base">🍌</div>
            <div>
              <p className="text-sm font-bold text-gray-800">Nano Banana 카드뉴스</p>
              <p className="text-[11px] text-gray-400">Google Gemini 3.1 Flash Image Preview</p>
            </div>
          </div>

          <div className="flex-1" />

          {/* 해시태그 복사 */}
          {slides.some(s => (editedCards[s.order]?.hashtags ?? s.hashtags)?.length) && (
            <button onClick={copyHashtags} className="btn-secondary text-xs gap-1.5">
              {copied ? <><Check size={12} className="text-green-500" /> 복사됨</> : <><Copy size={12} /> 해시태그</>}
            </button>
          )}

          {/* 다운로드 */}
          {generatedCount > 0 && (
            <>
              <button onClick={handleDownload} className="btn-secondary text-xs gap-1.5">
                <Download size={12} /> 현재 카드
              </button>
              {generatedCount > 1 && (
                <button onClick={handleDownloadAll} className="btn-secondary text-xs gap-1.5 border-brand-200 text-brand-600">
                  <Download size={12} /> 전체 {generatedCount}장
                </button>
              )}
            </>
          )}

          {/* 버전 선택 */}
          {contents.length > 1 && (
            <select
              aria-label="버전 선택"
              value={selectedId ?? ''}
              onChange={e => {
                const id = e.target.value
                setSelectedId(id)
                setActiveSlide(0)
                setEditedCards({})
                setAiPhotos(extractSavedImages(id))
              }}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600 bg-white"
            >
              {contents.map((c, i) => (
                <option key={c.id} value={c.id}>버전 {c.version ?? (contents.length - i)}</option>
              ))}
            </select>
          )}

          {/* 텍스트 재생성 */}
          <button onClick={handleGenerate} disabled={generating} className="btn-secondary text-xs gap-1.5">
            {generating ? <><Loader2 size={12} className="animate-spin" /> 생성중…</> : <><RefreshCw size={12} /> 텍스트 재생성</>}
          </button>
        </div>
      </div>

      {/* ── 빈 상태 ── */}
      {slides.length === 0 ? (
        <div className="card p-16 text-center">
          <div className="text-5xl mb-4">🍌</div>
          <p className="text-gray-700 font-bold text-lg mb-1">카드뉴스를 시작하세요</p>
          <p className="text-sm text-gray-400 mb-6">
            먼저 AI가 카드 텍스트 구조를 생성한 후 Nano Banana로 이미지를 만듭니다
          </p>
          <button onClick={handleGenerate} disabled={generating} className="btn-primary mx-auto">
            {generating
              ? <><Loader2 size={14} className="animate-spin" /> 생성중…</>
              : <><Wand2 size={14} /> 카드 텍스트 구조 생성</>
            }
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[300px_1fr] gap-5">

          {/* ══ 좌측 패널 ══ */}
          <div className="space-y-4">

            {/* Nano Banana 전체 생성 */}
            <div className="card p-4 bg-gradient-to-br from-yellow-50 to-amber-50 border border-yellow-200">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-2xl">🍌</span>
                <div>
                  <p className="font-bold text-yellow-900 text-sm">Nano Banana 이미지 생성</p>
                  <p className="text-[10px] text-yellow-700">매물 사진 + 텍스트 → AI 카드 이미지</p>
                </div>
              </div>

              <button
                onClick={handleGenerateAllAI}
                disabled={nanoBananaLoading}
                className="w-full py-3 rounded-xl font-bold text-sm text-yellow-900 shadow transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg,#fbbf24,#f59e0b)' }}
              >
                {nanoBananaLoading ? (
                  <><Loader2 size={15} className="animate-spin" /> {nanoBananaProgress}/{slides.length} 생성 중…</>
                ) : (
                  <><Sparkles size={15} aria-hidden="true" /> {slides.length}장 전체 이미지 생성</>
                )}
              </button>

              {nanoBananaLoading && (
                <div
                  className="mt-2 h-2 bg-yellow-200 rounded-full overflow-hidden"
                  role="progressbar"
                  aria-valuenow={Math.round((nanoBananaProgress / slides.length) * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="h-full bg-yellow-500 rounded-full transition-all duration-700"
                    style={{ width: `${(nanoBananaProgress / slides.length) * 100}%` }}
                  />
                </div>
              )}

              {generatedCount > 0 && !nanoBananaLoading && (
                <div className="mt-2.5 flex items-center justify-between text-[11px]">
                  <span className="text-yellow-800 font-medium">✓ {generatedCount}장 생성됨</span>
                  <button
                    onClick={() => {
                      if (confirm('생성된 카드 이미지를 모두 초기화할까요?')) {
                        setAiPhotos({})
                      }
                    }}
                    className="text-red-400 hover:text-red-600"
                  >
                    초기화
                  </button>
                </div>
              )}
            </div>

            {/* 카드별 사진 배정 */}
            {assets.length > 0 && (
              <div className="card p-4">
                <p className="text-xs font-bold text-gray-600 mb-3">📷 카드별 사진 배정</p>
                <div className="grid grid-cols-3 gap-2">
                  {slides.map((card, idx) => {
                    const photo = cardPhotos[card.order] ?? assignPhoto(card.order, assets)
                    const isActive = activeSlide === idx
                    const isOpen = photoPickerSlot === card.order
                    const hasAI = !!aiPhotos[card.order]
                    return (
                      <div key={card.order}>
                        <button
                          onClick={() => {
                            setActiveSlide(idx)
                            setPhotoPickerSlot(isOpen ? null : card.order)
                          }}
                          className={cn(
                            'relative aspect-square w-full rounded-xl overflow-hidden border-2 transition-all',
                            isActive ? 'border-brand-500 shadow-md' : 'border-gray-200 hover:border-gray-400',
                            isOpen && 'ring-2 ring-yellow-400 ring-offset-1'
                          )}
                        >
                          {photo
                            ? <img src={photo} alt="매물 사진" width={96} height={96} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                            : <div className="absolute inset-0 bg-gray-100 flex items-center justify-center"><ImageIcon size={12} className="text-gray-300" /></div>
                          }
                          <div className="absolute inset-x-0 bottom-0 py-0.5 text-center bg-black/50">
                            <span className="text-[8px] font-bold text-white">{SLIDE_LABELS[idx]}</span>
                          </div>
                          {hasAI && (
                            <div className="absolute top-1 right-1 text-[8px] bg-yellow-400 rounded-full w-3.5 h-3.5 flex items-center justify-center">🍌</div>
                          )}
                        </button>
                      </div>
                    )
                  })}
                </div>

                {/* 사진 선택 드롭다운 */}
                {photoPickerSlot !== null && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <p className="text-[11px] text-gray-500 mb-2">
                      <span className="font-semibold text-brand-600">{SLIDE_LABELS[(photoPickerSlot - 1)]}</span> 카드 사진 선택
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {assets.map((asset: any, ai: number) => {
                        const isAssigned = (cardPhotos[photoPickerSlot] ?? assignPhoto(photoPickerSlot, assets)) === asset.file_url
                        return (
                          <button
                            key={asset.id ?? ai}
                            onClick={() => { setCardPhotos(prev => ({ ...prev, [photoPickerSlot!]: asset.file_url })); setPhotoPickerSlot(null) }}
                            className={cn(
                              'relative w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 transition-all',
                              isAssigned ? 'ring-2 ring-brand-500 ring-offset-1' : 'opacity-75 hover:opacity-100'
                            )}
                          >
                            <img src={asset.file_url} alt="매물 사진" width={56} height={56} loading="lazy" className="w-full h-full object-cover" />
                            {isAssigned && (
                              <div className="absolute inset-0 bg-brand-500/20 flex items-center justify-center">
                                <Check size={14} className="text-white drop-shadow" />
                              </div>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 버전 기록 */}
            {contents.length > 1 && (
              <div className="card p-4">
                <h3 className="text-xs font-bold text-gray-600 mb-2">생성 기록 ({contents.length})</h3>
                <div className="space-y-1.5">
                  {contents.map((c, i) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setSelectedId(c.id)
                        setActiveSlide(0)
                        setEditedCards({})
                        setAiPhotos(extractSavedImages(c.id))
                      }}
                      className={cn(
                        'w-full text-left p-2 rounded-lg border text-xs transition-colors',
                        selectedId === c.id ? 'bg-brand-50 border-brand-200 text-brand-700' : 'border-gray-100 hover:bg-gray-50 text-gray-600'
                      )}
                    >
                      버전 {c.version ?? (contents.length - i)} · {new Date(c.created_at).toISOString().slice(0, 10).replace(/-/g, '.')}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ══ 우측: 미리보기 + 편집 ══ */}
          <div className="space-y-4">

            {/* 카드 탭 */}
            <div className="flex gap-1 overflow-x-auto">
              {slides.map((s, i) => (
                <button
                  key={s.order}
                  onClick={() => setActiveSlide(i)}
                  className={cn(
                    'flex-shrink-0 px-3 py-1.5 text-[11px] font-semibold rounded-full border transition-all flex items-center gap-1',
                    activeSlide === i ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-500 hover:border-gray-400'
                  )}
                >
                  {aiPhotos[s.order] && <span className="text-[10px]">🍌</span>}
                  {SLIDE_LABELS[i] ?? `카드 ${i + 1}`}
                </button>
              ))}
            </div>

            {/* 메인 이미지 뷰어 */}
            <div className="relative">
              <button type="button" aria-label="이전 카드" onClick={prevSlide} disabled={activeSlide === 0}
                className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-5 z-10 w-9 h-9 bg-white rounded-full shadow-lg border border-gray-200 flex items-center justify-center disabled:opacity-30 hover:bg-gray-50">
                <ChevronLeft size={16} aria-hidden="true" />
              </button>
              <button type="button" aria-label="다음 카드" onClick={nextSlide} disabled={activeSlide === slides.length - 1}
                className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-5 z-10 w-9 h-9 bg-white rounded-full shadow-lg border border-gray-200 flex items-center justify-center disabled:opacity-30 hover:bg-gray-50">
                <ChevronRight size={16} aria-hidden="true" />
              </button>

              <div className="max-w-[440px] mx-auto">
                {slides[activeSlide] && (
                  <CardImageDisplay
                    card={mergeCard(slides[activeSlide])}
                    photo={cardPhotos[slides[activeSlide].order] ?? assignPhoto(slides[activeSlide].order, assets)}
                    aiPhoto={aiPhotos[slides[activeSlide].order]}
                    loading={aiLoading[slides[activeSlide].order]}
                    onGenerate={() => handleGenerateAI(slides[activeSlide])}
                  />
                )}
              </div>

              {/* 슬라이드 닷 */}
              <div className="flex justify-center gap-1.5 mt-4">
                {slides.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={`${i + 1}번째 카드로 이동`}
                    aria-current={activeSlide === i}
                    onClick={() => setActiveSlide(i)}
                    className={cn('h-2 rounded-full transition-[width,background-color]',
                      activeSlide === i ? 'w-6 bg-brand-600' : 'w-2 bg-gray-300 hover:bg-gray-400'
                    )}
                  />
                ))}
              </div>
            </div>

            {/* 텍스트 편집 */}
            {slides[activeSlide] && (
              <TextEditor
                card={mergeCard(slides[activeSlide])}
                onUpdate={(field, val) => updateCard(slides[activeSlide].order, { [field]: val } as Partial<CardSlide>)}
                onReset={() => resetCard(slides[activeSlide].order)}
                hasEdits={!!editedCards[slides[activeSlide].order]}
              />
            )}

          </div>
        </div>
      )}
    </div>
  )
}
