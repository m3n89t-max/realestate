import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

const BASE_URL = 'https://apis.data.go.kr/B553077/api/open/sdsc2'

interface ZoneItem {
  trarNo: string
  mainTrarNm: string
  ctprvnNm?: string
  signguNm?: string
  trarArea?: number
  lon?: number
  lat?: number
}

interface StoreItem {
  bizesId: string
  bizesNm: string
  indsLclsNm?: string
  indsMclsNm?: string
  indsSclsNm?: string
  lon?: number
  lat?: number
  lnoAdr?: string
}

// serviceKey는 공공데이터포털 인코딩키를 그대로 URL에 삽입 (이중 인코딩 방지)
function buildApiUrl(operation: string, serviceKey: string, params: Record<string, string>): string {
  const qs = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
  return `${BASE_URL}/${operation}?serviceKey=${serviceKey}&${qs}`
}

// 공공데이터포털 API 응답에서 items 배열 추출
// 가능한 구조: body.items.item[], body.items[], body.item[], 또는 직접 배열
function extractItems(data: any): any[] {
  if (!data) return []

  // 에러 응답 체크
  const resultCode = data?.header?.resultCode ?? data?.response?.header?.resultCode
  if (resultCode && resultCode !== '00' && resultCode !== '0000') {
    const msg = data?.header?.resultMsg ?? data?.response?.header?.resultMsg ?? 'API 오류'
    console.error('[analyze-commercial] API error:', resultCode, msg)
    return []
  }

  const body = data?.body ?? data?.response?.body ?? data
  if (!body) return []

  // Format 1: body.items.item (배열 또는 단일 객체)
  if (body?.items?.item !== undefined) {
    const item = body.items.item
    return Array.isArray(item) ? item : [item]
  }

  // Format 2: body.items (직접 배열)
  if (Array.isArray(body?.items)) {
    return body.items
  }

  // Format 3: body.item (직접)
  if (body?.item !== undefined) {
    const item = body.item
    return Array.isArray(item) ? item : [item]
  }

  // Format 4: 최상위 배열
  if (Array.isArray(data)) {
    return data
  }

  return []
}

async function fetchCommercialZones(serviceKey: string, lat: number, lng: number): Promise<ZoneItem[]> {
  const url = buildApiUrl('storeZoneInRadius', serviceKey, {
    pageNo: '1', numOfRows: '20', radius: '1000',
    cx: String(lng), cy: String(lat), type: 'json',
  })
  console.log('[analyze-commercial] zones URL:', url.replace(serviceKey, serviceKey.slice(0, 8) + '...'))
  const res = await fetch(url)
  const text = await res.text()
  console.log('[analyze-commercial] zones raw response (first 500):', text.slice(0, 500))
  try {
    const data = JSON.parse(text)
    return extractItems(data)
  } catch {
    console.error('[analyze-commercial] zones JSON parse error, raw:', text.slice(0, 200))
    return []
  }
}

async function fetchNearbyStores(serviceKey: string, lat: number, lng: number): Promise<StoreItem[]> {
  const url = buildApiUrl('storeListInRadius', serviceKey, {
    pageNo: '1', numOfRows: '100', radius: '1000',
    cx: String(lng), cy: String(lat), type: 'json',
  })
  console.log('[analyze-commercial] stores URL:', url.replace(serviceKey, serviceKey.slice(0, 8) + '...'))
  const res = await fetch(url)
  const text = await res.text()
  console.log('[analyze-commercial] stores raw response (first 500):', text.slice(0, 500))
  try {
    const data = JSON.parse(text)
    return extractItems(data)
  } catch {
    console.error('[analyze-commercial] stores JSON parse error, raw:', text.slice(0, 200))
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
    let project_id: string

    if (isServiceRole) {
      const body = await req.json()
      project_id = body.project_id
    } else {
      const { data: { user }, error } = await supabaseClient.auth.getUser()
      if (error || !user) throw new Error('인증되지 않은 요청입니다')
      const body = await req.json()
      project_id = body.project_id
    }

    if (!project_id) throw new Error('project_id가 필요합니다')

    const { data: project } = await supabaseClient
      .from('projects').select('*').eq('id', project_id).single()
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

    const serviceKey = Deno.env.get('COMMERCIAL_API_KEY') ?? ''
    if (!serviceKey) throw new Error('COMMERCIAL_API_KEY가 설정되지 않았습니다')

    console.log('[analyze-commercial] lat:', lat, 'lng:', lng, 'key prefix:', serviceKey.slice(0, 8))

    const [zones, stores] = await Promise.all([
      fetchCommercialZones(serviceKey, lat, lng),
      fetchNearbyStores(serviceKey, lat, lng),
    ])

    console.log('[analyze-commercial] zones:', zones.length, 'stores:', stores.length)

    // 카테고리(대분류)별 상가 수 집계
    const storeCounts: Record<string, number> = {}
    for (const store of stores) {
      const cat = store.indsLclsNm ?? '기타'
      storeCounts[cat] = (storeCounts[cat] ?? 0) + 1
    }

    const commercial_data = {
      zones,
      stores,
      store_count_by_category: storeCounts,
      radius_m: 1000,
      collected_at: new Date().toISOString(),
    }

    await supabaseClient.from('projects')
      .update({ commercial_data })
      .eq('id', project_id)

    return new Response(JSON.stringify({ success: true, commercial_data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('[analyze-commercial]', error)
    const message = error instanceof Error ? error.message : '상권 분석에 실패했습니다'
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
