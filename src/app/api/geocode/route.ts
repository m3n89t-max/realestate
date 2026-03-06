import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/geocode?address=서울시+강남구+역삼동+123
 *
 * 카카오 REST API를 사용하여 주소를 좌표(lat, lng)로 변환합니다.
 * KAKAO_REST_API_KEY는 서버 사이드에서만 사용되므로 클라이언트에 노출되지 않습니다.
 */
export async function GET(req: NextRequest) {
    const address = req.nextUrl.searchParams.get('address')
    if (!address) {
        return NextResponse.json({ error: '주소가 필요합니다' }, { status: 400 })
    }

    const apiKey = process.env.KAKAO_REST_API_KEY
    if (!apiKey) {
        return NextResponse.json({ error: 'KAKAO_REST_API_KEY 환경변수가 설정되지 않았습니다' }, { status: 500 })
    }

    try {
        // 1차: 주소 검색
        const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}&analyze_type=similar`
        const res = await fetch(url, {
            headers: { Authorization: `KakaoAK ${apiKey}` },
        })

        if (!res.ok) {
            const errText = await res.text()
            console.error('Kakao API error:', res.status, errText)
            return NextResponse.json({ error: `카카오 API 오류: ${res.status}` }, { status: 502 })
        }

        const data = await res.json()

        // 주소 검색 결과가 있으면 반환
        if (data.documents?.length > 0) {
            const doc = data.documents[0]
            return NextResponse.json({
                lat: parseFloat(doc.y),
                lng: parseFloat(doc.x),
                road_address: doc.road_address?.address_name || null,
                jibun_address: doc.address?.address_name || null,
            })
        }

        // 2차: 키워드 검색 (아파트명 등으로 입력한 경우)
        const kwUrl = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(address)}&size=1`
        const kwRes = await fetch(kwUrl, {
            headers: { Authorization: `KakaoAK ${apiKey}` },
        })

        if (kwRes.ok) {
            const kwData = await kwRes.json()
            if (kwData.documents?.length > 0) {
                const kwDoc = kwData.documents[0]
                return NextResponse.json({
                    lat: parseFloat(kwDoc.y),
                    lng: parseFloat(kwDoc.x),
                    road_address: kwDoc.road_address_name || null,
                    jibun_address: kwDoc.address_name || null,
                })
            }
        }

        return NextResponse.json({ error: '좌표를 찾을 수 없습니다', lat: null, lng: null }, { status: 404 })
    } catch (err) {
        console.error('Geocode error:', err)
        return NextResponse.json({ error: '지오코딩 실패' }, { status: 500 })
    }
}
