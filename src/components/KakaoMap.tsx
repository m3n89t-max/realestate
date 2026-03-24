'use client'

import { useEffect, useRef, useState } from 'react'
import type { POIItem, KakaoDensity } from '@/lib/types'

declare global {
  interface Window { kakao: any; h337: any }
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

// 유동인구 추정 가중치 (TEAM5 spec 기반)
const POI_HEATMAP_WEIGHT: Record<string, number> = {
  subway: 10,
  mart: 7,
  convenience: 5,
  cafe: 4,
  restaurant: 4,
  hospital: 3,
  pharmacy: 3,
  school: 3,
  bank: 2,
  culture: 2,
}

export default function KakaoMap({
  lat, lng, level = 4, className, style, poiData, kakaoDensity, locationAnalysis, populationData
}: KakaoMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const heatmapDivRef = useRef<HTMLDivElement>(null)
  const [showHeatmap, setShowHeatmap] = useState(false)
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

        // 2. 업종 밀집도 원
        if (kakaoDensity && kakaoDensity.radius_m) {
          const circle = new window.kakao.maps.Circle({
            center: center,
            radius: kakaoDensity.radius_m,
            strokeWeight: 1,
            strokeColor: '#3b82f6',
            strokeOpacity: 0.5,
            fillColor: '#60a5fa',
            fillOpacity: 0.1
          })
          circle.setMap(map)
        }

        // 3. 유동인구 히트맵 (heatmap.js + POI 가중치)
        if (poiData && heatmapDivRef.current) {
          const hDiv = heatmapDivRef.current

          const buildHeatmap = () => {
            hDiv.innerHTML = '' // 이전 canvas 제거

            const instance = window.h337.create({
              container: hDiv,
              radius: 55,
              maxOpacity: 0.65,
              minOpacity: 0,
              blur: 0.88,
              gradient: {
                0.2: '#3b82f6',
                0.5: '#06b6d4',
                0.75: '#eab308',
                1.0: '#ef4444',
              },
            })

            // bounds 기반 좌표 변환 (pointFromCoords 대신 — 더 안정적)
            const latlngToPixel = (itemLat: number, itemLng: number, w: number, h: number) => {
              const bounds = map.getBounds()
              const sw = bounds.getSouthWest()
              const ne = bounds.getNorthEast()
              const x = ((itemLng - sw.getLng()) / (ne.getLng() - sw.getLng())) * w
              const y = ((ne.getLat() - itemLat) / (ne.getLat() - sw.getLat())) * h
              return { x: Math.round(x), y: Math.round(y) }
            }

            const render = () => {
              const w = hDiv.offsetWidth
              const h = hDiv.offsetHeight
              const points: { x: number; y: number; value: number }[] = []

              // 매물 위치 자체도 데이터 포인트로 추가 (항상 유효)
              points.push({ ...latlngToPixel(lat, lng, w, h), value: 8 })

              Object.entries(poiData!).forEach(([catKey, items]) => {
                const weight = POI_HEATMAP_WEIGHT[catKey] || 2
                items.forEach(item => {
                  if (item.lat && item.lng) {
                    const pt = latlngToPixel(item.lat, item.lng, w, h)
                    if (pt.x > -80 && pt.x < w + 80 && pt.y > -80 && pt.y < h + 80) {
                      points.push({ ...pt, value: weight })
                    }
                  }
                })
              })

              instance.setData({ max: 10, data: points })
            }

            render()
            window.kakao.maps.event.addListener(map, 'zoom_changed', render)
            window.kakao.maps.event.addListener(map, 'dragend', render)
          }

          if (window.h337) {
            buildHeatmap()
          } else {
            const s = document.createElement('script')
            s.src = 'https://cdn.jsdelivr.net/npm/heatmap.js@2.0.5/build/heatmap.min.js'
            s.onload = buildHeatmap
            document.head.appendChild(s)
          }
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

  const hasPoi = poiData && Object.keys(poiData).length > 0

  return (
    <div className={`relative ${className || ''}`} style={style}>
      <div ref={containerRef} className="w-full h-full" />

      {/* 히트맵 캔버스 오버레이 (항상 DOM에 있어야 heatmap.js 초기화 가능) */}
      <div
        ref={heatmapDivRef}
        style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          pointerEvents: 'none',
          opacity: showHeatmap ? 1 : 0,
          transition: 'opacity 0.4s ease',
          zIndex: 5,
        }}
      />

      {/* 히트맵 토글 버튼 */}
      {hasPoi && (
        <button
          onClick={() => setShowHeatmap(v => !v)}
          className={`absolute bottom-10 left-2 z-20 text-[11px] px-2.5 py-1.5 rounded-full shadow-md border font-medium transition-all ${
            showHeatmap
              ? 'bg-orange-500 text-white border-orange-400'
              : 'bg-white/90 backdrop-blur-sm text-gray-600 border-gray-200 hover:bg-gray-50'
          }`}
        >
          🔥 유동인구 히트맵
        </button>
      )}

      {/* 배후 인구 분석 팝업 */}
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
