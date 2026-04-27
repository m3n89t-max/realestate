import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * SGIS API는 한국 정부 서버로 Vercel(미국) 에서 직접 호출 시 네트워크 차단됨.
 * 대신 Supabase Edge Function(아시아 리전)에서 호출한다.
 */
export async function POST(req: NextRequest) {
  try {
    const { project_id } = await req.json()
    if (!project_id) return NextResponse.json({ error: 'project_id가 필요합니다' }, { status: 400 })

    const supabase = await createClient()
    const { error, data } = await supabase.functions.invoke('collect-population', {
      body: { project_id },
    })

    if (error) throw new Error(error.message)
    if (data?.success === false) throw new Error(data.error ?? 'SGIS 수집 실패')

    return NextResponse.json({ success: true, population_data: data?.population_data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || '인구 데이터 수집 실패' }, { status: 500 })
  }
}
