import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

// 한국관광공사 TourAPI KorService1
const TOUR_API_BASE = 'https://apis.data.go.kr/B551011/KorService1'

// contentTypeId → 한글 카테고리
const CONTENT_TYPE: Record<string, string> = {
  '12': '관광지',
  '14': '문화시설',
  '28': '레포츠',
  '32': '숙박',
  '38': '쇼핑',
  '39': '음식점',
}

interface TourItem {
  contentid: string
  contenttypeid: string
  title: string
  addr1?: string
  mapx?: string  // 경도
  mapy?: string  // 위도
  cat1?: string
  cat2?: string
  cat3?: string
  firstimage?: string
  dist?: string  // 거리(m)
}

async function fetchLocationBased(
  serviceKey: string,
  lat: number,
  lng: number,
  contentTypeId: string,
  radius = 1000,
): Promise<TourItem[]> {
  const params = new URLSearchParams({
    serviceKey,
    numOfRows: '50',
    pageNo: '1',
    MobileOS: 'ETC',
    MobileApp: 'RealEstateAIOS',
    _type: 'json',
    mapX: String(lng),
    mapY: String(lat),
    radius: String(radius),
    contentTypeId,
    listYN: 'Y',
    arrange: 'S',  // 거리순
  })
  try {
    const res = await fetch(`${TOUR_API_BASE}/locationBasedList1?${params}`)
    const text = await res.text()
    const data = JSON.parse(text)
    const items = data?.response?.body?.items?.item
    if (!items) return []
    return Array.isArray(items) ? items : [items]
  } catch (e) {
    console.error('[analyze-tourism] fetch error for type', contentTypeId, e)
    return []
  }
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  const authHeader = req.headers.get('Authorization') ?? ''
  const isServiceRole = authHeader.includes(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? 'never-match')

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    isServiceRole
      ? (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
      : (Deno.env.get('SUPABASE_ANON_KEY') ?? ''),
    { global: { headers: { Authorization: authHeader } } }
  )

  try {
    if (!isServiceRole) {
      const { data: { user }, error } = await supabaseClient.auth.getUser()
      if (error || !user) throw new Error('인증되지 않은 요청입니다')
    }

    const { project_id } = await req.json()
    if (!project_id) throw new Error('project_id가 필요합니다')

    const { data: project } = await supabaseClient
      .from('projects').select('lat, lng, address').eq('id', project_id).single()
    if (!project) throw new Error('프로젝트를 찾을 수 없습니다')

    let lat = project.lat
    let lng = project.lng

    // 좌표 없으면 Kakao geocoding
    if (!lat || !lng) {
      const kakaoKey = Deno.env.get('KAKAO_REST_API_KEY')
      if (kakaoKey) {
        const geoRes = await fetch(
          `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(project.address)}`,
          { headers: { Authorization: `KakaoAK ${kakaoKey}` } }
        )
        const geoData = await geoRes.json()
        if (geoData.documents?.length > 0) {
          lat = parseFloat(geoData.documents[0].y)
          lng = parseFloat(geoData.documents[0].x)
          await supabaseClient.from('projects').update({ lat, lng }).eq('id', project_id)
        }
      }
    }
    if (!lat || !lng) throw new Error('주소 좌표를 찾을 수 없습니다')

    const serviceKey = Deno.env.get('TOUR_API_KEY') ?? ''
    if (!serviceKey) {
      // 키 미설정 시 placeholder 저장 → 재시도 루프 방지
      await supabaseClient.from('projects')
        .update({ tourism_data: { available: false, reason: 'TOUR_API_KEY not configured' } })
        .eq('id', project_id)
      return new Response(JSON.stringify({ success: true, skipped: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 모든 contentType 병렬 수집 (1km 반경)
    const RADIUS = 1000
    const results = await Promise.all(
      Object.keys(CONTENT_TYPE).map(typeId => fetchLocationBased(serviceKey, lat, lng, typeId, RADIUS))
    )

    // contentTypeId별 분류
    const byType: Record<string, { count: number; items: TourItem[] }> = {}
    Object.keys(CONTENT_TYPE).forEach((typeId, idx) => {
      byType[typeId] = { count: results[idx].length, items: results[idx] }
    })

    // 전체 통계
    const totalCount = Object.values(byType).reduce((s, v) => s + v.count, 0)

    // 관광 활성도 지수 (0~100): 업소 수 기반
    // 관광지/문화/레포츠는 가중치 2, 숙박/음식/쇼핑은 1
    const weightedScore =
      (byType['12'].count + byType['14'].count + byType['28'].count) * 2 +
      (byType['32'].count + byType['39'].count + byType['38'].count)
    const tourismIndex = Math.min(Math.round((weightedScore / 30) * 100), 100)

    // 주요 관광지 top5 (거리순, 관광지+문화시설만)
    const topSpots = [...byType['12'].items, ...byType['14'].items]
      .sort((a, b) => Number(a.dist ?? 9999) - Number(b.dist ?? 9999))
      .slice(0, 5)
      .map(it => ({
        title: it.title,
        addr: it.addr1,
        dist: Number(it.dist ?? 0),
        lat: it.mapy ? parseFloat(it.mapy) : null,
        lng: it.mapx ? parseFloat(it.mapx) : null,
        image: it.firstimage ?? null,
      }))

    // 숙박 시설 목록 (좌표 포함 - 히트맵용)
    const accommodations = byType['32'].items
      .filter(it => it.mapy && it.mapx)
      .map(it => ({
        title: it.title,
        lat: parseFloat(it.mapy!),
        lng: parseFloat(it.mapx!),
        dist: Number(it.dist ?? 0),
      }))

    // 음식점 목록 (좌표 포함 - 히트맵용)
    const restaurants = byType['39'].items
      .filter(it => it.mapy && it.mapx)
      .map(it => ({
        title: it.title,
        lat: parseFloat(it.mapy!),
        lng: parseFloat(it.mapx!),
        dist: Number(it.dist ?? 0),
      }))

    const tourism_data = {
      radius_m: RADIUS,
      total_count: totalCount,
      tourism_index: tourismIndex,
      by_type: Object.fromEntries(
        Object.entries(byType).map(([typeId, val]) => [
          CONTENT_TYPE[typeId],
          val.count,
        ])
      ),
      top_spots: topSpots,
      accommodations,
      restaurants,
      collected_at: new Date().toISOString(),
    }

    await supabaseClient.from('projects')
      .update({ tourism_data })
      .eq('id', project_id)

    return new Response(JSON.stringify({ success: true, tourism_data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('[analyze-tourism]', error)
    const message = error instanceof Error ? error.message : '관광 데이터 수집에 실패했습니다'
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
