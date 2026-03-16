export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import {
  ArrowLeft, MapPin, Home, Share2, Download, Upload
} from 'lucide-react'
import StatusBadge from '@/components/ui/StatusBadge'
import { formatPrice, formatArea, getPropertyTypeLabel } from '@/lib/utils'
import BlogTab from './components/BlogTab'
import CardNewsTab from './components/CardNewsTab'
import DocsTab from './components/DocsTab'
import ShortsTab from './components/ShortsTab'
import TasksTab from './components/TasksTab'
import ProjectActions from './components/ProjectActions'
import PhotoGallery from './components/PhotoGallery'

interface Params {
  id: string
}

const TABS = [
  { id: 'overview', label: '개요' },
  { id: 'blog', label: '블로그 글' },
  { id: 'card_news', label: '카드뉴스' },
  { id: 'shorts', label: '쇼츠' },
  { id: 'docs', label: '서류' },
  { id: 'tasks', label: '작업 현황' },
  { id: 'package', label: '패키지' },
]

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<Params>
  searchParams: Promise<{ tab?: string }>
}) {
  const { id } = await params
  const { tab = 'overview' } = await searchParams

  const supabase = await createClient()
  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .single()

  if (!project) notFound()

  const { data: contents } = await supabase
    .from('generated_contents')
    .select('*')
    .eq('project_id', id)
    .order('created_at', { ascending: false })

  const { data: locationAnalysis } = await supabase
    .from('location_analyses')
    .select('*')
    .eq('project_id', id)
    .single()

  const { data: assets } = await supabase
    .from('assets')
    .select('*')
    .eq('project_id', id)
    .order('sort_order', { ascending: true })

  const { data: documents } = await supabase
    .from('documents')
    .select('*')
    .eq('project_id', id)
    .order('created_at', { ascending: false })

  const blogContents = contents?.filter(c => c.type === 'blog') ?? []
  const cardNewsContents = contents?.filter(c => c.type === 'card_news') ?? []

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 헤더 */}
      <div>
        <Link href="/projects" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-3">
          <ArrowLeft size={14} />
          프로젝트 목록
        </Link>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <StatusBadge status={project.status} />
              {project.property_type && (
                <span className="text-sm text-gray-500">{getPropertyTypeLabel(project.property_type)}</span>
              )}
            </div>
            <h1 className="text-xl font-bold text-gray-900 leading-tight">{project.address}</h1>
            <div className="flex items-center gap-3 mt-1.5 text-sm text-gray-500">
              {project.price && <span className="font-medium text-gray-800">{formatPrice(project.price)}</span>}
              {project.area && <span>{formatArea(project.area)}</span>}
              {project.floor && <span>{project.floor}층 / {project.total_floors}층</span>}
              {project.direction && <span>{project.direction}</span>}
            </div>
          </div>

          {/* 우측 액션 버튼 */}
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
            <ProjectActions projectId={id} currentStatus={project.status} />
            <button className="btn-secondary">
              <Share2 size={14} />
              공유
            </button>
            <button className="btn-secondary">
              <Download size={14} />
              PDF
            </button>
            <Link
              href={`/projects/${id}?tab=blog`}
              className="btn-primary"
            >
              <Upload size={14} />
              네이버 업로드
            </Link>
          </div>
        </div>
      </div>

      {/* 탭 */}
      <div className="border-b border-gray-200">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map(t => (
            <Link
              key={t.id}
              href={`/projects/${id}?tab=${t.id}`}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${tab === t.id
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </div>

      {/* 탭 콘텐츠 */}
      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 좌측: 기본 정보 */}
            <div className="lg:col-span-2 space-y-5">
              {/* 매물 정보 */}
              <div className="card p-5">
                <h3 className="section-title mb-4 flex items-center gap-2">
                  <Home size={16} className="text-brand-500" />
                  매물 정보
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {[
                    { label: '주소', value: project.address },
                    { label: '매물 유형', value: getPropertyTypeLabel(project.property_type ?? '') },
                    { label: '매매가', value: project.price ? formatPrice(project.price) : '—' },
                    { label: '전용면적', value: project.area ? formatArea(project.area) : '—' },
                    { label: '층수', value: project.floor ? `${project.floor}층 / ${project.total_floors}층` : '—' },
                    { label: '방향', value: project.direction ?? '—' },
                  ].map(item => (
                    <div key={item.label}>
                      <p className="text-gray-400 text-xs mb-0.5">{item.label}</p>
                      <p className="font-medium text-gray-800">{item.value}</p>
                    </div>
                  ))}
                </div>
                {project.features && project.features.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <p className="text-xs text-gray-400 mb-2">특징</p>
                    <div className="flex flex-wrap gap-1.5">
                      {project.features.map((f: string) => (
                        <span key={f} className="px-2.5 py-1 bg-brand-50 text-brand-700 text-xs rounded-full">
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 입지 분석 */}
              {locationAnalysis?.advantages && (
                <div className="card p-5">
                  <h3 className="section-title mb-4 flex items-center gap-2">
                    <MapPin size={16} className="text-brand-500" />
                    입지 분석
                  </h3>
                  <ul className="space-y-2">
                    {locationAnalysis.advantages.map((adv: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="w-5 h-5 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        <span className="text-gray-700">{adv}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* 우측: 생성 현황 */}
            <div className="space-y-4">
              <div className="card p-5">
                <h3 className="section-title mb-4">생성 현황</h3>
                <div className="space-y-3">
                  {[
                    { label: '블로그 글', count: blogContents.length, tab: 'blog', color: 'bg-blue-500' },
                    { label: '카드뉴스', count: cardNewsContents.length, tab: 'card_news', color: 'bg-purple-500' },
                    { label: '서류', count: (documents ?? []).length, tab: 'docs', color: 'bg-green-500' },
                  ].map(item => (
                    <Link
                      key={item.label}
                      href={`/projects/${id}?tab=${item.tab}`}
                      className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${item.color}`} />
                        <span className="text-sm text-gray-700">{item.label}</span>
                      </div>
                      <span className={`text-sm font-medium ${item.count > 0 ? 'text-brand-600' : 'text-gray-400'}`}>
                        {item.count > 0 ? `${item.count}건` : '미생성'}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 하단: 업로드된 사진 전체 갤러리 */}
          <PhotoGallery assets={assets || []} />
        </div>
      )}

      {tab === 'blog' && (
        <BlogTab projectId={id} contents={blogContents} />
      )}

      {tab === 'card_news' && (
        <CardNewsTab projectId={id} contents={cardNewsContents} />
      )}

      {tab === 'docs' && (
        <DocsTab projectId={id} documents={documents ?? []} />
      )}

      {tab === 'shorts' && (
        <ShortsTab projectId={id} />
      )}

      {tab === 'tasks' && (
        <TasksTab projectId={id} />
      )}

      {tab === 'package' && (
        <div className="card p-8 text-center">
          <Download size={40} className="mx-auto text-gray-200 mb-3" />
          <p className="text-gray-600 font-medium">거래 서류팩 자동 생성</p>
          <p className="text-sm text-gray-400 mt-1">건축물대장 + 서류 요약 + 마케팅 자료를 하나의 PDF로 병합합니다</p>
          <button className="btn-primary mt-4">
            <Download size={16} />
            패키지 PDF 생성
          </button>
        </div>
      )}
    </div>
  )
}
