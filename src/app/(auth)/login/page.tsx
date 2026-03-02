'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Mail, Lock, Loader2, Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

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
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* 로고 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-600 rounded-2xl shadow-lg mb-4">
            <Building2 size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">부동산 AI OS</h1>
          <p className="text-sm text-gray-500 mt-1">공인중개사 업무 자동화 플랫폼</p>
        </div>

        {/* 카드 */}
        <div className="card p-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">
            {mode === 'login' ? '로그인' : '회원가입'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">이메일</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-3.5 text-gray-400" />
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
                <Lock size={16} className="absolute left-3 top-3.5 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="비밀번호"
                  className="input pl-9 pr-10"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3.5 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center py-3"
            >
              {loading
                ? <><Loader2 size={16} className="animate-spin" /> 처리중...</>
                : mode === 'login' ? '로그인' : '가입하기'
              }
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
              className="text-sm text-brand-600 hover:underline"
            >
              {mode === 'login'
                ? '계정이 없으신가요? 회원가입'
                : '이미 계정이 있으신가요? 로그인'
              }
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          © 2026 RealEstate AI OS. All rights reserved.
        </p>
      </div>
    </div>
  )
}
