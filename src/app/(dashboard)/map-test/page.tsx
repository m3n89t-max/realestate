'use client'

import { useEffect, useRef, useState } from 'react'

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
    interface Window {
        kakao: any
    }
}

const SAMPLE_MARKERS = [
    { id: '1', lat: 37.5665, lng: 126.978, label: '서울 시청', price: '8억 5,000만' },
    { id: '2', lat: 37.5172, lng: 127.0473, label: '강남역', price: '12억' },
    { id: '3', lat: 37.5547, lng: 126.9707, label: '서울역', price: '6억 3,000만' },
    { id: '4', lat: 37.5796, lng: 126.977, label: '광화문', price: '9억 2,000만' },
    { id: '5', lat: 37.4979, lng: 127.0276, label: '역삼동', price: '15억' },
]

export default function KakaoMapTestPage() {
    const mapRef = useRef<HTMLDivElement>(null)
    const [status, setStatus] = useState<'loading' | 'loaded' | 'error' | 'no-key'>('loading')
    const [mapInstance, setMapInstance] = useState<any>(null)
    const [errorMsg, setErrorMsg] = useState('')

    useEffect(() => {
        const apiKey = process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY
        if (!apiKey || apiKey === 'YOUR_KAKAO_MAP_API_KEY_HERE') {
            setStatus('no-key')
            return
        }

        // 이미 로드 됐으면
        if (typeof window !== 'undefined' && window.kakao?.maps) {
            initMap()
            return
        }

        const script = document.createElement('script')
        script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${apiKey}&autoload=false`
        script.async = true
        script.onload = () => {
            window.kakao.maps.load(() => {
                initMap()
            })
        }
        script.onerror = () => {
            setStatus('error')
            setErrorMsg('카카오맵 SDK 스크립트 로드 실패')
        }
        document.head.appendChild(script)
    }, [])

    function initMap() {
        try {
            if (!mapRef.current) return
            const kakaoMaps = window.kakao.maps

            const options = {
                center: new kakaoMaps.LatLng(37.5665, 126.978),
                level: 7,
            }
            const map = new kakaoMaps.Map(mapRef.current, options)
            setMapInstance(map)

            // 줌 컨트롤 추가
            const zoomControl = new kakaoMaps.ZoomControl()
            map.addControl(zoomControl, kakaoMaps.ControlPosition.RIGHT)

            // 마커 생성
            SAMPLE_MARKERS.forEach(marker => {
                const position = new kakaoMaps.LatLng(marker.lat, marker.lng)

                const content = document.createElement('div')
                content.innerHTML = `
          <div style="
            padding: 6px 14px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 700;
            white-space: nowrap;
            cursor: pointer;
            background: white;
            color: #1f2937;
            border: 1.5px solid #e5e7eb;
            box-shadow: 0 2px 8px rgba(0,0,0,0.12);
            transform: translateY(-50%);
            transition: all 0.2s;
          "
          onmouseenter="this.style.background='#0284c7'; this.style.color='white'; this.style.borderColor='#0284c7';"
          onmouseleave="this.style.background='white'; this.style.color='#1f2937'; this.style.borderColor='#e5e7eb';"
          >
            ${marker.price}
          </div>
        `

                const overlay = new kakaoMaps.CustomOverlay({
                    position,
                    content,
                    yAnchor: 1.3,
                })
                overlay.setMap(map)
            })

            // 바운드 맞추기
            const bounds = new kakaoMaps.LatLngBounds()
            SAMPLE_MARKERS.forEach(m => bounds.extend(new kakaoMaps.LatLng(m.lat, m.lng)))
            map.setBounds(bounds)

            setStatus('loaded')
        } catch (err: any) {
            setStatus('error')
            setErrorMsg(err?.message || '지도 초기화 실패')
        }
    }

    return (
        <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
            <h1 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>
                🗺️ 카카오맵 통합 테스트
            </h1>
            <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '16px' }}>
                카카오맵 SDK 로드, 지도 렌더링, 커스텀 가격 마커 오버레이 테스트
            </p>

            {/* 상태 표시 */}
            <div style={{
                padding: '12px 16px',
                borderRadius: '12px',
                marginBottom: '16px',
                fontSize: '14px',
                fontWeight: 600,
                background: status === 'loaded' ? '#ecfdf5' : status === 'error' ? '#fef2f2' : status === 'no-key' ? '#fffbeb' : '#f0f9ff',
                color: status === 'loaded' ? '#065f46' : status === 'error' ? '#991b1b' : status === 'no-key' ? '#92400e' : '#1e40af',
                border: `1px solid ${status === 'loaded' ? '#a7f3d0' : status === 'error' ? '#fecaca' : status === 'no-key' ? '#fde68a' : '#bfdbfe'
                    }`,
            }}>
                {status === 'loading' && '⏳ 카카오맵 SDK 로딩 중...'}
                {status === 'loaded' && '✅ 카카오맵 로드 성공! 지도가 정상 표시됩니다.'}
                {status === 'error' && `❌ 오류 발생: ${errorMsg}`}
                {status === 'no-key' && '⚠️ NEXT_PUBLIC_KAKAO_MAP_API_KEY가 설정되지 않았습니다.'}
            </div>

            {/* 지도 */}
            <div style={{
                width: '100%',
                height: '500px',
                borderRadius: '16px',
                overflow: 'hidden',
                border: '1px solid #e5e7eb',
                background: '#f3f4f6',
                position: 'relative',
            }}>
                <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
                {status === 'loading' && (
                    <div style={{
                        position: 'absolute', inset: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: '#f3f4f6',
                    }}>
                        <span style={{ color: '#9ca3af', fontSize: '14px' }}>지도 로딩 중...</span>
                    </div>
                )}
            </div>

            {/* 테스트 항목 체크리스트 */}
            {status === 'loaded' && (
                <div style={{
                    marginTop: '16px',
                    padding: '16px',
                    borderRadius: '12px',
                    background: 'white',
                    border: '1px solid #e5e7eb',
                }}>
                    <p style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>테스트 결과:</p>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '13px', lineHeight: '2' }}>
                        <li>✅ 카카오맵 JavaScript SDK 로드</li>
                        <li>✅ 지도 렌더링 (서울 중심)</li>
                        <li>✅ 줌 컨트롤 표시</li>
                        <li>✅ 커스텀 가격 마커 오버레이 ({SAMPLE_MARKERS.length}개)</li>
                        <li>✅ 마커 호버 시 색상 변경 (흰색→파란색)</li>
                        <li>✅ 바운드 자동 맞춤</li>
                    </ul>
                </div>
            )}
        </div>
    )
}
