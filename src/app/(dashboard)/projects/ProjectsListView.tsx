'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
    Search, Plus, SlidersHorizontal, ArrowUpDown, MapIcon, List, X
} from 'lucide-react'
import PropertyCard from '@/components/projects/PropertyCard'
import ProjectsMap from '@/components/projects/ProjectsMap'
import { cn } from '@/lib/utils'
import type { PropertyType } from '@/lib/types'

interface Project {
    id: string
    address: string
    price?: number
    monthly_rent?: number
    area?: number
    floor?: number
    total_floors?: number
    property_type?: PropertyType
    features?: string[]
    status: string
    cover_image_url?: string
    images: string[]
    direction?: string
    lat?: number
    lng?: number
    created_at: string
}

interface SearchParams {
    status?: string
    type?: string
    q?: string
    sort?: string
    view?: string
}

const STATUS_FILTERS = [
    { value: '', label: '전체' },
    { value: 'draft', label: '작성중' },
    { value: 'active', label: '진행중' },
    { value: 'completed', label: '완료' },
]

const PROPERTY_FILTERS: { value: PropertyType; label: string }[] = [
    { value: 'apartment', label: '아파트' },
    { value: 'officetel', label: '오피스텔' },
    { value: 'villa', label: '빌라' },
    { value: 'commercial', label: '상가' },
    { value: 'land', label: '토지' },
    { value: 'house', label: '주택' },
]

interface ProjectsListViewProps {
    projects: Project[]
    searchParams: SearchParams
}

