'use client'

import { useState, useEffect } from 'react'
import {
    Eye, EyeOff, Save, Trash2, CheckCircle, AlertCircle, Loader2, ExternalLink
} from 'lucide-react'

// ============================================================
// 플랫폼 설정
// ============================================================
const PLATFORMS = [
    {
        key: 'naver',
        name: '네이버',
        color: 'bg-green-500',
        fields: [{ key: 'id', label: '아이디', placeholder: '네이버 아이디' }],
        desc: '블로그 자동 업로드에 사용됩니다.',
        icon: '🟢',
    },
    {
        key: 'google',
        name: '구글 (유튜브)',
        color: 'bg-red-500',
        fields: [{ key: 'email', label: '이메일', placeholder: 'example@gmail.com' }],
        desc: '유튜브 영상 자동 업로드에 사용됩니다.',
        icon: '▶️',
    },
    {
        key: 'instagram',
        name: '인스타그램',
        color: 'bg-gradient-to-tr from-purple-500 to-pink-500',
        fields: [{ key: 'id', label: '아이디', placeholder: '인스타그램 아이디 또는 이메일' }],
        desc: '카드뉴스 자동 업로드에 사용됩니다.',
        icon: '📸',
    },
    {
        key: 'kakao',
        name: '카카오',
        color: 'bg-yellow-400',
        fields: [{ key: 'email', label: '이메일 또는 전화번호', placeholder: '카카오 로그인 이메일' }],
        desc: '카카오 채널 콘텐츠 업로드에 사용됩니다.',
        icon: '💬',
    },
] as const

type PlatformKey = typeof PLATFORMS[number]['key']

interface SavedCredential {
    id?: string
    email?: string
    pw_masked: string
    saved_at: string
    has_creds: boolean
}

