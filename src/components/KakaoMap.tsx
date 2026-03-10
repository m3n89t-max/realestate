'use client'

import { useEffect, useRef } from 'react'

declare global {
  interface Window { kakao: any }
}

interface KakaoMapProps {
  lat: number
  lng: number
  level?: number
  className?: string
  style?: React.CSSProperties
}

export default function KakaoMap({ lat, lng, level = 4, className, style }: KakaoMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY

  useEffect(() => {
    if (!appKey || !containerRef.current) return

    const initMap = () => {
      window.kakao.maps.load(() => {
        const container = containerRef.current!
        const center = new window.kakao.maps.LatLng(lat, lng)
        const map = new window.kakao.maps.Map(container, { center, level })

        // 매물 위치 마커
        const marker = new window.kakao.maps.Marker({ position: center, map })

        // 인포윈도우
        const infowindow = new window.kakao.maps.InfoWindow({
          content: '<div style="padding:5px 10px;font-size:12px;font-weight:600;white-space:nowrap">📍 매물 위치</div>',
        })
        infowindow.open(map, marker)
      })
    }

    const existing = document.querySelector('script[src*="dapi.kakao.com/v2/maps"]')
    if (window.kakao?.maps) {
      initMap()
    } else if (existing) {
      existing.addEventListener('load', initMap)
    } else {
      const script = document.createElement('script')
      script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false`
      script.async = true
      script.onload = initMap
      document.head.appendChild(script)
    }
  }, [lat, lng, level, appKey])

  if (!appKey) {
    return (
      <div className="flex items-center justify-center bg-gray-100 text-gray-400 text-xs rounded-lg" style={style}>
        NEXT_PUBLIC_KAKAO_MAP_API_KEY 미설정
      </div>
    )
  }

  return <div ref={containerRef} className={className} style={style} />
}
