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

async function fetchCommercialZones(serviceKey: string, lat: number, lng: number): Promise<ZoneItem[]> {
  const url = buildApiUrl('storeZoneInRadius', serviceKey, {
    pageNo: '1', numOfRows: '20', radius: '500',
    cx: String(lng), cy: String(lat), type: 'json',
  })
  const res = await fetch(url)
  const data = await res.json()
  const items = data?.body?.items?.item
  if (!items) return []
  return Array.isArray(items) ? items : [items]
}

async function fetchNearbyStores(serviceKey: string, lat: number, lng: number): Promise<StoreItem[]> {
  const url = buildApiUrl('storeListInRadius', serviceKey, {
    pageNo: '1', numOfRows: '100', radius: '500',
    cx: String(lng), cy: String(lat), type: 'json',
  })
  const res = await fetch(url)
  const data = await res.json()
  const items = data?.body?.items?.item
  if (!items) return []
  return Array.isArray(items) ? items : [items]
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
      radius_m: 500,
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
