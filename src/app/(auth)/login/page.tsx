'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Building2, Eye, EyeOff, Lock, Loader2, Mail } from 'lucide-react'
import toast from 'react-hot-toast'
import { BRAND } from '@/lib/brand'
import { createClient } from '@/lib/supabase/client'
import { normalizeSignupName } from '@/lib/auth'

type Mode = 'login' | 'signup' | 'forgot' | 'confirmation'

const safeAuthMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  if (message.includes('invalid login')) return '이메일 또는 비밀번호를 다시 확인해 주세요.'
  if (message.includes('password') && message.includes('6')) return '비밀번호는 6자 이상 입력해 주세요.'
  return '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'
}

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<Mode>('login')
  const [confirmedEmail, setConfirmedEmail] = useState('')
  const [confirmationKind, setConfirmationKind] = useState<'signup' | 'reset'>('signup')
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const error = searchParams.get('error')
    if (error) {
      toast.error('인증 링크를 확인할 수 없습니다. 새 인증 메일을 보내 주세요.')
      window.history.replaceState({}, '', '/login')
      return
    }
    if (searchParams.get('mode') === 'signup') setMode('signup')
  }, [])
  useEffect(() => {
    if (!cooldown) return
    const timer = window.setInterval(() => setCooldown(value => Math.max(0, value - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [cooldown])

  const setModeSafely = (next: Mode) => { if (!loading) setMode(next) }
  const redirectTo = (next = '/dashboard') => `${window.location.origin}/auth/confirm?next=${encodeURIComponent(next)}`
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault(); setLoading(true)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
        router.push('/dashboard'); router.refresh()
      } else if (mode === 'forgot') {
        const response = await fetch('/auth/recovery/request', {
          method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: email.trim() }),
        })
        if (!response.ok) throw new Error('recovery-request-failed')
        setConfirmedEmail(email.trim()); setConfirmationKind('reset'); setMode('confirmation')
      } else {
        const name = normalizeSignupName(fullName)
        if (!name) { toast.error('이름을 입력해 주세요.'); return }
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: name }, emailRedirectTo: redirectTo() } })
        if (error) throw error
        if (data.session) { router.push('/dashboard'); router.refresh(); return }
        setConfirmedEmail(email.trim()); setConfirmationKind('signup'); setMode('confirmation')
      }
    } catch (error) { toast.error(safeAuthMessage(error)) } finally { setLoading(false) }
  }
  const resend = async () => {
    if (cooldown || loading) return
    setLoading(true)
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email: confirmedEmail, options: { emailRedirectTo: redirectTo() } })
      if (error) throw error
      setCooldown(60); toast.success('입력한 이메일을 사용할 수 있는 경우 인증 안내를 보냈습니다.')
    } catch (error) { toast.error(safeAuthMessage(error)) } finally { setLoading(false) }
  }

  if (mode === 'confirmation') return <main className="grid min-h-screen place-items-center bg-[#faf9f5] p-4"><section className="w-full max-w-md rounded-2xl bg-white p-7 shadow-sm"><Building2 className="text-brand-700" /><h1 className="mt-5 text-2xl font-bold text-slate-950">이메일을 확인해 주세요</h1><p className="mt-3 text-sm leading-6 text-slate-600"><strong className="block text-slate-900">{confirmedEmail}</strong>입력한 이메일을 사용할 수 있는 경우 인증 안내를 보냈습니다. 받은편지함에 없으면 스팸함도 확인해 주세요.</p>{confirmationKind === 'signup' ? <><button type="button" disabled={loading || cooldown > 0} onClick={resend} className="btn-primary mt-6 w-full">{loading ? <Loader2 className="animate-spin" size={17} /> : null}{cooldown ? `${cooldown}초 후 다시 보내기` : '인증 메일 다시 보내기'}</button><button type="button" disabled={loading} onClick={() => setMode('signup')} className="mt-3 min-h-11 w-full text-sm font-semibold text-brand-700 disabled:opacity-50">이메일 다시 입력</button></> : null}<div className="mt-4 flex gap-4 text-sm font-semibold text-brand-700"><button type="button" disabled={loading} onClick={() => setMode('login')}>로그인</button><button type="button" disabled={loading} onClick={() => setMode('forgot')}>비밀번호 재설정</button></div></section></main>

  const heading = mode === 'signup' ? '계정 만들기' : mode === 'forgot' ? '비밀번호 재설정' : '로그인'
  return <main className="grid min-h-screen place-items-center bg-[#faf9f5] p-4"><section className="w-full max-w-md rounded-2xl bg-white p-7 shadow-sm"><div className="flex items-center gap-2 text-slate-950"><span className="grid size-9 place-items-center rounded-lg bg-brand-700 text-white"><Building2 size={18} /></span><span className="font-bold">{BRAND.name}</span></div><h1 className="mt-8 text-3xl font-bold tracking-[-.04em] text-slate-950">{heading}</h1><p className="mt-2 text-sm text-slate-600">{mode === 'forgot' ? '입력한 이메일로 재설정 안내를 보내 드립니다.' : BRAND.tagline}</p>
    <form onSubmit={handleSubmit} className="mt-7 space-y-5">
      {mode === 'signup' && <Field label="이름" htmlFor="fullName"><input id="fullName" value={fullName} onChange={e => setFullName(e.target.value)} autoComplete="name" className="input" placeholder="이름을 입력해 주세요" required /></Field>}
      <Field label="이메일" htmlFor="email"><span className="relative block"><Mail size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" className="input pl-10" placeholder="name@example.com" required /></span></Field>
      {mode !== 'forgot' && <Field label="비밀번호" htmlFor="password"><span className="relative block"><Lock size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input id="password" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} className="input pl-10 pr-11" minLength={6} required /><button type="button" aria-label="비밀번호 보기" onClick={() => setShowPassword(value => !value)} className="absolute right-0 top-0 grid size-11 place-items-center text-slate-500">{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span><p className="mt-1.5 text-xs text-slate-500">비밀번호는 6자 이상</p></Field>}
      <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? <Loader2 size={17} className="animate-spin" /> : null}{mode === 'login' ? '로그인' : mode === 'signup' ? '계정 만들기' : '재설정 안내 보내기'}{!loading && <ArrowRight size={16} />}</button>
    </form>
    {mode === 'login' && <button type="button" disabled={loading} onClick={() => setModeSafely('forgot')} className="mt-4 min-h-11 text-sm font-semibold text-brand-700 disabled:opacity-50">비밀번호를 잊으셨나요?</button>}
    <div className="mt-5 text-sm text-slate-600">{mode === 'signup' ? '이미 계정이 있으신가요?' : '아직 계정이 없으신가요?'} <button type="button" disabled={loading} onClick={() => setModeSafely(mode === 'signup' ? 'login' : 'signup')} className="font-semibold text-brand-700 disabled:opacity-50">{mode === 'signup' ? '로그인' : '무료 계정 만들기'}</button></div>
    <p className="mt-6 text-xs leading-5 text-slate-500"><Link href="/terms" className="underline">이용약관</Link> 및 <Link href="/privacy" className="underline">개인정보처리방침</Link>에 동의하고 계속합니다.</p>
  </section></main>
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) { return <div><label htmlFor={htmlFor} className="label">{label}</label>{children}</div> }
