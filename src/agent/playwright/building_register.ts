import { AgentConfig } from '../config';
import { sendTaskProgress } from '../webhook-client';
import { createClient } from '@supabase/supabase-js';

/**
 * 건축물대장 다운로드 — 공공데이터포털 건축HUB API
 * Playwright 스크래핑 방식에서 공식 REST API 방식으로 교체
 */
export async function downloadBuildingRegister(
    task: any,
    config: AgentConfig
): Promise<Record<string, unknown>> {
    const projectId  = task.project_id
    const sigunguCd  = task.payload?.sigungu_code ?? ''
    const bjdongCd   = task.payload?.bjdong_code  ?? ''
    const bun        = (task.payload?.bun  ?? '0000').padStart(4, '0')
    const ji         = (task.payload?.ji   ?? '0000').padStart(4, '0')
    const address    = task.payload?.normalized_address ?? task.payload?.address ?? ''

    if (!sigunguCd || !bjdongCd) {
        throw new Error('[SEARCH_NOT_FOUND] 지번 코드 정보가 없습니다. 주소 정규화를 먼저 실행하세요.')
    }

    const apiKey = (config as any).building_api_key
    if (!apiKey) {
        throw new Error('[CONFIG_MISSING] building_api_key가 설정되지 않았습니다. 에이전트 설정 화면에서 입력하세요.')
    }

    await progress(config, task.id, `건축물대장 API 조회 시작: ${address}`, 10)

    // ── 표제부 조회 ───────────────────────────────────────────
    await progress(config, task.id, '표제부 조회 중...', 30)
    const titleItems = await callApi(apiKey, 'getBrTitleInfo', sigunguCd, bjdongCd, bun, ji)

    // ── 층별개요 조회 ─────────────────────────────────────────
    await progress(config, task.id, '층별개요 조회 중...', 55)
    const floorItems = await callApi(apiKey, 'getBrFlrOulnInfo', sigunguCd, bjdongCd, bun, ji)

    // ── 전유부 조회 (집합건물) ────────────────────────────────
    await progress(config, task.id, '전유부 조회 중...', 70)
    const exclItems  = await callApi(apiKey, 'getBrExposPublcInfo', sigunguCd, bjdongCd, bun, ji).catch(() => [])

    const results = { title: titleItems, floors: floorItems, exclusive: exclItems }

    // ── Supabase documents 저장 ───────────────────────────────
    await progress(config, task.id, 'Supabase에 저장 중...', 85)
    const supabase = createClient(config.supabase_url, config.supabase_anon_key)

    const { data: proj } = await supabase.from('projects').select('org_id').eq('id', projectId).single()

    if (proj) {
        await supabase.from('documents').upsert({
            project_id: projectId,
            org_id:     proj.org_id,
            type:       'building_register',
            status:     'completed',
            raw_data:   results,
            summary:    formatSummary(titleItems),
            fetched_at: new Date().toISOString(),
        }, { onConflict: 'project_id,type' })
    }

    await progress(config, task.id, '건축물대장 조회 완료! ✅', 100)

    return {
        title_count: titleItems.length,
        floor_count: floorItems.length,
        summary:     formatSummary(titleItems),
    }
}

// ── API 호출 공통 함수 ────────────────────────────────────────
async function callApi(
    apiKey: string,
    operation: string,
    sigunguCd: string,
    bjdongCd: string,
    bun: string,
    ji: string
): Promise<any[]> {
    const url = new URL(`https://apis.data.go.kr/1613000/BldRgstHubService/${operation}`)
    url.searchParams.set('serviceKey', apiKey)
    url.searchParams.set('sigunguCd', sigunguCd)
    url.searchParams.set('bjdongCd',  bjdongCd)
    url.searchParams.set('bun',       bun)
    url.searchParams.set('ji',        ji)
    url.searchParams.set('numOfRows', '100')
    url.searchParams.set('pageNo',    '1')
    url.searchParams.set('_type',     'json')

    const res = await fetch(url.toString())
    if (!res.ok) throw new Error(`API 오류 ${res.status}: ${operation}`)

    const json = await res.json()
    const resultCode = json?.response?.header?.resultCode
    if (resultCode && resultCode !== '00') {
        throw new Error(`API 오류 ${resultCode}: ${json?.response?.header?.resultMsg}`)
    }

    const item = json?.response?.body?.items?.item
    if (!item) return []
    return Array.isArray(item) ? item : [item]
}

// ── 표제부 요약 텍스트 ────────────────────────────────────────
function formatSummary(items: any[]): string {
    if (!Array.isArray(items) || items.length === 0) return ''
    const t = items[0]
    return [
        `건물명: ${t.bldNm ?? '-'}`,
        `주용도: ${t.mainPurpsCdNm ?? '-'}`,
        `구조: ${t.strctCdNm ?? '-'}`,
        `연면적: ${t.totArea ?? '-'}㎡`,
        `건폐율: ${t.bcRat ?? '-'}%`,
        `용적률: ${t.vlRat ?? '-'}%`,
        `사용승인일: ${t.useAprDay ?? '-'}`,
        `지상층수: ${t.grndFlrCnt ?? '-'}층 / 지하 ${t.ugrndFlrCnt ?? '-'}층`,
    ].join('\n')
}

async function progress(config: AgentConfig, taskId: string, message: string, pct: number) {
    console.log(`  [${pct}%] ${message}`)
    if (config.agent_key) {
        await sendTaskProgress(config, taskId, message, 'info', pct)
    }
}