export default function ProjectsListView({ projects, searchParams }: ProjectsListViewProps) {
    const router = useRouter()
    const [showMap, setShowMap] = useState(true)
    const [highlightedId, setHighlightedId] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState(searchParams.q ?? '')

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault()
        const params = new URLSearchParams()
        if (searchQuery) params.set('q', searchQuery)
        if (searchParams.status) params.set('status', searchParams.status)
        if (searchParams.type) params.set('type', searchParams.type)
        if (searchParams.sort) params.set('sort', searchParams.sort)
        router.push(`/projects?${params.toString()}`)
    }

    const updateFilter = (key: string, value: string) => {
        const params = new URLSearchParams()
        if (searchParams.q) params.set('q', searchParams.q)
        if (searchParams.status) params.set('status', searchParams.status)
        if (searchParams.type) params.set('type', searchParams.type)
        if (searchParams.sort) params.set('sort', searchParams.sort)

        if (value) {
            params.set(key, value)
        } else {
            params.delete(key)
        }
        router.push(`/projects?${params.toString()}`)
    }

    const handleHover = useCallback((id: string | null) => {
        setHighlightedId(id)
    }, [])

    const handleMarkerClick = useCallback((id: string) => {
        router.push(`/projects/${id}`)
    }, [router])

    const sortLabel = searchParams.sort === 'price_asc' ? '낮은 가격순'
        : searchParams.sort === 'price_desc' ? '높은 가격순'
            : '최신순'

    return (
        <div className="px-4 lg:px-6 py-5">
            {/* ────────── 검색 & 필터 바 ────────── */}
            <div className="flex flex-col md:flex-row items-start md:items-center gap-3 mb-5">
                {/* 검색 */}
                <form onSubmit={handleSearch} className="relative w-full md:w-72 flex-shrink-0">
                    <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="주소로 검색..."
                        className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl
                       placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent
                       transition-all duration-200"
                    />
                </form>

                {/* 필터 pills */}
                <div className="flex items-center gap-2 flex-wrap flex-1">
                    {/* 상태 필터 */}
                    {STATUS_FILTERS.map(f => (
                        <button
                            key={f.value}
                            onClick={() => updateFilter('status', f.value)}
                            className={cn(
                                'px-3.5 py-2 rounded-xl text-sm font-medium border transition-all duration-200',
                                (searchParams.status === f.value || (!searchParams.status && f.value === ''))
                                    ? 'bg-gray-900 text-white border-gray-900'
                                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                            )}
                        >
                            {f.label}
                        </button>
                    ))}

                    {/* 구분선 */}
                    <div className="w-px h-6 bg-gray-200 hidden md:block" />

                    {/* 매물유형 필터 */}
                    {PROPERTY_FILTERS.map(f => (
                        <button
                            key={f.value}
                            onClick={() => updateFilter('type', searchParams.type === f.value ? '' : f.value)}
                            className={cn(
                                'px-3.5 py-2 rounded-xl text-sm font-medium border transition-all duration-200',
                                searchParams.type === f.value
                                    ? 'bg-brand-600 text-white border-brand-600'
                                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                            )}
                        >
                            {f.label}
                        </button>
                    ))}

                    {/* 필터 초기화 */}
                    {(searchParams.status || searchParams.type || searchParams.q) && (
                        <button
                            onClick={() => router.push('/projects')}
                            className="px-3 py-2 rounded-xl text-sm text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* ────────── 결과 헤더 ────────── */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <h2 className="text-lg font-bold text-gray-900">
                        {projects.length}개 매물
                    </h2>
                    <Link href="/projects/new" className="btn-primary text-sm !py-2">
                        <Plus size={15} />
                        새 매물
                    </Link>
                </div>

                <div className="flex items-center gap-2">
                    {/* 정렬 */}
                    <button
                        onClick={() => {
                            const next = !searchParams.sort ? 'price_asc'
                                : searchParams.sort === 'price_asc' ? 'price_desc'
                                    : ''
                            updateFilter('sort', next)
                        }}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm text-gray-600 bg-white border border-gray-200 hover:border-gray-300 transition-colors"
                    >
                        <ArrowUpDown size={14} />
                        {sortLabel}
                    </button>

                    {/* 맵 토글 */}
                    <button
                        onClick={() => setShowMap(!showMap)}
                        className={cn(
                            'flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-all duration-200',
                            showMap
                                ? 'bg-brand-50 text-brand-700 border-brand-200'
                                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                        )}
                    >
                        {showMap ? <MapIcon size={14} /> : <List size={14} />}
                        {showMap ? '지도' : '목록'}
                    </button>
                </div>
            </div>

            {/* ────────── 메인 콘텐츠: 리스트 + 지도 ────────── */}
            <div className={cn(
                'flex gap-5',
                showMap ? 'flex-col lg:flex-row' : ''
            )}>
                {/* 좌측: 매물 카드 그리드 */}
                <div className={cn(
                    'flex-1 min-w-0',
                    showMap ? 'lg:w-[55%] lg:flex-none' : ''
                )}>
                    {projects.length === 0 ? (
                        <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
                            <Search size={40} className="mx-auto text-gray-200 mb-4" />
                            <p className="text-gray-600 font-medium">매물이 없습니다</p>
                            <p className="text-sm text-gray-400 mt-1.5">새 매물을 등록하거나 검색 조건을 변경해보세요</p>
                            <Link href="/projects/new" className="btn-primary mt-5 inline-flex">
                                <Plus size={16} />
                                매물 등록하기
                            </Link>
                        </div>
                    ) : (
                        <div className={cn(
                            'grid gap-4',
                            showMap
                                ? 'grid-cols-1 sm:grid-cols-2'
                                : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                        )}>
                            {projects.map(project => (
                                <PropertyCard
                                    key={project.id}
                                    id={project.id}
                                    address={project.address}
                                    price={project.price}
                                    monthly_rent={project.monthly_rent}
                                    area={project.area}
                                    floor={project.floor}
                                    total_floors={project.total_floors}
                                    property_type={project.property_type}
                                    features={project.features}
                                    status={project.status}
                                    cover_image_url={project.cover_image_url}
                                    images={project.images}
                                    direction={project.direction}
                                    onHover={handleHover}
                                    isHighlighted={highlightedId === project.id}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* 우측: 지도 */}
                {showMap && (
                    <div className="lg:flex-1 h-[400px] lg:h-[calc(100vh-220px)] lg:sticky lg:top-[84px] rounded-2xl overflow-hidden">
                        <ProjectsMap
                            projects={projects.map(p => ({
                                id: p.id,
                                address: p.address,
                                lat: p.lat,
                                lng: p.lng,
                                price: p.price,
                                cover_image_url: p.cover_image_url,
                            }))}
                            highlightedId={highlightedId}
                            onMarkerHover={handleHover}
                            onMarkerClick={handleMarkerClick}
                        />
                    </div>
                )}
            </div>
        </div>
    )
}
