'use client'

import { useEffect, useRef, useState } from 'react'
import type { POIItem, KakaoDensity } from '@/lib/types'
import {
  buildFacilityHeatPoints,
  describeBarrierStatus,
  getPopulationEstimate,
  hasDisplayableMetric,
} from '@/lib/location-data-truthfulness'
import type { PublicDataLayerResult } from '@/lib/public-data-layers'
import type { SeoulCommercial, LocalCurrencySpending } from '@/lib/public-data-collectors'
import {
  buildMapDataLayerOptions,
  type MapDataLayerId,
} from '@/lib/map-data-layer-controls'

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
  const flpopLabelRef   = useRef<any>(null)
  const cardOverlayRef  = useRef<any>(null)
  const publicLayerRef  = useRef<any>(null)
  const analysisCircleRef = useRef<any>(null)
  const poiDataRef = useRef(poiData)
  const kakaoDensityRef = useRef(kakaoDensity)
  const renderHeatmapRef = useRef<(() => void) | null>(null)
  const [activeLayer, setActiveLayer] = useState<MapDataLayerId | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [mapVersion, setMapVersion] = useState(0)
  const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY

  const results = publicDataLayers?.results ?? []
  const hasPoi = buildFacilityHeatPoints(poiData, kakaoDensity).length > 0
  const populationEstimate = getPopulationEstimate(populationData)
  const hasPopulationLayer = populationEstimate != null
  const hasActivityLayer = (
    (cardData?.has_data === true && hasDisplayableMetric(cardData?.floating_population)) ||
    hasDisplayableMetric(commercialData?.floating_population)
  )
  const hasPublicLayerData = results.some(
    r =>
      (r.layerId === 'seoul_realtime_commercial' || r.layerId === 'local_currency_spending') &&
      r.status === 'available',
  )
  const hasSpendingLayer = hasPublicLayerData || (
    (cardData?.has_data === true && hasDisplayableMetric(cardData?.card_sales)) ||
    hasDisplayableMetric(commercialData?.sales_data)
  )
  const mapLayerOptions = buildMapDataLayerOptions({
    facilities: hasPoi,
    population: hasPopulationLayer,
    activity: hasActivityLayer,
    spending: hasSpendingLayer,
  })
  const activeLayerOption = mapLayerOptions.find(layer => layer.id === activeLayer) ?? null
  const showHeatmap = activeLayer === 'facilities'
  const showPopulation = activeLayer === 'population'
  const showActivity = activeLayer === 'activity'
  const showSpending = activeLayer === 'spending'
  const showPublicLayer = showSpending
  const showLand = activeLayer === 'land'

  // 히트맵 입력 ref 동기화. 지도 인스턴스는 데이터 갱신 때 재생성하지 않는다.
  useEffect(() => {
    poiDataRef.current = poiData
    kakaoDensityRef.current = kakaoDensity
    renderHeatmapRef.current?.()
  }, [poiData, kakaoDensity])

  // ── Effect 1: 지도는 좌표가 바뀔 때만 초기화하고 데이터 갱신은 기존 지도에 반영한다.
  useEffect(() => {
    if (!appKey || !containerRef.current) return

    let disposed = false
    let initializedMap: any = null
    let render: (() => void) | null = null
    let script: HTMLScriptElement | null = null

    const initMap = () => {
      window.kakao.maps.load(() => {
        if (disposed || !containerRef.current) return
        const container = containerRef.current
        const center = new window.kakao.maps.LatLng(lat, lng)
        const map = new window.kakao.maps.Map(container, { center, level })
        initializedMap = map
        mapRef.current = map

        const marker = new window.kakao.maps.Marker({ position: center, map })
        const infowindow = new window.kakao.maps.InfoWindow({
          content: '<div style="padding:5px 10px;font-size:12px;font-weight:600;white-space:nowrap;color:#1e3a8a;">📍 매물 주변 분석</div>',
        })
        infowindow.open(map, marker)

        const canvas = canvasRef.current
        if (canvas) {
          const toPixel = (iLat: number, iLng: number) => {
            const b = map.getBounds()
            const sw = b.getSouthWest()
            const ne = b.getNorthEast()
            return {
              x: Math.round(((iLng - sw.getLng()) / (ne.getLng() - sw.getLng())) * canvas.width),
              y: Math.round(((ne.getLat() - iLat) / (ne.getLat() - sw.getLat())) * canvas.height),
            }
          }

          render = () => {
            const width = container.offsetWidth
            const height = container.offsetHeight
            if (!width || !height) return
            canvas.width = width
            canvas.height = height
            const points = buildFacilityHeatPoints(poiDataRef.current, kakaoDensityRef.current)
              .map(point => ({ ...toPixel(point.lat, point.lng), value: point.value }))
              .filter(point => point.x > -80 && point.x < canvas.width + 80 && point.y > -80 && point.y < canvas.height + 80)
            drawHeatmap(canvas, points)
          }
          renderHeatmapRef.current = render
          requestAnimationFrame(render)
          window.kakao.maps.event.addListener(map, 'zoom_changed', render)
          window.kakao.maps.event.addListener(map, 'dragend', render)
        }

        setMapReady(true)
        setMapVersion(version => version + 1)
      })
    }

    const existing = document.querySelector<HTMLScriptElement>('script[src*="dapi.kakao.com/v2/maps"]')
    if (window.kakao?.maps) {
      initMap()
    } else if (existing) {
      script = existing
      existing.addEventListener('load', initMap)
    } else {
      script = document.createElement('script')
      script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false`
      script.async = true
      script.addEventListener('load', initMap)
      document.head.appendChild(script)
    }

    return () => {
      disposed = true
      script?.removeEventListener('load', initMap)
      if (initializedMap && render) {
        window.kakao.maps.event.removeListener(initializedMap, 'zoom_changed', render)
        window.kakao.maps.event.removeListener(initializedMap, 'dragend', render)
      }
      if (mapRef.current === initializedMap) mapRef.current = null
      if (renderHeatmapRef.current === render) renderHeatmapRef.current = null
    }
  }, [lat, lng, level, appKey])

  // 생활·교통 분석 범위는 해당 레이어를 선택했을 때만 표시한다.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !window.kakao?.maps) return

    if (analysisCircleRef.current) {
      analysisCircleRef.current.setMap(null)
      analysisCircleRef.current = null
    }
    if (!showHeatmap || !kakaoDensity?.radius_m) return

    const circle = new window.kakao.maps.Circle({
      map,
      center: new window.kakao.maps.LatLng(lat, lng),
      radius: kakaoDensity.radius_m,
      strokeWeight: 1,
      strokeColor: '#3b82f6',
      strokeOpacity: 0.5,
      fillColor: '#60a5fa',
      fillOpacity: 0.1,
    })
    circle.setMap(map)
    analysisCircleRef.current = circle
  }, [showHeatmap, kakaoDensity?.radius_m, lat, lng, mapReady, mapVersion])

  // ── Effect 2: 배후 인구 원 (mapRef 준비 후 populationData 변경 시)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !window.kakao?.maps) return

    // 기존 원/라벨 제거
    if (popCircleRef.current) { popCircleRef.current.setMap(null); popCircleRef.current = null }
    if (popLabelRef.current)  { popLabelRef.current.setMap(null);  popLabelRef.current  = null }

    if (!showPopulation) return
    const estimate = getPopulationEstimate(populationData)
    if (!estimate) return

    const center = new window.kakao.maps.LatLng(lat, lng)
    // 배후인구 반경: 500m 고정 (업종밀집도와 같은 분석범위)
    const popRadius = 500

    const color = '#2563eb'

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

    const householdText = estimate.households == null ? '' : ` · 약 ${estimate.households.toLocaleString()}가구`
    const labelText = `약 ${estimate.value.toLocaleString()}명${householdText} (추정)`
    const labelPos = new window.kakao.maps.LatLng(
      lat + (popRadius / 111_000) * 0.9,
      lng
    )
    const label = new window.kakao.maps.CustomOverlay({
      map,
      position: labelPos,
      content: `<div style="background:${color};color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:99px;white-space:nowrap;opacity:0.9;">👥 ${labelText}</div>`,
      yAnchor: 1,
    })
    label.setMap(map)
    popLabelRef.current = label
  }, [populationData, lat, lng, mapReady, mapVersion, locationAnalysis, showPopulation])

  // ── Effect 3: 제공기관 집계 범위의 유동인구 (임의의 반경 원을 그리지 않는다)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !window.kakao?.maps) return

    if (flpopLabelRef.current)  { flpopLabelRef.current.setMap(null);  flpopLabelRef.current  = null }

    if (!showActivity) return
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

    // 카드/상권 기반 티어별 색상 (🔥 핫 = 빨강, 🟡 보통 = 주황, 💤 한산 = 회색)
    const isHot    = useCard ? weekdayCount > 3000  : weekdayCount > 10000
    const isNormal = useCard ? weekdayCount > 500   : weekdayCount > 2000
    const color = isHot ? '#dc2626' : isNormal ? '#d97706' : '#64748b'

    // 피크 시간대 계산
    let peakLabel = peakTimeLabel ?? ''
    if (!peakLabel && byHour && byHour.length > 0) {
      const hourLabels = ['0-6시', '6-11시', '11-14시', '14-17시', '17-21시', '21-24시']
      const peakIdx = byHour.indexOf(Math.max(...byHour))
      peakLabel = peakIdx >= 0 ? hourLabels[peakIdx] : ''
    }

    const labelPos = new window.kakao.maps.LatLng(lat - 0.0015, lng)
    const sourceTag = useCard ? '카드' : '상권'
    const label = new window.kakao.maps.CustomOverlay({
      map,
      position: labelPos,
      content: `<div style="background:${color};color:#fff;font-size:10px;font-weight:700;padding:4px 9px;border-radius:8px;white-space:nowrap;opacity:0.94;">🚶 주중 ${weekdayCount.toLocaleString()}명(${sourceTag})${peakLabel ? ` · 피크 ${peakLabel}` : ''}<div style="font-size:8px;font-weight:500;opacity:0.8;margin-top:1px;">제공기관 집계 범위</div></div>`,
      yAnchor: 0,
    })
    label.setMap(map)
    flpopLabelRef.current = label
  }, [commercialData, cardData, lat, lng, mapReady, mapVersion, showActivity])

  // ── Effect 4: 카드·상권 매출 현황 오버레이 (제주=카드, 전국=상권매출 병행)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !window.kakao?.maps) return

    if (cardOverlayRef.current) { cardOverlayRef.current.setMap(null); cardOverlayRef.current = null }

    if (!showSpending) return
    // 제주 카드 데이터
    const hasJejuCard = cardData?.has_data === true && hasDisplayableMetric(cardData?.card_sales)
    // 전국 상권 매출 데이터 (소상공인진흥공단 trdarSalersList)
    const commercialSales = commercialData?.sales_data
    const hasCommercialSales = hasDisplayableMetric(commercialSales) && !!(commercialSales?.monthly_sales > 0 || commercialSales?.area_name)

    const overlayPos = new window.kakao.maps.LatLng(lat, lng + 0.003)

    if (!hasJejuCard && !hasCommercialSales) return

    // ── 티어 분류 (🔥 핫플 / 🟡 보통 / 💤 한산)
    let tier: 'hot' | 'normal' | 'quiet' = 'normal'
    if (hasJejuCard) {
      const monthlySales = cardData.card_sales?.monthly_sales ?? 0
      if (monthlySales > 30_000_000) tier = 'hot'
      else if (monthlySales > 5_000_000) tier = 'normal'
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
      const cs = cardData.card_sales
      const monthlySales: number = cs?.monthly_sales ?? 0
      const latestMonth: string = cs?.latest_month ?? ''

      rows += `
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
  }, [cardData, commercialData, lat, lng, mapReady, mapVersion, showSpending])

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
          <div style="font-size:8px;color:#94a3b8;margin-top:4px;">행정구역 통계 · 매물 지점 값 아님</div>
          <div style="font-size:8px;color:#cbd5e1;margin-top:2px;">지역화폐 결제분만 포함돼요 · 한국조폐공사</div>
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
  }, [publicDataLayers, showPublicLayer, lat, lng, mapReady, mapVersion])

  // ── Effect 6: 토지·지적 레이어
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !window.kakao?.maps) return

    const cadastralType = window.kakao.maps.MapTypeId.USE_DISTRICT
    if (showLand) {
      map.addOverlayMapTypeId(cadastralType)
    } else {
      map.removeOverlayMapTypeId(cadastralType)
    }

    return () => map.removeOverlayMapTypeId(cadastralType)
  }, [showLand, mapReady, mapVersion])

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

      {/* 하단: 한 번에 하나만 선택하는 지도 정보 레이어 */}
      <div
        role="group"
        aria-label="지도 정보 레이어"
        className="absolute bottom-10 left-2 right-2 z-20 flex gap-1.5 overflow-x-auto pb-0.5"
      >
        <button
          type="button"
          aria-pressed={activeLayer == null}
          onClick={() => setActiveLayer(null)}
          className={`shrink-0 text-[11px] px-2.5 py-1.5 rounded-full shadow-md border font-medium transition-all ${
            activeLayer == null
              ? 'bg-slate-700 text-white border-slate-600'
              : 'bg-white/90 backdrop-blur-sm text-gray-600 border-gray-200 hover:bg-gray-50'
          }`}
        >
          기본
        </button>
        {mapLayerOptions.map(layer => {
          const selected = activeLayer === layer.id
          return (
            <button
              key={layer.id}
              type="button"
              disabled={!layer.available}
              aria-pressed={selected}
              aria-label={`${layer.label}${layer.available ? '' : ' · 자료 없음'}`}
              title={layer.available ? layer.description : `${layer.label}: 아직 수집된 자료가 없습니다.`}
              onClick={() => setActiveLayer(selected ? null : layer.id)}
              className={`shrink-0 text-[11px] px-2.5 py-1.5 rounded-full shadow-md border font-medium transition-all ${
                selected
                  ? `${layer.colorClass} text-white`
                  : layer.available
                    ? 'bg-white/90 backdrop-blur-sm text-gray-600 border-gray-200 hover:bg-gray-50'
                    : 'bg-gray-100/90 text-gray-400 border-gray-200 cursor-not-allowed'
              }`}
            >
              {layer.label}
            </button>
          )
        })}
      </div>

      {activeLayerOption && activeLayer !== 'population' && (
        <div className="absolute top-3 left-3 z-20 max-w-[220px] rounded-xl border border-gray-200 bg-white/95 px-3 py-2 shadow-md backdrop-blur-sm">
          <p className="text-[11px] font-bold text-gray-800">{activeLayerOption.label}</p>
          <p className="mt-0.5 text-[9px] leading-4 text-gray-600">{activeLayerOption.description}</p>
          <p className="mt-1 text-[10px] text-gray-600">범위: {activeLayerOption.scopeLabel}</p>
          <p className="mt-0.5 text-[10px] text-gray-600">자료: {activeLayerOption.sourceLabel}</p>
        </div>
      )}

      {/* 배후 인구 분석 팝업 */}
      {activeLayer === 'population' && populationData && (
        <div className="absolute top-4 right-4 z-10 bg-white/95 backdrop-blur-sm p-3.5 rounded-xl shadow-md border border-brand-100 min-w-[190px]">
          <h4 className="text-xs font-bold text-gray-800 mb-2 flex items-center gap-1">
            <span>👥</span> 배후 인구 분석
          </h4>

          {/* SGIS 수집 실패 시 에러 안내 */}
          {populationData?.error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-2.5 py-2 text-[10px] text-red-600 mb-2">
              <p className="font-semibold mb-0.5">데이터 수집 실패</p>
              <p className="text-red-500">SGIS가 이 좌표를 찾지 못했습니다. &apos;배후 인구 분석&apos; 버튼으로 재시도하세요.</p>
            </div>
          )}

          {/* 검증된 소지역 재배분 방식의 500m 거주인구만 표시 */}
          {!populationData?.error && populationEstimate && (() => {
            const estimate = populationEstimate
            const barrierMessage = describeBarrierStatus(populationData)
            return (
              <div className="mb-2.5">
                <p className="text-[9px] font-semibold text-blue-600 mb-1">{estimate.title}</p>
                <div className="bg-blue-50 rounded-lg px-2.5 py-1.5 flex justify-between items-center">
                  <span className="text-[11px] text-blue-700">거주인구 추정</span>
                  <span className="text-[13px] font-bold text-blue-800">약 {estimate.value.toLocaleString()}명</span>
                </div>
                {estimate.households != null && (
                  <div className="bg-emerald-50 rounded-lg px-2.5 py-1.5 flex justify-between items-center mt-1">
                    <span className="text-[11px] text-emerald-700">센서스 가구 추정</span>
                    <span className="text-[13px] font-bold text-emerald-800">약 {estimate.households.toLocaleString()}가구</span>
                  </div>
                )}
                <p className="text-[9px] text-gray-500 mt-1">{estimate.description}</p>
                <p className="text-[8px] text-gray-400 mt-0.5">{estimate.sourceLabel}</p>
                {barrierMessage && <p className="text-[8px] text-orange-500 mt-0.5">{barrierMessage}</p>}
              </div>
            )
          })()}

        </div>
      )}
    </div>
  )
}
