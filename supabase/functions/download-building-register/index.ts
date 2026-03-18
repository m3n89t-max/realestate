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

    let docId: string | null = null
    if (projectData) {
      const { data: savedDoc } = await adminClient.from('documents').upsert({
        project_id,
        org_id:    projectData.org_id,
        type:      'building_register',
        status:    'completed',
        raw_data:  results,
        raw_text:  formatRawText(results),
        summary:   formatSummary(results.title),
        fetched_at: new Date().toISOString(),
      }, { onConflict: 'project_id,type' }).select('id').single()
      docId = savedDoc?.id ?? null
    }

    // ── AI 요약 자동 실행 ──────────────────────────────────────
    if (docId) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
        await fetch(`${supabaseUrl}/functions/v1/analyze-document`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({ document_id: docId }),
        })
        console.log('[download-building-register] AI 요약 자동 실행 완료')
      } catch (aiErr) {
        console.warn('[download-building-register] AI 요약 실패 (비필수):', aiErr)
      }
    }

    // task → success
    if (task_id) {
      await adminClient.from('tasks').update({
        status:       'success',
        result:       { api_data: results, doc_id: docId },
        completed_at: new Date().toISOString(),
      }).eq('id', task_id)
    }

    return new Response(JSON.stringify({ success: true, data: results, doc_id: docId }), {
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

// ── AI 분석용 raw_text 생성 ────────────────────────────────────
function formatRawText(results: Record<string, any>): string {
  const lines: string[] = ['=== 건축물대장 원문 데이터 ===\n']

  if (Array.isArray(results.title) && results.title.length > 0) {
    lines.push('[표제부]')
    const t = results.title[0]
    lines.push(`건물명: ${t.bldNm ?? '-'}`)
    lines.push(`주용도: ${t.mainPurpsCdNm ?? '-'}`)
    lines.push(`부용도: ${t.etcPurps ?? '-'}`)
    lines.push(`구조: ${t.strctCdNm ?? '-'}`)
    lines.push(`지붕: ${t.roofCdNm ?? '-'}`)
    lines.push(`연면적: ${t.totArea ?? '-'}㎡`)
    lines.push(`건축면적: ${t.archArea ?? '-'}㎡`)
    lines.push(`대지면적: ${t.platArea ?? '-'}㎡`)
    lines.push(`건폐율: ${t.bcRat ?? '-'}%`)
    lines.push(`용적률: ${t.vlRat ?? '-'}%`)
    lines.push(`사용승인일: ${t.useAprDay ?? '-'}`)
    lines.push(`착공일: ${t.stcnsDay ?? '-'}`)
    lines.push(`지상층수: ${t.grndFlrCnt ?? '-'}층`)
    lines.push(`지하층수: ${t.ugrndFlrCnt ?? '-'}층`)
    lines.push(`승강기: ${t.rideUseElvtCnt ?? 0}대(승용) + ${t.emgenUseElvtCnt ?? 0}대(비상)`)
    lines.push(`주차대수: 기계식 ${t.indrMechUtcnt ?? 0}대 + 옥외 ${t.oudrMechUtcnt ?? 0}대 + 자주식 ${t.indrAutoUtcnt ?? 0}대`)
    lines.push(`위반건축물: ${t.vltnBldYn === 'Y' ? '있음 ⚠️' : '없음'}`)
    lines.push(`현장관리인: ${t.siteMgmtSttus ?? '-'}`)
  }

  if (Array.isArray(results.floors) && results.floors.length > 0) {
    lines.push('\n[층별개요]')
    for (const f of results.floors.slice(0, 20)) {
      lines.push(`  ${f.flrNoNm ?? f.flrNo}층: ${f.mainPurpsCdNm ?? '-'} ${f.area ?? '-'}㎡`)
    }
  }

  if (Array.isArray(results.exclusive) && results.exclusive.length > 0) {
    lines.push('\n[전유부]')
    for (const e of results.exclusive.slice(0, 10)) {
      lines.push(`  ${e.flrNoNm}층 ${e.hoNm ?? ''}: ${e.mainPurpsCdNm ?? '-'} ${e.area ?? '-'}㎡`)
    }
  }

  return lines.join('\n')
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
