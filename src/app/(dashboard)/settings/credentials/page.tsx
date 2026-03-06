import { Key, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import CredentialForm from './CredentialForm'

export const metadata = {
    title: '자동화 계정 관리 | 부동산 AI OS',
}

export default function CredentialsPage() {
    return (
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-6 animate-fade-in">
            {/* 헤더 */}
            <div>
                <Link href="/settings" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 mb-4 transition-colors">
                    <ArrowLeft size={14} />
                    설정으로 돌아가기
                </Link>
                <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 bg-brand-50 rounded-xl flex items-center justify-center">
                        <Key size={18} className="text-brand-600" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-gray-900">자동화 계정 관리</h1>
                        <p className="text-xs text-gray-400">
                            네이버, 유튜브, 인스타그램 등 자동화 계정을 로컬에 안전하게 저장합니다.
                        </p>
                    </div>
                </div>
            </div>

            {/* 폼 */}
            <CredentialForm />
        </div>
    )
}
