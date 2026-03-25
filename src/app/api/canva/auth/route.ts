import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

function base64URLEncode(buf: Buffer) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

export async function GET(req: NextRequest) {
  const clientId = process.env.CANVA_CLIENT_ID
  const redirectUri = process.env.CANVA_REDIRECT_URI

  if (!clientId || !redirectUri) {
    return NextResponse.json({ error: 'CANVA_CLIENT_ID or CANVA_REDIRECT_URI not set' }, { status: 500 })
  }

  // PKCE: code_verifier + code_challenge
  const codeVerifier = base64URLEncode(crypto.randomBytes(32))
  const codeChallenge = base64URLEncode(
    crypto.createHash('sha256').update(codeVerifier).digest()
  )
  const state = base64URLEncode(crypto.randomBytes(16))

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'asset:read asset:write design:content:read design:content:write brandtemplate:content:read',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })

  const authUrl = `https://www.canva.com/api/oauth/authorize?${params}`

  // codeVerifier와 state를 쿠키에 임시 저장 (10분)
  const response = NextResponse.redirect(authUrl)
  response.cookies.set('canva_cv', codeVerifier, { httpOnly: true, maxAge: 600, path: '/' })
  response.cookies.set('canva_state', state, { httpOnly: true, maxAge: 600, path: '/' })

  return response
}
