'use client'

import { useState } from 'react'
import { X, Check, Sparkles, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type DesignStyle = 'modern' | 'luxury' | 'minimal' | 'vivid' | 'photo' | 'split'

export interface BuiltinTemplate {
  id: string
  label: string
  desc: string
  tag?: string
  ds: DesignStyle
  colorId: string
  gradient: string
  overlay: string
  accentColor: string
  category: 'modern' | 'luxury' | 'minimal' | 'vivid' | 'photo' | 'split'
}

export interface CanvaTemplateSet {
  id: string
  name: string
  description: string
  thumbnail_url: string
  category: string
  template_ids: Record<string, string>
  gradient?: string
  accent_color?: string
}

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  {
    id: 'modern-blue', ds: 'modern', colorId: 'blue', category: 'modern',
    label: '모던 블루', desc: '신뢰감 있는 전문 스타일', tag: '인기',
    gradient: 'linear-gradient(160deg,#1e3a8a 0%,#1d4ed8 60%,#3b82f6 100%)',
    overlay: 'linear-gradient(to top,rgba(10,20,60,0.92) 0%,rgba(30,58,138,0.25) 100%)',
    accentColor: '#3b82f6',
  },
  {
    id: 'modern-emerald', ds: 'modern', colorId: 'emerald', category: 'modern',
    label: '모던 그린', desc: '안정적이고 세련된 스타일',
    gradient: 'linear-gradient(160deg,#064e3b 0%,#047857 60%,#10b981 100%)',
    overlay: 'linear-gradient(to top,rgba(6,50,35,0.92) 0%,rgba(6,78,59,0.25) 100%)',
    accentColor: '#10b981',
  },
  {
    id: 'modern-purple', ds: 'modern', colorId: 'purple', category: 'modern',
    label: '모던 퍼플', desc: '독창적이고 프리미엄 느낌',
    gradient: 'linear-gradient(160deg,#3b0764 0%,#7e22ce 60%,#a855f7 100%)',
    overlay: 'linear-gradient(to top,rgba(30,7,50,0.92) 0%,rgba(59,7,100,0.25) 100%)',
    accentColor: '#a855f7',
  },
  {
    id: 'modern-slate', ds: 'modern', colorId: 'slate', category: 'modern',
    label: '모던 다크', desc: '차분하고 비즈니스 느낌',
    gradient: 'linear-gradient(160deg,#0f172a 0%,#1e293b 60%,#475569 100%)',
    overlay: 'linear-gradient(to top,rgba(10,15,30,0.92) 0%,rgba(30,41,59,0.25) 100%)',
    accentColor: '#64748b',
  },
  {
    id: 'modern-rose', ds: 'modern', colorId: 'rose', category: 'modern',
    label: '모던 레드', desc: '열정적이고 강렬한 스타일',
    gradient: 'linear-gradient(160deg,#881337 0%,#be123c 60%,#f43f5e 100%)',
    overlay: 'linear-gradient(to top,rgba(80,10,30,0.92) 0%,rgba(136,19,55,0.25) 100%)',
    accentColor: '#f43f5e',
  },
  {
    id: 'luxury-gold', ds: 'luxury', colorId: 'slate', category: 'luxury',
    label: '럭셔리 골드', desc: '고급스럽고 프리미엄', tag: '추천',
    gradient: 'linear-gradient(160deg,#0a0500 0%,#1a0e00 60%,#2a1a00 100%)',
    overlay: 'linear-gradient(to top,rgba(5,2,0,0.95) 0%,rgba(20,10,0,0.35) 100%)',
    accentColor: '#d4a843',
  },
  {
    id: 'luxury-rose', ds: 'luxury', colorId: 'rose', category: 'luxury',
    label: '럭셔리 로즈', desc: '우아하고 감성적인',
    gradient: 'linear-gradient(160deg,#1a0008 0%,#3d0018 60%,#6b001f 100%)',
    overlay: 'linear-gradient(to top,rgba(20,0,8,0.95) 0%,rgba(50,0,20,0.35) 100%)',
    accentColor: '#f43f5e',
  },
  {
    id: 'luxury-blue', ds: 'luxury', colorId: 'blue', category: 'luxury',
    label: '럭셔리 네이비', desc: '권위 있고 신뢰감 있는',
    gradient: 'linear-gradient(160deg,#040d1a 0%,#0a1f3d 60%,#0f2f5a 100%)',
    overlay: 'linear-gradient(to top,rgba(4,13,26,0.95) 0%,rgba(10,31,61,0.35) 100%)',
    accentColor: '#3b82f6',
  },
  {
    id: 'minimal-blue', ds: 'minimal', colorId: 'blue', category: 'minimal',
    label: '미니멀 블루', desc: '깔끔하고 전문적인',
    gradient: 'linear-gradient(160deg,#eff6ff 0%,#dbeafe 100%)',
    overlay: 'linear-gradient(to bottom,transparent 45%,rgba(255,255,255,0.92) 100%)',
    accentColor: '#3b82f6',
  },
  {
    id: 'minimal-emerald', ds: 'minimal', colorId: 'emerald', category: 'minimal',
    label: '미니멀 그린', desc: '자연스럽고 친근한',
    gradient: 'linear-gradient(160deg,#f0fdf4 0%,#d1fae5 100%)',
    overlay: 'linear-gradient(to bottom,transparent 45%,rgba(255,255,255,0.92) 100%)',
    accentColor: '#10b981',
  },
  {
    id: 'minimal-rose', ds: 'minimal', colorId: 'rose', category: 'minimal',
    label: '미니멀 로즈', desc: '따뜻하고 감성적인',
    gradient: 'linear-gradient(160deg,#fff1f2 0%,#ffe4e6 100%)',
    overlay: 'linear-gradient(to bottom,transparent 45%,rgba(255,255,255,0.92) 100%)',
    accentColor: '#f43f5e',
  },
  {
    id: 'minimal-purple', ds: 'minimal', colorId: 'purple', category: 'minimal',
    label: '미니멀 퍼플', desc: '세련되고 창의적인',
    gradient: 'linear-gradient(160deg,#faf5ff 0%,#f3e8ff 100%)',
    overlay: 'linear-gradient(to bottom,transparent 45%,rgba(255,255,255,0.92) 100%)',
    accentColor: '#a855f7',
  },
  {
    id: 'vivid-rose', ds: 'vivid', colorId: 'rose', category: 'vivid',
    label: '비비드 레드', desc: '강렬하고 임팩트 있는', tag: '신규',
    gradient: 'linear-gradient(135deg,#f43f5e 0%,#be123c 100%)',
    overlay: 'linear-gradient(135deg,rgba(244,63,94,0.75) 0%,transparent 40%,rgba(0,0,0,0.88) 100%)',
    accentColor: '#f43f5e',
  },
  {
    id: 'vivid-purple', ds: 'vivid', colorId: 'purple', category: 'vivid',
    label: '비비드 퍼플', desc: '화려하고 독창적인',
    gradient: 'linear-gradient(135deg,#a855f7 0%,#4f46e5 100%)',
    overlay: 'linear-gradient(135deg,rgba(168,85,247,0.75) 0%,transparent 40%,rgba(0,0,0,0.88) 100%)',
    accentColor: '#a855f7',
  },
  {
    id: 'vivid-orange', ds: 'vivid', colorId: 'orange', category: 'vivid',
    label: '비비드 오렌지', desc: '활기차고 에너지 넘치는',
    gradient: 'linear-gradient(135deg,#f97316 0%,#dc2626 100%)',
    overlay: 'linear-gradient(135deg,rgba(249,115,22,0.75) 0%,transparent 40%,rgba(0,0,0,0.88) 100%)',
    accentColor: '#f97316',
  },
  {
    id: 'photo-blue', ds: 'photo', colorId: 'blue', category: 'photo',
    label: '포토 블루', desc: '사진이 살아있는 스타일', tag: '사진강조',
    gradient: 'linear-gradient(160deg,#1e3a8a 0%,#3b82f6 100%)',
    overlay: 'linear-gradient(to top,rgba(0,0,0,0.58) 0%,transparent 65%)',
    accentColor: '#3b82f6',
  },
  {
    id: 'photo-emerald', ds: 'photo', colorId: 'emerald', category: 'photo',
    label: '포토 그린', desc: '자연스럽고 선명한',
    gradient: 'linear-gradient(160deg,#064e3b 0%,#10b981 100%)',
    overlay: 'linear-gradient(to top,rgba(0,0,0,0.58) 0%,transparent 65%)',
    accentColor: '#10b981',
  },
  {
    id: 'photo-rose', ds: 'photo', colorId: 'rose', category: 'photo',
    label: '포토 레드', desc: '강렬하고 임팩트 있는',
    gradient: 'linear-gradient(160deg,#881337 0%,#f43f5e 100%)',
    overlay: 'linear-gradient(to top,rgba(0,0,0,0.58) 0%,transparent 65%)',
    accentColor: '#f43f5e',
  },
  {
    id: 'split-blue', ds: 'split', colorId: 'blue', category: 'split',
    label: '분할 블루', desc: '깔끔한 매거진 스타일', tag: '신규',
    gradient: 'linear-gradient(160deg,#1e3a8a 0%,#3b82f6 100%)',
    overlay: 'linear-gradient(to bottom,transparent 45%,rgba(255,255,255,1) 100%)',
    accentColor: '#3b82f6',
  },
  {
    id: 'split-emerald', ds: 'split', colorId: 'emerald', category: 'split',
    label: '분할 그린', desc: '사진+텍스트 반반',
    gradient: 'linear-gradient(160deg,#064e3b 0%,#10b981 100%)',
    overlay: 'linear-gradient(to bottom,transparent 45%,rgba(255,255,255,1) 100%)',
    accentColor: '#10b981',
  },
  {
    id: 'split-purple', ds: 'split', colorId: 'purple', category: 'split',
    label: '분할 퍼플', desc: '세련된 리스팅 카드',
    gradient: 'linear-gradient(160deg,#3b0764 0%,#a855f7 100%)',
    overlay: 'linear-gradient(to bottom,transparent 45%,rgba(255,255,255,1) 100%)',
    accentColor: '#a855f7',
  },
]

