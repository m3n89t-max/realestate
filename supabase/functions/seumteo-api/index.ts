import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { getAuthenticatedUser, getOrgId } from '../_shared/auth.ts'

const SEUMTEO_BASE_URL = 'https://apis.data.go.kr/1613000'

interface SeumteoParams {
  sigunguCd: string
  bjdongCd: string
  bun: string
  ji: string
}

async function addressToSeumteoCode(address: string): Promise<SeumteoParams | null> {
  // 카카오맵 API로 지번 주소 파싱
  const kakaoKey = Deno.env.get('KAKAO_REST_API_KEY')
  if (!kakaoKey) return null

  const res = await fetch(
    `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}`,
    { headers: { Authorization: `KakaoAK ${kakaoKey}` } }
  )
  const data = await res.json()

  if (!data.documents?.length) return null
  const doc = data.documents[0]
  const addr = doc.address ?? doc.road_address

  if (!addr) return null

  return {
    sigunguCd: addr.b_code?.slice(0, 5) ?? '',
    bjdongCd: addr.b_code?.slice(5, 10) ?? '',
    bun: addr.main_address_no?.padStart(4, '0') ?? '0000',
    ji: addr.sub_address_no?.padStart(4, '0') ?? '0000',
  }
}

async function callSeumteoAPI(endpoint: string, params: Record<string, string>): Promise<unknown> {
  const apiKey = Deno.env.get('SEUMTEO_API_KEY')
  if (!apiKey) throw new Error('세움터 API 키가 설정되지 않았습니다')

  const queryParams = new URLSearchParams({
    serviceKey: apiKey,
    numOfRows: '10',
    pageNo: '1',
    _type: 'json',
    ...params,
  })

  const url = `${SEUMTEO_BASE_URL}${endpoint}?${queryParams}`
  const res = await fetch(url)

  if (!res.ok) throw new Error(`세움터 API 오류: ${res.status}`)

  const data = await res.json()
  return data.response?.body?.items?.item ?? []
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const { user, supabaseClient } = await getAuthenticatedUser(req)
    await getOrgId(supabaseClient, user.id)

    const { project_id, action = 'permit_history' } = await req.json()
    if (!project_id) throw new Error('project_id가 필요합니다')

    const { data: project } = await supabaseClient
      .from('projects')
      .select('address, jibun_address')
      .eq('id', project_id)
      .single()
    if (!project) throw new Error('프로젝트를 찾을 수 없습니다')

    const seumteoCode = await addressToSeumteoCode(project.jibun_address ?? project.address)
    if (!seumteoCode) throw new Error('주소를 세움터 코드로 변환할 수 없습니다')

    let result: unknown

    if (action === 'permit_history') {
      // 건축허가 정보 조회
      result = await callSeumteoAPI('/ArchPmsService/getApBasisOulnInfo', {
        sigunguCd: seumteoCode.sigunguCd,
        bjdongCd: seumteoCode.bjdongCd,
        bun: seumteoCode.bun,
        ji: seumteoCode.ji,
      })

      // documents 테이블에 저장
      await supabaseClient.from('documents').insert({
        project_id,
        org_id: (await supabaseClient.from('projects').select('org_id').eq('id', project_id).single()).data?.org_id,
        type: 'permit_history',
        file_name: '인허가이력_세움터.json',
        raw_text: JSON.stringify(result),
        summary: {
          summary_text: `세움터 인허가 이력 ${Array.isArray(result) ? result.length : 0}건 조회 완료`,
          violation: false,
        },
      })
    } else if (action === 'floor_plan_list') {
      // 설계도면 목록 조회
      result = await callSeumteoAPI('/ArchPmsService/getApFloorPlanList', {
        sigunguCd: seumteoCode.sigunguCd,
        bjdongCd: seumteoCode.bjdongCd,
        bun: seumteoCode.bun,
        ji: seumteoCode.ji,
      })
    }

    return new Response(JSON.stringify({ success: true, data: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[seumteo-api]', err)
    const message = err instanceof Error ? err.message : '세움터 조회에 실패했습니다'
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
