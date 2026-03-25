import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server'
import type { CanvaToken } from '@/lib/canva-client'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (error) {
    return NextResponse.redirect(new URL('/settings?canva=error', req.url))
  }

  // PKCE state 검증
  const savedState = req.cookies.get('canva_state')?.value
  const codeVerifier = req.cookies.get('canva_cv')?.value

  if (!code || !state || state !== savedState || !codeVerifier) {
    return NextResponse.redirect(new URL('/settings?canva=error', req.url))
  }

  const clientId = process.env.CANVA_CLIENT_ID!
  const clientSecret = process.env.CANVA_CLIENT_SECRET!
  const redirectUri = process.env.CANVA_REDIRECT_URI!

  try {
    // code → token 교환
    const tokenRes = await fetch('https://api.canva.com/rest/v1/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
        code_verifier: codeVerifier,
      }),
    })

    if (!tokenRes.ok) {
      throw new Error(`Token exchange failed: ${await tokenRes.text()}`)
    }

    const tokenData = await tokenRes.json() as {
      access_token: string
      refresh_token: string
      expires_in: number
      token_type: string
    }

    const canvaToken: CanvaToken = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: Date.now() + tokenData.expires_in * 1000,
      token_type: tokenData.token_type,
    }

    // 현재 사용자 org_id 조회
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data: membership } = await supabase
      .from('memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .not('joined_at', 'is', null)
      .limit(1)
      .single()

    if (!membership?.org_id) throw new Error('No organization found')

    // token을 organizations 테이블에 저장
    const admin = await createAdminClient()
    await admin
      .from('organizations')
      .update({ canva_token: canvaToken })
      .eq('id', membership.org_id)

    const response = NextResponse.redirect(new URL('/settings?canva=connected', req.url))
    // 쿠키 삭제
    response.cookies.delete('canva_cv')
    response.cookies.delete('canva_state')
    return response

  } catch (e: any) {
    console.error('Canva OAuth callback error:', e.message)
    return NextResponse.redirect(new URL('/settings?canva=error', req.url))
  }
}
