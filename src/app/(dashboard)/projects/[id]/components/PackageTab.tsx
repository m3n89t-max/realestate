'use client'

import { useState } from 'react'
import {
  Download, FileText, Image as ImageIcon, Video, CheckCircle,
  Package, ExternalLink, Copy, Check
} from 'lucide-react'
import type { GeneratedContent, Document } from '@/lib/types'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'

interface PackageTabProps {
  projectId: string
  project: any
  blogContents: GeneratedContent[]
  cardNewsContents: GeneratedContent[]
  documents: Document[]
  assets: any[]
}

export default function PackageTab({
  project,
  blogContents,
  cardNewsContents,
  documents,
  assets,
}: PackageTabProps) {
  const [copied, setCopied] = useState<string | null>(null)

  const latestBlog = blogContents[0]
  const latestCard = cardNewsContents[0]
  const buildingDoc = documents.find(d => d.type === 'building_register')
  const cadastralDoc = documents.find(d => d.type === 'cadastral_map')
  const coverAsset = assets.find(a => a.is_cover) ?? assets[0]

  const copyText = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(key)
    toast.success('복사되었습니다')
    setTimeout(() => setCopied(null), 2000)
  }

  const items = [
    {
      key: 'blog',
      label: '블로그 SEO 글',
      icon: FileText,
      color: 'text-blue-500 bg-blue-50',
      available: !!latestBlog,
      description: latestBlog ? `${latestBlog.title ?? '제목 없음'} · ${latestBlog.content?.length ?? 0}자` : '아직 생성되지 않았습니다',
      actions: latestBlog ? [
        {
          label: '본문 복사',
          icon: Copy,
          onClick: () => copyText(latestBlog.content ?? '', 'blog_content'),
          active: copied === 'blog_content',
        },
      ] : [],
    },
    {
      key: 'card_news',
      label: '인스타 카드뉴스',
      icon: ImageIcon,
      color: 'text-pink-500 bg-pink-50',
      available: !!latestCard,
      description: latestCard ? `${latestCard.content ? JSON.parse(latestCard.content as any)?.cards?.length ?? 6 : 6}장 생성됨` : '아직 생성되지 않았습니다',
      actions: [],
    },
    {
      key: 'building',
      label: '건축물대장',
      icon: FileText,
      color: 'text-gray-500 bg-gray-50',
      available: !!buildingDoc,
      description: buildingDoc ? `수집일: ${new Date(buildingDoc.created_at).toLocaleDateString('ko-KR')}` : '아직 수집되지 않았습니다',
      actions: buildingDoc?.file_url ? [
        {
          label: '다운로드',
          icon: Download,
          onClick: () => window.open(buildingDoc.file_url!, '_blank'),
          active: false,
        },
      ] : [],
    },
    {
      key: 'cadastral',
      label: '지적도',
      icon: ImageIcon,
      color: 'text-emerald-500 bg-emerald-50',
      available: !!cadastralDoc,
      description: cadastralDoc ? `수집일: ${new Date(cadastralDoc.created_at).toLocaleDateString('ko-KR')}` : '아직 수집되지 않았습니다',
      actions: cadastralDoc?.file_url ? [
        {
          label: '열기',
          icon: ExternalLink,
          onClick: () => window.open(cadastralDoc.file_url!, '_blank'),
          active: false,
        },
      ] : [],
    },
    {
      key: 'photos',
      label: `매물 사진 (${assets.length}장)`,
      icon: ImageIcon,
      color: 'text-orange-500 bg-orange-50',
      available: assets.length > 0,
      description: assets.length > 0 ? `대표사진 포함 총 ${assets.length}장` : '등록된 사진이 없습니다',
      actions: [],
    },
  ]

  const availableCount = items.filter(i => i.available).length

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="card p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 bg-brand-50 rounded-xl flex items-center justify-center">
            <Package size={20} className="text-brand-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">마케팅 패키지</h2>
            <p className="text-xs text-gray-500">{project.address}</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-2xl font-bold text-brand-600">{availableCount}<span className="text-sm text-gray-400">/{items.length}</span></p>
            <p className="text-xs text-gray-500">항목 준비됨</p>
          </div>
        </div>

        {/* 진행바 */}
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div
            className="bg-brand-500 h-2 rounded-full transition-all"
            style={{ width: `${(availableCount / items.length) * 100}%` }}
          />
        </div>
        <p className="text-xs text-gray-400 mt-1.5">{availableCount === items.length ? '모든 항목이 준비되었습니다 ✓' : `${items.length - availableCount}개 항목이 아직 준비되지 않았습니다`}</p>
      </div>

      {/* 항목 목록 */}
      <div className="space-y-3">
        {items.map(item => {
          const Icon = item.icon
          return (
            <div key={item.key} className={cn('card p-4 flex items-center gap-4', !item.available && 'opacity-60')}>
              <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', item.color)}>
                <Icon size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800">{item.label}</p>
                <p className="text-xs text-gray-400 truncate">{item.description}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {item.available
                  ? <CheckCircle size={16} className="text-green-500" />
                  : <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
                }
                {item.actions.map((action, i) => {
                  const ActionIcon = action.icon
                  return (
                    <button
                      key={i}
                      onClick={action.onClick}
                      className="btn-secondary py-1.5 text-xs"
                    >
                      {action.active ? <Check size={12} className="text-green-500" /> : <ActionIcon size={12} />}
                      {action.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* 대표사진 미리보기 */}
      {coverAsset && (
        <div className="card p-4">
          <p className="text-sm font-semibold text-gray-700 mb-3">대표사진</p>
          <img
            src={coverAsset.file_url}
            alt="대표사진"
            className="w-full max-h-64 object-cover rounded-lg"
          />
        </div>
      )}

      {/* 블로그 제목 미리보기 */}
      {latestBlog?.titles && Array.isArray(latestBlog.titles) && latestBlog.titles.length > 0 && (
        <div className="card p-4 space-y-2">
          <p className="text-sm font-semibold text-gray-700 mb-3">블로그 제목 후보</p>
          {(latestBlog.titles as string[]).map((title, i) => (
            <div key={i} className="flex items-center justify-between gap-2 p-2.5 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-700 flex-1 min-w-0 truncate">{title}</p>
              <button
                onClick={() => copyText(title, `title_${i}`)}
                className="flex-shrink-0 p-1.5 hover:bg-gray-200 rounded transition-colors"
              >
                {copied === `title_${i}` ? <Check size={12} className="text-green-500" /> : <Copy size={12} className="text-gray-400" />}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 해시태그 */}
      {latestBlog?.tags && Array.isArray(latestBlog.tags) && latestBlog.tags.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-gray-700">해시태그 ({(latestBlog.tags as string[]).length}개)</p>
            <button
              onClick={() => copyText((latestBlog.tags as string[]).join(' '), 'hashtags')}
              className="btn-secondary py-1.5 text-xs"
            >
              {copied === 'hashtags' ? <Check size={12} /> : <Copy size={12} />}
              전체 복사
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(latestBlog.tags as string[]).map((tag, i) => (
              <span key={i} className="px-2 py-1 bg-brand-50 text-brand-600 text-xs rounded-full">
                {tag.startsWith('#') ? tag : `#${tag}`}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
