import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

// 국토교통부 실거래가 API 서비스 매핑.
// src/lib/comparable-sales.ts 의 COMPARABLE_DEAL_SERVICE_MAP 과 같아야 한다.
// Deno 함수에서 src/ 를 import 할 수 없어 값을 복제하고, 일치 여부를 tests/comparable-sales.test.ts 가 검사한다.
const DEAL_SERVICE_MAP: Record<string, string> = {
  apartment:  'RTMSDataSvcAptTrade',
  officetel:  'RTMSDataSvcOffiTrade',
  villa:      'RTMSDataSvcRHTrade',
  house:      'RTMSDataSvcSHTrade',
  commercial: 'RTMSDataSvcNrgTrade',
  land:       'RTMSDataSvcLandTrade',
}

/** 수집 기간(개월). 화면 표기(COMPARABLE_COLLECTION_MONTHS)와 같아야 한다. */
const COLLECTION_MONTHS = 6

/** 저장 상한(건). */
const SAVE_LIMIT = 60

function xmlTagValue(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))
  return m ? m[1].trim() : null
}

function extractSigunguCode(bCode: string): string {
  return bCode.slice(0, 5)
}

/** '역삼1동' → '역삼'. 저장 시 동 비중 로그를 남기기 위한 정규화. */
function normalizeDong(dong: string | null): string {
  if (!dong) return ''
  return dong.replace(/[0-9]/g, '').replace(/동$/, '').trim()
}

