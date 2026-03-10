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

// ── XML 파싱 헬퍼 (실거래가 API용) ──────────────────────────
function xmlTagValue(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))
  return m ? m[1].trim() || null : null
}

// ── 토지이용계획 수집 (VWorld 2D 데이터 API) ─────────────────
// 기존 arLandUseInfoService는 행위제한 조회용 (필지 조회 불가)
// VWorld LT_C_LHBLPN: 필지 PNU로 용도지역지구 조회
async function collectLandUse(
  sigunguCd: string,
  bjdongCd: string,
  bun: string,
  ji: string,
  vworldKey: string
): Promise<any[]> {
  // PNU 19자리: 시군구(5) + 법정동(5) + 산구분(1,0=대지) + 본번(4) + 부번(4)
  const pnu = `${sigunguCd}${bjdongCd}0${bun}${ji}`
  const url = `https://api.vworld.kr/req/data?service=data&request=GetFeature&data=LT_C_LHBLPN&key=${vworldKey}&attrFilter=pnu:=:${pnu}&format=json&geometry=false&pagenum=1&pagesize=20`

  console.log('[LandUse] VWorld PNU:', pnu)
  const res = await fetch(url)
  if (!res.ok) {
    console.error('[LandUse] VWorld HTTP error:', res.status)
    return []
  }

  const data = await res.json()
  console.log('[LandUse] VWorld status:', data?.response?.status)

  if (data?.response?.status !== 'OK') {
    console.error('[LandUse] VWorld error:', JSON.stringify(data?.response).slice(0, 300))
    return []
  }

  const features: any[] = data?.response?.result?.featureCollection?.features ?? []
  console.log('[LandUse] features found:', features.length)

  return features.map((f: any) => ({
    zone_name:  f.properties?.prposAreaDstrcCodeNm ?? null,
    zone_code:  f.properties?.prposAreaDstrcCode   ?? null,
    reg_date:   f.properties?.lastUpdtDt           ?? null,
    law_name:   null,
    group_name: f.properties?.ldCodeNm             ?? null,
  }))
}

