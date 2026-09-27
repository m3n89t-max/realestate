'use client'

import { ExternalLink, MonitorCog, ShieldCheck } from 'lucide-react'

const LOCAL_AGENT_URL = 'http://127.0.0.1:3005'

export default function CredentialForm() {
    return (
        <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 flex gap-3">
                <ShieldCheck className="text-blue-600 flex-shrink-0" size={22} aria-hidden="true" />
                <div>
                    <p className="text-sm font-semibold text-blue-800">자격증명은 로컬 에이전트에서만 관리됩니다</p>
                    <p className="text-xs text-blue-700 mt-1 leading-relaxed">
                        이 웹사이트는 네이버, 구글, 인스타그램, 카카오의 아이디나 비밀번호를
                        입력받거나 SaaS 서버에 저장하지 않습니다.
                    </p>
                </div>
            </div>

            <div className="border border-gray-200 rounded-2xl bg-white shadow-sm p-6">
                <div className="flex items-start gap-4">
                    <div className="rounded-xl bg-amber-50 p-3 text-amber-700">
                        <MonitorCog size={24} aria-hidden="true" />
                    </div>
                    <div className="space-y-3">
                        <div>
                            <h2 className="text-base font-semibold text-gray-900">로컬 에이전트 설정 열기</h2>
                            <p className="text-sm text-gray-600 mt-1 leading-relaxed">
                                RealEstate Agent를 실행한 뒤 Windows 작업 표시줄의 트레이 아이콘을 열고
                                <strong> 설정 열기</strong>를 선택하세요. 에이전트가 발급한 일회성 접근 주소로
                                로컬 설정 화면이 열립니다.
                            </p>
                        </div>
                        <div className="rounded-xl bg-gray-50 px-4 py-3 text-xs text-gray-600">
                            로컬 서비스 주소: <code className="font-mono text-gray-900">{LOCAL_AGENT_URL}</code>
                            <br />
                            보안을 위해 주소를 직접 열면 접근이 거부될 수 있습니다. 반드시 트레이 메뉴를 이용하세요.
                        </div>
                        <a
                            href="/settings/agent"
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
                        >
                            에이전트 연결 상태 확인
                            <ExternalLink size={14} aria-hidden="true" />
                        </a>
                    </div>
                </div>
            </div>
        </div>
    )
}
