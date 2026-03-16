import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

// 국토교통부 실거래가 API 서비스 매핑
const DEAL_SERVICE_MAP: Record<string, string> = {
  apartment:  'RTMSDataSvcAptTrade',
  officetel:  'RTMSDataSvcOffiTrade',
  villa:      'RTMSDataSvcRHTrade',
  house:      'RTMSDataSvcSHTrade',
  commercial: 'RTMSDataSvcNrgTrade',
  land:       'RTMSDataSvcLandTrade',
}

function xmlTagValue(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))
  return m ? m[1].trim() : null
}

function extractSigunguCode(bCode: string): string {
  return bCode.slice(0, 5)
}

async function collectRealPrice(
  sigungu_code: string,
  property_type: string | null,
  apiKey: string
): Promise<any[]> {
  const now = new Date()
  const months: string[] = []
  for (let i = 1; i <= 6; i++) {
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
  )

  // 최신순 정렬
  allItems.sort((a, b) => (b.deal_ym ?? '').localeCompare(a.deal_ym ?? ''))
  return allItems
}

// 같은 동(洞) 우선 필터링
function filterByDong(items: any[], legal_dong: string | null): any[] {
  if (!legal_dong || items.length === 0) return items.slice(0, 60)

  // 법정동 이름 정규화 (예: "역삼1동" → "역삼동" 포함 여부 체크)
  const normDong = legal_dong.replace(/[0-9]/g, '').replace('동', '')

  const sameDong = items.filter(it => {
    if (!it.dong) return false
    return it.dong.includes(normDong) || it.dong.includes(legal_dong)
  })

  // 같은 동 거래가 3건 이상이면 동 필터 적용, 아니면 전체 시군구 데이터
  if (sameDong.length >= 3) {
    console.log(`[collect-real-price] 동 필터 적용: ${legal_dong} → ${sameDong.length}건 / 전체 ${items.length}건`)
    return sameDong.slice(0, 60)
  }

  console.log(`[collect-real-price] 동 필터 결과 부족(${sameDong.length}건), 전체 시군구 사용`)
  return items.slice(0, 60)
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

    let sigungu_code = project.sigungu_code ?? ''

    // sigungu_code 없으면 Kakao geocoding으로 추출
    if (!sigungu_code) {
      const kakaoKey = Deno.env.get('KAKAO_REST_API_KEY') ?? ''
      if (!kakaoKey) throw new Error('KAKAO_REST_API_KEY가 설정되지 않았습니다')

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
          await supabaseClient.from('projects')
            .update({ sigungu_code, lat: parseFloat(geoData.documents[0].y), lng: parseFloat(geoData.documents[0].x) })
            .eq('id', project_id)
        }
      }
    }

    if (!sigungu_code) throw new Error('시군구 코드를 찾을 수 없습니다 (주소를 확인하세요)')

    const apiKey = Deno.env.get('PUBLIC_DATA_API_KEY') ?? Deno.env.get('BUILDING_API_KEY') ?? ''
    if (!apiKey) throw new Error('PUBLIC_DATA_API_KEY가 설정되지 않았습니다')

    console.log('[collect-real-price] sigungu_code:', sigungu_code, 'legal_dong:', project.legal_dong, 'type:', project.property_type)

    const allItems = await collectRealPrice(sigungu_code, project.property_type, apiKey)
    const real_price_data = filterByDong(allItems, project.legal_dong ?? null)

    console.log('[collect-real-price] total items:', real_price_data.length)

    await supabaseClient.from('projects')
      .update({ real_price_data })
      .eq('id', project_id)

    return new Response(JSON.stringify({ success: true, count: real_price_data.length }), {
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
