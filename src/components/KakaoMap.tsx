'use client'

import { useEffect, useRef, useState } from 'react'
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
  commercialData?: any
}

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

// 네이티브 Canvas 히트맵 렌더러 (heatmap.js 불필요)
function drawHeatmap(
  canvas: HTMLCanvasElement,
  points: { x: number; y: number; value: number }[]
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  points.forEach(({ x, y, value }) => {
    const radius = 50 + value * 4
    const alpha = 0.12 + (value / 10) * 0.35
    const grad = ctx.createRadialGradient(x, y, 0, x, y, radius)
    grad.addColorStop(0,   `rgba(239,68,68,${alpha})`)
    grad.addColorStop(0.4, `rgba(234,179,8,${alpha * 0.7})`)
    grad.addColorStop(0.75,`rgba(59,130,246,${alpha * 0.4})`)
    grad.addColorStop(1,   'rgba(59,130,246,0)')
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fillStyle = grad
    ctx.fill()
  })
}

export default function KakaoMap({
  lat, lng, level = 4, className, style, poiData, kakaoDensity, locationAnalysis, populationData, commercialData
}: KakaoMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const mapRef          = useRef<any>(null)
  const popCircleRef    = useRef<any>(null)
  const popLabelRef     = useRef<any>(null)
  const flpopCircleRef  = useRef<any>(null)
  const flpopLabelRef   = useRef<any>(null)
  const kakaoDensityRef = useRef(kakaoDensity)
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [mapReady, setMapReady] = useState(false)
  const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY

  // kakaoDensity ref 동기화
  useEffect(() => { kakaoDensityRef.current = kakaoDensity }, [kakaoDensity])

  // ── Effect 1: 지도 초기화 + 히트맵 (poiData / kakaoDensity 변경 시)
  useEffect(() => {
    if (!appKey || !containerRef.current) return

    const initMap = () => {
      window.kakao.maps.load(() => {
        const container = containerRef.current!
        const center = new window.kakao.maps.LatLng(lat, lng)
        const map = new window.kakao.maps.Map(container, { center, level })
        mapRef.current = map
        setMapReady(true)

        // 1. 매물 위치 마커
        const marker = new window.kakao.maps.Marker({ position: center, map })
        const infowindow = new window.kakao.maps.InfoWindow({
          content: '<div style="padding:5px 10px;font-size:12px;font-weight:600;white-space:nowrap;color:#1e3a8a;">📍 매물 주변 분석</div>',
        })
        infowindow.open(map, marker)

        // 2. 업종 밀집도 원 (파란 실선)
        if (kakaoDensity?.radius_m) {
          new window.kakao.maps.Circle({
            map,
            center,
            radius: kakaoDensity.radius_m,
            strokeWeight: 1,
            strokeColor: '#3b82f6',
            strokeOpacity: 0.5,
            fillColor: '#60a5fa',
            fillOpacity: 0.1,
          }).setMap(map)
        }

        // 3. 시설 밀집도 히트맵 (네이티브 Canvas)
        const canvas = canvasRef.current
        if (!canvas || !poiData) return

        const toPixel = (iLat: number, iLng: number) => {
          const b  = map.getBounds()
          const sw = b.getSouthWest()
          const ne = b.getNorthEast()
          const w  = canvas.width
          const h  = canvas.height
          return {
            x: Math.round(((iLng - sw.getLng()) / (ne.getLng() - sw.getLng())) * w),
            y: Math.round(((ne.getLat() - iLat)  / (ne.getLat() - sw.getLat()))  * h),
          }
        }

        const render = () => {
          canvas.width  = container.offsetWidth
          canvas.height = container.offsetHeight
          const points: { x: number; y: number; value: number }[] = []
          Object.entries(poiData!).forEach(([cat, items]) => {
            const w = POI_HEATMAP_WEIGHT[cat] || 2
            items.forEach(item => {
              if (item.lat && item.lng) {
                const pt = toPixel(item.lat, item.lng)
                if (pt.x > -80 && pt.x < canvas.width + 80 && pt.y > -80 && pt.y < canvas.height + 80) {
                  points.push({ ...pt, value: w })
                }
              }
            })
          })
          drawHeatmap(canvas, points)
        }

        render()
        window.kakao.maps.event.addListener(map, 'zoom_changed', render)
        window.kakao.maps.event.addListener(map, 'dragend', render)
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

  // ── Effect 2: 배후 인구 원 (mapRef 준비 후 populationData 변경 시)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !window.kakao?.maps) return

    // 기존 원/라벨 제거
    if (popCircleRef.current) { popCircleRef.current.setMap(null); popCircleRef.current = null }
    if (popLabelRef.current)  { popLabelRef.current.setMap(null);  popLabelRef.current  = null }

    if (!populationData?.total_population || !populationData?.density || populationData.density <= 0) return

    const center = new window.kakao.maps.LatLng(lat, lng)
    // 반경: kakaoDensity 분석반경의 1.5배, 없으면 700m 고정 (행정구역 면적 기반 계산은 너무 광범위)
    const baseRadius = kakaoDensityRef.current?.radius_m ?? 700
    const clampedRadius = Math.round(Math.min(baseRadius * 1.5, 2000))

    const density = populationData.density
    const color = density > 5000 ? '#ef4444' : density > 1000 ? '#f97316' : '#22c55e'

    const circle = new window.kakao.maps.Circle({
      map,
      center,
      radius: clampedRadius,
      strokeWeight: 2,
      strokeColor: color,
      strokeOpacity: 0.7,
      strokeStyle: 'dashed',
      fillColor: color,
      fillOpacity: 0.06,
    })
    circle.setMap(map)
    popCircleRef.current = circle

    const labelPos = new window.kakao.maps.LatLng(
      lat + (clampedRadius / 111_000) * 0.85,
      lng
    )
    const label = new window.kakao.maps.CustomOverlay({
      map,
      position: labelPos,
      content: `<div style="background:${color};color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:99px;white-space:nowrap;opacity:0.9;">👥 ${(populationData.total_population / 10000).toFixed(1)}만명</div>`,
      yAnchor: 1,
    })
    label.setMap(map)
    popLabelRef.current = label
  }, [populationData, lat, lng, mapReady])

  // ── Effect 3: 유동인구 원 (commercial_data.floating_population)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !window.kakao?.maps) return

    if (flpopCircleRef.current) { flpopCircleRef.current.setMap(null); flpopCircleRef.current = null }
    if (flpopLabelRef.current)  { flpopLabelRef.current.setMap(null);  flpopLabelRef.current  = null }

    const fp = commercialData?.floating_population
    if (!fp?.weekday) return

    const center = new window.kakao.maps.LatLng(lat, lng)
    const radius = kakaoDensityRef.current?.radius_m ?? 500  // 상권 분석 반경 그대로 사용

    // 유동인구 수에 따른 색상: 고(>10000) 보라, 중(2000-10000) 파랑, 저(<2000) 하늘
    const color = fp.weekday > 10000 ? '#7c3aed' : fp.weekday > 2000 ? '#2563eb' : '#0891b2'

    const circle = new window.kakao.maps.Circle({
      map, center, radius,
      strokeWeight: 2,
      strokeColor: color,
      strokeOpacity: 0.8,
      strokeStyle: 'shortdot',
      fillColor: color,
      fillOpacity: 0.08,
    })
    circle.setMap(map)
    flpopCircleRef.current = circle

    // 피크 시간대 계산
    const hourLabels = ['0-6시', '6-11시', '11-14시', '14-17시', '17-21시', '21-24시']
    const peakIdx = fp.by_hour ? fp.by_hour.indexOf(Math.max(...fp.by_hour)) : -1
    const peakLabel = peakIdx >= 0 ? hourLabels[peakIdx] : ''

    const labelPos = new window.kakao.maps.LatLng(lat - (radius / 111_000) * 0.85, lng)
    const label = new window.kakao.maps.CustomOverlay({
      map,
      position: labelPos,
      content: `<div style="background:${color};color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px;white-space:nowrap;opacity:0.92;display:flex;align-items:center;gap:4px;">🚶 주중 ${fp.weekday.toLocaleString()}명${peakLabel ? ` · 피크 ${peakLabel}` : ''}</div>`,
      yAnchor: 0,
    })
    label.setMap(map)
    flpopLabelRef.current = label
  }, [commercialData, lat, lng, mapReady])

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

      {/* 히트맵 캔버스 오버레이 */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute', top: 0, left: 0,
          width: '100%', height: '100%',
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

      {/* 히트맵 색상 범례 */}
      {hasPoi && showHeatmap && (
        <div className="absolute bottom-10 left-28 z-20 bg-white/90 backdrop-blur-sm px-2.5 py-1.5 rounded-xl shadow-md border border-gray-200 text-[10px] text-gray-600">
          <div className="flex items-center gap-1.5 mb-1 font-medium text-gray-500">유동인구 밀집도</div>
          <div className="flex items-center gap-1">
            <div className="flex gap-0.5">
              <span className="w-3 h-3 rounded-sm" style={{background:'rgba(239,68,68,0.8)'}} />
              <span className="w-3 h-3 rounded-sm" style={{background:'rgba(234,179,8,0.6)'}} />
              <span className="w-3 h-3 rounded-sm" style={{background:'rgba(59,130,246,0.4)'}} />
            </div>
            <span className="text-gray-400">높음 → 낮음</span>
          </div>
          <p className="mt-1 text-[9px] text-gray-400">지하철·마트·편의점 등 집객시설 기반 추정</p>
        </div>
      )}

      {/* 배후 인구 분석 팝업 */}
      {populationData && (
        <div className="absolute top-4 right-4 z-10 bg-white/95 backdrop-blur-sm p-3.5 rounded-xl shadow-md border border-brand-100 min-w-[180px]">
          <h4 className="text-xs font-bold text-gray-800 mb-1 flex items-center gap-1">
            <span>👥</span> 배후 인구 분석
          </h4>
          <p className="text-[9px] text-blue-500 mb-2 pb-1.5 border-b border-gray-100">
            {populationData.adm_nm
              ? `${populationData.adm_nm} (${populationData.adm_level || '시군구'} 기준)`
              : '시군구 행정구역 기준'}
          </p>
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
