import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { CanvaClient, refreshCanvaToken } from '@/lib/canva-client'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { design_id, format = 'png' } = await req.json()
    if (!design_id) return NextResponse.json({ error: 'design_id 필요' }, { status: 400 })

    const { data: membership } = await supabase
      .from('memberships').select('org_id').eq('user_id', user.id).not('joined_at', 'is', null).limit(1).single()
    if (!membership?.org_id) return NextResponse.json({ error: 'org 없음' }, { status: 400 })

    const admin = await createAdminClient()
    const { data: org } = await admin.from('organizations').select('canva_token').eq('id', membership.org_id).single()
    if (!org?.canva_token) return NextResponse.json({ error: 'Canva 미연결' }, { status: 400 })

    let token = org.canva_token as { access_token: string; refresh_token: string; expires_at: number; token_type: string }
    if (token.expires_at < Date.now() + 60_000) {
      const refreshed = await refreshCanvaToken(token.refresh_token)
      await admin.from('organizations').update({ canva_token: refreshed }).eq('id', membership.org_id)
      token = refreshed
    }

    const client = new CanvaClient(token.access_token)
    const exportUrl = await client.exportDesign(design_id, format as 'png' | 'pdf')

    return NextResponse.json({ url: exportUrl })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
