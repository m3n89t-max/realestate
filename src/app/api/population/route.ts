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
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })

    const { data: project } = await supabase
      .from('projects')
      .select('id')
      .eq('id', project_id)
      .single()
    if (!project) return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다' }, { status: 404 })

    const { error, data } = await supabase.functions.invoke('collect-population', {
      body: { project_id },
    })

    if (error) {
      // FunctionsHttpError.context는 실제 Response — 본문에서 실제 에러 메시지 추출
      let msg = error.message
      try {
        const body = await (error as any).context?.json?.()
        if (body?.error) msg = body.error
      } catch { /* ignore */ }
      console.error('[population] Edge Function error:', msg)
      throw new Error(msg)
    }
    if (data?.success === false) throw new Error(data.error ?? 'SGIS 수집 실패')

    return NextResponse.json({ success: true, population_data: data?.population_data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || '인구 데이터 수집 실패' }, { status: 500 })
  }
}
