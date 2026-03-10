import { NextRequest, NextResponse } from 'next/server'

// GET /api/map?lat=37.5&lng=127.0&w=600&h=280&level=4
// 카카오 정적지도 API 프록시 (API 키 서버사이드 보호)
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const lat   = searchParams.get('lat')
  const lng   = searchParams.get('lng')
  const w     = searchParams.get('w')     ?? '600'
  const h     = searchParams.get('h')     ?? '280'
  const level = searchParams.get('level') ?? '4'

  if (!lat || !lng) {
    return NextResponse.json({ error: '좌표가 필요합니다' }, { status: 400 })
  }

  const apiKey = process.env.KAKAO_REST_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'KAKAO_REST_API_KEY 없음' }, { status: 500 })
  }

  const url = `https://smap.kakao.com/staticmap?appkey=${apiKey}&center=${lng},${lat}&level=${level}&w=${w}&h=${h}&markers=default,${lng},${lat}`

  try {
    const res = await fetch(url)
    if (!res.ok) {
      return NextResponse.json({ error: `카카오 지도 오류: ${res.status}` }, { status: 502 })
    }
    const buf = await res.arrayBuffer()
    return new NextResponse(buf, {
      headers: {
        'Content-Type': res.headers.get('Content-Type') ?? 'image/png',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch {
    return NextResponse.json({ error: '지도 로딩 실패' }, { status: 500 })
  }
}
