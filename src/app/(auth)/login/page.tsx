'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Building2, CheckCircle2, Eye, EyeOff, Lock, Loader2, Mail } from 'lucide-react'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'

const valuePoints = ['매물 정보를 한 곳에서 관리', '반복 콘텐츠 제작을 AI로 자동화', '에이전트 작업 상태를 실시간 확인']

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'login' | 'signup'>('login')

  useEffect(() => { const error = new URLSearchParams(window.location.search).get('error'); if (error) { toast.error(error); window.history.replaceState({}, '', '/login') } }, [])
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault(); setLoading(true)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) throw error
        toast.success('로그인되었습니다'); router.push('/dashboard'); router.refresh()
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName }, emailRedirectTo: `${window.location.origin}/auth/confirm` } }); if (error) throw error
        if (data.user && (data.user.identities?.length ?? 0) === 0) { toast.error('이미 가입된 이메일입니다. 로그인해주세요.'); setMode('login') }
        else if (data.session) { toast.success('가입이 완료되었습니다'); router.push('/dashboard'); router.refresh() }
        else { toast.success('확인 이메일을 보냈습니다. 메일의 링크를 눌러 가입을 완료해주세요.'); setMode('login') }
      }
    } catch (error: unknown) {
      let message = error instanceof Error ? error.message : '오류가 발생했습니다'
      if (/already registered/i.test(message)) message = '이미 가입된 이메일입니다. 로그인해주세요.'
      else if (/invalid login credentials/i.test(message)) message = '이메일 또는 비밀번호가 올바르지 않습니다.'
      else if (/email not confirmed/i.test(message)) message = '이메일 인증이 완료되지 않았습니다. 메일의 링크를 확인해주세요.'
      else if (/password/i.test(message) && /6/.test(message)) message = '비밀번호는 6자 이상이어야 합니다.'
      toast.error(message)
    } finally { setLoading(false) }
  }

  return <main className="min-h-screen bg-[#faf9f5] p-4 lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(440px,.95fr)] lg:p-6">
    <section className="hidden min-h-[calc(100vh-48px)] flex-col justify-between rounded-xl bg-slate-950 p-10 text-white lg:flex xl:p-14">
      <div className="flex items-center gap-2.5"><span className="grid size-9 place-items-center rounded-lg bg-brand-600"><Building2 size={18} /></span><span className="font-bold tracking-[-0.025em]">RealEstate AI OS</span></div>
      <div className="max-w-xl"><p className="text-xs font-semibold tracking-[0.16em] text-brand-300">REAL ESTATE OPERATIONS</p><h1 className="mt-5 text-5xl font-bold leading-[1.12] tracking-[-0.05em]">매물 운영의 흐름을<br /><span className="text-brand-300">더 정확하게.</span></h1><p className="mt-6 max-w-md text-base leading-7 text-slate-300">부동산 실무자가 매물 관리부터 AI 콘텐츠 제작, 자동화 작업까지 한 화면에서 운영하는 업무 공간입니다.</p></div>
      <div className="border-t border-slate-700 pt-6"><p className="mb-4 text-xs font-semibold text-slate-400">하나의 운영 흐름</p><div className="grid grid-cols-3 gap-4">{valuePoints.map((point, index) => <div key={point}><span className="text-sm font-bold text-brand-300">0{index + 1}</span><p className="mt-2 text-sm leading-5 text-slate-300">{point}</p></div>)}</div></div>
    </section>
    <section className="flex min-h-[calc(100vh-32px)] items-center justify-center bg-[#faf9f5] px-4 py-10 lg:min-h-[calc(100vh-48px)] lg:px-12">
      <div className="w-full max-w-[400px]"><div className="mb-10 flex items-center gap-2.5 lg:hidden"><span className="grid size-9 place-items-center rounded-lg bg-brand-700 text-white"><Building2 size={18} /></span><span className="font-bold tracking-[-0.025em] text-slate-900">RealEstate AI OS</span></div><div className="mb-8"><p className="text-xs font-semibold tracking-[0.12em] text-brand-700">{mode === 'login' ? 'WELCOME BACK' : 'START YOUR WORKSPACE'}</p><h2 className="mt-2 text-3xl font-bold tracking-[-0.04em] text-slate-950">{mode === 'login' ? '업무 공간에 로그인' : '무료로 시작하기'}</h2><p className="mt-2 text-sm leading-6 text-slate-500">{mode === 'login' ? '계정 정보를 입력해 운영 현황을 확인하세요.' : '부동산 업무 자동화를 위한 계정을 만드세요.'}</p></div>
        <form onSubmit={handleSubmit} className="space-y-5">
          {mode === 'signup' && <div><label htmlFor="fullName" className="label">이름</label><div className="relative"><Building2 size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input id="fullName" name="name" type="text" autoComplete="name" value={fullName} onChange={event => setFullName(event.target.value)} placeholder="이름을 입력하세요" className="input pl-10" required /></div></div>}
          <div><label htmlFor="email" className="label">이메일</label><div className="relative"><Mail size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input id="email" name="email" type="email" inputMode="email" autoComplete="email" spellCheck={false} value={email} onChange={event => setEmail(event.target.value)} placeholder="name@company.com" className="input pl-10" required /></div></div>
          <div><label htmlFor="password" className="label">비밀번호</label><div className="relative"><Lock size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={event => setPassword(event.target.value)} placeholder={mode === 'login' ? '비밀번호를 입력하세요' : '6자 이상 입력하세요'} className="input pl-10 pr-11" required minLength={6} /><button type="button" aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)} className="absolute right-0 top-0 grid size-11 place-items-center text-slate-400 hover:text-slate-700">{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></div>
          <button type="submit" disabled={loading} className="btn-primary mt-2 w-full">{loading ? <><Loader2 size={17} className="animate-spin" />처리 중</> : <>{mode === 'login' ? '로그인' : '계정 만들기'}<ArrowRight size={16} /></>}</button>
        </form>
        {mode === 'signup' && <div className="mt-5 space-y-2 border-l-2 border-brand-200 pl-3">{['카드 등록 없이 시작', '언제든 설정에서 관리 가능'].map(item => <p key={item} className="flex items-center gap-2 text-xs text-slate-500"><CheckCircle2 size={14} className="text-brand-600" />{item}</p>)}</div>}
        <div className="mt-8 border-t border-slate-200 pt-6 text-center text-sm text-slate-500">{mode === 'login' ? '아직 계정이 없으신가요?' : '이미 계정이 있으신가요?'} <button type="button" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')} className="font-semibold text-brand-700 hover:text-brand-800 hover:underline">{mode === 'login' ? '무료 계정 만들기' : '로그인하기'}</button></div>
      </div>
    </section>
  </main>
}
