import { BarChart3 } from 'lucide-react'

export default function UsagePage() {
    return (
        <div className="p-6 animate-fade-in">
            <div className="page-header">
                <div>
                    <h1 className="text-xl font-bold text-gray-900">사용량 / 결제</h1>
                    <p className="text-sm text-gray-500 mt-0.5">이번 달 사용량과 요금제를 관리합니다</p>
                </div>
            </div>
            <div className="card p-16 text-center">
                <BarChart3 size={48} className="mx-auto text-gray-200 mb-4" />
                <p className="text-gray-600 font-medium">사용량 / 결제</p>
                <p className="text-sm text-gray-400 mt-1.5">
                    프로젝트 생성, AI 생성, 영상 렌더, 서류 수집 등의 사용량을 확인할 수 있습니다
                </p>
            </div>
        </div>
    )
}
