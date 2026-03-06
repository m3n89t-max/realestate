'use client'

import { useEffect, useRef, useState } from 'react'
import { formatPrice } from '@/lib/utils'
import { Layers, Map as MapIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
    interface Window {
        kakao: any
    }
}

interface MapProject {
    id: string
    address: string
    lat?: number
    lng?: number
    price?: number
    cover_image_url?: string
}

interface ProjectsMapProps {
    projects: MapProject[]
    highlightedId?: string | null
    onMarkerHover?: (id: string | null) => void
    onMarkerClick?: (id: string) => void
}

export default function ProjectsMap({
    projects,
    highlightedId,
    onMarkerHover,
    onMarkerClick,
}: ProjectsMapProps) {
    const mapRef = useRef<HTMLDivElement>(null)
    const [map, setMap] = useState<any>(null)
    const [isLoaded, setIsLoaded] = useState(false)
    const [showCadastral, setShowCadastral] = useState(false)
    const [mapType, setMapType] = useState<'ROADMAP' | 'SKYVIEW'>('ROADMAP')
    const overlaysRef = useRef<any[]>([])

    // Kakao Map SDK 로드
    useEffect(() => {
        const apiKey = process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY
        if (!apiKey) {
            console.warn('NEXT_PUBLIC_KAKAO_MAP_API_KEY 환경변수가 설정되지 않았습니다.')
            return
        }

        if (typeof window !== 'undefined' && window.kakao?.maps) {
            setIsLoaded(true)
            return
        }

        const script = document.createElement('script')
        script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${apiKey}&autoload=false&libraries=services`
        script.async = true
        script.onload = () => {
            window.kakao.maps.load(() => {
                setIsLoaded(true)
            })
        }
        script.onerror = () => console.error('Kakao Map SDK load failed — 도메인 등록 확인 필요')
        document.head.appendChild(script)
    }, [])

    // 맵 초기화
    useEffect(() => {
        if (!isLoaded || !mapRef.current) return

        const kakaoMaps = window.kakao.maps
        const options = {
            center: new kakaoMaps.LatLng(37.5665, 126.978), // 서울 시청 기본
            level: 8,
        }
        const mapInstance = new kakaoMaps.Map(mapRef.current, options)
        setMap(mapInstance)
    }, [isLoaded])

    // 지도 타입 토글
    useEffect(() => {
        if (!map || !window.kakao?.maps) return

        const kakaoMaps = window.kakao.maps
        if (mapType === 'SKYVIEW') {
            map.setMapTypeId(kakaoMaps.MapTypeId.SKYVIEW)
        } else {
            map.setMapTypeId(kakaoMaps.MapTypeId.ROADMAP)
        }
    }, [map, mapType])

    // 지적도 토글
    useEffect(() => {
        if (!map || !window.kakao?.maps) return

        const kakaoMaps = window.kakao.maps
        if (showCadastral) {
            map.addOverlayMapTypeId(kakaoMaps.MapTypeId.USE_DISTRICT)
        } else {
            map.removeOverlayMapTypeId(kakaoMaps.MapTypeId.USE_DISTRICT)
        }
    }, [map, showCadastral])

    // 마커 (CustomOverlay) 생성
    useEffect(() => {
        if (!map) return
        const kakaoMaps = window.kakao.maps

        // 기존 오버레이 제거
        overlaysRef.current.forEach((o: any) => o.setMap(null))
        overlaysRef.current = []

        const projectsWithCoords = projects.filter(p => p.lat && p.lng)
        if (projectsWithCoords.length === 0) return

        const bounds = new kakaoMaps.LatLngBounds()

        projectsWithCoords.forEach(project => {
            const position = new kakaoMaps.LatLng(project.lat!, project.lng!)
            bounds.extend(position)

            const priceLabel = project.price ? formatPrice(project.price) : '—'
            const isActive = project.id === highlightedId

            const content = document.createElement('div')
            content.innerHTML = `
        <div
          style="
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 700;
            white-space: nowrap;
            cursor: pointer;
            transform: translateY(-50%);
            transition: all 0.2s;
            ${isActive
                    ? 'background: #0284c7; color: white; box-shadow: 0 4px 12px rgba(2, 132, 199, 0.4);'
                    : 'background: white; color: #1f2937; border: 1.5px solid #e5e7eb; box-shadow: 0 2px 8px rgba(0,0,0,0.1);'
                }
          "
        >
          ${priceLabel}
        </div>
      `

            content.addEventListener('mouseenter', () => onMarkerHover?.(project.id))
            content.addEventListener('mouseleave', () => onMarkerHover?.(null))
            content.addEventListener('click', () => onMarkerClick?.(project.id))

            const overlay = new kakaoMaps.CustomOverlay({
                position,
                content,
                yAnchor: 1,
            })
            overlay.setMap(map)
            overlaysRef.current.push(overlay)
        })

        // 바운드에 맞추기
        if (projectsWithCoords.length > 1) {
            map.setBounds(bounds)
        } else {
            map.setCenter(new kakaoMaps.LatLng(projectsWithCoords[0].lat!, projectsWithCoords[0].lng!))
            map.setLevel(5)
        }
    }, [map, projects, highlightedId, onMarkerHover, onMarkerClick])



    const noKey = !process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY

    return (
        <div className="w-full h-full rounded-2xl overflow-hidden relative">
            <div ref={mapRef} className="w-full h-full" />

            {isLoaded && !noKey && (
                <div className="absolute top-4 right-4 z-10 flex gap-2">
                    <button
                        onClick={(e) => {
                            e.stopPropagation()
                            setMapType(prev => prev === 'ROADMAP' ? 'SKYVIEW' : 'ROADMAP')
                        }}
                        className={cn(
                            "flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg shadow-md border text-sm font-medium transition-colors",
                            mapType === 'SKYVIEW'
                                ? "bg-brand-50 border-brand-300 text-brand-700"
                                : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                        )}
                    >
                        <MapIcon size={16} />
                        위성사진
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation()
                            setShowCadastral(!showCadastral)
                        }}
                        className={cn(
                            "flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg shadow-md border text-sm font-medium transition-colors",
                            showCadastral
                                ? "bg-brand-50 border-brand-300 text-brand-700"
                                : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                        )}
                    >
                        <Layers size={16} />
                        지적도
                    </button>
                </div>
            )}

            {!isLoaded && (
                <div className="absolute inset-0 bg-gray-100 flex items-center justify-center">
                    {noKey ? (
                        <div className="text-center p-4">
                            <p className="text-sm font-medium text-gray-500">카카오맵 API 키 미설정</p>
                            <p className="text-xs text-gray-400 mt-1">Vercel 환경변수에 NEXT_PUBLIC_KAKAO_MAP_API_KEY를 추가하세요</p>
                        </div>
                    ) : (
                        <span className="text-sm text-gray-400 animate-pulse">지도 로딩 중...</span>
                    )}
                </div>
            )}
        </div>
    )
}