const FILTER_TABS = [
  { id: 'all', label: '전체' },
  { id: 'photo', label: '사진강조' },
  { id: 'split', label: '분할' },
  { id: 'modern', label: '모던' },
  { id: 'luxury', label: '럭셔리' },
  { id: 'minimal', label: '미니멀' },
  { id: 'vivid', label: '비비드' },
]

interface TemplateGalleryProps {
  open: boolean
  onClose: () => void
  currentId: string
  onSelectBuiltin: (ds: DesignStyle, colorId: string, templateId: string) => void
  onSelectCanva: (template: CanvaTemplateSet) => void
  firstPhotoUrl?: string
  canvaTemplates: CanvaTemplateSet[]
  canvaLoading: boolean
}

export function TemplateGallery({
  open, onClose, currentId, onSelectBuiltin, onSelectCanva,
  firstPhotoUrl, canvaTemplates, canvaLoading,
}: TemplateGalleryProps) {
  const [filter, setFilter] = useState('all')

  if (!open) return null

  const hasCanva = canvaTemplates.length > 0 || canvaLoading
  const filteredBuiltin = BUILTIN_TEMPLATES.filter(t =>
    filter === 'all' || t.category === filter
  )
  const showBuiltin = filter !== 'canva'
  const showCanva = filter === 'all' || filter === 'canva'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
      style={{ backdropFilter: 'blur(4px)', background: 'rgba(0,0,0,0.65)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-t-3xl md:rounded-2xl w-full md:max-w-3xl flex flex-col shadow-2xl"
        style={{ maxHeight: '90vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0">
          <div>
            <h2 className="font-bold text-gray-900 text-base">디자인 템플릿</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {BUILTIN_TEMPLATES.length}개 기본 + {canvaTemplates.length}개 Canva
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
          >
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1.5 px-5 py-3 border-b overflow-x-auto flex-shrink-0">
          {FILTER_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={cn(
                'px-3 py-1.5 text-xs rounded-full border font-medium transition-all flex-shrink-0',
                filter === tab.id
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'border-gray-200 text-gray-600 hover:border-gray-400'
              )}
            >{tab.label}</button>
          ))}
          {hasCanva && (
            <button
              onClick={() => setFilter('canva')}
              className={cn(
                'px-3 py-1.5 text-xs rounded-full border font-medium transition-all flex-shrink-0 flex items-center gap-1',
                filter === 'canva'
                  ? 'bg-[#8B5CF6] text-white border-[#8B5CF6]'
                  : 'border-[#8B5CF6]/50 text-[#8B5CF6] hover:border-[#8B5CF6]'
              )}
            >
              <Sparkles size={10} /> Canva
            </button>
          )}
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-5">
          {canvaLoading && showCanva && (
            <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
              <Loader2 size={14} className="animate-spin" />
              Canva 템플릿 불러오는 중...
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {/* Built-in templates */}
            {showBuiltin && filteredBuiltin.map(tmpl => {
              const isSelected = currentId === tmpl.id
              return (
                <button
                  key={tmpl.id}
                  onClick={() => { onSelectBuiltin(tmpl.ds, tmpl.colorId, tmpl.id); onClose() }}
                  className={cn(
                    'rounded-xl overflow-hidden text-left transition-all hover:scale-[1.02] active:scale-[0.98]',
                    isSelected
                      ? 'ring-2 ring-brand-500 ring-offset-2 shadow-lg'
                      : 'shadow-sm hover:shadow-md'
                  )}
                >
                  {/* Thumbnail */}
                  <div className="aspect-square relative overflow-hidden">
                    {firstPhotoUrl && (
                      <img
                        src={firstPhotoUrl}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    )}
                    <div
                      className="absolute inset-0"
                      style={{ background: firstPhotoUrl ? tmpl.overlay : tmpl.gradient }}
                    />
                    {/* Simulated card content */}
                    <div className="absolute inset-0 p-3 flex flex-col justify-end pointer-events-none">
                      <div className="space-y-1 mb-2">
                        <div className="h-2.5 rounded-full bg-white/55 w-3/4" />
                        <div className="h-1.5 rounded-full bg-white/35 w-1/2" />
                        <div className="h-1.5 rounded-full bg-white/25 w-2/3" />
                      </div>
                      <div
                        className="h-5 rounded-full w-16"
                        style={{ background: tmpl.accentColor }}
                      />
                    </div>
                    {/* Tag badge */}
                    {tmpl.tag && (
                      <div
                        className="absolute top-2 left-2 text-[8px] font-black px-1.5 py-0.5 rounded-full text-white shadow"
                        style={{ background: tmpl.accentColor }}
                      >
                        {tmpl.tag}
                      </div>
                    )}
                    {/* Selected indicator */}
                    {isSelected && (
                      <div className="absolute inset-0 flex items-center justify-center bg-brand-600/20">
                        <div className="w-9 h-9 rounded-full bg-brand-600 flex items-center justify-center shadow-xl">
                          <Check size={18} className="text-white" />
                        </div>
                      </div>
                    )}
                  </div>
                  {/* Info */}
                  <div className="px-2.5 py-2 bg-white border-t border-gray-50">
                    <p className="font-semibold text-[11px] text-gray-800 truncate">{tmpl.label}</p>
                    <p className="text-[10px] text-gray-400 truncate mt-0.5">{tmpl.desc}</p>
                  </div>
                </button>
              )
            })}

            {/* Canva templates from DB */}
            {showCanva && canvaTemplates.map(tmpl => {
              const isSelected = currentId === `canva-${tmpl.id}`
              return (
                <button
                  key={tmpl.id}
                  onClick={() => { onSelectCanva(tmpl); onClose() }}
                  className={cn(
                    'rounded-xl overflow-hidden text-left transition-all hover:scale-[1.02] active:scale-[0.98]',
                    isSelected
                      ? 'ring-2 ring-[#8B5CF6] ring-offset-2 shadow-lg'
                      : 'shadow-sm hover:shadow-md'
                  )}
                >
                  <div className="aspect-square relative overflow-hidden bg-gray-100">
                    {tmpl.thumbnail_url ? (
                      <img src={tmpl.thumbnail_url} alt={tmpl.name} className="w-full h-full object-cover" />
                    ) : (
                      <div
                        className="w-full h-full"
                        style={{ background: tmpl.gradient ?? 'linear-gradient(135deg,#8B5CF6,#4F46E5)' }}
                      />
                    )}
                    <div className="absolute top-2 right-2 flex items-center gap-0.5 text-[8px] font-black px-1.5 py-0.5 rounded-full bg-[#8B5CF6] text-white shadow">
                      <Sparkles size={7} /> Canva
                    </div>
                    {isSelected && (
                      <div className="absolute inset-0 flex items-center justify-center bg-[#8B5CF6]/20">
                        <div className="w-9 h-9 rounded-full bg-[#8B5CF6] flex items-center justify-center shadow-xl">
                          <Check size={18} className="text-white" />
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="px-2.5 py-2 bg-white border-t border-gray-50">
                    <p className="font-semibold text-[11px] text-gray-800 truncate">{tmpl.name}</p>
                    <p className="text-[10px] text-gray-400 truncate mt-0.5">{tmpl.description}</p>
                  </div>
                </button>
              )
            })}

            {/* Empty state for Canva filter */}
            {filter === 'canva' && !canvaLoading && canvaTemplates.length === 0 && (
              <div className="col-span-3 py-14 text-center">
                <Sparkles size={36} className="mx-auto mb-3 text-gray-200" />
                <p className="text-sm font-semibold text-gray-400">Canva 템플릿 없음</p>
                <p className="text-xs text-gray-300 mt-1 leading-relaxed">
                  Canva Brand Hub에서 Brand Template을<br />
                  만들고 관리자 화면에서 등록하면<br />
                  여기에 표시됩니다
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
