'use client'

import { useEffect, useRef, useState } from 'react'
import type { POIItem, KakaoDensity } from '@/lib/types'
import {
  buildFacilityHeatPoints,
  canRenderPopulationStats,
  describeBarrierStatus,
  evaluatePopulationDisplay,
  hasDisplayableMetric,
} from '@/lib/location-data-truthfulness'
import type { PublicDataLayerResult } from '@/lib/public-data-layers'
import type { SeoulCommercial, LocalCurrencySpending } from '@/lib/public-data-collectors'

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
  /** 무료 공공 데이터 레이어 수집 결과. */
  publicDataLayers?: {
    results?: PublicDataLayerResult[] | null
    seoul_nearest_place?: { area_nm: string; area_cd: string | null; distance_m: number } | null
  } | null
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
  lat, lng, level = 4, className, style, poiData, kakaoDensity, locationAnalysis, populationData, commercialData, cardData, publicDataLayers
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
  const publicLayerRef  = useRef<any>(null)
  const kakaoDensityRef = useRef(kakaoDensity)
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [showPublicLayer, setShowPublicLayer] = useState(true)
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

        // 3. 시설 밀집 참고도 (네이티브 Canvas) — 장소 좌표를 중복 제거해 시각화
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
          const points = buildFacilityHeatPoints(poiData, kakaoDensityRef.current)
            .map(point => ({ ...toPixel(point.lat, point.lng), value: point.value }))
            .filter(point => point.x > -80 && point.x < canvas.width + 80 && point.y > -80 && point.y < canvas.height + 80)

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

    // 표시 가능 여부는 게이트 한 곳에서만 판단한다.
    // 여기서 density/total_population 조건을 다시 쓰면 레거시 행이 지도로 흘러든다.
    const popState = evaluatePopulationDisplay(populationData)
    if (popState.status !== 'available' || !popState.estimate) return
    if (!canRenderPopulationStats(populationData)) return

    const center = new window.kakao.maps.LatLng(lat, lng)
    // 거주인구 참고값 반경: 500m 고정 (업종밀집도와 같은 분석범위)
    const popRadius = 500

    const density = populationData.density as number
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

    // 게이트를 통과한 추정값만 표시한다. 폴백으로 총인구를 대신 찍지 않는다
    // (총인구는 읍면동 전체 숫자라 500m 참고값 자리에 오면 수십 배 과대표시된다).
    const labelText = `약 ${popState.estimate.value.toLocaleString()}명(추정)`
    const labelPos = new window.kakao.maps.LatLng(
      lat + (popRadius / 111_000) * 0.9,
      lng
    )
    const label = new window.kakao.maps.CustomOverlay({
      map,
      position: labelPos,
      content: `<div style="background:${color};color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:99px;white-space:nowrap;opacity:0.9;">${labelText}</div>`,
      yAnchor: 1,
    })
    label.setMap(map)
    popLabelRef.current = label
  }, [populationData, lat, lng, mapReady, locationAnalysis])

  // ── Effect 3: 유동인구 원 (cardData 우선, fallback: commercial_data.floating_population)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !window.kakao?.maps) return

    if (flpopCircleRef.current) { flpopCircleRef.current.setMap(null); flpopCircleRef.current = null }
    if (flpopLabelRef.current)  { flpopLabelRef.current.setMap(null);  flpopLabelRef.current  = null }

    // cardData 우선 사용, 없으면 commercialData fallback
    const useCard = cardData?.has_data && hasDisplayableMetric(cardData?.floating_population)
    const useCommercial = hasDisplayableMetric(commercialData?.floating_population)
    const weekdayCount: number = useCard
      ? cardData.floating_population.weekday
      : (useCommercial ? commercialData.floating_population.weekday : 0)
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
    const hasJejuCard = cardData?.has_data === true && hasDisplayableMetric(cardData?.card_sales)
    // 전국 상권 매출 데이터 (소상공인진흥공단 trdarSalersList)
    const commercialSales = commercialData?.sales_data
    const hasCommercialSales = hasDisplayableMetric(commercialSales) && !!(commercialSales?.monthly_sales > 0 || commercialSales?.area_name)

    const overlayPos = new window.kakao.maps.LatLng(lat, lng + 0.003)

    // ── 전국 상권 유동인구 (소상공인 API — 카드 대체)
    const commercialFp = commercialData?.floating_population
    const hasCommercialFp = hasDisplayableMetric(commercialFp) && !!(commercialFp?.weekday > 0)

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

  // ── Effect 5: 무료 공공 데이터 레이어 오버레이
  // 서울 실시간 상권 결제 동향과 지역화폐 업종별 소비를 지도에 표시한다.
  // 금액은 구간값으로만 공개되므로 구간 그대로 보여준다.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !window.kakao?.maps) return

    if (publicLayerRef.current) { publicLayerRef.current.setMap(null); publicLayerRef.current = null }
    if (!showPublicLayer) return

    const results = publicDataLayers?.results ?? []
    const seoulResult = results.find(r => r.layerId === 'seoul_realtime_commercial' && r.status === 'available')
    const localResult = results.find(r => r.layerId === 'local_currency_spending' && r.status === 'available')
    if (!seoulResult && !localResult) return

    const escapeHtml = (value: string) =>
      value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

    // 반올림하지 않는다. 5만원 단위 구간 경계를 접으면 서로 다른 구간이
    // 같은 문자열이 되어 사용자가 '확정 금액'으로 읽는다.
    const won = (amount: number) => {
      const man = amount / 10000
      const text = Number.isInteger(man) ? man.toLocaleString() : man.toFixed(1)
      return `${text}만원`
    }
    /** 구간 표기. 결측이면 null을 돌려 행 자체를 생략한다. */
    const wonRange = (min: number | null, max: number | null): string | null => {
      if (min == null && max == null) return null
      if (min == null) return `${won(max as number)} 이하`
      if (max == null) return `${won(min)} 이상`
      return `${won(min)}~${won(max)}`
    }
    /** 결측을 0건으로 표시하지 않는다. */
    const count = (value: number | null, unit: string): string | null =>
      value == null ? null : `${value.toLocaleString()}${unit}`

    let blocks = ''

    if (seoulResult) {
      const seoul = seoulResult.value as SeoulCommercial
      // 서울시가 실제로 쓰는 4단계만 색으로 표현한다.
      // 미지의 등급을 기본색으로 칠하면 '붐비는'이 '보통' 색으로 렌더될 수 있다.
      const LEVEL_COLOR: Record<string, string> = {
        '한산한': '#64748b',
        '보통': '#0284c7',
        '바쁜': '#d97706',
        '붐비는': '#dc2626',
      }
      const knownLevel = Object.prototype.hasOwnProperty.call(LEVEL_COLOR, seoul.congestionLevel)
      const color = knownLevel ? LEVEL_COLOR[seoul.congestionLevel] : '#94a3b8'
      const topCategories = seoul.categories
        .slice()
        .sort((a, b) => (b.paymentCount ?? -1) - (a.paymentCount ?? -1))
        .slice(0, 3)

      // 상권이 매물에서 얼마나 먼지 반드시 보여준다.
      // 서울 공식 장소는 최대 5km 간격이라, 거리 없이 '지금 이 상권'이라고 하면
      // 다른 생활권 지표를 자기 동네로 읽는다.
      const distM = publicDataLayers?.seoul_nearest_place?.distance_m
      const distanceLabel =
        typeof distM === 'number'
          ? ` · 매물에서 ${distM < 1000 ? `${Math.round(distM)}m` : `${(distM / 1000).toFixed(1)}km`}`
          : ''

      blocks += `
        <div style="margin-bottom:8px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;">
            <span style="font-size:11px;font-weight:700;color:#334155;">가까운 상권 지금 상황</span>
            <span style="font-size:10px;font-weight:700;color:#fff;background:${color};padding:2px 8px;border-radius:99px;">${escapeHtml(seoul.congestionLevel)}</span>
          </div>
          <div style="font-size:9px;color:#64748b;margin-bottom:5px;">${escapeHtml(seoul.placeName)}${distanceLabel}</div>
          ${count(seoul.paymentCount, '건') ? `
          <div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:2px;">
            <span style="color:#6b7280;">결제 건수</span>
            <span style="font-weight:600;color:#1e293b;">${count(seoul.paymentCount, '건')}</span>
          </div>` : ''}
          ${wonRange(seoul.paymentAmountMin, seoul.paymentAmountMax) ? `
          <div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:4px;">
            <span style="color:#6b7280;">결제 금액대</span>
            <span style="font-weight:600;color:#1e293b;">${wonRange(seoul.paymentAmountMin, seoul.paymentAmountMax)}</span>
          </div>` : ''}
          ${topCategories.map(cat => {
            const detail = [count(cat.paymentCount, '건'), count(cat.merchantCount, '곳')]
              .filter(Boolean).join(' · ')
            if (!detail) return ''
            return `
            <div style="display:flex;justify-content:space-between;font-size:9px;color:#94a3b8;">
              <span>${escapeHtml(cat.midCategory)}</span>
              <span>${detail}</span>
            </div>`
          }).join('')}
          <div style="font-size:8px;color:#cbd5e1;margin-top:4px;">금액은 구간으로만 공개돼요 · 서울시(신한카드 제공)</div>
        </div>
      `
    }

    if (localResult) {
      const local = localResult.value as LocalCurrencySpending
      const top = local.categories.slice(0, 3)
      blocks += `
        <div style="${seoulResult ? 'border-top:1px solid #f1f5f9;padding-top:7px;' : ''}">
          <div style="font-size:11px;font-weight:700;color:#334155;margin-bottom:4px;">지역화폐가 많이 쓰이는 업종</div>
          <div style="font-size:9px;color:#64748b;margin-bottom:5px;">${escapeHtml(local.region)}</div>
          ${top.map(cat => `
            <div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:2px;">
              <span style="color:#6b7280;">${escapeHtml(cat.industry)}</span>
              <span style="font-weight:600;color:#1e293b;">${won(cat.settlementAmount)}</span>
            </div>
          `).join('')}
          <div style="font-size:8px;color:#cbd5e1;margin-top:4px;">지역화폐 결제분만 포함돼요 · 한국조폐공사</div>
        </div>
      `
    }

    const overlay = new window.kakao.maps.CustomOverlay({
      map,
      position: new window.kakao.maps.LatLng(lat, lng - 0.004),
      content: `
        <div style="background:#fff;border:2px solid #cbd5e1;border-radius:12px;padding:10px 13px;box-shadow:0 2px 12px rgba(0,0,0,0.13);min-width:195px;max-width:235px;font-family:sans-serif;">
          ${blocks}
        </div>
      `,
      yAnchor: 0.5,
      xAnchor: 1,
    })
    overlay.setMap(map)
    publicLayerRef.current = overlay
  }, [publicDataLayers, showPublicLayer, lat, lng, mapReady])

  if (!appKey) {
    return (
      <div className="flex items-center justify-center bg-gray-100 text-gray-400 text-xs rounded-lg" style={style}>
        NEXT_PUBLIC_KAKAO_MAP_API_KEY 미설정
      </div>
    )
  }

  const hasPoi = poiData && Object.keys(poiData).length > 0
  const hasPublicLayerData = (publicDataLayers?.results ?? []).some(
    r =>
      (r.layerId === 'seoul_realtime_commercial' || r.layerId === 'local_currency_spending') &&
      r.status === 'available',
  )

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

      {/* 하단 좌측: 레이어 토글 버튼 */}
      <div className="absolute bottom-2 left-2 z-20 flex gap-1.5">
        {hasPoi && (
          <button
            onClick={() => setShowHeatmap(v => !v)}
            className={`text-[11px] px-2.5 py-1.5 rounded-full shadow-md border font-medium transition-all ${
              showHeatmap
                ? 'bg-orange-500 text-white border-orange-400'
                : 'bg-white/90 backdrop-blur-sm text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            시설 밀집 참고도
          </button>
        )}
        {hasPublicLayerData && (
          <button
            onClick={() => setShowPublicLayer(v => !v)}
            className={`text-[11px] px-2.5 py-1.5 rounded-full shadow-md border font-medium transition-all ${
              showPublicLayer
                ? 'bg-sky-600 text-white border-sky-500'
                : 'bg-white/90 backdrop-blur-sm text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            상권·소비
          </button>
        )}
      </div>

      {/* 거주인구 참고값 패널 — 표시 여부는 게이트가 정한다 */}
      {(() => {
        const popState = evaluatePopulationDisplay(populationData)
        // 수집 자체를 안 한 매물은 패널을 띄우지 않는다.
        if (popState.status === 'not_collected') return null

        const barrierMessage = describeBarrierStatus(populationData)
        const showStats = canRenderPopulationStats(populationData)

        return (
          <div className="absolute top-4 right-4 z-10 bg-white/95 backdrop-blur-sm p-3.5 rounded-xl shadow-md border border-brand-100 min-w-[190px]">
            <h4 className="text-xs font-bold text-gray-800 mb-2">주변 거주인구 참고값</h4>

            {/* 신뢰도 등급 + 평문 한 문장을 맨 앞에 둔다 */}
            <div
              className={`rounded-lg px-2.5 py-2 text-[10px] leading-relaxed mb-2 ${
                popState.status === 'available'
                  ? 'bg-blue-50 text-blue-700'
                  : popState.status === 'failed'
                    ? 'bg-red-50 border border-red-200 text-red-600'
                    : 'bg-gray-50 text-gray-600'
              }`}
            >
              <p className="font-semibold mb-0.5">
                {popState.status === 'available' ? '참고값 (추정)' : '값 없음'}
              </p>
              <p>{popState.message}</p>
            </div>

            {/* 값은 게이트를 통과했을 때만 렌더한다 */}
            {popState.estimate && (
              <div className="mb-2.5">
                <div className="bg-blue-50 rounded-lg px-2.5 py-1.5 flex justify-between items-center">
                  <span className="text-[11px] text-blue-700">거주인구 추정</span>
                  <span className="text-[13px] font-bold text-blue-800">
                    약 {popState.estimate.value.toLocaleString()}명
                  </span>
                </div>
                <p className="text-[8px] text-gray-400 mt-0.5">{popState.estimate.sourceLabel}</p>
                {barrierMessage && <p className="text-[8px] text-orange-500 mt-0.5">{barrierMessage}</p>}
                {/* 산식·출처는 접어둔다 */}
                <details className="mt-1">
                  <summary className="text-[8px] text-gray-400 cursor-pointer">산정 기준 보기</summary>
                  <p className="text-[8px] text-gray-500 mt-1 leading-relaxed">
                    {popState.estimate.methodLabel}
                    <br />
                    출처: 통계청 SGIS. 장벽은 참고정보로만 쓰고 인구 숫자에서 차감하지 않습니다.
                  </p>
                </details>
              </div>
            )}

            {/* 행정구역 통계는 별도 게이트로 판단한다 */}
            {showStats && (
              <>
                <div className="border-t border-gray-200 my-2" />
                <div>
                  <p className="text-[9px] font-semibold text-gray-500 mb-1.5">
                    {populationData.adm_nm || '행정구역'} ({populationData.adm_level || '시군구'}) 전체 통계
                  </p>
                  <div className="space-y-1.5">
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
                  </div>
                  <p className="mt-2.5 text-[9px] text-gray-400 text-right">
                    {populationData.source_year}년 통계청 SGIS
                  </p>
                </div>
              </>
            )}
          </div>
        )
      })()}
    </div>
  )
}
