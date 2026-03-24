'use client'

import { useEffect, useRef } from 'react'
import type { POIItem, KakaoDensity } from '@/lib/types'

declare global {
  interface Window { kakao: any }
}

interface KakaoMapProps {
  lat: number
  lng: number
  level?: number
  className?: string
  style?: React.CSSProperties
  poiData?: Record<string, POIItem[]> | null
  kakaoDensity?: KakaoDensity | null
  locationAnalysis?: any
  populationData?: any
}

// 카테고리별 마커 이미지 색상 매핑 (임의의 색상/이모지 사용)
const POI_EMOJI: Record<string, string> = {
  subway: '🚇',
  mart: '🛒',
  hospital: '🏥',
  school: '🏫',
  convenience: '🏪',
  pharmacy: '💊',
  culture: '🏛️',
  bank: '🏦',
  cafe: '☕',
  restaurant: '🍽️',
}

export default function KakaoMap({
  lat, lng, level = 4, className, style, poiData, kakaoDensity, locationAnalysis, populationData
}: KakaoMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY

  useEffect(() => {
    if (!appKey || !containerRef.current) return

    const initMap = () => {
      window.kakao.maps.load(() => {
        const container = containerRef.current!
        const center = new window.kakao.maps.LatLng(lat, lng)
        const map = new window.kakao.maps.Map(container, { center, level })

        // 1. 매물 위치 마커
        const marker = new window.kakao.maps.Marker({ position: center, map })
        const infowindow = new window.kakao.maps.InfoWindow({
          content: '<div style="padding:5px 10px;font-size:12px;font-weight:600;white-space:nowrap;color:#1e3a8a;">📍 매물 주변 분석</div>',
        })
        infowindow.open(map, marker)

        // 2. 업종 밀집도 (원 그리기)
        if (kakaoDensity && kakaoDensity.radius_m) {
          const circle = new window.kakao.maps.Circle({
            center: center,
            radius: kakaoDensity.radius_m,
            strokeWeight: 1,
            strokeColor: '#3b82f6', // blue-500
            strokeOpacity: 0.5,
            fillColor: '#60a5fa', // blue-400
            fillOpacity: 0.1
          });
          circle.setMap(map);
        }

        // 3. POI 데이터 마커
        if (poiData) {
          Object.entries(poiData).forEach(([catKey, items]) => {
            const emoji = POI_EMOJI[catKey] || '📍'
            items.forEach((item) => {
              if (item.lat && item.lng) {
                const itemPos = new window.kakao.maps.LatLng(item.lat, item.lng)
                // 커스텀 오버레이로 텍스트/이모지 마커 표시
                const content = document.createElement('div');
                content.className = 'bg-white border text-xs px-1.5 py-0.5 rounded shadow-sm text-gray-700 whitespace-nowrap cursor-pointer hover:bg-gray-50';
                content.innerHTML = `<span class="mr-1">${emoji}</span>${item.name}`;

                const overlay = new window.kakao.maps.CustomOverlay({
                  position: itemPos,
                  content: content,
                  yAnchor: 1
                });
                overlay.setMap(map);
              }
            })
          })
        }
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
  }, [lat, lng, level, appKey, poiData, kakaoDensity, locationAnalysis])

  if (!appKey) {
    return (
      <div className="flex items-center justify-center bg-gray-100 text-gray-400 text-xs rounded-lg" style={style}>
        NEXT_PUBLIC_KAKAO_MAP_API_KEY 미설정
      </div>
    )
  }

  return (
    <div className={`relative ${className || ''}`} style={style}>
      <div ref={containerRef} className="w-full h-full" />
      {populationData && (
        <div className="absolute top-4 right-4 z-10 bg-white/95 backdrop-blur-sm p-3.5 rounded-xl shadow-md border border-brand-100 min-w-[180px]">
          <h4 className="text-xs font-bold text-gray-800 mb-2.5 border-b pb-1.5 flex items-center gap-1">
            <span>👥</span> 배후 인구 분석
          </h4>
          <div className="space-y-2">
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-gray-500">인구 밀도</span>
              <span className="font-semibold text-brand-600">{populationData.density?.toLocaleString()}명/㎢</span>
            </div>
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-gray-500">총 인구</span>
              <span className="font-semibold text-gray-700">{populationData.total_population?.toLocaleString()}명</span>
            </div>
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-gray-500">총 가구 수</span>
              <span className="font-semibold text-gray-700">{populationData.total_households?.toLocaleString()}가구</span>
            </div>
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-gray-500">1인가구 비율</span>
              <span className="font-semibold text-orange-600">
                {populationData.total_households > 0
                  ? ((populationData.single_households / populationData.total_households) * 100).toFixed(1)
                  : 0}%
              </span>
            </div>
          </div>
          {populationData.collected_at && (
            <p className="mt-3 text-[9px] text-gray-400 text-right">SGIS 통계청 기준</p>
          )}
        </div>
      )}
    </div>
  )
}
