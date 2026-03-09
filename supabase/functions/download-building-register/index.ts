import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors } from '../_shared/cors.ts'
import { corsHeaders } from '../_shared/cors.ts'

/**
 * 건축물대장 다운로드 Edge Function
 * 공공데이터포털 건축HUB API 사용
 * Endpoint: https://apis.data.go.kr/1613000/BldRgstHubService
 *
 * Webhook(tasks INSERT) 또는 직접 호출 모두 지원
 */
Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const body = await req.json()

    // Webhook payload 또는 직접 호출 지원
    const task    = body.record ?? body
    const task_id = task.id
    const payload = task.payload ?? {}

    const project_id = payload.project_id ?? task.project_id

    if (!project_id) throw new Error('project_id가 없습니다')

    const apiKey = Deno.env.get('BUILDING_API_KEY')
    if (!apiKey) throw new Error('BUILDING_API_KEY 환경변수가 설정되지 않았습니다')

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // payload에 코드가 없으면 projects 테이블에서 조회
    let sigungu_code = payload.sigungu_code ?? ''
    let bjdong_code  = payload.bjdong_code  ?? ''
    let bun          = payload.bun ?? ''
    let ji           = payload.ji  ?? ''

    if (!sigungu_code || !bjdong_code) {
      const { data: projData } = await adminClient
        .from('projects')
        .select('sigungu_code, bjdong_code, bun, ji')
        .eq('id', project_id)
        .single()
      sigungu_code = projData?.sigungu_code ?? ''
      bjdong_code  = projData?.bjdong_code  ?? ''
      bun          = bun || projData?.bun || '0'
      ji           = ji  || projData?.ji  || '0'
    }

    bun = (bun || '0').padStart(4, '0')
    ji  = (ji  || '0').padStart(4, '0')

    if (!sigungu_code) throw new Error('sigungu_code가 없습니다 (매물 주소 정규화 먼저 실행)')
    if (!bjdong_code)  throw new Error('bjdong_code가 없습니다 (매물 주소 정규화 먼저 실행)')

    // task → running
    if (task_id) {
      await adminClient.from('tasks').update({
        status: 'running',
        started_at: new Date().toISOString(),
      }).eq('id', task_id)
    }

    // ── 건축HUB API 호출 ──────────────────────────────────────
    const results: Record<string, any> = {}

    // 1. 표제부 (기본 정보)
    const titleRes = await callBuildingApi(apiKey, 'getBrTitleInfo', {
      sigunguCd: sigungu_code,
      bjdongCd:  bjdong_code,
      bun,
      ji,
    })
    results.title = titleRes

    // 2. 층별개요
    const floorRes = await callBuildingApi(apiKey, 'getBrFlrOulnInfo', {
      sigunguCd: sigungu_code,
      bjdongCd:  bjdong_code,
      bun,
      ji,
    })
    results.floors = floorRes

    // 3. 전유부 (집합건물인 경우)
    const expRes = await callBuildingApi(apiKey, 'getBrExposPublcInfo', {
      sigunguCd: sigungu_code,
      bjdongCd:  bjdong_code,
      bun,
      ji,
    }).catch(() => null)
    if (expRes) results.exclusive = expRes

    // ── documents 테이블에 저장 ───────────────────────────────
    const { data: projectData } = await adminClient
      .from('projects')
      .select('org_id')
      .eq('id', project_id)
      .single()

    if (projectData) {
      await adminClient.from('documents').upsert({
        project_id,
        org_id:    projectData.org_id,
        type:      'building_register',
        status:    'completed',
        raw_data:  results,
        summary:   formatSummary(results.title),
        fetched_at: new Date().toISOString(),
      }, { onConflict: 'project_id,type' })
    }

    // task → success
    if (task_id) {
      await adminClient.from('tasks').update({
        status:       'success',
        result:       { api_data: results },
        completed_at: new Date().toISOString(),
      }).eq('id', task_id)
    }

    return new Response(JSON.stringify({ success: true, data: results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    const msg = err instanceof Error ? err.message : '건축물대장 조회 실패'
    console.error('[download-building-register]', msg)

    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

// ── 건축HUB API 공통 호출 함수 ────────────────────────────────
async function callBuildingApi(
  apiKey: string,
  operation: string,
  params: Record<string, string>
): Promise<any> {
  const url = new URL(`https://apis.data.go.kr/1613000/BldRgstHubService/${operation}`)
  url.searchParams.set('serviceKey', apiKey)
  url.searchParams.set('numOfRows', '100')
  url.searchParams.set('pageNo', '1')
  url.searchParams.set('_type', 'json')
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`API 오류 ${res.status}: ${operation}`)

  const json = await res.json()
  const resultCode = json?.response?.header?.resultCode
  if (resultCode && resultCode !== '00') {
    throw new Error(`API 결과코드 ${resultCode}: ${json?.response?.header?.resultMsg}`)
  }

  return json?.response?.body?.items?.item ?? []
}

// ── 표제부 요약 텍스트 생성 ────────────────────────────────────
function formatSummary(titleItems: any[]): string {
  if (!Array.isArray(titleItems) || titleItems.length === 0) return ''
  const t = titleItems[0]
  const lines = [
    `건물명: ${t.bldNm ?? '-'}`,
    `주용도: ${t.mainPurpsCdNm ?? '-'}`,
    `구조: ${t.strctCdNm ?? '-'}`,
    `연면적: ${t.totArea ?? '-'}㎡`,
    `건폐율: ${t.bcRat ?? '-'}%`,
    `용적률: ${t.vlRat ?? '-'}%`,
    `사용승인일: ${t.useAprDay ?? '-'}`,
    `지상층수: ${t.grndFlrCnt ?? '-'}층`,
    `지하층수: ${t.ugrndFlrCnt ?? '-'}층`,
    `주차대수: ${t.indrMechUtcnt ?? 0}대(기계) + ${t.oudrMechUtcnt ?? 0}대(옥외)`,
  ]
  return lines.join('\n')
}