async function collectRealPrice(
  sigungu_code: string,
  svcName: string,
  apiKey: string,
): Promise<any[]> {
  const now = new Date()
  const months: string[] = []
  for (let i = 1; i <= COLLECTION_MONTHS; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const allItems: any[] = []

  await Promise.allSettled(
    months.map(async ym => {
      const params = new URLSearchParams({
        LAWD_CD:   sigungu_code,
        DEAL_YMD:  ym,
        pageNo:    '1',
        numOfRows: '30',
      })
      const url = `https://apis.data.go.kr/1613000/${svcName}/get${svcName}?serviceKey=${apiKey}&${params}`

      try {
        const res = await fetch(url)
        if (!res.ok) {
          console.error('[collect-real-price] HTTP error:', svcName, ym, res.status)
          return
        }
        const text = await res.text()
        if (!text.trimStart().startsWith('<')) {
          console.error('[collect-real-price] XML 아님:', text.slice(0, 200))
          return
        }
        const resultCode = xmlTagValue(text, 'resultCode') ?? xmlTagValue(text, 'ERROR_CODE')
        if (resultCode && resultCode !== '00' && resultCode !== '000' && resultCode !== '0000') {
          const msg = xmlTagValue(text, 'resultMsg') ?? resultCode
          console.error('[collect-real-price] API 오류:', svcName, ym, resultCode, msg)
          return
        }
        const itemBlocks = [...text.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => m[1])
        console.log('[collect-real-price]', svcName, ym, 'items:', itemBlocks.length)
        for (const block of itemBlocks) {
          const amountRaw = xmlTagValue(block, 'dealAmount') ?? xmlTagValue(block, '거래금액')
          const amount = amountRaw ? parseInt(amountRaw.replace(/[^0-9]/g, '')) || null : null
          const yr = xmlTagValue(block, 'dealYear')  ?? xmlTagValue(block, '년')
          const mo = xmlTagValue(block, 'dealMonth') ?? xmlTagValue(block, '월')
          const dealYm = (yr && mo) ? `${yr}${mo.padStart(2, '0')}` : ym
          allItems.push({
            deal_ym: dealYm,
            amount,
            area:  parseFloat(xmlTagValue(block, 'excluUseAr') ?? xmlTagValue(block, '전용면적') ?? '0') || null,
            floor: xmlTagValue(block, 'floor') ?? xmlTagValue(block, '층'),
            name:  xmlTagValue(block, 'aptNm') ?? xmlTagValue(block, '아파트') ?? xmlTagValue(block, '건물명'),
            dong:  xmlTagValue(block, 'umdNm') ?? xmlTagValue(block, '법정동'),
            type:  svcName,
          })
        }
      } catch (e) {
        console.error('[collect-real-price] fetch error:', svcName, ym, e)
      }
    })
  )

  // 최신순 정렬
  allItems.sort((a, b) => (b.deal_ym ?? '').localeCompare(a.deal_ym ?? ''))
  return allItems
}

/**
 * 저장할 비교군을 고른다.
 *
 * 국토교통부 실거래가 API는 LAWD_CD(시군구 5자리)+DEAL_YMD로만 조회되고 동 단위 조회가 없다.
 * 그래서 '해당 동만 수집'은 API 레벨에서 불가능하다. 같은 동 거래를 앞으로 당겨 저장하되
 * 동 이름으로 비교군을 부를지는 화면이 실제 구성비(과반 여부)를 보고 결정한다.
 * 여기서 임계값으로 동 필터를 켜고 끄지 않는다 — 과거 '3건 이상이면 동 필터'가
 * 15%짜리 비교군을 그 동 이름으로 표시하게 만들었다.
 */
function selectComparables(items: any[], legal_dong: string | null): any[] {
  if (items.length === 0) return []
  const normTarget = normalizeDong(legal_dong)
  if (!normTarget) return items.slice(0, SAVE_LIMIT)

  const sameDong = items.filter(it => normalizeDong(it.dong) === normTarget)
  const others = items.filter(it => normalizeDong(it.dong) !== normTarget)
  const selected = [...sameDong, ...others].slice(0, SAVE_LIMIT)

  const selectedSame = selected.filter(it => normalizeDong(it.dong) === normTarget).length
  console.log(
    `[collect-real-price] 비교군 ${selected.length}건 중 ${legal_dong} ${selectedSame}건 ` +
    `(${Math.round((selectedSame / selected.length) * 100)}%) / 조회 전체 ${items.length}건`,
  )
  return selected
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  const authHeader = req.headers.get('Authorization') ?? ''
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  )

  try {
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) throw new Error('인증되지 않은 요청입니다')

    const body = await req.json()
    const { project_id } = body
    if (!project_id) throw new Error('project_id가 필요합니다')

    const { data: project } = await supabaseClient
      .from('projects').select('*').eq('id', project_id).single()
    if (!project) throw new Error('프로젝트를 찾을 수 없습니다')

    // 요청 데이터셋은 매물 종류에서만 유도한다. 매핑에 없는 종류를 아파트로 대체하지 않는다.
    const svcName = project.property_type ? DEAL_SERVICE_MAP[project.property_type] : undefined
    if (!svcName) {
      console.log('[collect-real-price] 공개 실거래 자료 없는 매물 종류:', project.property_type)
      const { error: unsupportedError } = await supabaseClient
        .from('projects')
        .update({ real_price_data: [] })
        .eq('id', project_id)
      if (unsupportedError) throw new Error('실거래가 수집 결과를 저장하지 못했습니다')
      return new Response(
        JSON.stringify({ success: true, count: 0, status: 'unsupported', property_type: project.property_type ?? null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    let sigungu_code = project.sigungu_code ?? ''

    // sigungu_code 없으면 Kakao geocoding으로 추출
    if (!sigungu_code) {
      const kakaoKey = Deno.env.get('KAKAO_REST_API_KEY') ?? ''
      if (!kakaoKey) throw new Error('주소 좌표 변환 기능이 아직 연결되지 않았습니다')

      const geoRes = await fetch(
        `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(project.address)}`,
        { headers: { Authorization: `KakaoAK ${kakaoKey}` } }
      )
      const geoData = await geoRes.json()
      if (geoData.documents?.length > 0) {
        const addr = geoData.documents[0].address ?? geoData.documents[0].road_address
        const bCode = addr?.b_code ?? ''
        sigungu_code = extractSigunguCode(bCode)
        if (sigungu_code) {
          const { error: geoUpdateError } = await supabaseClient.from('projects')
            .update({ sigungu_code, lat: parseFloat(geoData.documents[0].y), lng: parseFloat(geoData.documents[0].x) })
            .eq('id', project_id)
          if (geoUpdateError) console.error('[collect-real-price] 좌표 저장 실패:', geoUpdateError)
        }
      }
    }

    if (!sigungu_code) throw new Error('시군구 코드를 찾을 수 없습니다 (주소를 확인하세요)')

    const apiKey = Deno.env.get('PUBLIC_DATA_API_KEY') ?? Deno.env.get('BUILDING_API_KEY') ?? ''
    if (!apiKey) throw new Error('실거래가 자료 연결이 아직 준비되지 않았습니다')

    console.log('[collect-real-price] sigungu_code:', sigungu_code, 'legal_dong:', project.legal_dong, 'type:', project.property_type, 'service:', svcName)

    const allItems = await collectRealPrice(sigungu_code, svcName, apiKey)
    const real_price_data = selectComparables(allItems, project.legal_dong ?? null)

    console.log('[collect-real-price] total items:', real_price_data.length)

    const { error: updateError } = await supabaseClient.from('projects')
      .update({ real_price_data })
      .eq('id', project_id)
    if (updateError) {
      console.error('[collect-real-price] update 실패:', updateError)
      throw new Error('실거래가 수집 결과를 저장하지 못했습니다')
    }

    return new Response(JSON.stringify({
      success: true,
      count: real_price_data.length,
      status: real_price_data.length > 0 ? 'available' : 'empty',
      service: svcName,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('[collect-real-price]', error)
    const message = error instanceof Error ? error.message : '실거래가 수집에 실패했습니다'
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
