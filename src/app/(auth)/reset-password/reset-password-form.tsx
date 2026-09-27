'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordForm() {
  const router = useRouter()
  const supabase = createClient()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [passwordChanged, setPasswordChanged] = useState(false)
  const [message, setMessage] = useState('새 비밀번호를 입력해 주세요.')

  const completeRecovery = async () => {
    const response = await fetch('/auth/recovery/complete', { method: 'POST', credentials: 'same-origin' })
    if (!response.ok) {
      setSubmitting(false)
      setMessage('비밀번호는 변경됐지만 보안 로그아웃을 완료하지 못했습니다. 아래 버튼으로 다시 시도해 주세요.')
      return
    }
    router.replace('/login?message=password-reset')
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (passwordChanged) { setSubmitting(true); await completeRecovery(); return }
    if (password.length < 6) { setMessage('비밀번호는 6자 이상 입력해 주세요.'); return }
    if (password !== confirmation) { setMessage('비밀번호 확인이 일치하지 않습니다.'); return }
    setSubmitting(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setSubmitting(false); setMessage('비밀번호를 변경하지 못했습니다. 재설정 링크를 다시 요청해 주세요.'); return }
    setPasswordChanged(true)
    await completeRecovery()
  }

  return <main className="grid min-h-screen place-items-center bg-[#faf9f5] p-4"><section className="w-full max-w-md rounded-2xl bg-white p-7 shadow-sm"><h1 className="text-2xl font-bold text-slate-950">비밀번호 재설정</h1><p className="mt-3 text-sm leading-6 text-slate-600" role="status">{message}</p><form onSubmit={submit} className="mt-6 space-y-4"><label className="label">새 비밀번호<input className="input mt-2" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} required disabled={passwordChanged} /></label><label className="label">새 비밀번호 확인<input className="input mt-2" type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={6} required disabled={passwordChanged} /></label><button className="btn-primary w-full" type="submit" disabled={submitting}>{submitting ? <><Loader2 className="animate-spin" size={16} />처리 중</> : passwordChanged ? '보안 로그아웃 다시 시도' : '비밀번호 변경'}</button></form><Link href="/login" className="mt-5 inline-block text-sm font-semibold text-brand-700 underline">로그인으로 돌아가기</Link></section></main>
}
