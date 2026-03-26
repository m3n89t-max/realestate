import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

// 제주데이터허브 API proxy 경로
const JEJU_BASE = 'https://open.jejudatahub.net/api/proxy'
const PROXY_WEEKDAY  = '868ttD1tbDb8tbt00tDtaba6t0Db1110'  // 관광지·상업지구 요일별 카드
const PROXY_TIMESLOT = 'DD7a1ta6tba70bt7tD1D1aDttDt701b7'  // 관광지·상업지구 시간대별 카드

// 요일 → 주중/주말 분류
const WEEKDAY_SET = new Set(['월', '화', '수', '목', '금'])
const WEEKEND_SET = new Set(['토', '일'])

// 시간대 한글 → 인덱스 매핑 (by_hour 배열: [밤,오전,점심,오후,저녁])
const TIME_ORDER = ['밤', '오전', '점심', '오후', '저녁']

// YYYYMM 문자열 생성
function toYYYYMM(date: Date): string {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`
}

// 최근 N개월 범위 반환
function dateRange(monthsBack: number): { startDate: string; endDate: string } {
  const end = new Date()
  const start = new Date()
  start.setMonth(start.getMonth() - monthsBack)
  return { startDate: toYYYYMM(start), endDate: toYYYYMM(end) }
}

async function fetchJeju(proxyPath: string, appKey: string, params: Record<string, string>): Promise<any[]> {
  const qs = new URLSearchParams({ ...params, limit: '100' }).toString()
  const url = `${JEJU_BASE}/${proxyPath}/${appKey}?${qs}`
  console.log('[analyze-jeju-card] GET', url.replace(appKey, appKey.slice(0, 6) + '...'))
  try {
    const res = await fetch(url)
    const json = await res.json()
    return Array.isArray(json.data) ? json.data : []
  } catch (e) {
    console.error('[analyze-jeju-card] fetch error:', e)
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
    if (!isServiceRole) {
      const { data: { user }, error } = await supabaseClient.auth.getUser()
      if (error || !user) throw new Error('인증되지 않은 요청입니다')
    }

    const { project_id } = await req.json()
    if (!project_id) throw new Error('project_id가 필요합니다')

    const appKey = Deno.env.get('JEJU_DATA_HUB_KEY') ?? ''
    if (!appKey) {
      // 키 미설정 시 placeholder 저장 → 재시도 루프 방지
      await supabaseClient.from('projects')
        .update({ card_data: { available: false, reason: 'JEJU_DATA_HUB_KEY not configured' } })
        .eq('id', project_id)
      return new Response(JSON.stringify({ success: true, skipped: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 최근 12개월 데이터 조회
    const { startDate, endDate } = dateRange(12)
    const params = { startDate, endDate, userType: '내국인관광객' }

    // 요일별 + 시간대별 병렬 조회
    const [weekdayRows, timeslotRows] = await Promise.all([
      fetchJeju(PROXY_WEEKDAY, appKey, params),
      fetchJeju(PROXY_TIMESLOT, appKey, params),
    ])

    console.log('[analyze-jeju-card] weekday rows:', weekdayRows.length, 'timeslot rows:', timeslotRows.length)

    // ── 요일별 집계 ──────────────────────────────────────
    const weekdayAgg = { userCount: 0, useCount: 0, useCost: 0, n: 0 }
    const weekendAgg = { userCount: 0, useCount: 0, useCost: 0, n: 0 }

    for (const row of weekdayRows) {
      const day = row.dtWeek as string
      const target = WEEKDAY_SET.has(day) ? weekdayAgg : WEEKEND_SET.has(day) ? weekendAgg : null
      if (!target) continue
      target.userCount += Number(row.userCount ?? 0)
      target.useCount  += Number(row.useCount  ?? 0)
      target.useCost   += Number(row.useCost   ?? 0)
      target.n++
    }

    const avgWeekday = weekdayAgg.n > 0 ? Math.round(weekdayAgg.userCount / weekdayAgg.n) : 0
    const avgWeekend = weekendAgg.n > 0 ? Math.round(weekendAgg.userCount / weekendAgg.n) : 0
    const totalCost  = weekdayAgg.useCost + weekendAgg.useCost

    // 월별 카드 매출 (가장 최근 월)
    const monthlySales: Record<string, number> = {}
    for (const row of weekdayRows) {
      const ym = row.dtYearMonth as string
      monthlySales[ym] = (monthlySales[ym] ?? 0) + Number(row.useCost ?? 0)
    }
    const latestMonth = Object.keys(monthlySales).sort().reverse()[0] ?? null
    const latestMonthlySales = latestMonth ? monthlySales[latestMonth] : 0

    // 요일별 상세 (월~일 평균 userCount)
    const byDay: Record<string, { userCount: number; useCost: number; n: number }> = {}
    for (const row of weekdayRows) {
      const day = row.dtWeek as string
      if (!byDay[day]) byDay[day] = { userCount: 0, useCost: 0, n: 0 }
      byDay[day].userCount += Number(row.userCount ?? 0)
      byDay[day].useCost   += Number(row.useCost   ?? 0)
      byDay[day].n++
    }
    const byDayAvg: Record<string, number> = {}
    for (const [day, agg] of Object.entries(byDay)) {
      byDayAvg[day] = agg.n > 0 ? Math.round(agg.userCount / agg.n) : 0
    }

    // ── 시간대별 집계 ────────────────────────────────────
    const timeAgg: Record<string, { userCount: number; n: number }> = {}
    for (const cat of TIME_ORDER) timeAgg[cat] = { userCount: 0, n: 0 }

    for (const row of timeslotRows) {
      const cat = row.dateTimeCategory as string
      if (!timeAgg[cat]) continue
      timeAgg[cat].userCount += Number(row.userCount ?? 0)
      timeAgg[cat].n++
    }

    // by_hour 배열 (밤/오전/점심/오후/저녁 순)
    const byHour = TIME_ORDER.map(cat => {
      const agg = timeAgg[cat]
      return agg.n > 0 ? Math.round(agg.userCount / agg.n) : 0
    })

    // 피크 시간대
    const peakIdx = byHour.indexOf(Math.max(...byHour))
    const peakLabel = TIME_ORDER[peakIdx] ?? null

    // 데이터 유무 확인
    const hasData = weekdayRows.length > 0 || timeslotRows.length > 0

    const card_data = {
      source: '제주데이터허브',
      period: { startDate, endDate },
      has_data: hasData,
      // 유동인구 추정 (카드 이용자 수 기반)
      floating_population: {
        weekday: avgWeekday,
        weekend: avgWeekend,
        by_hour: byHour,
        by_hour_labels: TIME_ORDER,
        peak_time: peakLabel,
      },
      // 카드 매출
      card_sales: {
        latest_month: latestMonth,
        monthly_sales: latestMonthlySales,
        total_period_sales: totalCost,
      },
      // 요일별 상세
      by_day: byDayAvg,
      collected_at: new Date().toISOString(),
    }

    await supabaseClient.from('projects')
      .update({ card_data })
      .eq('id', project_id)

    return new Response(JSON.stringify({ success: true, card_data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('[analyze-jeju-card]', error)
    const message = error instanceof Error ? error.message : '카드 데이터 수집에 실패했습니다'
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
