import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const RECOVERY_PREFLIGHT = 'recovery-request'
const neutralBody = { message: '입력한 이메일을 사용할 수 있는 경우 재설정 안내를 보냈습니다.' }
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) return new NextResponse(null, { status: 403 })

  let email = ''
  try {
    const body = await request.json()
    if (typeof body?.email === 'string') email = body.email.trim()
  } catch {
    return NextResponse.json(neutralBody, { status: 400 })
  }
  if (!emailPattern.test(email) || email.length > 254) return NextResponse.json(neutralBody, { status: 400 })

  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${new URL(request.url).origin}/auth/confirm?next=%2Freset-password`,
  })

  // Keep this response neutral so the endpoint cannot be used to enumerate accounts.
  const response = NextResponse.json(neutralBody)
  if (!error) {
    response.cookies.set(RECOVERY_PREFLIGHT, '1', {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/auth/confirm',
      maxAge: 10 * 60,
    })
  }
  return response
}
