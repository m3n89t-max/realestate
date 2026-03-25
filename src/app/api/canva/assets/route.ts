import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { CanvaClient, refreshCanvaToken } from '@/lib/canva-client'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const { image_url, name } = await req.json()
    if (!image_url) return NextResponse.json({ error: 'image_url 필요' }, { status: 400 })

    // org canva_token 가져오기
    const { data: membership } = await supabase
      .from('memberships').select('org_id').eq('user_id', user.id).not('joined_at', 'is', null).limit(1).single()
    if (!membership?.org_id) return NextResponse.json({ error: 'org 없음' }, { status: 400 })

    const admin = await createAdminClient()
    const { data: org } = await admin.from('organizations').select('canva_token').eq('id', membership.org_id).single()
    if (!org?.canva_token) return NextResponse.json({ error: 'Canva 미연결. 설정 페이지에서 Canva를 연결하세요.' }, { status: 400 })

    let token = org.canva_token as { access_token: string; refresh_token: string; expires_at: number; token_type: string }

    // token 만료 시 갱신
    if (token.expires_at < Date.now() + 60_000) {
      const refreshed = await refreshCanvaToken(token.refresh_token)
      await admin.from('organizations').update({ canva_token: refreshed }).eq('id', membership.org_id)
      token = refreshed
    }

    const client = new CanvaClient(token.access_token)
    const assetId = await client.uploadAsset(image_url, name ?? 'card-image')

    return NextResponse.json({ asset_id: assetId })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