// ============================================================
// 개별 플랫폼 카드
// ============================================================
function PlatformCard({
    platform,
    saved,
    onSaved,
    onDeleted,
}: {
    platform: typeof PLATFORMS[number]
    saved?: SavedCredential
    onSaved: () => void
    onDeleted: () => void
}) {
    const [idValue, setIdValue] = useState('')
    const [pwValue, setPwValue] = useState('')
    const [showPw, setShowPw] = useState(false)
    const [loading, setLoading] = useState(false)
    const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
    const [errorMsg, setErrorMsg] = useState('')

    const idField = platform.fields[0]
    const isEmailField = idField.key === 'email'

    async function handleSave() {
        if (!idValue || !pwValue) {
            setStatus('error')
            setErrorMsg('아이디/이메일과 비밀번호를 모두 입력해주세요.')
            return
        }

        setLoading(true)
        setStatus('idle')

        try {
            const res = await fetch('/api/agent/credentials', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    platform: platform.key,
                    [idField.key]: idValue,
                    pw: pwValue,
                }),
            })
            const json = await res.json()

            if (!res.ok || json.error) {
                throw new Error(json.error || '저장 실패')
            }

            setStatus('success')
            setIdValue('')
            setPwValue('')
            setTimeout(() => setStatus('idle'), 3000)
            onSaved()
        } catch (err: any) {
            setStatus('error')
            setErrorMsg(err.message)
        } finally {
            setLoading(false)
        }
    }

    async function handleDelete() {
        if (!confirm(`${platform.name} 자격증명을 삭제하시겠습니까?`)) return

        setLoading(true)
        try {
            await fetch('/api/agent/credentials', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ platform: platform.key }),
            })
            onDeleted()
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-sm">
            {/* 헤더 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                    <span className="text-2xl">{platform.icon}</span>
                    <div>
                        <p className="text-sm font-semibold text-gray-900">{platform.name}</p>
                        <p className="text-xs text-gray-400">{platform.desc}</p>
                    </div>
                </div>
                {saved?.has_creds && (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full font-medium">
                        <CheckCircle size={12} />
                        저장됨
                    </div>
                )}
            </div>

            {/* 바디 */}
            <div className="px-5 py-4 space-y-3">
                {/* 저장된 요약 */}
                {saved?.has_creds && (
                    <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-500 font-mono flex items-center justify-between">
                        <span>
                            {saved.id || saved.email} · {saved.pw_masked}
                        </span>
                        <span className="text-gray-400">
                            {new Date(saved.saved_at).toLocaleDateString('ko-KR')} 저장
                        </span>
                    </div>
                )}

                {/* 입력 폼 */}
                <div className="space-y-2">
                    <input
                        type={isEmailField ? 'email' : 'text'}
                        placeholder={idField.placeholder}
                        value={idValue}
                        onChange={e => setIdValue(e.target.value)}
                        className="input-field text-sm"
                        autoComplete="off"
                        autoCorrect="off"
                        spellCheck={false}
                    />
                    <div className="relative">
                        <input
                            type={showPw ? 'text' : 'password'}
                            placeholder="비밀번호"
                            value={pwValue}
                            onChange={e => setPwValue(e.target.value)}
                            className="input-field text-sm pr-10"
                            autoComplete="new-password"
                            onKeyDown={e => e.key === 'Enter' && handleSave()}
                        />
                        <button
                            type="button"
                            onClick={() => setShowPw(!showPw)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                            {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                    </div>
                </div>

                {/* 상태 메시지 */}
                {status === 'success' && (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-600">
                        <CheckCircle size={13} />
                        로컬에 안전하게 저장되었습니다.
                    </div>
                )}
                {status === 'error' && (
                    <div className="flex items-center gap-1.5 text-xs text-red-500">
                        <AlertCircle size={13} />
                        {errorMsg}
                    </div>
                )}

                {/* 버튼 */}
                <div className="flex items-center gap-2 pt-1">
                    <button
                        onClick={handleSave}
                        disabled={loading}
                        className="btn-primary flex-1 justify-center text-sm py-2.5"
                    >
                        {loading ? (
                            <Loader2 size={14} className="animate-spin" />
                        ) : (
                            <Save size={14} />
                        )}
                        {saved?.has_creds ? '업데이트' : '저장'}
                    </button>
                    {saved?.has_creds && (
                        <button
                            onClick={handleDelete}
                            disabled={loading}
                            className="p-2.5 rounded-xl border border-red-200 text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                        >
                            <Trash2 size={14} />
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}

// ============================================================
// 메인 자격증명 폼 컴포넌트
// ============================================================
export default function CredentialForm() {
    const [savedMap, setSavedMap] = useState<Record<string, SavedCredential>>({})
    const [loadingInit, setLoadingInit] = useState(true)

    async function loadSaved() {
        try {
            const res = await fetch('/api/agent/credentials')
            const json = await res.json()
            setSavedMap(json.data || {})
        } catch {
            // ignore
        } finally {
            setLoadingInit(false)
        }
    }

    useEffect(() => {
        loadSaved()
    }, [])

    if (loadingInit) {
        return (
            <div className="flex items-center justify-center py-16">
                <Loader2 size={24} className="animate-spin text-brand-500" />
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {/* 보안 안내 */}
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex gap-3">
                <span className="text-xl flex-shrink-0">🔒</span>
                <div>
                    <p className="text-sm font-semibold text-blue-800">로컬 전용 보안 저장</p>
                    <p className="text-xs text-blue-600 mt-0.5 leading-relaxed">
                        입력하신 아이디와 비밀번호는 <strong>서버(클라우드)에 절대 전송되지 않습니다.</strong>
                        이 PC의 <code className="bg-blue-100 px-1 rounded">%APPDATA%\RealEstateAIOS\credentials.json</code>에만 저장됩니다.
                    </p>
                </div>
            </div>

            {/* 플랫폼 카드 그리드 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {PLATFORMS.map(platform => (
                    <PlatformCard
                        key={platform.key}
                        platform={platform}
                        saved={savedMap[platform.key]}
                        onSaved={loadSaved}
                        onDeleted={loadSaved}
                    />
                ))}
            </div>

            {/* 에이전트 안내 */}
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex gap-3">
                <span className="text-xl flex-shrink-0">🤖</span>
                <div>
                    <p className="text-sm font-semibold text-amber-800">에이전트 실행 필요</p>
                    <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                        저장된 계정으로 자동화를 실행하려면 로컬 에이전트가 실행 중이어야 합니다.
                    </p>
                    <code className="mt-2 block text-xs bg-amber-100 text-amber-900 px-3 py-2 rounded-lg font-mono">
                        npm run agent:start
                    </code>
                </div>
            </div>
        </div>
    )
}
