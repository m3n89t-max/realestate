'use client'

import { useState, useRef, useEffect } from 'react'
import { toPng } from 'html-to-image'
import {
  Wand2, Download, Image as ImageIcon, Sparkles, Loader2,
  Building2, MapPin, TrendingUp, Home, Phone,
  ChevronLeft, ChevronRight, Copy, Check, Paintbrush, ExternalLink,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { GeneratedContent } from '@/lib/types'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'
import { TemplateGallery, BUILTIN_TEMPLATES } from './TemplateGallery'
import type { CanvaTemplateSet } from './TemplateGallery'

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
  hashtags?: string[]
  cta?: string
  image_prompt?: string
  // Kakao-specific
  headline?: string
  price?: string
  location?: string
  section?: string
  phone?: string
  kakao_id?: string
}

const PHOTO_FILTERS = [
  { id: 'original', label: '원본',   css: '' },
  { id: 'vivid',    label: '선명',   css: 'brightness(1.05) contrast(1.12) saturate(1.25)' },
  { id: 'bright',   label: '밝게',   css: 'brightness(1.18) contrast(1.05) saturate(1.1)' },
  { id: 'warm',     label: '따뜻',   css: 'brightness(1.05) saturate(1.15) sepia(0.18)' },
  { id: 'cool',     label: '쿨',     css: 'brightness(1.05) saturate(0.85) hue-rotate(12deg)' },
  { id: 'drama',    label: '드라마', css: 'brightness(0.95) contrast(1.25) saturate(1.2)' },
]

const COLOR_THEMES = [
  { id: 'emerald', label: '에메랄드', accent: '#10b981', dark: '#064e3b', light: '#d1fae5', mid: '#059669' },
  { id: 'blue',    label: '블루',     accent: '#3b82f6', dark: '#1e3a8a', light: '#dbeafe', mid: '#2563eb' },
  { id: 'orange',  label: '오렌지',   accent: '#f97316', dark: '#7c2d12', light: '#fed7aa', mid: '#ea580c' },
  { id: 'purple',  label: '퍼플',     accent: '#a855f7', dark: '#3b0764', light: '#f3e8ff', mid: '#9333ea' },
  { id: 'rose',    label: '로즈',     accent: '#f43f5e', dark: '#881337', light: '#ffe4e6', mid: '#e11d48' },
  { id: 'slate',   label: '슬레이트', accent: '#64748b', dark: '#0f172a', light: '#f1f5f9', mid: '#475569' },
]
type Theme = typeof COLOR_THEMES[0]

const KAKAO_YELLOW = '#FEE500'
const KAKAO_DARK = '#3A2E2E'
const KAKAO_LIGHT = '#FFFDE7'

const SLIDE_LABELS = ['커버', '입지', '구성', '투자', '내부', 'CTA']
const KAKAO_ICONS: Record<number, string> = { 1: '🏠', 2: '📍', 3: '🏢', 4: '📈', 5: '👥', 6: '📞' }

type DesignStyle = 'modern' | 'luxury' | 'minimal' | 'vivid'
const DESIGN_STYLE_LIST = [
  { id: 'modern'  as DesignStyle, label: '모던 다크',   desc: '강렬하고 세련된',    gradient: 'linear-gradient(135deg,#1e1b4b,#4338ca)', preview: ['#1e1b4b','#4338ca','#6366f1','#818cf8'] },
  { id: 'luxury'  as DesignStyle, label: '럭셔리 골드', desc: '고급스럽고 프리미엄', gradient: 'linear-gradient(135deg,#0a0500,#2a1a00)', preview: ['#0a0500','#2a1a00','#d4a843','#f5e6c8'] },
  { id: 'minimal' as DesignStyle, label: '미니멀',      desc: '깔끔하고 전문적인',   gradient: 'linear-gradient(135deg,#f8fafc,#e2e8f0)', preview: ['#ffffff','#f1f5f9','#334155','#64748b'] },
  { id: 'vivid'   as DesignStyle, label: '비비드',      desc: '활기차고 눈에 띄는',  gradient: 'linear-gradient(135deg,#f43f5e,#8b5cf6)', preview: ['#f43f5e','#ec4899','#8b5cf6','#6366f1'] },
]

function layoutFromOrder(order: number): string {
  const map: Record<number, string> = { 1: 'cover', 2: 'location', 3: 'composition', 4: 'investment', 5: 'interior', 6: 'cta' }
  return map[order] ?? 'cover'
}

function assignPhoto(order: number, assets: any[]): string | undefined {
  if (!assets.length) return undefined
  const cover = assets.find(a => a.is_cover) ?? assets[0]
  const rest = assets.filter(a => !a.is_cover)
  const find = (cats: string[]) => assets.find(a => cats.some(c => (a.category ?? '').toLowerCase().includes(c)))
  const exterior = find(['exterior', 'outside', 'front', '외부', '전경', '외관']) ?? cover
  const interior = find(['interior', 'inside', 'room', 'living', '내부', '거실', '방']) ?? rest[0] ?? cover
  const kitchen = find(['kitchen', 'bath', 'toilet', 'facility', '주방', '욕실', '시설']) ?? rest[1] ?? interior
  const pool: Record<number, string | undefined> = {
    1: cover?.file_url, 2: exterior?.file_url, 3: interior?.file_url,
    4: kitchen?.file_url, 5: (rest[rest.length - 1] ?? cover)?.file_url, 6: cover?.file_url,
  }
  return pool[order] ?? assets[(order - 1) % assets.length]?.file_url
}

/* ═══════════════════ Instagram Card Components ═══════════════════ */

