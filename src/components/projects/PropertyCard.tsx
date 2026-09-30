'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, MapPin } from 'lucide-react'
import { formatPrice, formatArea, getPropertyTypeLabel, isPriceEntered } from '@/lib/utils'
import { formatPriceSourceLabel } from '@/lib/price-source'
import { cn } from '@/lib/utils'
import type { PriceValueType } from '@/lib/types'

interface PropertyCardProps {
  id: string
  address: string
  price?: number
  monthly_rent?: number
  // 값 출처 메타 4필드 — 가격 아래에 출처명·기준일을 함께 노출한다
  value_type?: PriceValueType | null
  source_name?: string | null
  source_date?: string | null
  source_channel?: string | null
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
  value_type,
  source_name,
  source_date,
  source_channel,
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
    ? [cover_image_url, ...images.filter((image) => image !== cover_image_url)]
    : images
  const displayImages = allImages.length > 0 ? allImages : ['/images/default-property.png']
  const hasMultipleImages = displayImages.length > 1
  const href = `/projects/${id}`

  const nextImage = () => setCurrentImage((previous) => (previous + 1) % displayImages.length)
  const previousImage = () =>
    setCurrentImage((previous) => (previous - 1 + displayImages.length) % displayImages.length)

  return (
    <article
      className={cn(
        'group overflow-hidden rounded-xl border bg-white transition-all duration-200',
        isHighlighted
          ? 'border-brand-400 shadow-hover'
          : 'border-slate-200 shadow-card hover:border-brand-300 hover:shadow-hover',
      )}
      onMouseEnter={() => onHover?.(id)}
      onMouseLeave={() => onHover?.(null)}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
        <Link href={href} aria-label={`${address || '매물'} 사진과 상세 정보 보기`} className="absolute inset-0">
          <Image
            src={displayImages[currentImage]}
            alt={address || '매물 사진'}
            fill
            className={cn(
              'object-cover transition-transform duration-500',
              allImages.length > 0 ? 'group-hover:scale-[1.03]' : 'opacity-80',
            )}
            sizes="(max-width: 768px) 100vw, 300px"
          />
        </Link>

        {allImages.length === 0 && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/10">
            <span className="rounded-md bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-card">
              대표사진 없음
            </span>
          </div>
        )}

        {hasMultipleImages && (
          <>
            <button
              type="button"
              onClick={previousImage}
              aria-label="이전 사진"
              className="absolute left-2 top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-lg bg-white/95 text-slate-700 shadow-card transition-colors hover:bg-white focus:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
            >
              <ChevronLeft size={17} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={nextImage}
              aria-label="다음 사진"
              className="absolute right-2 top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-lg bg-white/95 text-slate-700 shadow-card transition-colors hover:bg-white focus:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
            >
              <ChevronRight size={17} aria-hidden="true" />
            </button>
            <div aria-hidden="true" className="absolute bottom-2.5 left-1/2 flex -translate-x-1/2 gap-1">
              {displayImages.map((_, index) => (
                <span
                  key={index}
                  className={cn(
                    'size-1.5 rounded-full transition-colors',
                    index === currentImage ? 'bg-white' : 'bg-white/50',
                  )}
                />
              ))}
            </div>
          </>
        )}

        {status === 'completed' && (
          <span className="absolute left-3 top-3 rounded-md bg-emerald-700 px-2 py-1 text-xs font-semibold text-white">
            완료
          </span>
        )}
        {status === 'draft' && (
          <span className="absolute left-3 top-3 rounded-md bg-slate-800/90 px-2 py-1 text-xs font-semibold text-white">
            작성 중
          </span>
        )}
      </div>

      <div className="p-4">
        <Link href={href} className="block rounded-sm focus-visible:outline-none">
          <h3 className="text-lg font-bold tracking-[-0.03em] text-slate-950">
            {/* 빈 값 표기는 formatPrice 가 PRICE_UNKNOWN_TEXT 한 종으로 통일해 돌려준다 */}
            {formatPrice(price)}
            {isPriceEntered(monthly_rent) ? (
              <span className="ml-1.5 text-sm font-medium text-slate-600">
                {/* monthly_rent 는 원 단위다. 이전에는 원 값에 만원 접미를 그대로 붙여
                    1,500,000원이 백오십만배로 표시되는 단위 버그가 있었다. */}
                / 월 {formatPrice(monthly_rent)}
              </span>
            ) : null}
          </h3>
          {/* 가격 옆에 출처명·기준일을 함께 노출 (값 출처 메타 4필드) */}
          <span className="mt-1 block text-xs font-medium text-slate-700">
            {formatPriceSourceLabel({ value_type, source_name, source_date, source_channel })}
          </span>
          <span className="mt-1.5 flex items-center gap-1 text-sm text-slate-600">
            <MapPin size={13} aria-hidden="true" className="shrink-0 text-slate-500" />
            <span className="truncate">{address}</span>
          </span>
        </Link>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
          {property_type && <span>{getPropertyTypeLabel(property_type)}</span>}
          {area && <span>· {formatArea(area)}</span>}
          {floor && <span>· {floor}층{total_floors ? `/${total_floors}층` : ''}</span>}
          {direction && <span>· {direction}</span>}
        </div>

        {features && features.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {features.slice(0, 3).map((feature) => (
              <span key={feature} className="rounded-md bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-800">
                {feature}
              </span>
            ))}
            {features.length > 3 && (
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                +{features.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
    </article>
  )
}
