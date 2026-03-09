'use client'

import { useEffect, useRef, useState } from 'react'

/* eslint-disable @typescript-eslint/no-explicit-any */

const KAKAO_API_KEY = '65a3b218190f7f33bbe1b37f75ede543'

const SAMPLE_MARKERS = [
    { id: '1', lat: 37.5665, lng: 126.978, label: '서울 시청', price: '8억 5,000만' },
    { id: '2', lat: 37.5172, lng: 127.0473, label: '강남역', price: '12억' },
    { id: '3', lat: 37.5547, lng: 126.9707, label: '서울역', price: '6억 3,000만' },
    { id: '4', lat: 37.5796, lng: 126.977, label: '광화문', price: '9억 2,000만' },
    { id: '5', lat: 37.4979, lng: 127.0276, label: '역삼동', price: '15억' },
]

export default function KakaoMapTestPage() {
    const mapRef = useRef<HTMLDivElement>(null)
    const [status, setStatus] = useState<string>('loading')
    const [errorMsg, setErrorMsg] = useState('')

    useEffect(() => {
        // 이미 로드 됐으면
        if (typeof window !== 'undefined' && (window as any).kakao?.maps) {
            initMap()
            return
        }

        const script = document.createElement('script')
        script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_API_KEY}&autoload=false`
        script.async = true
        script.onload = () => {
            try {
                ; (window as any).kakao.maps.load(() => {
                    initMap()
                })
            } catch (e: any) {
                setStatus('error')
                setErrorMsg('kakao.maps.load() 실패: ' + (e?.message || ''))
            }
        }
        script.onerror = (e) => {
            setStatus('error')
            setErrorMsg('카카오맵 스크립트 로드 실패 (네트워크 또는 키 오류)')
        }
        document.head.appendChild(script)
    }, [])

    function initMap() {
        try {
            if (!mapRef.current) {
                setStatus('error')
                setErrorMsg('맵 컨테이너를 찾을 수 없습니다')
                return
            }

            const kakaoMaps = (window as any).kakao.maps
            const mapInstance = new kakaoMaps.Map(mapRef.current, {
                center: new kakaoMaps.LatLng(37.5665, 126.978),
                level: 7,
            })

            // 줌 컨트롤
            mapInstance.addControl(new kakaoMaps.ZoomControl(), kakaoMaps.ControlPosition.RIGHT)

            // 마커 생성
            const bounds = new kakaoMaps.LatLngBounds()
            SAMPLE_MARKERS.forEach(marker => {
                const position = new kakaoMaps.LatLng(marker.lat, marker.lng)
                bounds.extend(position)

                const el = document.createElement('div')
                el.innerHTML = `<div style="
          padding:6px 14px; border-radius:20px; font-size:12px; font-weight:700;
          background:white; color:#1f2937; border:1.5px solid #e5e7eb;
          box-shadow:0 2px 8px rgba(0,0,0,0.12); cursor:pointer; white-space:nowrap;
        ">${marker.price}</div>`

                new kakaoMaps.CustomOverlay({ position, content: el, yAnchor: 1.3 }).setMap(mapInstance)
            })

            mapInstance.setBounds(bounds)
            setStatus('loaded')
        } catch (err: any) {
            setStatus('error')
            setErrorMsg(err?.message || '지도 초기화 실패')
        }
    }

    const bannerStyle: Record<string, { bg: string; border: string; color: string; text: string }> = {
        loading: { bg: '#f0f9ff', border: '#bfdbfe', color: '#1e40af', text: '카카오맵 SDK 로딩 중...' },
        loaded: { bg: '#ecfdf5', border: '#a7f3d0', color: '#065f46', text: '카카오맵 로드 성공! 지도가 정상 표시됩니다.' },
        error: { bg: '#fef2f2', border: '#fecaca', color: '#991b1b', text: `오류: ${errorMsg}` },
    }
    const b = bannerStyle[status] || bannerStyle.loading

    return (
        <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'sans-serif' }}>
            <h1 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>카카오맵 통합 테스트</h1>
            <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px' }}>
                API Key: {KAKAO_API_KEY.substring(0, 8)}... | 도메인: {typeof window !== 'undefined' ? window.location.hostname : ''}
            </p>

            <div style={{
                padding: '12px 16px', borderRadius: '12px', marginBottom: '16px',
                fontSize: '14px', fontWeight: 600,
                background: b.bg, color: b.color, border: `1px solid ${b.border}`,
            }}>
                {b.text}
            </div>

            <div style={{
                width: '100%', height: '500px', borderRadius: '16px', overflow: 'hidden',
                border: '1px solid #e5e7eb', background: '#f3f4f6', position: 'relative',
            }}>
                <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
                {status === 'loading' && (
                    <div style={{
                        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: '#f3f4f6',
                    }}>
                        <span style={{ color: '#9ca3af', fontSize: '14px' }}>지도 로딩 중...</span>
                    </div>
                )}
            </div>

            {status === 'loaded' && (
                <div style={{ marginTop: '16px', padding: '16px', borderRadius: '12px', background: 'white', border: '1px solid #e5e7eb' }}>
                    <p style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>테스트 결과</p>
                    <div style={{ fontSize: '13px', lineHeight: '2' }}>
                        SDK 로드 완료<br />
                        지도 렌더링 성공<br />
                        줌 컨트롤 표시<br />
                        가격 마커 5개 표시<br />
                        바운드 자동 맞춤
                    </div>
                </div>
            )}
        </div>
    )
}
