import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors } from '../_shared/cors.ts'
import { getAuthenticatedUser, getOrgId } from '../_shared/auth.ts'
import { ok, err } from '../_shared/response.ts'

function extractSigunguCode(bCode: string): string {
  return bCode?.slice(0, 5) ?? ''
}

// ── Kakao Local API 카테고리 POI 수집 ─────────────────────────
const POI_CATEGORIES: Array<{ code: string; label: string; radius: number; size: number }> = [
  { code: 'SW8', label: 'subway',      radius: 2000, size: 3 },
  { code: 'MT1', label: 'mart',        radius: 2000, size: 3 },
  { code: 'CS2', label: 'convenience', radius: 500,  size: 3 },
  { code: 'HP8', label: 'hospital',    radius: 1500, size: 3 },
  { code: 'PM9', label: 'pharmacy',    radius: 1000, size: 3 },
  { code: 'SC4', label: 'school',      radius: 1500, size: 5 },
  { code: 'BK9', label: 'bank',        radius: 1000, size: 3 },
  { code: 'CE7', label: 'cafe',        radius: 500,  size: 3 },
  { code: 'FD6', label: 'restaurant',  radius: 500,  size: 5 },
  { code: 'OL7', label: 'gas_station', radius: 1000, size: 3 },
  { code: 'PK6', label: 'parking',     radius: 500,  size: 3 },
  { code: 'CT1', label: 'culture',     radius: 2000, size: 3 },
]

async function collectPOI(lat: number, lng: number, kakaoKey: string): Promise<Record<string, any[]>> {
  const results: Record<string, any[]> = {}

  await Promise.allSettled(
    POI_CATEGORIES.map(async ({ code, label, radius, size }) => {
      const url = new URL('https://dapi.kakao.com/v2/local/search/category.json')
      url.searchParams.set('category_group_code', code)
      url.searchParams.set('x', String(lng))
      url.searchParams.set('y', String(lat))
      url.searchParams.set('radius', String(radius))
      url.searchParams.set('sort', 'distance')
      url.searchParams.set('size', String(size))

      const res = await fetch(url.toString(), {
        headers: { Authorization: `KakaoAK ${kakaoKey}` },
      })
      if (!res.ok) return

      const data = await res.json()
      results[label] = (data.documents ?? []).map((d: any) => ({
        name:       d.place_name,
        address:    d.road_address_name || d.address_name,
        distance_m: parseInt(d.distance ?? '0'),
        category:   d.category_name,
        phone:      d.phone || null,
      }))
    })
  )

  return results
}

// ── 토지이용규제 API 수집 ─────────────────────────────────────
async function collectLandUse(lat: number, lng: number, apiKey: string): Promise<any[]> {
  const url = new URL('https://apis.data.go.kr/1611000/nsdi/LandUseService/wgs84/getLandUseAttr')
  url.searchParams.set('serviceKey', apiKey)
  url.searchParams.set('x', String(lng))
  url.searchParams.set('y', String(lat))
  url.searchParams.set('numOfRows', '20')
  url.searchParams.set('pageNo', '1')
  url.searchParams.set('_type', 'json')

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`토지이용규제 API 오류: ${res.status}`)

  const json = await res.json()
  const items = json?.response?.body?.items?.item ?? []
  const arr = Array.isArray(items) ? items : (items ? [items] : [])

  return arr.map((item: any) => ({
    zone_name:   item.prposAreaDstrcNm   ?? null,
    zone_code:   item.prposAreaDstrcCdNm ?? null,
    reg_date:    item.regStrDate          ?? null,
    law_name:    item.refLawNm            ?? null,
    group_name:  item.manageGroupNm       ?? null,
  }))
}

// ── 국토부 실거래가 API 수집 ──────────────────────────────────
const DEAL_SERVICE_MAP: Record<string, string> = {
  apartment:  'RTMSDataSvcAptTradeDev',
  officetel:  'RTMSDataSvcOffiTrade',
  villa:      'RTMSDataSvcRHTrade',
  house:      'RTMSDataSvcSHTrade',
  commercial: 'RTMSDataSvcNrgTrade',
  land:       'RTMSDataSvcLandTrade',
}

async function collectRealPrice(
  sigungu_code: string,
  property_type: string | null,
  apiKey: string
): Promise<any[]> {
  // 최근 3개월
  const now = new Date()
  const months: string[] = []
  for (let i = 0; i < 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const svcNames = new Set<string>(['RTMSDataSvcAptTradeDev'])
  if (property_type && DEAL_SERVICE_MAP[property_type]) {
    svcNames.add(DEAL_SERVICE_MAP[property_type])
  }

  const allItems: any[] = []

  await Promise.allSettled(
    [...svcNames].flatMap(svcName =>
      months.map(async ym => {
        const url = new URL(`https://apis.data.go.kr/1613000/${svcName}/get${svcName}`)
        url.searchParams.set('serviceKey', apiKey)
        url.searchParams.set('LAWD_CD', sigungu_code)
        url.searchParams.set('DEAL_YMD', ym)
        url.searchParams.set('pageNo', '1')
        url.searchParams.set('numOfRows', '30')
        url.searchParams.set('_type', 'json')

        const res = await fetch(url.toString())
        if (!res.ok) return

        const json = await res.json()
        const items = json?.response?.body?.items?.item ?? []
        const arr = (Array.isArray(items) ? items : (items ? [items] : [])).filter(Boolean)

        for (const item of arr) {
          const amount = item['거래금액'] ?? item.dealAmount ?? null
          allItems.push({
            deal_ym:   ym,
            amount:    typeof amount === 'string' ? parseInt(amount.replace(/,/g, '')) : amount,
            area:      parseFloat(item['전용면적'] ?? item.excluUseAr ?? '0') || null,
            floor:     item['층']    ?? item.floor     ?? null,
            name:      item['아파트'] ?? item.aptNm     ?? item['건물명'] ?? null,
            dong:      item['법정동'] ?? item.umdNm     ?? null,
            type:      svcName,
          })
        }
      })
    )
  )

  // 금액 내림차순 정렬
  allItems.sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))
  return allItems.slice(0, 60)
}

// ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const { user, supabaseClient } = await getAuthenticatedUser(req)
    const orgId = await getOrgId(supabaseClient, user.id)

    const { parcel_input, project_id } = await req.json()
    if (!parcel_input) throw new Error('parcel_input이 필요합니다')
    if (!project_id)   throw new Error('project_id가 필요합니다')

    const { data: project, error: projectError } = await supabaseClient
      .from('projects')
      .select('id, org_id, property_type')
      .eq('id', project_id)
      .single()
    if (projectError || !project) throw new Error('프로젝트를 찾을 수 없습니다')

    const kakaoKey = Deno.env.get('KAKAO_REST_API_KEY')
    if (!kakaoKey) throw new Error('KAKAO_REST_API_KEY가 설정되지 않았습니다')

    // ── 1. 카카오 주소 정규화 ────────────────────────────────
    const kakaoRes = await fetch(
      `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(parcel_input)}`,
      { headers: { Authorization: `KakaoAK ${kakaoKey}` } }
    )
    if (!kakaoRes.ok) throw new Error(`카카오 API 오류: ${kakaoRes.status}`)

    const kakaoData = await kakaoRes.json()
    if (!kakaoData.documents?.length) {
      throw new Error('주소를 찾을 수 없습니다. 지번 또는 도로명주소를 확인해주세요.')
    }

    const doc      = kakaoData.documents[0]
    const addr     = doc.address ?? doc.road_address
    const roadAddr = doc.road_address

    const address_name: string = doc.address_name ?? parcel_input
    const lat: number          = parseFloat(doc.y)
    const lng: number          = parseFloat(doc.x)

    const region_1depth_name: string = addr?.region_1depth_name ?? roadAddr?.region_1depth_name ?? ''
    const region_2depth_name: string = addr?.region_2depth_name ?? roadAddr?.region_2depth_name ?? ''
    const region_3depth_name: string = addr?.region_3depth_name ?? roadAddr?.region_3depth_name ?? ''

    const bCode: string        = addr?.b_code ?? ''
    const sigungu_code: string = extractSigunguCode(bCode)
    const bjdong_code: string  = bCode.slice(5, 10)
    const bun: string          = (addr?.main_address_no ?? '0').padStart(4, '0')
    const ji: string           = (addr?.sub_address_no  ?? '0').padStart(4, '0')
    const legal_dong: string   = region_3depth_name
    const normalized_address: string = roadAddr?.address_name ?? addr?.address_name ?? address_name

    // ── 2. 데이터 수집 (병렬) ────────────────────────────────
    const publicApiKey = Deno.env.get('PUBLIC_DATA_API_KEY') ?? Deno.env.get('BUILDING_API_KEY') ?? ''

    const [poiResult, landUseResult, realPriceResult] = await Promise.allSettled([
      collectPOI(lat, lng, kakaoKey),
      publicApiKey ? collectLandUse(lat, lng, publicApiKey) : Promise.resolve(null),
      (publicApiKey && sigungu_code) ? collectRealPrice(sigungu_code, project.property_type ?? null, publicApiKey) : Promise.resolve(null),
    ])

    const poi_data        = poiResult.status       === 'fulfilled' ? poiResult.value       : null
    const land_use_data   = landUseResult.status   === 'fulfilled' ? landUseResult.value   : null
    const real_price_data = realPriceResult.status === 'fulfilled' ? realPriceResult.value : null

    if (poiResult.status === 'rejected')        console.error('[POI]',       poiResult.reason)
    if (landUseResult.status === 'rejected')    console.error('[LandUse]',   landUseResult.reason)
    if (realPriceResult.status === 'rejected')  console.error('[RealPrice]', realPriceResult.reason)

    // ── 3. 프로젝트 업데이트 ─────────────────────────────────
    await supabaseClient
      .from('projects')
      .update({
        address: normalized_address,
        lat, lng,
        sigungu_code, bjdong_code, bun, ji, legal_dong,
        ...(poi_data        !== null && { poi_data }),
        ...(land_use_data   !== null && { land_use_data }),
        ...(real_price_data !== null && { real_price_data }),
      })
      .eq('id', project_id)

    // ── 4. 건축물대장 task 생성 ──────────────────────────────
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: createdTasks, error: taskError } = await adminClient
      .from('tasks')
      .insert([{
        org_id: project.org_id,
        project_id,
        type: 'download_building_register',
        status: 'pending',
        payload: { project_id, normalized_address, sigungu_code, bjdong_code, bun, ji, legal_dong },
      }])
      .select('id, type')

    if (taskError) throw taskError

    const task_ids: string[] = (createdTasks ?? []).map((t: { id: string }) => t.id)

    return ok(
      {
        normalized_address, lat, lng, sigungu_code, legal_dong,
        region_1depth_name, region_2depth_name, region_3depth_name,
        task_ids,
        collected: {
          poi:        poi_data        !== null,
          land_use:   land_use_data   !== null,
          real_price: real_price_data !== null,
        },
      },
      { org_id: orgId }
    )

  } catch (error) {
    console.error('[normalize-parcel]', error)
    const message = error instanceof Error ? error.message : '주소 정규화에 실패했습니다'
    return err(message, 400)
  }
})