function CoverCard({ card, theme, photo, filterCss, ds }: { card: CardSlide; theme: Theme; photo?: string; filterCss?: string; ds: DesignStyle }) {
  if (ds === 'luxury') {
    const LA = '#d4a843'
    return (
      <div className="relative aspect-square overflow-hidden shadow-2xl" style={{ borderRadius: 16, background: '#040100' }}>
        {photo && <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ filter: 'brightness(0.45) sepia(0.1)' }} />}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top,rgba(0,0,0,0.98) 0%,rgba(0,0,0,0.55) 55%,rgba(0,0,0,0.25) 100%)' }} />
        <div className="absolute top-0 left-0 right-0 h-[1.5px]" style={{ background: LA }} />
        <div className="absolute top-0 bottom-0 left-4 flex flex-col items-center justify-center gap-1">
          <div className="flex-1 w-px" style={{ background: `${LA}35` }} />
          <span className="text-[8px] font-bold tracking-[3px]" style={{ color: LA, writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>PREMIUM</span>
          <div className="flex-1 w-px" style={{ background: `${LA}35` }} />
        </div>
        <div className="absolute top-4 right-4 text-[9px] tracking-widest font-medium" style={{ color: `${LA}70` }}>01 / 06</div>
        <div className="absolute inset-x-0 bottom-0 px-6 pb-6">
          {card.checkpoints && card.checkpoints.length > 0 && (
            <div className="mb-4 space-y-2">
              {card.checkpoints.slice(0, 3).map((pt, i) => (
                <div key={i} className="flex items-center gap-2.5 text-[11px]" style={{ color: '#f5e6c8bb' }}>
                  <div className="w-4 h-px flex-shrink-0" style={{ background: LA }} />
                  <span>{pt}</span>
                </div>
              ))}
            </div>
          )}
          <div className="w-8 h-px mb-3" style={{ background: LA }} />
          <h2 className="font-display font-bold text-[26px] leading-tight whitespace-pre-line mb-2" style={{ color: '#f5e6c8' }}>{card.title}</h2>
          {card.subtitle && <p className="text-[11px] mb-3 tracking-widest uppercase" style={{ color: `${LA}99` }}>{card.subtitle}</p>}
          {card.price_badge && (
            <div className="inline-block text-[12px] font-bold px-4 py-1.5" style={{ border: `1px solid ${LA}`, color: LA }}>{card.price_badge}</div>
          )}
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-[1.5px]" style={{ background: `${LA}33` }} />
      </div>
    )
  }
  if (ds === 'minimal') {
    return (
      <div className="relative aspect-square overflow-hidden shadow-xl" style={{ borderRadius: 24, background: '#ffffff' }}>
        {photo ? (
          <div className="absolute top-0 left-0 right-0 h-[56%] overflow-hidden">
            <img src={photo} alt="" className="w-full h-full object-cover" style={filterCss ? { filter: filterCss } : undefined} />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom,transparent 50%,rgba(255,255,255,0.85))' }} />
          </div>
        ) : (
          <div className="absolute top-0 left-0 right-0 h-[56%]" style={{ background: `linear-gradient(135deg,${theme.accent}20,${theme.light})` }} />
        )}
        <div className="absolute top-0 left-0 right-0 h-1" style={{ background: theme.accent }} />
        <div className="absolute top-3 right-3 text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: theme.accent, color: '#fff' }}>1/6</div>
        <div className="absolute bottom-0 left-0 right-0 bg-white px-5 pb-4 pt-2.5">
          {card.price_badge && (
            <div className="inline-block text-[11px] font-bold px-2.5 py-0.5 rounded-md mb-1.5" style={{ background: `${theme.accent}18`, color: theme.accent }}>{card.price_badge}</div>
          )}
          <h2 className="font-display font-bold text-[21px] leading-tight whitespace-pre-line mb-1" style={{ color: '#111' }}>{card.title}</h2>
          {card.subtitle && <p className="text-[11px] mb-1.5" style={{ color: '#888' }}>{card.subtitle}</p>}
          {card.checkpoints && card.checkpoints.length > 0 && (
            <div className="space-y-0.5">
              {card.checkpoints.slice(0, 2).map((pt, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[10px]" style={{ color: '#555' }}>
                  <span style={{ color: theme.accent }} className="font-bold">✓</span>{pt}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }
  if (ds === 'vivid') {
    return (
      <div className="relative aspect-square overflow-hidden shadow-2xl" style={{ borderRadius: 28 }}>
        {photo ? (
          <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover" style={filterCss ? { filter: filterCss } : undefined} />
        ) : (
          <div className="absolute inset-0" style={{ background: `linear-gradient(135deg,${theme.accent},${theme.dark})` }} />
        )}
        <div className="absolute inset-0" style={{ background: `linear-gradient(135deg,${theme.accent}cc 0%,transparent 45%,rgba(0,0,0,0.78) 100%)` }} />
        <div className="absolute top-4 left-4 bg-white/20 backdrop-blur-sm rounded-full px-2.5 py-1 text-[10px] font-bold text-white">1 / 6</div>
        <div className="absolute inset-x-0 bottom-0 p-5 text-white">
          {card.checkpoints && card.checkpoints.length > 0 && (
            <div className="mb-3 space-y-1.5">
              {card.checkpoints.slice(0, 3).map((pt, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px] font-medium">
                  <span>★</span><span className="opacity-95">{pt}</span>
                </div>
              ))}
            </div>
          )}
          <h2 className="font-display font-black text-[30px] leading-tight whitespace-pre-line mb-2 drop-shadow-lg">{card.title}</h2>
          {card.subtitle && <p className="text-[12px] mb-3 opacity-90 font-semibold">{card.subtitle}</p>}
          {card.price_badge && (
            <div className="inline-block text-[13px] font-black px-4 py-2 rounded-full shadow-lg bg-white" style={{ color: theme.dark }}>{card.price_badge}</div>
          )}
        </div>
      </div>
    )
  }
  // modern (default)
  return (
    <div className="relative aspect-square rounded-[32px] overflow-hidden shadow-2xl">
      {photo ? <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover" style={filterCss ? { filter: filterCss } : undefined} />
        : <div className="absolute inset-0" style={{ background: `linear-gradient(135deg,${theme.dark},${theme.accent})` }} />}
      <div className="absolute inset-0 bg-gradient-to-t from-black/88 via-black/20 to-transparent" />
      <div className="absolute top-0 left-0 right-0 h-1.5" style={{ background: theme.accent }} />
      <div className="absolute top-4 left-4 px-2.5 py-1 rounded-full text-[10px] font-bold" style={{ background: `${theme.accent}cc`, color: '#fff' }}>1 / 6</div>
      <div className="absolute inset-x-0 bottom-0 p-5 text-white">
        {card.checkpoints && card.checkpoints.length > 0 && (
          <div className="mb-3 space-y-1.5">
            {card.checkpoints.slice(0, 3).map((pt, i) => (
              <div key={i} className="flex items-start gap-2 text-[12px]">
                <span className="font-bold mt-0.5 flex-shrink-0" style={{ color: theme.accent }}>✓</span>
                <span className="opacity-90 leading-snug">{pt}</span>
              </div>
            ))}
          </div>
        )}
        <h2 className="font-display font-bold text-[28px] tracking-tight leading-tight drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)] whitespace-pre-line mb-2">{card.title}</h2>
        {card.subtitle && <p className="text-[13px] opacity-80 mb-3 font-medium">{card.subtitle}</p>}
        {card.price_badge && (
          <div className="inline-block text-[13px] font-black px-4 py-2 rounded-full shadow-lg" style={{ background: theme.accent }}>{card.price_badge}</div>
        )}
      </div>
    </div>
  )
}

function LocationCard({ card, theme, photo, filterCss, ds }: { card: CardSlide; theme: Theme; photo?: string; filterCss?: string; ds: DesignStyle }) {
  if (ds === 'luxury') {
    const LA = '#d4a843'
    return (
      <div className="relative aspect-square overflow-hidden shadow-2xl" style={{ borderRadius: 16, background: '#040100' }}>
        {photo && <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ filter: 'brightness(0.45) sepia(0.05)' }} />}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top,rgba(0,0,0,0.97) 0%,rgba(0,0,0,0.4) 100%)' }} />
        <div className="absolute top-0 left-0 right-0 px-5 py-3.5" style={{ background: 'rgba(5,2,0,0.92)', borderBottom: `1px solid ${LA}44` }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2" style={{ color: LA }}>
              <MapPin size={14} />
              <span className="font-medium text-[14px] tracking-wide">{card.title}</span>
            </div>
            <span className="text-[9px] tracking-widest font-medium" style={{ color: `${LA}60` }}>02 / 06</span>
          </div>
          {card.address && <p className="text-[11px] mt-0.5" style={{ color: '#f5e6c888' }}>{card.address}</p>}
        </div>
        <div className="absolute inset-x-0 bottom-0 p-5">
          {card.checkpoints && card.checkpoints.length > 0 && (
            <div className="space-y-3">
              {card.checkpoints.slice(0, 4).map((pt, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-sm flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: `${LA}22`, border: `1px solid ${LA}55` }}>
                    <span className="text-[9px] font-bold" style={{ color: LA }}>{i + 1}</span>
                  </div>
                  <span className="text-[12px] leading-snug" style={{ color: '#f5e6c8cc' }}>{pt}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-[1.5px]" style={{ background: `${LA}33` }} />
      </div>
    )
  }
  if (ds === 'minimal') {
    return (
      <div className="relative aspect-square overflow-hidden shadow-xl" style={{ borderRadius: 24, background: '#ffffff' }}>
        {photo ? (
          <div className="absolute top-0 left-0 right-0 h-[48%] overflow-hidden">
            <img src={photo} alt="" className="w-full h-full object-cover" style={filterCss ? { filter: filterCss } : undefined} />
          </div>
        ) : (
          <div className="absolute top-0 left-0 right-0 h-[48%]" style={{ background: `linear-gradient(135deg,${theme.accent}25,${theme.light})` }} />
        )}
        <div className="absolute top-3 right-3 text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: theme.accent, color: '#fff' }}>2/6</div>
        <div className="absolute bottom-0 left-0 right-0 bg-white px-5 pb-4 pt-3">
          <div className="flex items-center gap-1.5 mb-1">
            <MapPin size={12} style={{ color: theme.accent }} />
            <span className="font-bold text-[14px]" style={{ color: '#111' }}>{card.title}</span>
          </div>
          {card.address && <p className="text-[11px] mb-2.5" style={{ color: '#888' }}>{card.address}</p>}
          {card.checkpoints && card.checkpoints.length > 0 && (
            <div className="space-y-1.5">
              {card.checkpoints.slice(0, 4).map((pt, i) => (
                <div key={i} className="flex items-start gap-2 p-1.5 rounded-lg" style={{ background: `${theme.accent}0d` }}>
                  <span className="font-bold text-[11px] flex-shrink-0 mt-0.5" style={{ color: theme.accent }}>✓</span>
                  <span className="text-[11px] leading-snug" style={{ color: '#444' }}>{pt}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }
  if (ds === 'vivid') {
    return (
      <div className="relative aspect-square overflow-hidden shadow-2xl" style={{ borderRadius: 28 }}>
        {photo ? <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover" style={filterCss ? { filter: filterCss } : undefined} />
          : <div className="absolute inset-0" style={{ background: `linear-gradient(135deg,${theme.accent},${theme.dark})` }} />}
        <div className="absolute inset-0" style={{ background: `linear-gradient(to bottom,${theme.accent}dd 0%,transparent 35%,rgba(0,0,0,0.82) 100%)` }} />
        <div className="absolute top-0 left-0 right-0 px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-white">
              <MapPin size={15} /><span className="font-bold text-[15px]">{card.title}</span>
            </div>
            <span className="text-white/60 text-[10px]">2 / 6</span>
          </div>
          {card.address && <p className="text-white/85 text-[11px] mt-1 font-medium">{card.address}</p>}
        </div>
        <div className="absolute inset-x-0 bottom-0 p-4 text-white">
          {card.checkpoints && card.checkpoints.length > 0 && (
            <div className="space-y-2">
              {card.checkpoints.slice(0, 4).map((pt, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 bg-white/20 backdrop-blur-sm">
                    <span className="text-white text-[9px] font-black">✓</span>
                  </div>
                  <span className="text-[12px] leading-snug opacity-95">{pt}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }
  // modern
  return (
    <div className="relative aspect-square rounded-[32px] overflow-hidden shadow-2xl">
      {photo ? <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover" style={filterCss ? { filter: filterCss } : undefined} />
        : <div className="absolute inset-0" style={{ background: `linear-gradient(135deg,${theme.dark},${theme.accent})` }} />}
      <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/30 to-black/80" />
      <div className="absolute top-0 left-0 right-0 p-5" style={{ background: `${theme.accent}dd` }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <MapPin size={16} /><span className="font-display font-medium text-[15px]">{card.title}</span>
          </div>
          <span className="text-white/70 text-[10px] font-medium">2 / 6</span>
        </div>
        {card.address && <p className="text-white/90 text-[11px] mt-1 font-medium">{card.address}</p>}
      </div>
      <div className="absolute inset-x-0 bottom-0 p-4 text-white">
        {card.checkpoints && card.checkpoints.length > 0 && (
          <div className="space-y-2.5">
            {card.checkpoints.slice(0, 4).map((pt, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 shadow" style={{ background: theme.accent }}>
                  <span className="text-white text-[9px] font-black">✓</span>
                </div>
                <span className="text-[12px] leading-snug">{pt}</span>
              </div>
            ))}
          </div>
        )}
        {card.body && <p className="text-[11px] opacity-60 mt-2">{card.body}</p>}
      </div>
    </div>
  )
}

function CompositionCard({ card, theme, photo, filterCss, ds }: { card: CardSlide; theme: Theme; photo?: string; filterCss?: string; ds: DesignStyle }) {
  const specs = card.spec_grid ?? []
  if (ds === 'luxury') {
    const LA = '#d4a843'
    return (
      <div className="relative aspect-square overflow-hidden shadow-2xl" style={{ borderRadius: 16, background: '#050200' }}>
        {photo && <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover opacity-[0.06]" />}
        <div className="absolute top-0 left-0 right-0 px-5 py-3.5" style={{ background: 'rgba(5,2,0,0.95)', borderBottom: `1px solid ${LA}44` }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2" style={{ color: LA }}>
              <Building2 size={14} /><span className="font-medium text-[14px] tracking-wide">{card.title}</span>
            </div>
            <span className="text-[9px] tracking-widest" style={{ color: `${LA}60` }}>03 / 06</span>
          </div>
        </div>
        <div className="absolute top-[52px] inset-x-3 bottom-3">
          {specs.length > 0 ? (
            <div className={`grid gap-2 h-full ${specs.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {specs.slice(0, 6).map((spec, i) => (
                <div key={i} className="rounded-sm p-2.5 flex flex-col justify-center" style={{ background: '#0f0800', border: `1px solid ${LA}22` }}>
                  <p className="text-[9px] font-bold mb-1 tracking-widest uppercase" style={{ color: `${LA}99` }}>{spec.label}</p>
                  <p className="text-[12px] font-bold leading-snug" style={{ color: '#f5e6c8' }}>{spec.value}</p>
                </div>
              ))}
            </div>
          ) : card.points && card.points.length > 0 ? (
            <div className="mt-1 space-y-2">
              {card.points.slice(0, 5).map((pt, i) => (
                <div key={i} className="flex items-start gap-2 p-2.5" style={{ borderBottom: `1px solid ${LA}22` }}>
                  <div className="w-3 h-px flex-shrink-0 mt-2" style={{ background: LA }} />
                  <span className="text-[11px] leading-snug" style={{ color: '#f5e6c8bb' }}>{pt}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-[1.5px]" style={{ background: `${LA}33` }} />
      </div>
    )
  }
  if (ds === 'minimal') {
    return (
      <div className="relative aspect-square overflow-hidden shadow-xl" style={{ borderRadius: 24, background: '#ffffff' }}>
        <div className="absolute top-0 left-0 right-0 px-5 py-3.5" style={{ background: theme.accent }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-white">
              <Building2 size={14} /><span className="font-medium text-[14px]">{card.title}</span>
            </div>
            <span className="text-white/70 text-[10px]">3/6</span>
          </div>
        </div>
        <div className="absolute top-[52px] inset-x-3 bottom-3">
          {specs.length > 0 ? (
            <div className={`grid gap-2 h-full ${specs.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {specs.slice(0, 6).map((spec, i) => (
                <div key={i} className="rounded-xl p-2.5 flex flex-col justify-center border" style={{ background: '#fafafa', borderColor: `${theme.accent}25` }}>
                  <p className="text-[9px] font-bold mb-1 uppercase tracking-wide" style={{ color: theme.accent }}>{spec.label}</p>
                  <p className="text-[12px] font-bold leading-snug" style={{ color: '#1a1a1a' }}>{spec.value}</p>
                </div>
              ))}
            </div>
          ) : card.points && card.points.length > 0 ? (
            <div className="mt-1 space-y-2">
              {card.points.slice(0, 5).map((pt, i) => (
                <div key={i} className="flex items-start gap-2 p-2.5 rounded-xl border" style={{ borderColor: `${theme.accent}20` }}>
                  <span style={{ color: theme.accent }} className="flex-shrink-0 font-black text-[11px] mt-0.5">●</span>
                  <span className="text-[11px] leading-snug" style={{ color: '#333' }}>{pt}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    )
  }
  if (ds === 'vivid') {
    return (
      <div className="relative aspect-square overflow-hidden shadow-2xl" style={{ borderRadius: 28, background: `linear-gradient(135deg,${theme.dark},${theme.accent}88)` }}>
        {photo && <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover opacity-[0.1]" />}
        <div className="absolute top-0 left-0 right-0 px-5 py-3.5" style={{ background: `${theme.accent}ee` }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-white">
              <Building2 size={14} /><span className="font-bold text-[14px]">{card.title}</span>
            </div>
            <span className="text-white/70 text-[10px]">3 / 6</span>
          </div>
        </div>
        <div className="absolute top-[52px] inset-x-3 bottom-3">
          {specs.length > 0 ? (
            <div className={`grid gap-2 h-full ${specs.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {specs.slice(0, 6).map((spec, i) => (
                <div key={i} className="rounded-xl p-2.5 flex flex-col justify-center" style={{ background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(4px)' }}>
                  <p className="text-[9px] font-bold mb-1 uppercase tracking-wide text-white/70">{spec.label}</p>
                  <p className="text-[12px] font-bold leading-snug text-white">{spec.value}</p>
                </div>
              ))}
            </div>
          ) : card.points && card.points.length > 0 ? (
            <div className="mt-1 space-y-2">
              {card.points.slice(0, 5).map((pt, i) => (
                <div key={i} className="flex items-start gap-2 p-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.12)' }}>
                  <span className="flex-shrink-0 font-black text-[13px] text-white">●</span>
                  <span className="text-[11px] leading-snug text-white/90">{pt}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    )
  }
  // modern
  return (
    <div className="relative aspect-square rounded-[32px] overflow-hidden shadow-2xl">
      {photo ? <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover" style={filterCss ? { filter: filterCss } : undefined} />
        : <div className="absolute inset-0" style={{ background: `linear-gradient(135deg,${theme.dark},${theme.accent})` }} />}
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.68)' }} />
      <div className="absolute top-0 left-0 right-0 p-4 z-10" style={{ background: `${theme.accent}ee` }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <Building2 size={15} /><span className="font-display font-medium text-[15px]">{card.title}</span>
          </div>
          <span className="text-white/70 text-[10px] font-medium">3 / 6</span>
        </div>
      </div>
      <div className="absolute top-[52px] inset-x-3 bottom-3 z-10">
        {specs.length > 0 ? (
          <div className={`grid gap-2 h-full ${specs.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {specs.slice(0, 6).map((spec, i) => (
              <div key={i} className="rounded-xl p-2.5 flex flex-col justify-center shadow-sm" style={{ background: 'rgba(255,255,255,0.12)', border: `1px solid ${theme.accent}55` }}>
                <p className="text-[10px] font-black mb-1 uppercase tracking-wide" style={{ color: theme.accent }}>{spec.label}</p>
                <p className="text-[12px] font-bold leading-snug whitespace-pre-line text-white">{spec.value}</p>
              </div>
            ))}
          </div>
        ) : card.points && card.points.length > 0 ? (
          <div className="mt-1 space-y-2">
            {card.points.slice(0, 5).map((pt, i) => (
              <div key={i} className="flex items-start gap-2 p-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.12)', border: `1px solid ${theme.accent}44` }}>
                <span style={{ color: theme.accent }} className="flex-shrink-0 font-black text-[13px]">●</span>
                <span className="text-[11px] leading-snug text-white/90">{pt}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function InvestmentCard({ card, theme, photo, filterCss, ds }: { card: CardSlide; theme: Theme; photo?: string; filterCss?: string; ds: DesignStyle }) {
  if (ds === 'luxury') {
    const LA = '#d4a843'
    return (
      <div className="relative aspect-square overflow-hidden shadow-2xl" style={{ borderRadius: 16, background: '#040100' }}>
        {photo && <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ filter: 'brightness(0.45) sepia(0.05)' }} />}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top,rgba(0,0,0,0.98) 0%,rgba(0,0,0,0.45) 100%)' }} />
        <div className="absolute top-0 left-0 right-0 px-5 py-3.5" style={{ background: 'rgba(5,2,0,0.9)', borderBottom: `1px solid ${LA}44` }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2" style={{ color: LA }}>
              <TrendingUp size={14} /><span className="font-medium text-[14px] tracking-wide">{card.title}</span>
            </div>
            <span className="text-[9px] tracking-widest" style={{ color: `${LA}60` }}>04 / 06</span>
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 px-6 pb-6">
          {card.highlight && (
            <div className="inline-block text-[12px] font-bold px-4 py-1.5 mb-3" style={{ border: `1px solid ${LA}`, color: LA }}>{card.highlight}</div>
          )}
          {card.body && <p className="text-[13px] mb-3 leading-snug" style={{ color: '#f5e6c8cc' }}>{card.body}</p>}
          {card.points && card.points.length > 0 && (
            <div className="space-y-2">
              {card.points.slice(0, 3).map((pt, i) => (
                <div key={i} className="flex items-start gap-2.5 text-[11px]" style={{ color: '#f5e6c8aa' }}>
                  <div className="w-3 h-px flex-shrink-0 mt-2" style={{ background: LA }} /><span className="leading-snug">{pt}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-[1.5px]" style={{ background: `${LA}33` }} />
      </div>
    )
  }
  if (ds === 'minimal') {
    return (
      <div className="relative aspect-square overflow-hidden shadow-xl" style={{ borderRadius: 24, background: '#ffffff' }}>
        {photo ? (
          <div className="absolute top-0 left-0 right-0 h-[45%] overflow-hidden">
            <img src={photo} alt="" className="w-full h-full object-cover" style={filterCss ? { filter: filterCss } : undefined} />
          </div>
        ) : (
          <div className="absolute top-0 left-0 right-0 h-[45%]" style={{ background: `linear-gradient(135deg,${theme.accent}20,${theme.light})` }} />
        )}
        <div className="absolute top-3 right-3 text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: theme.accent, color: '#fff' }}>4/6</div>
        <div className="absolute bottom-0 left-0 right-0 bg-white px-5 pb-4 pt-3">
          <div className="flex items-center gap-1.5 mb-2">
            <TrendingUp size={13} style={{ color: theme.accent }} />
            <span className="font-bold text-[14px]" style={{ color: '#111' }}>{card.title}</span>
          </div>
          {card.highlight && (
            <div className="inline-block text-[11px] font-bold px-2.5 py-0.5 rounded-md mb-2" style={{ background: `${theme.accent}18`, color: theme.accent }}>{card.highlight}</div>
          )}
          {card.body && <p className="text-[11px] mb-2 leading-snug" style={{ color: '#555' }}>{card.body}</p>}
          {card.points && card.points.length > 0 && (
            <div className="space-y-1">
              {card.points.slice(0, 3).map((pt, i) => (
                <div key={i} className="flex items-start gap-1.5 text-[10px]" style={{ color: '#444' }}>
                  <span style={{ color: theme.accent }} className="font-bold flex-shrink-0">▶</span><span>{pt}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }
  if (ds === 'vivid') {
    return (
      <div className="relative aspect-square overflow-hidden shadow-2xl" style={{ borderRadius: 28 }}>
        {photo ? <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover" style={filterCss ? { filter: filterCss } : undefined} />
          : <div className="absolute inset-0" style={{ background: `linear-gradient(135deg,${theme.accent},${theme.dark})` }} />}
        <div className="absolute inset-0" style={{ background: `linear-gradient(to top,rgba(0,0,0,0.92) 0%,rgba(0,0,0,0.3) 50%,${theme.accent}99 100%)` }} />
        <div className="absolute top-0 left-0 right-0 px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-white">
              <TrendingUp size={15} /><span className="font-bold text-[15px]">{card.title}</span>
            </div>
            <span className="text-white/60 text-[10px]">4 / 6</span>
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 p-5 text-white">
          {card.highlight && (
            <div className="inline-block px-3 py-1.5 rounded-full text-[12px] font-black mb-2 bg-white shadow-lg" style={{ color: theme.dark }}>{card.highlight}</div>
          )}
          {card.body && <p className="text-[13px] font-semibold mb-2 leading-snug opacity-95">{card.body}</p>}
          {card.points && card.points.length > 0 && (
            <div className="space-y-1.5">
              {card.points.slice(0, 3).map((pt, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px] bg-white/10 rounded-lg px-2.5 py-1.5 backdrop-blur-sm">
                  <span className="flex-shrink-0 font-bold">→</span><span className="leading-snug opacity-95">{pt}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }
  // modern
  return (
    <div className="relative aspect-square rounded-[32px] overflow-hidden shadow-2xl">
      {photo ? <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover" style={filterCss ? { filter: filterCss } : undefined} />
        : <div className="absolute inset-0" style={{ background: `linear-gradient(135deg,${theme.dark},${theme.mid})` }} />}
      <div className="absolute inset-0 bg-gradient-to-t from-black/92 via-black/30 to-black/60" />
      <div className="absolute top-0 left-0 right-0 p-4" style={{ background: `${theme.dark}dd` }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <TrendingUp size={15} style={{ color: theme.accent }} />
            <span className="font-display font-medium text-[15px]">{card.title}</span>
          </div>
          <span className="text-white/50 text-[10px]">4 / 6</span>
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 p-5 text-white">
        {card.highlight && (
          <div className="inline-block px-3 py-1.5 rounded-lg text-[13px] font-black mb-2.5 shadow-lg" style={{ background: theme.accent }}>{card.highlight}</div>
        )}
        {card.body && <p className="text-[13px] font-medium mb-2 leading-snug">{card.body}</p>}
        {card.points && card.points.length > 0 && (
          <div className="space-y-1.5">
            {card.points.slice(0, 3).map((pt, i) => (
              <div key={i} className="flex items-start gap-2 text-[11px] opacity-90">
                <span style={{ color: theme.accent }} className="flex-shrink-0 mt-0.5 font-bold">▶</span>
                <span className="leading-snug">{pt}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function InteriorCard({ card, theme, photo, filterCss, ds }: { card: CardSlide; theme: Theme; photo?: string; filterCss?: string; ds: DesignStyle }) {
  if (ds === 'luxury') {
    const LA = '#d4a843'
    return (
      <div className="relative aspect-square overflow-hidden shadow-2xl" style={{ borderRadius: 16, background: '#040100' }}>
        {photo && <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ filter: 'brightness(0.45)' }} />}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top,rgba(0,0,0,0.97) 0%,rgba(0,0,0,0.15) 100%)' }} />
        <div className="absolute top-0 left-0 right-0 h-[1.5px]" style={{ background: LA }} />
        <div className="absolute top-4 left-5 flex items-center gap-2">
          <div className="w-6 h-6 rounded-none flex items-center justify-center" style={{ border: `1px solid ${LA}`, background: 'transparent' }}>
            <Home size={12} style={{ color: LA }} />
          </div>
          <span className="text-[9px] tracking-widest font-medium" style={{ color: `${LA}70` }}>05 / 06</span>
        </div>
        <div className="absolute inset-x-0 bottom-0 px-6 pb-6">
          <div className="w-6 h-px mb-2" style={{ background: LA }} />
          <h3 className="font-display font-bold text-[20px] mb-3" style={{ color: '#f5e6c8' }}>{card.title}</h3>
          {card.checkpoints && card.checkpoints.length > 0 && (
            <div className="space-y-2.5">
              {card.checkpoints.slice(0, 4).map((pt, i) => (
                <div key={i} className="flex items-start gap-2.5 text-[11px]" style={{ color: '#f5e6c8bb' }}>
                  <div className="w-3 h-px flex-shrink-0 mt-2" style={{ background: LA }} /><span className="leading-snug">{pt}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-[1.5px]" style={{ background: `${LA}33` }} />
      </div>
    )
  }
  if (ds === 'minimal') {
    return (
      <div className="relative aspect-square overflow-hidden shadow-xl" style={{ borderRadius: 24, background: '#ffffff' }}>
        {photo ? (
          <div className="absolute top-0 left-0 right-0 h-[52%] overflow-hidden">
            <img src={photo} alt="" className="w-full h-full object-cover" style={filterCss ? { filter: filterCss } : undefined} />
          </div>
        ) : (
          <div className="absolute top-0 left-0 right-0 h-[52%]" style={{ background: `linear-gradient(135deg,${theme.accent}20,${theme.light})` }} />
        )}
        <div className="absolute top-3 right-3 text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: theme.accent, color: '#fff' }}>5/6</div>
        <div className="absolute bottom-0 left-0 right-0 bg-white px-5 pb-4 pt-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Home size={13} style={{ color: theme.accent }} />
            <span className="font-bold text-[15px]" style={{ color: '#111' }}>{card.title}</span>
          </div>
          {card.checkpoints && card.checkpoints.length > 0 && (
            <div className="space-y-1.5">
              {card.checkpoints.slice(0, 4).map((pt, i) => (
                <div key={i} className="flex items-start gap-2 p-1.5 rounded-lg" style={{ background: `${theme.accent}0d` }}>
                  <span style={{ color: theme.accent }} className="font-bold text-[11px] flex-shrink-0 mt-0.5">✓</span>
                  <span className="text-[11px] leading-snug" style={{ color: '#444' }}>{pt}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }
  if (ds === 'vivid') {
    return (
      <div className="relative aspect-square overflow-hidden shadow-2xl" style={{ borderRadius: 28 }}>
        {photo ? <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover" style={filterCss ? { filter: filterCss } : undefined} />
          : <div className="absolute inset-0" style={{ background: `linear-gradient(135deg,${theme.accent},${theme.dark})` }} />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/20 to-transparent" />
        <div className="absolute top-4 left-4 flex items-center gap-2">
          <div className="w-8 h-8 rounded-full flex items-center justify-center bg-white/20 backdrop-blur-sm">
            <Home size={15} className="text-white" />
          </div>
          <span className="text-white/70 text-[10px]">5 / 6</span>
        </div>
        <div className="absolute inset-x-0 bottom-0 p-6 text-white">
          <h3 className="font-display font-black text-[22px] mb-3 drop-shadow-md">{card.title}</h3>
          {card.checkpoints && card.checkpoints.length > 0 && (
            <div className="space-y-2">
              {card.checkpoints.slice(0, 4).map((pt, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px] bg-white/10 rounded-lg px-2.5 py-1.5 backdrop-blur-sm">
                  <span className="font-bold flex-shrink-0">★</span>
                  <span className="opacity-95 leading-snug">{pt}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }
  // modern
  return (
    <div className="relative aspect-square rounded-[32px] overflow-hidden shadow-2xl">
      {photo ? <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover" style={filterCss ? { filter: filterCss } : undefined} />
        : <div className="absolute inset-0" style={{ background: `linear-gradient(135deg,${theme.dark},${theme.accent})` }} />}
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/20 to-transparent" />
      <div className="absolute top-4 left-4 flex items-center gap-2">
        <div className="w-8 h-8 rounded-full flex items-center justify-center shadow-lg" style={{ background: `${theme.accent}dd` }}>
          <Home size={15} className="text-white" />
        </div>
        <span className="text-white/70 text-[10px]">5 / 6</span>
      </div>
      <div className="absolute inset-x-0 bottom-0 p-6 text-white">
        <h3 className="font-display font-bold text-[20px] mb-3 drop-shadow-md">{card.title}</h3>
        {card.checkpoints && card.checkpoints.length > 0 && (
          <div className="space-y-2">
            {card.checkpoints.slice(0, 4).map((pt, i) => (
              <div key={i} className="flex items-start gap-2 text-[11px]">
                {i < 3 ? <span className="font-bold flex-shrink-0 mt-0.5" style={{ color: theme.accent }}>✓</span>
                  : <span className="flex-shrink-0">⭐</span>}
                <span className="opacity-90 leading-snug">{pt}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function CtaCard({ card, theme, photo, filterCss, ds }: { card: CardSlide; theme: Theme; photo?: string; filterCss?: string; ds: DesignStyle }) {
  if (ds === 'luxury') {
    const LA = '#d4a843'
    return (
      <div className="relative aspect-square overflow-hidden shadow-2xl" style={{ borderRadius: 16, background: '#040100' }}>
        {photo && <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ filter: 'brightness(0.4) sepia(0.1)' }} />}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom,rgba(0,0,0,0.6) 0%,rgba(0,0,0,0.98) 100%)' }} />
        <div className="absolute top-0 left-0 right-0 h-[1.5px]" style={{ background: LA }} />
        <div className="absolute top-3 right-4 text-[9px] tracking-widest font-medium" style={{ color: `${LA}60` }}>06 / 06</div>
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-10 h-10 rounded-none flex items-center justify-center mb-4" style={{ border: `1px solid ${LA}66` }}>
            <Phone size={18} style={{ color: LA }} />
          </div>
          <div className="w-8 h-px mb-3" style={{ background: LA }} />
          <h2 className="font-display font-bold text-[24px] leading-tight whitespace-pre-line mb-4" style={{ color: '#f5e6c8' }}>{card.title}</h2>
          {card.price_badge && (
            <div className="inline-block text-[12px] font-bold px-5 py-1.5 mb-3" style={{ border: `1px solid ${LA}`, color: LA }}>{card.price_badge}</div>
          )}
          {card.cta && (
            <div className="w-full text-[12px] font-bold py-2 mb-3" style={{ background: `${LA}22`, border: `1px solid ${LA}55`, color: `${LA}cc` }}>{card.cta}</div>
          )}
          <div className="w-8 h-px mt-1" style={{ background: `${LA}55` }} />
          {card.hashtags && card.hashtags.length > 0 && (
            <div className="flex flex-wrap gap-x-1.5 gap-y-0.5 justify-center mt-2">
              {card.hashtags.slice(0, 10).map((t, i) => (
                <span key={i} className="text-[8px]" style={{ color: `${LA}50` }}>{t.startsWith('#') ? t : `#${t}`}</span>
              ))}
            </div>
          )}
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-[1.5px]" style={{ background: `${LA}44` }} />
      </div>
    )
  }
  if (ds === 'minimal') {
    return (
      <div className="relative aspect-square overflow-hidden shadow-xl" style={{ borderRadius: 24, background: '#ffffff' }}>
        <div className="absolute top-0 left-0 right-0 h-1" style={{ background: theme.accent }} />
        <div className="absolute top-3 right-3 text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: theme.accent, color: '#fff' }}>6/6</div>
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4 shadow-md" style={{ background: `${theme.accent}18` }}>
            <Phone size={22} style={{ color: theme.accent }} />
          </div>
          <h2 className="font-display font-bold text-[22px] leading-tight whitespace-pre-line mb-3" style={{ color: '#111' }}>{card.title}</h2>
          {card.price_badge && (
            <div className="inline-block text-[12px] font-bold px-4 py-1.5 rounded-full mb-3" style={{ background: `${theme.accent}18`, color: theme.accent }}>{card.price_badge}</div>
          )}
          {card.cta && (
            <div className="w-full text-[13px] font-bold py-2.5 rounded-xl mb-3 text-white" style={{ background: theme.accent }}>{card.cta}</div>
          )}
          {card.hashtags && card.hashtags.length > 0 && (
            <div className="flex flex-wrap gap-x-1.5 gap-y-0.5 justify-center mt-1">
              {card.hashtags.slice(0, 10).map((t, i) => (
                <span key={i} className="text-[9px]" style={{ color: `${theme.accent}88` }}>{t.startsWith('#') ? t : `#${t}`}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }
  if (ds === 'vivid') {
    return (
      <div className="relative aspect-square overflow-hidden shadow-2xl" style={{ borderRadius: 28 }}>
        {photo ? <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover" style={filterCss ? { filter: filterCss } : undefined} />
          : <div className="absolute inset-0" style={{ background: `linear-gradient(135deg,${theme.accent},${theme.dark})` }} />}
        <div className="absolute inset-0" style={{ background: `linear-gradient(to bottom,${theme.accent}bb 0%,rgba(0,0,0,0.9) 100%)` }} />
        <div className="absolute top-3 right-4 text-white/50 text-[10px]">6 / 6</div>
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-white">
          <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3 bg-white/20 backdrop-blur-sm">
            <Phone size={22} className="text-white" />
          </div>
          <h2 className="font-display font-black text-[26px] leading-tight whitespace-pre-line mb-3 drop-shadow-lg">{card.title}</h2>
          {card.price_badge && (
            <div className="inline-block text-[13px] font-black px-5 py-2 rounded-full mb-3 shadow-lg bg-white" style={{ color: theme.dark }}>{card.price_badge}</div>
          )}
          {card.cta && (
            <div className="w-full border-2 border-white/50 rounded-xl px-5 py-2 text-[12px] font-bold backdrop-blur-sm mb-3">{card.cta}</div>
          )}
          {card.hashtags && card.hashtags.length > 0 && (
            <div className="flex flex-wrap gap-x-1.5 gap-y-0.5 justify-center">
              {card.hashtags.slice(0, 12).map((t, i) => (
                <span key={i} className="text-[9px] opacity-45">{t.startsWith('#') ? t : `#${t}`}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }
  // modern
  return (
    <div className="relative aspect-square rounded-[32px] overflow-hidden shadow-2xl">
      {photo ? <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover" style={filterCss ? { filter: filterCss } : undefined} />
        : <div className="absolute inset-0" style={{ background: `linear-gradient(135deg,${theme.dark},${theme.accent})` }} />}
      <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/60 to-black/95" />
      <div className="absolute top-0 left-0 right-0 h-1.5" style={{ background: theme.accent }} />
      <div className="absolute top-3 right-3 text-white/50 text-[10px]">6 / 6</div>
      <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-white">
        <div className="mb-3"><Phone size={24} style={{ color: theme.accent }} className="mx-auto" /></div>
        <h2 className="font-display font-bold text-[26px] tracking-tight leading-tight whitespace-pre-line mb-4 drop-shadow-xl">{card.title}</h2>
        {card.price_badge && (
          <div className="inline-block text-[13px] font-black px-5 py-2 rounded-full mb-3 shadow-lg" style={{ background: theme.accent }}>{card.price_badge}</div>
        )}
        {card.cta && (
          <div className="border border-white/40 rounded-xl px-5 py-2 text-[12px] font-bold backdrop-blur-sm mb-3 w-full">{card.cta}</div>
        )}
        {card.hashtags && card.hashtags.length > 0 && (
          <div className="flex flex-wrap gap-x-1.5 gap-y-0.5 justify-center">
            {card.hashtags.slice(0, 12).map((t, i) => (
              <span key={i} className="text-[9px] opacity-40">{t.startsWith('#') ? t : `#${t}`}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════ Kakao Card Components ═══════════════════ */

function KakaoHeader({ cardNum, total = 6 }: { cardNum: number; total?: number }) {
  return (
    <div className="flex items-center justify-between px-4 py-3" style={{ background: KAKAO_YELLOW }}>
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black shadow" style={{ background: KAKAO_DARK, color: KAKAO_YELLOW }}>K</div>
        <span className="text-[12px] font-bold" style={{ color: KAKAO_DARK }}>부동산 카드뉴스</span>
      </div>
      <span className="text-[10px] font-semibold" style={{ color: '#7A6A6A' }}>{cardNum} / {total}</span>
    </div>
  )
}

function KakaoHookCard({ card }: { card: CardSlide }) {
  const headline = card.headline ?? card.title ?? ''
  const price = card.price ?? card.price_badge ?? ''
  const location = card.location ?? card.address ?? ''
  return (
    <div className="aspect-square rounded-2xl overflow-hidden shadow-xl flex flex-col" style={{ background: '#FAFAFA' }}>
      <KakaoHeader cardNum={1} />
      <div className="flex-1 flex flex-col justify-center p-5" style={{ background: 'linear-gradient(180deg, #FFFDE7 0%, #FFF8E1 100%)' }}>
        <div className="mb-3">
          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ background: KAKAO_YELLOW, color: KAKAO_DARK }}>
            {location || '입지 정보'}
          </span>
        </div>
        <h2 className="font-black text-[22px] leading-tight mb-4 whitespace-pre-line" style={{ color: KAKAO_DARK }}>{headline}</h2>
        {price && (
          <div className="inline-block px-4 py-2 rounded-xl text-[14px] font-black shadow-sm border" style={{ background: KAKAO_YELLOW, color: KAKAO_DARK, borderColor: '#F0D900' }}>
            {price}
          </div>
        )}
      </div>
      <div className="px-4 py-2 text-[10px]" style={{ background: '#F5F5F5', color: '#AAA' }}>카카오 채널 · 부동산 마케팅</div>
    </div>
  )
}

function KakaoPointsCard({ card, icon }: { card: CardSlide; icon: string }) {
  const points = card.points ?? card.checkpoints ?? []
  const section = card.section ?? card.title ?? ''
  return (
    <div className="aspect-square rounded-2xl overflow-hidden shadow-xl flex flex-col" style={{ background: '#FAFAFA' }}>
      <KakaoHeader cardNum={card.order} />
      <div className="flex-1 p-4 overflow-hidden" style={{ background: '#FFFDE7' }}>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[22px]">{icon}</span>
          <h3 className="font-black text-[16px] leading-tight" style={{ color: KAKAO_DARK }}>{section}</h3>
        </div>
        <div className="space-y-2">
          {points.slice(0, 4).map((pt, i) => (
            <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-xl" style={{ background: i % 2 === 0 ? '#FFF8D6' : '#FFFFFF', border: '1px solid #F0E060' }}>
              <span className="text-[13px] flex-shrink-0 mt-0.5">✅</span>
              <span className="text-[12px] leading-snug font-medium" style={{ color: KAKAO_DARK }}>{pt}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="px-4 py-2 text-[10px]" style={{ background: '#F5F5F5', color: '#AAA' }}>카카오 채널 · 부동산 마케팅</div>
    </div>
  )
}

function KakaoCtaCard({ card }: { card: CardSlide }) {
  const points = card.points ?? []
  const phone = card.phone ?? ''
  const kakaoId = card.kakao_id ?? ''
  return (
    <div className="aspect-square rounded-2xl overflow-hidden shadow-xl flex flex-col" style={{ background: '#FAFAFA' }}>
      <KakaoHeader cardNum={6} />
      <div className="flex-1 flex flex-col items-center justify-center p-5 gap-3" style={{ background: 'linear-gradient(180deg, #FFFDE7 0%, #FFF3CD 100%)' }}>
        <div className="text-[32px]">📞</div>
        <h2 className="font-black text-[20px] text-center leading-tight whitespace-pre-line" style={{ color: KAKAO_DARK }}>
          {card.title || card.section || '지금 바로\n문의하세요'}
        </h2>
        {card.cta && (
          <div className="w-full py-3 rounded-2xl text-[13px] font-black text-center shadow-sm" style={{ background: KAKAO_YELLOW, color: KAKAO_DARK }}>
            {card.cta}
          </div>
        )}
        {(phone || kakaoId || points.length > 0) && (
          <div className="w-full space-y-2">
            {phone && (
              <div className="flex items-center gap-2 p-2 rounded-xl" style={{ background: 'white', border: `1px solid ${KAKAO_YELLOW}` }}>
                <span className="text-[12px]">📱</span>
                <span className="text-[12px] font-semibold" style={{ color: KAKAO_DARK }}>{phone}</span>
              </div>
            )}
            {kakaoId && (
              <div className="flex items-center gap-2 p-2 rounded-xl" style={{ background: 'white', border: `1px solid ${KAKAO_YELLOW}` }}>
                <span className="text-[12px]">💬</span>
                <span className="text-[12px] font-semibold" style={{ color: KAKAO_DARK }}>카카오: {kakaoId}</span>
              </div>
            )}
            {points.slice(0, 1).map((pt, i) => (
              <p key={i} className="text-[11px] text-center" style={{ color: '#888' }}>{pt}</p>
            ))}
          </div>
        )}
      </div>
      <div className="px-4 py-2 text-[10px]" style={{ background: '#F5F5F5', color: '#AAA' }}>카카오 채널 · 부동산 마케팅</div>
    </div>
  )
}

/* ═══════════════════ Card Dispatcher ═══════════════════ */

function CardPreview({
  card, theme, photo, aiPhoto, onGenerateAI, aiLoading, filterCss, platform, ds,
}: {
  card: CardSlide; theme: Theme; photo?: string; aiPhoto?: string
  onGenerateAI?: () => void; aiLoading?: boolean; filterCss?: string; platform: 'instagram' | 'kakao'; ds: DesignStyle
}) {
  // Kakao rendering
  if (platform === 'kakao') {
    if (card.order === 1) return <KakaoHookCard card={card} />
    if (card.order === 6) return <KakaoCtaCard card={card} />
    return <KakaoPointsCard card={card} icon={KAKAO_ICONS[card.order] ?? '📌'} />
  }

  // Instagram rendering
  const bg = aiPhoto ?? photo
  const props = { card, theme, photo: bg, filterCss: aiPhoto ? undefined : filterCss, ds }
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
      {onGenerateAI && (
        <button
          onClick={onGenerateAI}
          disabled={aiLoading}
          className="exclude-export absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full shadow-lg bg-white/92 text-gray-700 hover:bg-white disabled:opacity-60"
        >
          {aiLoading ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} className="text-purple-500" />}
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

/* ═══════════════════ Main Component ═══════════════════ */

export default function CardNewsTab({ projectId, contents, assets }: CardNewsTabProps) {
  const supabase = createClient()
  const [generating, setGenerating] = useState(false)
  const [platform, setPlatform] = useState<'instagram' | 'kakao'>('instagram')
  const [colorTheme, setColorTheme] = useState('emerald')
  const [photoFilter, setPhotoFilter] = useState('original')
  const [selectedId, setSelectedId] = useState<string | null>(contents[0]?.id ?? null)
  const [aiPhotos, setAiPhotos] = useState<Record<number, string>>({})
  const [aiLoading, setAiLoading] = useState<Record<number, boolean>>({})
  const [activeSlide, setActiveSlide] = useState(0)
  const [cardPhotos, setCardPhotos] = useState<Record<number, string>>({})
  const [copied, setCopied] = useState(false)
  const [editedCards, setEditedCards] = useState<Record<number, Partial<CardSlide>>>({})
  const [customInstructions, setCustomInstructions] = useState('')
  const [showInstructions, setShowInstructions] = useState(true)
  const [canvaLoading, setCanvaLoading] = useState(false)
  const [canvaResult, setCanvaResult] = useState<{ design_id: string; edit_url: string; png_url?: string } | null>(null)
  const [designStyle, setDesignStyle] = useState<DesignStyle>('modern')
  const [selectedTemplateId, setSelectedTemplateId] = useState('modern-emerald')
  const [showGallery, setShowGallery] = useState(false)
  const [canvaTemplates, setCanvaTemplates] = useState<CanvaTemplateSet[]>([])
  const [canvaTemplatesLoading, setCanvaTemplatesLoading] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setCanvaTemplatesLoading(true)
    fetch('/api/canva/templates')
      .then(r => r.json())
      .then(d => setCanvaTemplates(d.templates ?? []))
      .catch(() => {})
      .finally(() => setCanvaTemplatesLoading(false))
  }, [])

  const selected = contents.find(c => c.id === selectedId)
  const rawContent = selected?.content ? JSON.parse(selected.content) : null
  const rawCards: any[] = Array.isArray(rawContent) ? rawContent
    : Array.isArray(rawContent?.cards) ? rawContent.cards
    : []

  const slides: CardSlide[] = rawCards.map((c: any, i: number) => {
    const order = c.order ?? c.card_number ?? (i + 1)
    return {
      order,
      layout: c.layout ?? layoutFromOrder(order),
      title: c.title ?? c.headline ?? c.section ?? `카드 ${i + 1}`,
      subtitle: c.subtitle,
      body: c.body ?? '',
      highlight: c.highlight ?? c.price ?? undefined,
      price_badge: c.price_badge,
      address: c.address,
      checkpoints: Array.isArray(c.checkpoints) ? c.checkpoints : undefined,
      spec_grid: Array.isArray(c.spec_grid) ? c.spec_grid : undefined,
      points: Array.isArray(c.points) ? c.points : undefined,
      hashtags: Array.isArray(c.hashtags) ? c.hashtags : undefined,
      cta: c.cta,
      image_prompt: c.image_prompt,
      headline: c.headline,
      price: c.price,
      location: c.location,
      section: c.section,
      phone: c.phone,
      kakao_id: c.kakao_id,
    }
  })

  const theme = COLOR_THEMES.find(t => t.id === colorTheme) ?? COLOR_THEMES[0]
  const filterCss = PHOTO_FILTERS.find(f => f.id === photoFilter)?.css

  const mergeCard = (card: CardSlide): CardSlide => ({
    ...card,
    ...(editedCards[card.order] ?? {}),
  })

  const updateCard = (order: number, updates: Partial<CardSlide>) => {
    setEditedCards(prev => ({ ...prev, [order]: { ...(prev[order] ?? {}), ...updates } }))
  }

  const resetCard = (order: number) => {
    setEditedCards(prev => { const n = { ...prev }; delete n[order]; return n })
  }

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
        body: JSON.stringify({ project_id: projectId, asset_urls, platform }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `생성 실패 (${res.status})`)
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
        body: JSON.stringify({ image_prompt: card.image_prompt ?? 'Real estate property photo, professional', project_id: projectId, card_number: card.order }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'AI 이미지 생성 실패')
      setAiPhotos(prev => ({ ...prev, [card.order]: json.image_url }))
      toast.success(`카드 ${card.order} AI 배경 생성 완료`)
    } catch (err: any) {
      toast.error(err.message ?? 'AI 이미지 생성 실패')
    } finally {
      setAiLoading(prev => ({ ...prev, [card.order]: false }))
    }
  }

  const copyHashtags = async () => {
    const lastCard = slides.find(s => s.order === 6)
    const tags = (lastCard?.hashtags ?? []).join(' ')
    if (!tags) { toast.error('해시태그가 없습니다'); return }
    await navigator.clipboard.writeText(tags)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('해시태그 복사됨')
  }

  const prevSlide = () => setActiveSlide(s => Math.max(0, s - 1))
  const nextSlide = () => setActiveSlide(s => Math.min((slides.length || 1) - 1, s + 1))

  const handleDownloadCurrent = async () => {
    if (!cardRef.current) return
    try {
      const dataUrl = await toPng(cardRef.current, {
        cacheBust: true,
        pixelRatio: 3,
        filter: (node) => !node.classList?.contains('exclude-export')
      })
      const link = document.createElement('a')
      link.download = `card-${platform}-${activeSlide + 1}.png`
      link.href = dataUrl
      link.click()
      toast.success('이미지가 저장되었습니다')
    } catch (err) {
      toast.error('다운로드 중 오류가 발생했습니다')
    }
  }

  const handleCanvaDesign = async () => {
    const card = slides[activeSlide]
    if (!card) { toast.error('카드를 먼저 생성하세요'); return }
    setCanvaLoading(true)
    try {
      // 1. 현재 카드에 연결된 사진 업로드
      const photoUrl = assets.length > 0 ? assignPhoto(card.order, assets) : undefined
      let asset_id: string | undefined
      if (photoUrl) {
        const assetRes = await fetch('/api/canva/assets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_url: photoUrl, name: `card-${card.order}` }),
        })
        if (assetRes.ok) {
          const assetJson = await assetRes.json()
          asset_id = assetJson.asset_id
        }
      }

      // 2. Autofill 실행
      const autofillRes = await fetch('/api/canva/autofill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card: mergeCard(card), asset_id, content_id: selectedId }),
      })
      const autofillJson = await autofillRes.json()
      if (!autofillRes.ok) throw new Error(autofillJson.error ?? 'Autofill 실패')

      const { design_id, edit_url } = autofillJson

      // 3. PNG Export
      let png_url: string | undefined
      const exportRes = await fetch('/api/canva/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ design_id, format: 'png' }),
      })
      if (exportRes.ok) {
        const exportJson = await exportRes.json()
        png_url = exportJson.url
      }

      setCanvaResult({ design_id, edit_url, png_url })
      toast.success('Canva 디자인 생성 완료!')
    } catch (err: any) {
      toast.error(err.message ?? 'Canva 디자인 생성 실패')
    } finally {
      setCanvaLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* ── 상단 컨트롤 바 ── */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* 플랫폼 */}
          <div className="flex rounded-xl overflow-hidden border border-gray-200">
            {[
              { id: 'instagram', label: '📸 인스타그램' },
              { id: 'kakao',     label: '💬 카카오톡' },
            ].map(p => (
              <button
                key={p.id}
                onClick={() => setPlatform(p.id as 'instagram' | 'kakao')}
                className={cn(
                  'px-4 py-2 text-[12px] font-semibold transition-all',
                  platform === p.id ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* 필터 (인스타만) */}
          {platform === 'instagram' && (
            <div className="flex gap-1">
              {PHOTO_FILTERS.map(f => (
                <button
                  key={f.id}
                  onClick={() => setPhotoFilter(f.id)}
                  className={cn(
                    'px-2.5 py-1.5 text-[11px] rounded-lg border font-medium transition-all',
                    photoFilter === f.id ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}

          <div className="flex-1" />

          {/* 현재 카드 다운로드 */}
          <button onClick={handleDownloadCurrent} className="btn-secondary text-xs gap-1.5 border-brand-200 hover:border-brand-500 hover:text-brand-600 transition-colors">
            <Download size={13} /> 다운로드
          </button>

          {/* 해시태그 복사 */}
          {slides.some(s => s.hashtags && s.hashtags.length > 0) && (
            <button onClick={copyHashtags} className="btn-secondary text-xs gap-1.5">
              {copied ? <><Check size={13} className="text-green-500" /> 복사됨</> : <><Copy size={13} /> 해시태그</>}
            </button>
          )}

          {/* 버전 선택 */}
          {contents.length > 1 && (
            <select
              value={selectedId ?? ''}
              onChange={e => { setSelectedId(e.target.value); setActiveSlide(0) }}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600 bg-white"
            >
              {contents.map((c, i) => (
                <option key={c.id} value={c.id}>버전 {c.version ?? (contents.length - i)}</option>
              ))}
            </select>
          )}

          {/* Canva 디자인 버튼 (슬라이드 있을 때만) */}
          {slides.length > 0 && (
            <button
              onClick={handleCanvaDesign}
              disabled={canvaLoading}
              className="btn-secondary text-xs gap-1.5 border-violet-200 text-violet-700 hover:border-violet-400 hover:bg-violet-50"
            >
              {canvaLoading
                ? <><Loader2 size={13} className="animate-spin" /> Canva 처리중...</>
                : <><Paintbrush size={13} /> Canva 디자인</>
              }
            </button>
          )}

          {/* 생성 버튼 */}
          <button onClick={handleGenerate} disabled={generating} className="btn-primary">
            {generating
              ? <><Loader2 size={14} className="animate-spin" /> 생성중...</>
              : <><Wand2 size={14} /> {platform === 'kakao' ? '카카오' : '인스타'} 생성</>
            }
          </button>
        </div>

      </div>

      {slides.length === 0 ? (
        <div className="card p-14 text-center">
          <ImageIcon size={44} className="mx-auto text-gray-200 mb-3" />
          <p className="text-gray-500 font-medium">카드뉴스를 생성해보세요</p>
          <p className="text-sm text-gray-400 mt-1">
            {platform === 'kakao' ? '카카오톡 채널용' : '인스타그램용'} 6장 카드뉴스를 AI가 자동 구성합니다
          </p>
          <button onClick={handleGenerate} disabled={generating} className="btn-primary mt-4">
            {generating ? <><Loader2 size={14} className="animate-spin" /> 생성중...</> : <><Wand2 size={14} /> 지금 생성하기</>}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[260px_1fr] gap-5">
          {/* ── 좌측 패널 ── */}
          <div className="space-y-4">
            {/* 현재 템플릿 표시 + 변경 버튼 (인스타만) */}
            {platform === 'instagram' && (() => {
              const cur = BUILTIN_TEMPLATES.find(t => t.id === selectedTemplateId)
              const isCanva = selectedTemplateId.startsWith('canva-')
              const curCanva = isCanva ? canvaTemplates.find(t => `canva-${t.id}` === selectedTemplateId) : null
              return (
                <div className="card p-3">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">디자인 템플릿</p>
                  <div className="flex items-center gap-2.5">
                    {/* Thumbnail */}
                    <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 shadow-sm relative">
                      {assets[0]?.file_url && (
                        <img src={assets[0].file_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
                      )}
                      <div
                        className="absolute inset-0"
                        style={{
                          background: isCanva
                            ? (curCanva?.gradient ?? 'linear-gradient(135deg,#8B5CF6,#4F46E5)')
                            : (assets[0]?.file_url ? (cur?.overlay ?? '') : (cur?.gradient ?? ''))
                        }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-800 text-[12px] truncate">
                        {isCanva ? (curCanva?.name ?? 'Canva') : (cur?.label ?? '미선택')}
                      </p>
                      <p className="text-[10px] text-gray-400 truncate">
                        {isCanva ? 'Canva 템플릿' : (cur?.desc ?? '')}
                      </p>
                    </div>
                    <button
                      onClick={() => setShowGallery(true)}
                      className="flex-shrink-0 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-brand-200 text-brand-600 hover:bg-brand-50 transition-colors"
                    >
                      변경
                    </button>
                  </div>
                </div>
              )
            })()}
            {/* 매물 사진 + 카드별 설정 */}
            {assets.length > 0 && (
              <div className="card p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
                  <ImageIcon size={14} />
                  매물 사진 ({assets.length}장)
                </h3>
                <div className="grid grid-cols-3 gap-1 mb-3">
                  {assets.slice(0, 6).map((a: any, i) => (
                    <img key={i} src={a.file_url} alt="" className="aspect-square rounded-lg object-cover" />
                  ))}
                </div>
                {platform === 'instagram' && slides.length > 0 && (
                  <>
                    <p className="text-[11px] font-semibold text-gray-600 mb-2">카드별 사진 설정</p>
                    <div className="space-y-2">
                      {slides.map((card, i) => (
                        <div key={card.order} className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-gray-400 w-7 flex-shrink-0 text-center">{SLIDE_LABELS[i] ?? `${i+1}`}</span>
                          <div className="flex gap-1 overflow-x-auto flex-1">
                            {assets.map((a: any) => (
                              <button
                                key={a.id ?? a.file_url}
                                onClick={() => setCardPhotos(prev => ({ ...prev, [card.order]: a.file_url }))}
                                className={cn(
                                  'w-8 h-8 rounded-md flex-shrink-0 overflow-hidden border-2 transition-all',
                                  (cardPhotos[card.order] ?? assignPhoto(card.order, assets)) === a.file_url
                                    ? 'border-brand-500 scale-110' : 'border-transparent hover:border-gray-300'
                                )}
                              >
                                <img src={a.file_url} alt="" className="w-full h-full object-cover" />
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-purple-500 mt-2">✦ 카드 위에 마우스 올려 AI 배경 생성</p>
                  </>
                )}
              </div>
            )}

            {/* AI 배경 안내 (인스타만) */}
            {platform === 'instagram' && (
              <div className="card p-3 bg-purple-50 border border-purple-100">
                <div className="flex items-start gap-2">
                  <Sparkles size={13} className="text-purple-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-purple-700 mb-0.5">AI 배경 이미지 (옵션)</p>
                    <p className="text-[11px] text-purple-600 leading-snug">카드에 마우스를 올려 "AI 배경" 버튼 클릭 시 DALL-E가 배경 이미지를 생성합니다.</p>
                    <p className="text-[10px] text-purple-400 mt-1">카드당 약 $0.04 비용 발생</p>
                  </div>
                </div>
              </div>
            )}

            {/* 버전 기록 */}
            {contents.length > 0 && (
              <div className="card p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">생성 기록 ({contents.length})</h3>
                <div className="space-y-1.5">
                  {contents.map((c, i) => (
                    <button
                      key={c.id}
                      onClick={() => { setSelectedId(c.id); setActiveSlide(0) }}
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

          {/* ── 우측: 캐러셀 미리보기 ── */}
          <div className="space-y-4">
            {/* 슬라이드 레이블 탭 */}
            <div className="flex gap-1 overflow-x-auto">
              {slides.map((s, i) => (
                <button
                  key={s.order}
                  onClick={() => setActiveSlide(i)}
                  className={cn(
                    'flex-shrink-0 px-3 py-1.5 text-[11px] font-semibold rounded-full border transition-all',
                    activeSlide === i
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'border-gray-200 text-gray-500 hover:border-gray-400'
                  )}
                >
                  {SLIDE_LABELS[i] ?? `카드 ${i + 1}`}
                </button>
              ))}
            </div>

            {/* 대형 카드 미리보기 */}
            <div className="relative">
              {/* Prev/Next */}
              <button
                onClick={prevSlide}
                disabled={activeSlide === 0}
                className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-5 z-10 w-9 h-9 bg-white rounded-full shadow-lg border border-gray-200 flex items-center justify-center disabled:opacity-30 hover:bg-gray-50 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={nextSlide}
                disabled={activeSlide === slides.length - 1}
                className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-5 z-10 w-9 h-9 bg-white rounded-full shadow-lg border border-gray-200 flex items-center justify-center disabled:opacity-30 hover:bg-gray-50 transition-colors"
              >
                <ChevronRight size={16} />
              </button>

              {/* Active card - centered, max width */}
              <div className="max-w-[420px] mx-auto w-full" ref={cardRef}>
                {slides[activeSlide] && (
                  <CardPreview
                    card={mergeCard(slides[activeSlide])}
                    theme={theme}
                    photo={cardPhotos[slides[activeSlide].order] ?? assignPhoto(slides[activeSlide].order, assets)}
                    aiPhoto={aiPhotos[slides[activeSlide].order]}
                    platform={platform}
                    onGenerateAI={platform === 'instagram' ? () => handleGenerateAI(slides[activeSlide]) : undefined}
                    aiLoading={aiLoading[slides[activeSlide].order]}
                    filterCss={filterCss}
                    ds={designStyle}
                  />
                )}
              </div>

              {/* Slide dots */}
              <div className="flex justify-center gap-1.5 mt-4">
                {slides.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveSlide(i)}
                    className={cn('h-2 rounded-full transition-all', activeSlide === i ? 'w-6 bg-brand-600' : 'w-2 bg-gray-300 hover:bg-gray-400')}
                  />
                ))}
              </div>
            </div>

            {/* ── 텍스트 직접 편집 패널 ── */}
            {slides[activeSlide] && (() => {
              const card = mergeCard(slides[activeSlide])
              const { order, layout } = card
              const upd = (field: keyof CardSlide, val: any) => updateCard(order, { [field]: val } as Partial<CardSlide>)

              const inp = (label: string, field: keyof CardSlide) => (
                <div key={String(field)}>
                  <label className="text-[10px] text-gray-400 mb-0.5 block">{label}</label>
                  <input
                    type="text"
                    value={(card[field] as string) ?? ''}
                    onChange={e => upd(field, e.target.value)}
                    className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-400"
                  />
                </div>
              )

              const listInp = (label: string, field: keyof CardSlide, max: number) => {
                const items: string[] = (card[field] as string[]) ?? []
                return (
                  <div key={String(field)}>
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
                            upd(field, next)
                          }}
                          className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-400"
                        />
                      ))}
                    </div>
                  </div>
                )
              }

              const fields: React.ReactNode = platform === 'kakao'
                ? order === 1
                  ? <><div className="col-span-2">{inp('헤드라인', 'headline')}</div>{inp('가격', 'price')}{inp('위치', 'location')}</>
                  : order === 6
                    ? <>{inp('제목', 'title')}{inp('CTA 버튼', 'cta')}{inp('전화번호', 'phone')}{inp('카카오 ID', 'kakao_id')}</>
                    : <><div className="col-span-2">{inp('섹션 제목', 'section')}</div><div className="col-span-2">{listInp('포인트', 'points', 4)}</div></>
                : layout === 'cover'
                  ? <><div className="col-span-2">{inp('제목', 'title')}</div>{inp('부제목', 'subtitle')}{inp('가격 배지', 'price_badge')}<div className="col-span-2">{listInp('핵심 포인트 (3개)', 'checkpoints', 3)}</div></>
                  : layout === 'location'
                    ? <><div className="col-span-2">{inp('제목', 'title')}</div>{inp('주소', 'address')}{inp('본문', 'body')}<div className="col-span-2">{listInp('입지 포인트 (4개)', 'checkpoints', 4)}</div></>
                    : layout === 'composition'
                      ? <><div className="col-span-2">{inp('제목', 'title')}</div><div className="col-span-2">{listInp('구성 항목 (4개)', 'points', 4)}</div></>
                      : layout === 'investment'
                        ? <><div className="col-span-2">{inp('제목', 'title')}</div>{inp('강조 문구', 'highlight')}{inp('본문', 'body')}<div className="col-span-2">{listInp('투자 포인트 (2개)', 'points', 2)}</div></>
                        : layout === 'interior'
                          ? <><div className="col-span-2">{inp('제목', 'title')}</div><div className="col-span-2">{listInp('내부 특징 (4개)', 'checkpoints', 4)}</div></>
                          : layout === 'cta'
                            ? <><div className="col-span-2">{inp('제목', 'title')}</div>{inp('가격 배지', 'price_badge')}{inp('CTA 버튼', 'cta')}<div className="col-span-2">{listInp('해시태그 (# 포함, 5개)', 'hashtags', 5)}</div></>
                            : null

              return (
                <div className="card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-gray-700">
                      ✏️ {SLIDE_LABELS[activeSlide] ?? `카드 ${activeSlide + 1}`} 텍스트 편집
                    </h4>
                    {editedCards[order] && (
                      <button onClick={() => resetCard(order)} className="text-xs text-red-400 hover:text-red-600 transition-colors">
                        초기화
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">{fields}</div>
                </div>
              )
            })()}

            {/* 썸네일 스트립 */}
            <div>
              <p className="text-xs text-gray-400 mb-2">모든 카드 ({slides.length}장)</p>
              <div className="grid grid-cols-6 gap-2">
                {slides.map((card, i) => (
                  <button
                    key={card.order}
                    onClick={() => setActiveSlide(i)}
                    className={cn('rounded-xl overflow-hidden transition-all', activeSlide === i ? 'ring-2 ring-brand-500 ring-offset-2 scale-105' : 'opacity-70 hover:opacity-100')}
                  >
                    <CardPreview
                      card={mergeCard(card)}
                      theme={theme}
                      photo={cardPhotos[card.order] ?? assignPhoto(card.order, assets)}
                      aiPhoto={aiPhotos[card.order]}
                      filterCss={filterCss}
                      platform={platform}
                      ds={designStyle}
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Canva 결과 */}
            {canvaResult && (
              <div className="card p-4 border-violet-200 bg-violet-50">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Paintbrush size={14} className="text-violet-600" />
                    <p className="text-sm font-semibold text-violet-800">Canva 디자인 완료</p>
                  </div>
                  <button onClick={() => setCanvaResult(null)} className="text-xs text-violet-400 hover:text-violet-600">닫기</button>
                </div>
                {canvaResult.png_url && (
                  <img src={canvaResult.png_url} alt="Canva 디자인" className="rounded-xl w-full mb-3 shadow-sm" />
                )}
                <div className="flex gap-2">
                  <a
                    href={canvaResult.edit_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary text-xs gap-1.5 border-violet-200 text-violet-700 hover:border-violet-400"
                  >
                    <ExternalLink size={12} /> Canva에서 편집
                  </a>
                  {canvaResult.png_url && (
                    <a
                      href={canvaResult.png_url}
                      download={`canva-card-${activeSlide + 1}.png`}
                      className="btn-secondary text-xs gap-1.5"
                    >
                      <Download size={12} /> PNG 저장
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* 다운로드 */}
            <div className="card p-4 bg-gray-50 border-dashed flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">PNG 다운로드</p>
                <p className="text-xs text-gray-400 mt-0.5">각 카드를 우클릭 → 이미지 저장 또는 스크린샷을 활용하세요</p>
              </div>
              <button className="btn-secondary opacity-50 cursor-not-allowed" disabled>
                <Download size={14} />
                일괄 저장
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── 템플릿 갤러리 모달 ── */}
      {showGallery && (
        <TemplateGallery
          open={showGallery}
          onClose={() => setShowGallery(false)}
          currentId={selectedTemplateId}
          firstPhotoUrl={assets[0]?.file_url}
          canvaTemplates={canvaTemplates}
          canvaLoading={canvaTemplatesLoading}
          onSelectBuiltin={(ds, colorId, templateId) => {
            setDesignStyle(ds)
            setColorTheme(colorId)
            setSelectedTemplateId(templateId)
          }}
          onSelectCanva={(tmpl) => {
            setSelectedTemplateId(`canva-${tmpl.id}`)
          }}
        />
      )}
    </div>
  )
}
