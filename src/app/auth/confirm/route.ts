import { type EmailOtpType } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sanitizeAuthNext, shouldIssueRecoveryMarker } from '@/lib/auth'

const RECOVERY_MARKER = 'recovery_reset_authorized'
const RECOVERY_PREFLIGHT = 'recovery-request'

function redirectAfterAuth(origin: string, next: string, issueRecoveryMarker: boolean, consumeRecoveryPreflight = false) {
  const response = NextResponse.redirect(new URL(next, origin))
  if (issueRecoveryMarker) response.cookies.set(RECOVERY_MARKER, '1', { httpOnly: true, sameSite: 'lax', secure: true, path: '/reset-password', maxAge: 10 * 60 })
  if (consumeRecoveryPreflight) response.cookies.set(RECOVERY_PREFLIGHT, '', { httpOnly: true, sameSite: 'lax', secure: true, path: '/auth/confirm', maxAge: 0 })
  return response
}

// 이메일 인증 링크 / OAuth 콜백 처리.
// Supabase가 보낸 확인 링크(?token_hash=&type=) 또는 PKCE 코드(?code=)를
// 세션으로 교환한 뒤 대시보드로 이동시킨다.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const code = searchParams.get('code')
  const next = sanitizeAuthNext(searchParams.get('next'))
  const hasRecoveryPreflight = request.cookies.get(RECOVERY_PREFLIGHT)?.value === '1'

  const supabase = await createClient()

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const issueRecoveryMarker = shouldIssueRecoveryMarker({ flow: 'pkce', successful: true, next, hasRecoveryPreflight })
      if (next === '/reset-password' && !issueRecoveryMarker) {
        return redirectAfterAuth(origin, `/login?error=${encodeURIComponent('비밀번호 재설정 요청을 다시 시작해 주세요.')}`, false, hasRecoveryPreflight)
      }
      return redirectAfterAuth(origin, next, issueRecoveryMarker, hasRecoveryPreflight)
    }
  } else if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (!error) return redirectAfterAuth(origin, next, shouldIssueRecoveryMarker({ flow: 'token_hash', successful: true, next, type }), hasRecoveryPreflight)
  }

  // Do not log callback parameters: they can contain one-time credentials.
  console.warn('[auth callback] verification failed')

  return redirectAfterAuth(origin, `/login?error=${encodeURIComponent('인증 링크가 만료되었거나 올바르지 않습니다. 다시 시도해주세요.')}`, false, hasRecoveryPreflight)
}
