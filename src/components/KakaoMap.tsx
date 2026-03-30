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
  cardData?: any
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
  lat, lng, level = 4, className, style, poiData, kakaoDensity, locationAnalysis, populationData, commercialData, cardData
}: KakaoMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const mapRef          = useRef<any>(null)
  const popCircleRef    = useRef<any>(null)
  const popLabelRef     = useRef<any>(null)
  const flpopCircleRef  = useRef<any>(null)
  const flpopLabelRef   = useRef<any>(null)
  const cardOverlayRef  = useRef<any>(null)
  const cardNoDataRef   = useRef<any>(null)
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

        // 3. 유동인구 히트맵 (네이티브 Canvas) — POI + kakaoDensity 아이템 좌표 활용
        const canvas = canvasRef.current
        if (!canvas) return

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
          const w = container.offsetWidth
          const h = container.offsetHeight
          if (!w || !h) return  // 컨테이너 미준비 시 스킵
          canvas.width  = w
          canvas.height = h
          const points: { x: number; y: number; value: number }[] = []

          // POI 데이터 포인트
          if (poiData) {
            Object.entries(poiData).forEach(([cat, items]) => {
              const weight = POI_HEATMAP_WEIGHT[cat] || 2
              items.forEach(item => {
                if (item.lat && item.lng) {
                  const pt = toPixel(item.lat, item.lng)
                  if (pt.x > -80 && pt.x < canvas.width + 80 && pt.y > -80 && pt.y < canvas.height + 80) {
                    points.push({ ...pt, value: weight })
                  }
                }
              })
            })
          }

          // kakaoDensity 아이템 포인트 (업종별 개별 시설 좌표)
          if (kakaoDensityRef.current?.categories) {
            Object.entries(kakaoDensityRef.current.categories).forEach(([, cat]: [string, any]) => {
              (cat.items || []).forEach((item: any) => {
                if (item.lat && item.lng) {
                  const pt = toPixel(item.lat, item.lng)
                  if (pt.x > -80 && pt.x < canvas.width + 80 && pt.y > -80 && pt.y < canvas.height + 80) {
                    points.push({ ...pt, value: 3 })
                  }
                }
              })
            })
          }

          drawHeatmap(canvas, points)
        }

        // 컨테이너 레이아웃 완료 후 렌더 (requestAnimationFrame)
        requestAnimationFrame(render)
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
    // 배후인구 반경: 500m 고정 (업종밀집도와 같은 분석범위)
    const popRadius = 500

    const density = populationData.density
    const color = density > 5000 ? '#ef4444' : density > 1000 ? '#f97316' : '#22c55e'

    const circle = new window.kakao.maps.Circle({
      map,
      center,
      radius: popRadius,
      strokeWeight: 2,
      strokeColor: color,
      strokeOpacity: 0.6,
      strokeStyle: 'dashed',
      fillColor: color,
      fillOpacity: 0.05,
    })
    circle.setMap(map)
    popCircleRef.current = circle

    // 라벨은 원 위쪽에 배치
    const labelPos = new window.kakao.maps.LatLng(
      lat + (popRadius / 111_000) * 0.9,
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

  // ── Effect 3: 유동인구 원 (cardData 우선, fallback: commercial_data.floating_population)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !window.kakao?.maps) return

    if (flpopCircleRef.current) { flpopCircleRef.current.setMap(null); flpopCircleRef.current = null }
    if (flpopLabelRef.current)  { flpopLabelRef.current.setMap(null);  flpopLabelRef.current  = null }

    // cardData 우선 사용, 없으면 commercialData fallback
    const useCard = cardData?.has_data && cardData?.floating_population?.weekday
    const weekdayCount: number = useCard
      ? cardData.floating_population.weekday
      : (commercialData?.floating_population?.weekday ?? 0)
    const byHour: number[] | undefined = useCard
      ? cardData.floating_population.by_hour
      : commercialData?.floating_population?.by_hour
    const peakTimeLabel: string | undefined = useCard
      ? cardData.floating_population.peak_time
      : undefined

    if (!weekdayCount) return

    const center = new window.kakao.maps.LatLng(lat, lng)
    const flRadius = 300

    // 카드/상권 기반 티어별 색상 (🔥 핫 = 빨강, 🟡 보통 = 주황, 💤 한산 = 회색)
    const isHot    = useCard ? weekdayCount > 3000  : weekdayCount > 10000
    const isNormal = useCard ? weekdayCount > 500   : weekdayCount > 2000
    const color        = isHot ? '#dc2626' : isNormal ? '#d97706' : '#94a3b8'
    const strokeWeight = isHot ? 3 : isNormal ? 2 : 1.5
    const fillOpacity  = isHot ? 0.18 : isNormal ? 0.1 : 0.04

    const circle = new window.kakao.maps.Circle({
      map, center, radius: flRadius,
      strokeWeight,
      strokeColor: color,
      strokeOpacity: 0.95,
      strokeStyle: isHot ? 'solid' : isNormal ? 'solid' : 'dashed',
      fillColor: color,
      fillOpacity,
    })
    circle.setMap(map)
    flpopCircleRef.current = circle

    // 피크 시간대 계산
    let peakLabel = peakTimeLabel ?? ''
    if (!peakLabel && byHour && byHour.length > 0) {
      const hourLabels = ['0-6시', '6-11시', '11-14시', '14-17시', '17-21시', '21-24시']
      const peakIdx = byHour.indexOf(Math.max(...byHour))
      peakLabel = peakIdx >= 0 ? hourLabels[peakIdx] : ''
    }

    const labelPos = new window.kakao.maps.LatLng(lat - (flRadius / 111_000) * 1.1, lng)
    const sourceTag = useCard ? '카드' : '상권'
    const label = new window.kakao.maps.CustomOverlay({
      map,
      position: labelPos,
      content: `<div style="background:${color};color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px;white-space:nowrap;opacity:0.92;">🚶 주중 ${weekdayCount.toLocaleString()}명(${sourceTag})${peakLabel ? ` · 피크 ${peakLabel}` : ''}</div>`,
      yAnchor: 0,
    })
    label.setMap(map)
    flpopLabelRef.current = label
  }, [commercialData, cardData, lat, lng, mapReady])

  // ── Effect 4: 카드·상권 매출 현황 오버레이 (제주=카드, 전국=상권매출 병행)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !window.kakao?.maps) return

    if (cardOverlayRef.current) { cardOverlayRef.current.setMap(null); cardOverlayRef.current = null }
    if (cardNoDataRef.current)  { cardNoDataRef.current.setMap(null);  cardNoDataRef.current  = null }

    // 제주 카드 데이터
    const hasJejuCard = cardData?.has_data === true
    // 전국 상권 매출 데이터 (소상공인진흥공단 trdarSalersList)
    const commercialSales = commercialData?.sales_data
    const hasCommercialSales = !!(commercialSales?.monthly_sales > 0 || commercialSales?.area_name)

    const overlayPos = new window.kakao.maps.LatLng(lat, lng + 0.003)

    // ── 전국 상권 유동인구 (소상공인 API — 카드 대체)
    const commercialFp = commercialData?.floating_population
    const hasCommercialFp = !!(commercialFp?.weekday > 0)

    // ── 데이터 없음 표기
    if (!hasJejuCard && !hasCommercialSales) {
      if (hasCommercialFp) {
        // 상권 유동인구 데이터로 대체 표시
        const weekday: number = commercialFp.weekday ?? 0
        const weekend: number = commercialFp.weekend ?? 0
        const fpOverlay = new window.kakao.maps.CustomOverlay({
          map,
          position: overlayPos,
          content: `
            <div style="background:#fff;border:2px solid #a5b4fc;border-radius:12px;padding:10px 13px;box-shadow:0 2px 12px rgba(0,0,0,0.13);min-width:175px;font-family:sans-serif;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:7px;border-bottom:1px solid #f3f4f6;padding-bottom:5px;">
                <span style="font-size:11px;font-weight:700;color:#4f46e5;">🚶 유동인구 현황</span>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:3px;">
                <span style="color:#6b7280;">주중 유동인구</span>
                <span style="font-weight:600;color:#1e293b;">${weekday.toLocaleString()}명</span>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:10px;">
                <span style="color:#6b7280;">주말 유동인구</span>
                <span style="font-weight:600;color:#1e293b;">${weekend.toLocaleString()}명</span>
              </div>
              <div style="font-size:9px;color:#9ca3af;text-align:right;margin-top:6px;">소상공인진흥공단</div>
            </div>
          `,
          yAnchor: 0.5,
          xAnchor: 0,
        })
        fpOverlay.setMap(map)
        cardNoDataRef.current = fpOverlay
      }
      // 데이터가 없으면 overlay 표시하지 않음 (혼란 방지)
      return
    }

    // ── 티어 분류 (🔥 핫플 / 🟡 보통 / 💤 한산)
    let tier: 'hot' | 'normal' | 'quiet' = 'normal'
    if (hasJejuCard) {
      const weekday = cardData.floating_population?.weekday ?? 0
      const monthlySales = cardData.card_sales?.monthly_sales ?? 0
      if (weekday > 3000 || monthlySales > 30_000_000) tier = 'hot'
      else if (weekday > 500 || monthlySales > 5_000_000) tier = 'normal'
      else tier = 'quiet'
    } else {
      const monthly = commercialSales?.monthly_sales ?? 0
      const weekdaySales = commercialSales?.weekly_sales ?? 0
      if (monthly > 50_000_000 || weekdaySales > 12_000_000) tier = 'hot'
      else if (monthly > 10_000_000 || weekdaySales > 3_000_000) tier = 'normal'
      else tier = 'quiet'
    }

    const TIER = {
      hot:    { label: '🔥 핫플', color: '#dc2626', bg: '#fef2f2', border: '#fca5a5', headerColor: '#b91c1c' },
      normal: { label: '🟡 보통', color: '#d97706', bg: '#fffbeb', border: '#fcd34d', headerColor: '#92400e' },
      quiet:  { label: '💤 한산', color: '#6b7280', bg: '#f3f4f6', border: '#d1d5db', headerColor: '#374151' },
    }
    const tc = TIER[tier]

    let rows = ''
    let source = ''

    if (hasJejuCard) {
      const fp = cardData.floating_population
      const cs = cardData.card_sales
      const weekday: number = fp?.weekday ?? 0
      const weekend: number = fp?.weekend ?? 0
      const peakTime: string = fp?.peak_time ?? ''
      const monthlySales: number = cs?.monthly_sales ?? 0
      const latestMonth: string = cs?.latest_month ?? ''

      rows += `
        <div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:3px;">
          <span style="color:#6b7280;">주중 카드사용</span>
          <span style="font-weight:600;color:#1e293b;">${weekday.toLocaleString()}명</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:3px;">
          <span style="color:#6b7280;">주말 카드사용</span>
          <span style="font-weight:600;color:#1e293b;">${weekend.toLocaleString()}명</span>
        </div>
        ${peakTime ? `<div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:3px;"><span style="color:#6b7280;">피크 시간대</span><span style="font-weight:600;color:#7c3aed;">${peakTime}</span></div>` : ''}
        ${monthlySales > 0 ? `<div style="display:flex;justify-content:space-between;font-size:10px;margin-top:4px;padding-top:4px;border-top:1px dashed #e5e7eb;"><span style="color:#6b7280;">${latestMonth} 이용금액</span><span style="font-weight:700;color:#059669;">${Math.round(monthlySales / 10000).toLocaleString()}만원</span></div>` : ''}
      `
      source += '제주데이터허브'
    }

    if (hasCommercialSales) {
      const sd = commercialSales
      const monthly = sd.monthly_sales ?? 0
      const weekdaySales = sd.weekly_sales ?? 0
      const weekendSales = sd.weekend_sales ?? 0
      const areaName: string = sd.area_name ?? ''
      const topCat: string = sd.top_category ?? ''

      rows += `
        ${hasJejuCard ? '<div style="margin-top:6px;padding-top:6px;border-top:1px solid #f3f4f6;"></div>' : ''}
        ${areaName ? `<div style="font-size:9px;color:#6366f1;font-weight:600;margin-bottom:4px;">📍 ${areaName}${topCat ? ` · ${topCat}` : ''}</div>` : ''}
        ${monthly > 0 ? `<div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:3px;"><span style="color:#6b7280;">월 카드사용금액</span><span style="font-weight:700;color:#059669;">${Math.round(monthly / 10000).toLocaleString()}만원</span></div>` : ''}
        ${weekdaySales > 0 ? `<div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:3px;"><span style="color:#6b7280;">주중 사용금액</span><span style="font-weight:600;color:#1e293b;">${Math.round(weekdaySales / 10000).toLocaleString()}만원</span></div>` : ''}
        ${weekendSales > 0 ? `<div style="display:flex;justify-content:space-between;font-size:10px;"><span style="color:#6b7280;">주말 사용금액</span><span style="font-weight:600;color:#1e293b;">${Math.round(weekendSales / 10000).toLocaleString()}만원</span></div>` : ''}
      `
      source += (source ? ' · ' : '') + '소상공인진흥공단'
    }

    const content = `
      <div style="background:#fff;border:2px solid ${tc.border};border-radius:12px;padding:10px 13px;box-shadow:0 2px 12px rgba(0,0,0,0.13);min-width:175px;font-family:sans-serif;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:7px;border-bottom:1px solid #f3f4f6;padding-bottom:5px;">
          <span style="font-size:11px;font-weight:700;color:#4f46e5;">💳 카드 사용량 현황</span>
          <span style="font-size:10px;font-weight:700;color:${tc.color};background:${tc.bg};padding:2px 8px;border-radius:99px;border:1px solid ${tc.border};">${tc.label}</span>
        </div>
        ${rows}
        <div style="font-size:9px;color:#9ca3af;text-align:right;margin-top:6px;">${source}</div>
      </div>
    `

    const overlay = new window.kakao.maps.CustomOverlay({
      map,
      position: overlayPos,
      content,
      yAnchor: 0.5,
      xAnchor: 0,
    })
    overlay.setMap(map)
    cardOverlayRef.current = overlay
  }, [cardData, commercialData, lat, lng, mapReady])

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

      {/* 하단 좌측: 히트맵 토글 버튼 */}
      {hasPoi && (
        <button
          onClick={() => setShowHeatmap(v => !v)}
          className={`absolute bottom-2 left-2 z-20 text-[11px] px-2.5 py-1.5 rounded-full shadow-md border font-medium transition-all ${
            showHeatmap
              ? 'bg-orange-500 text-white border-orange-400'
              : 'bg-white/90 backdrop-blur-sm text-gray-600 border-gray-200 hover:bg-gray-50'
          }`}
        >
          🔥 히트맵
        </button>
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