// ── 국토부 실거래가 API 수집 (XML 전용) ──────────────────────
// 아파트: RTMSDataSvcAptTrade, 빌라: RTMSDataSvcRHTrade (모두 XML)
const DEAL_SERVICE_MAP: Record<string, string> = {
  apartment:  'RTMSDataSvcAptTrade',
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
  const now = new Date()
  const months: string[] = []
  for (let i = 0; i < 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const svcNames = new Set<string>(['RTMSDataSvcAptTrade'])
  if (property_type && DEAL_SERVICE_MAP[property_type]) {
    svcNames.add(DEAL_SERVICE_MAP[property_type])
  }

  const allItems: any[] = []

  await Promise.allSettled(
    [...svcNames].flatMap(svcName =>
      months.map(async ym => {
        // serviceKey raw 연결 (이중 인코딩 방지)
        const params = new URLSearchParams({
          LAWD_CD:   sigungu_code,
          DEAL_YMD:  ym,
          pageNo:    '1',
          numOfRows: '30',
        })
        const url = `https://apis.data.go.kr/1613000/${svcName}/get${svcName}?serviceKey=${apiKey}&${params}`

        const res = await fetch(url)
        if (!res.ok) {
          console.error('[RealPrice] HTTP 오류:', svcName, ym, res.status)
          return
        }

        const text = await res.text()
        if (!text.trimStart().startsWith('<')) {
          console.error('[RealPrice] XML 아님:', text.slice(0, 100))
          return
        }

        // 에러 코드 체크 - 성공: '00', '000', '0000' / 에러: 그 외
        const resultCode = xmlTagValue(text, 'resultCode') ?? xmlTagValue(text, 'ERROR_CODE')
        if (resultCode && resultCode !== '00' && resultCode !== '000' && resultCode !== '0000') {
          const msg = xmlTagValue(text, 'returnReasonCode') ?? xmlTagValue(text, 'resultMsg') ?? xmlTagValue(text, 'ERROR_MSG') ?? resultCode
          console.error('[RealPrice] API 오류:', svcName, ym, resultCode, msg)
          return
        }

        // <item> 블록 파싱
        const itemBlocks = [...text.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => m[1])
        console.log('[RealPrice]', svcName, ym, 'items:', itemBlocks.length)
        for (const block of itemBlocks) {
          const amountStr = xmlTagValue(block, '거래금액')
          const amount = amountStr ? parseInt(amountStr.replace(/,/g, '').trim()) : null
          allItems.push({
            deal_ym: ym,
            amount,
            area:    parseFloat(xmlTagValue(block, '전용면적') ?? '0') || null,
            floor:   xmlTagValue(block, '층'),
            name:    xmlTagValue(block, '아파트') ?? xmlTagValue(block, '건물명'),
            dong:    xmlTagValue(block, '법정동') ?? xmlTagValue(block, '법정동명'),
            type:    svcName,
          })
        }
      })
    )
  )

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

    // ── 1. 카카오 주소 정규화 (실패해도 계속 진행) ──────────
    let address_name: string = parcel_input
    let lat: number = 0
    let lng: number = 0
    let region_1depth_name = '', region_2depth_name = '', region_3depth_name = ''
    let bCode = '', sigungu_code = '', bjdong_code = '', bun = '0000', ji = '0000', legal_dong = ''
    let normalized_address: string = parcel_input

    try {
      const kakaoRes = await fetch(
        `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(parcel_input)}`,
        { headers: { Authorization: `KakaoAK ${kakaoKey}` } }
      )
      if (!kakaoRes.ok) {
        console.error(`[normalize-parcel] Kakao API HTTP error: ${kakaoRes.status}`)
      } else {
        const kakaoData = await kakaoRes.json()
        if (!kakaoData.documents?.length) {
          console.error('[normalize-parcel] Kakao: 주소 검색 결과 없음:', parcel_input)
        } else {
          const doc  = kakaoData.documents[0]
          const addr = doc.address ?? doc.road_address
          const roadAddr = doc.road_address

          address_name       = doc.address_name ?? parcel_input
          lat                = parseFloat(doc.y)
          lng                = parseFloat(doc.x)
          region_1depth_name = addr?.region_1depth_name ?? roadAddr?.region_1depth_name ?? ''
          region_2depth_name = addr?.region_2depth_name ?? roadAddr?.region_2depth_name ?? ''
          region_3depth_name = addr?.region_3depth_name ?? roadAddr?.region_3depth_name ?? ''
          bCode              = addr?.b_code ?? ''
          sigungu_code       = extractSigunguCode(bCode)
          bjdong_code        = bCode.slice(5, 10)
          bun                = (addr?.main_address_no ?? '0').padStart(4, '0')
          ji                 = (addr?.sub_address_no  ?? '0').padStart(4, '0')
          legal_dong         = region_3depth_name
          normalized_address = roadAddr?.address_name ?? addr?.address_name ?? address_name
        }
      }
    } catch (kakaoErr) {
      console.error('[normalize-parcel] Kakao 주소 정규화 실패 (계속 진행):', kakaoErr)
    }

    // lat/lng 없으면 프로젝트에 저장된 좌표 사용
    if (!lat || !lng) {
      const { data: existingProject } = await supabaseClient
        .from('projects')
        .select('lat, lng')
        .eq('id', project_id)
        .single()
      if (existingProject?.lat) lat = existingProject.lat
      if (existingProject?.lng) lng = existingProject.lng
    }

    // b_code가 없으면 좌표→행정구역 코드 API로 보완
    if ((!sigungu_code || !bjdong_code) && lat && lng) {
      try {
        const regionRes = await fetch(
          `https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${lng}&y=${lat}`,
          { headers: { Authorization: `KakaoAK ${kakaoKey}` } }
        )
        if (regionRes.ok) {
          const regionData = await regionRes.json()
          // B (법정동) 타입 우선
          const region = regionData.documents?.find((d: any) => d.region_type === 'B')
            ?? regionData.documents?.[0]
          if (region?.code && region.code.length >= 10) {
            bCode        = region.code
            sigungu_code = bCode.slice(0, 5)
            bjdong_code  = bCode.slice(5, 10)
            legal_dong   = legal_dong || region.region_3depth_name || ''
            region_1depth_name = region_1depth_name || region.region_1depth_name || ''
            region_2depth_name = region_2depth_name || region.region_2depth_name || ''
            region_3depth_name = region_3depth_name || region.region_3depth_name || ''
            console.log('[normalize-parcel] coord2regioncode fallback:', { sigungu_code, bjdong_code })
          }
        }
      } catch (regionErr) {
        console.error('[normalize-parcel] coord2regioncode 실패:', regionErr)
      }
    }

    // ── 2. 데이터 수집 (병렬) ────────────────────────────────
    const publicApiKey = Deno.env.get('PUBLIC_DATA_API_KEY') ?? Deno.env.get('BUILDING_API_KEY') ?? ''
    const vworldKey    = Deno.env.get('VWORLD_API_KEY') ?? ''

    const [poiResult, landUseResult, realPriceResult] = await Promise.allSettled([
      collectPOI(lat, lng, kakaoKey),
      (vworldKey && sigungu_code && bjdong_code) ? collectLandUse(sigungu_code, bjdong_code, bun, ji, vworldKey) : Promise.resolve(null),
      (publicApiKey && sigungu_code) ? collectRealPrice(sigungu_code, project.property_type ?? null, publicApiKey) : Promise.resolve(null),
    ])

    const poi_data        = poiResult.status       === 'fulfilled' ? poiResult.value       : null
    const land_use_data   = landUseResult.status   === 'fulfilled' ? landUseResult.value   : null
    const real_price_data = realPriceResult.status === 'fulfilled' ? realPriceResult.value : null

    if (poiResult.status === 'rejected')        console.error('[POI]',       poiResult.reason)
    if (landUseResult.status === 'rejected')    console.error('[LandUse]',   landUseResult.reason)
    if (realPriceResult.status === 'rejected')  console.error('[RealPrice]', realPriceResult.reason)

    console.log('[normalize-parcel] collected:', {
      poi: poiResult.status,
      land: landUseResult.status,
      price: realPriceResult.status,
      poiCount: poi_data ? Object.keys(poi_data).length : 0,
      sigungu_code,
      bjdong_code,
      lat, lng,
    })

    // ── 3. 프로젝트 업데이트 ─────────────────────────────────
    const updatePayload: Record<string, unknown> = {
      address: normalized_address,
      lat, lng,
      sigungu_code, bjdong_code, bun, ji, legal_dong,
    }
    if (poi_data        !== null) updatePayload.poi_data        = poi_data
    if (land_use_data   !== null) updatePayload.land_use_data   = land_use_data
    if (real_price_data !== null) updatePayload.real_price_data = real_price_data

    const { error: updateError } = await supabaseClient
      .from('projects')
      .update(updatePayload)
      .eq('id', project_id)

    if (updateError) console.error('[normalize-parcel] update error:', updateError)

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
