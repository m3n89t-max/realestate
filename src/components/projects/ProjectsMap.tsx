'use client'

import { useEffect, useRef, useState } from 'react'
import { formatPrice } from '@/lib/utils'

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
    const overlaysRef = useRef<any[]>([])

    // Kakao Map SDK 로드
    useEffect(() => {
        const apiKey = process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY
        if (!apiKey || apiKey === 'YOUR_KAKAO_MAP_API_KEY_HERE') {
            setIsLoaded(false)
            return
        }

        if (typeof window !== 'undefined' && window.kakao?.maps) {
            setIsLoaded(true)
            return
        }

        const script = document.createElement('script')
        script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${apiKey}&autoload=false`
        script.async = true
        script.onload = () => {
            window.kakao.maps.load(() => {
                setIsLoaded(true)
            })
        }
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

    // API 키가 없을 때 placeholder
    if (!process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY || process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY === 'YOUR_KAKAO_MAP_API_KEY_HERE') {
        return (
            <div className="w-full h-full bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl flex flex-col items-center justify-center text-center p-6">
                <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mb-4">
                    <svg viewBox="0 0 24 24" className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                    </svg>
                </div>
                <p className="text-sm font-medium text-blue-700">카카오맵 API 키 필요</p>
                <p className="text-xs text-blue-500 mt-1 max-w-[200px]">
                    .env.local 파일에 NEXT_PUBLIC_KAKAO_MAP_API_KEY를 설정해주세요
                </p>
            </div>
        )
    }

    return (
        <div className="w-full h-full rounded-2xl overflow-hidden relative">
            <div ref={mapRef} className="w-full h-full" />
            {!isLoaded && (
                <div className="absolute inset-0 bg-gray-100 animate-pulse flex items-center justify-center">
                    <span className="text-sm text-gray-400">지도 로딩 중...</span>
                </div>
            )}
        </div>
    )
}
