'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Mail, Lock, Loader2, Eye, EyeOff, CheckCircle, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

const FEATURES = [
  { icon: <Building2 size={18} />, title: 'SEO 블로그 자동 생성', desc: '지번 입력만으로 1,500자 완성' },
  { icon: <CheckCircle size={18} />, title: '인스타·카카오 카드뉴스', desc: '6장 자동 생성 및 편집' },
  { icon: <CheckCircle size={18} />, title: '건축물대장 자동 수집', desc: '정부24 서류 즉시 다운로드' },
]

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'login' | 'signup'>('login')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        toast.success('로그인되었습니다')
        router.push('/dashboard')
        router.refresh()
      } else {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        toast.success('가입 확인 이메일을 발송했습니다')
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '오류가 발생했습니다'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex font-sans">
      {/* 왼쪽 브랜드/히어로 패널 (참고 사진의 감성적인 디자인 적용) */}
      <div
        className="hidden lg:flex lg:w-[60%] flex-col relative overflow-hidden bg-stone-900"
        style={{
          backgroundImage: 'linear-gradient(to right, rgba(28,25,23,0.9) 0%, rgba(28,25,23,0.4) 100%), url("https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?ixlib=rb-4.0.3&auto=format&fit=crop&w=2075&q=80")',
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      >
        <div className="relative z-10 flex flex-col h-full p-16 justify-between">
          {/* 상단 로고 */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/10 backdrop-blur-md rounded-xl flex items-center justify-center border border-white/20">
              <Building2 size={20} className="text-stone-100" />
            </div>
            <span className="text-stone-100 font-medium tracking-wide text-lg">RealEstate AI OS</span>
          </div>

          {/* 메인 카피 */}
          <div className="max-w-2xl mt-12">
            <h1 className="text-5xl lg:text-7xl font-light text-stone-50 leading-[1.1] tracking-tight mb-6">
              A Smart Space <span className="font-serif italic text-stone-300">for</span><br />
              <span className="font-medium text-white">Efficient Growth</span>
            </h1>
            <p className="text-stone-300 text-lg leading-relaxed max-w-xl font-light mb-10">
              A space dedicated to your real estate business, guided by automated AI workflows, offering the support you deserve.
            </p>
            <button
              onClick={() => document.getElementById('auth-form')?.scrollIntoView({ behavior: 'smooth' })}
              className="bg-stone-100 text-stone-900 px-8 py-3.5 rounded-full font-medium hover:bg-white transition-all flex items-center gap-2"
            >
              Get Started Today
              <ArrowRight size={18} />
            </button>
          </div>

          {/* 하단 특징 카드 (사진의 3개 하단 카드 레이아웃) */}
          <div className="grid grid-cols-3 gap-6 mt-16">
            {FEATURES.map((feature, idx) => (
              <div
                key={idx}
                className="bg-black/20 backdrop-blur-md border border-white/10 rounded-2xl p-6 transition-transform hover:-translate-y-1"
              >
                <div className="w-10 h-10 bg-stone-100/10 rounded-full flex items-center justify-center text-stone-200 mb-4">
                  {feature.icon}
                </div>
                <h3 className="text-stone-100 font-medium mb-2">{feature.title}</h3>
                <p className="text-stone-400 text-sm leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 오른쪽 로그인 폼 패널 */}
      <div className="flex-1 flex flex-col justify-center p-8 lg:p-16 bg-stone-50" id="auth-form">
        <div className="w-full max-w-md mx-auto">
          {/* 모바일 로고 */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="w-10 h-10 bg-stone-900 rounded-xl flex items-center justify-center">
              <Building2 size={20} className="text-stone-100" />
            </div>
            <span className="text-stone-900 font-medium tracking-wide text-lg">RealEstate AI OS</span>
          </div>

          <div className="mb-10">
            <h2 className="text-3xl font-light text-stone-900 mb-3">
              {mode === 'login' ? 'Welcome Back' : 'Create Account'}
            </h2>
            <p className="text-stone-500">
              {mode === 'login'
                ? 'Please enter your details to access your dashboard.'
                : 'Sign up to start automating your real estate workflows.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-2">Email Address</label>
              <div className="relative">
                <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full pl-12 pr-4 py-3.5 bg-white border border-stone-200 rounded-xl text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent transition-all"
                  required
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-stone-700">Password</label>
                {mode === 'login' && (
                  <button type="button" className="text-sm text-stone-500 hover:text-stone-900 font-medium">
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  className="w-full pl-12 pr-12 py-3.5 bg-white border border-stone-200 rounded-xl text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent transition-all"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center py-3.5 mt-4 bg-stone-900 hover:bg-stone-800 text-white rounded-xl font-medium transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? (
                <><Loader2 size={18} className="animate-spin mr-2" /> Processing...</>
              ) : (
                mode === 'login' ? 'Sign In' : 'Create Account'
              )}
            </button>
          </form>

          {mode === 'signup' && (
            <div className="mt-6 flex flex-wrap gap-4">
              {['No credit card required', '30-day free trial', 'Cancel anytime'].map(t => (
                <div key={t} className="flex items-center gap-1.5 text-sm text-stone-500">
                  <CheckCircle size={14} className="text-stone-400" />
                  {t}
                </div>
              ))}
            </div>
          )}

          <div className="mt-10 pt-8 border-t border-stone-200">
            <p className="text-center text-stone-500">
              {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
              <button
                onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
                className="font-semibold text-stone-900 hover:underline"
              >
                {mode === 'login' ? 'Create a free account' : 'Sign in here'}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
