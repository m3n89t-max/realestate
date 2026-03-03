'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Mail, Lock, Loader2, Eye, EyeOff, CheckCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

const FEATURES = [
  { icon: '📝', title: 'SEO 블로그 자동 생성', desc: '지번 입력만으로 1,500자 SEO 블로그 완성' },
  { icon: '🖼️', title: '인스타·카카오 카드뉴스', desc: '6장 카드뉴스 자동 생성 및 편집' },
  { icon: '🏛️', title: '건축물대장 자동 수집', desc: '정부24 자동화로 서류 즉시 다운로드' },
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
    <div className="min-h-screen flex">
      {/* 왼쪽 브랜드 패널 */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-brand-700 via-brand-600 to-brand-500 flex-col justify-between p-12 relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-white/5" />
        <div className="absolute -bottom-32 -left-16 w-80 h-80 rounded-full bg-white/5" />

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <Building2 size={22} className="text-white" />
            </div>
            <span className="text-white font-bold text-lg">부동산 AI OS</span>
          </div>
          <p className="text-blue-200 text-sm">공인중개사 업무 자동화 플랫폼</p>
        </div>

        <div className="relative z-10">
          <h2 className="text-4xl font-bold text-white leading-tight mb-4">
            지번 하나로<br />
            마케팅 끝.
          </h2>
          <p className="text-blue-200 text-base leading-relaxed mb-10">
            AI가 블로그, 카드뉴스, 건축물대장까지<br />
            자동으로 처리합니다.
          </p>
          <div className="space-y-4">
            {FEATURES.map(f => (
              <div key={f.title} className="flex items-start gap-3">
                <div className="w-9 h-9 bg-white/15 rounded-lg flex items-center justify-center flex-shrink-0 text-lg">
                  {f.icon}
                </div>
                <div>
                  <p className="text-white font-medium text-sm">{f.title}</p>
                  <p className="text-blue-200 text-xs mt-0.5">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10">
          <p className="text-blue-300 text-xs">© 2026 RealEstate AI OS</p>
        </div>
      </div>

      {/* 오른쪽 폼 패널 */}
      <div className="flex-1 flex items-center justify-center p-6 bg-gray-50">
        <div className="w-full max-w-sm">
          <div className="lg:hidden text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-brand-600 rounded-2xl shadow-lg mb-3">
              <Building2 size={24} className="text-white" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">부동산 AI OS</h1>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <h2 className="text-xl font-bold text-gray-900 mb-1">
              {mode === 'login' ? '로그인' : '무료로 시작하기'}
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              {mode === 'login' ? '계정에 로그인하세요' : '이메일로 가입하세요'}
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">이메일</label>
                <div className="relative">
                  <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="example@email.com"
                    className="input pl-9"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="label">비밀번호</label>
                <div className="relative">
                  <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="6자 이상"
                    className="input pl-9 pr-10"
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full justify-center py-3 mt-2"
              >
                {loading
                  ? <><Loader2 size={15} className="animate-spin" /> 처리중...</>
                  : mode === 'login' ? '로그인' : '가입하기'
                }
              </button>
            </form>

            {mode === 'signup' && (
              <div className="mt-4 space-y-1.5">
                {['신용카드 불필요', '30일 무료 체험', '언제든 취소 가능'].map(t => (
                  <div key={t} className="flex items-center gap-2 text-xs text-gray-500">
                    <CheckCircle size={13} className="text-green-500" />
                    {t}
                  </div>
                ))}
              </div>
            )}

            <div className="mt-5 pt-4 border-t border-gray-100 text-center">
              <button
                onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
                className="text-sm text-brand-600 hover:underline"
              >
                {mode === 'login'
                  ? '계정이 없으신가요? 무료 가입'
                  : '이미 계정이 있으신가요? 로그인'
                }
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
