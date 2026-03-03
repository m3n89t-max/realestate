'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, MapPin, Maximize2 } from 'lucide-react'
import { formatPrice, formatArea, getPropertyTypeLabel } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface PropertyCardProps {
    id: string
    address: string
    price?: number
    monthly_rent?: number
    area?: number
    floor?: number
    total_floors?: number
    property_type?: string
    features?: string[]
    status: string
    cover_image_url?: string
    images?: string[]
    direction?: string
    onHover?: (id: string | null) => void
    isHighlighted?: boolean
}

export default function PropertyCard({
    id,
    address,
    price,
    monthly_rent,
    area,
    floor,
    total_floors,
    property_type,
    features,
    status,
    cover_image_url,
    images = [],
    direction,
    onHover,
    isHighlighted = false,
}: PropertyCardProps) {
    const [currentImage, setCurrentImage] = useState(0)
    const allImages = cover_image_url
        ? [cover_image_url, ...images.filter(img => img !== cover_image_url)]
        : images

    const hasMultipleImages = allImages.length > 1

    const nextImage = (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setCurrentImage(prev => (prev + 1) % allImages.length)
    }

    const prevImage = (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setCurrentImage(prev => (prev - 1 + allImages.length) % allImages.length)
    }

    return (
        <Link
            href={`/projects/${id}`}
            className={cn(
                'group block rounded-2xl bg-white border transition-all duration-300',
                isHighlighted
                    ? 'border-brand-400 shadow-lg shadow-brand-100 scale-[1.02]'
                    : 'border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200'
            )}
            onMouseEnter={() => onHover?.(id)}
            onMouseLeave={() => onHover?.(null)}
        >
            {/* 이미지 영역 */}
            <div className="relative aspect-[4/3] rounded-t-2xl overflow-hidden bg-gray-100">
                {allImages.length > 0 ? (
                    <Image
                        src={allImages[currentImage]}
                        alt={address}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-500"
                        sizes="(max-width: 768px) 100vw, 300px"
                    />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
                        <Maximize2 size={32} className="text-gray-300" />
                    </div>
                )}

                {/* 이미지 네비게이션 */}
                {hasMultipleImages && (
                    <>
                        <button
                            onClick={prevImage}
                            className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/90 hover:bg-white flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            <ChevronLeft size={14} className="text-gray-700" />
                        </button>
                        <button
                            onClick={nextImage}
                            className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/90 hover:bg-white flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            <ChevronRight size={14} className="text-gray-700" />
                        </button>
                        {/* 인디케이터 */}
                        <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex gap-1">
                            {allImages.map((_, i) => (
                                <span
                                    key={i}
                                    className={cn(
                                        'w-1.5 h-1.5 rounded-full transition-colors',
                                        i === currentImage ? 'bg-white' : 'bg-white/50'
                                    )}
                                />
                            ))}
                        </div>
                    </>
                )}

                {/* 상태 배지 */}
                {status === 'completed' && (
                    <span className="absolute top-3 left-3 px-2.5 py-1 bg-emerald-500 text-white text-xs font-semibold rounded-full">
                        완료
                    </span>
                )}
                {status === 'draft' && (
                    <span className="absolute top-3 left-3 px-2.5 py-1 bg-gray-700/80 text-white text-xs font-semibold rounded-full">
                        작성중
                    </span>
                )}
            </div>

            {/* 카드 정보 */}
            <div className="p-4">
                {/* 가격 */}
                <p className="text-lg font-bold text-gray-900">
                    {price ? formatPrice(price) : '가격 미정'}
                    {monthly_rent ? (
                        <span className="text-sm font-medium text-gray-400 ml-1.5">/ 월 {monthly_rent.toLocaleString()}만</span>
                    ) : null}
                </p>

                {/* 주소 */}
                <div className="flex items-center gap-1 mt-1.5">
                    <MapPin size={13} className="text-gray-400 flex-shrink-0" />
                    <p className="text-sm text-gray-500 truncate">{address}</p>
                </div>

                {/* 스펙 */}
                <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                    {property_type && (
                        <span>{getPropertyTypeLabel(property_type)}</span>
                    )}
                    {area && (
                        <>
                            <span className="w-0.5 h-0.5 rounded-full bg-gray-300" />
                            <span>{formatArea(area)}</span>
                        </>
                    )}
                    {floor && (
                        <>
                            <span className="w-0.5 h-0.5 rounded-full bg-gray-300" />
                            <span>{floor}층{total_floors ? `/${total_floors}층` : ''}</span>
                        </>
                    )}
                    {direction && (
                        <>
                            <span className="w-0.5 h-0.5 rounded-full bg-gray-300" />
                            <span>{direction}</span>
                        </>
                    )}
                </div>

                {/* 특징 태그 */}
                {features && features.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-3">
                        {features.slice(0, 3).map(f => (
                            <span key={f} className="px-2 py-0.5 bg-brand-50 text-brand-600 text-[11px] font-medium rounded-md">
                                {f}
                            </span>
                        ))}
                        {features.length > 3 && (
                            <span className="px-2 py-0.5 bg-gray-50 text-gray-400 text-[11px] font-medium rounded-md">
                                +{features.length - 3}
                            </span>
                        )}
                    </div>
                )}
            </div>
        </Link>
    )
}
