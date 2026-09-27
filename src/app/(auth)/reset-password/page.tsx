import Link from 'next/link'
import { cookies } from 'next/headers'
import ResetPasswordForm from './reset-password-form'

const RECOVERY_MARKER = 'recovery_reset_authorized'

export default async function ResetPasswordPage() {
  const hasRecoveryMarker = (await cookies()).get(RECOVERY_MARKER)?.value === '1'
  if (!hasRecoveryMarker) {
    return <main className="grid min-h-screen place-items-center bg-[#faf9f5] p-4"><section className="w-full max-w-md rounded-2xl bg-white p-7 shadow-sm"><h1 className="text-2xl font-bold text-slate-950">비밀번호 재설정</h1><p className="mt-3 text-sm leading-6 text-slate-600">재설정 링크가 만료되었거나 올바르지 않습니다. 로그인 화면에서 다시 요청해 주세요.</p><Link href="/login" className="btn-primary mt-6 w-full">로그인으로 이동</Link></section></main>
  }
  return <ResetPasswordForm />
}
