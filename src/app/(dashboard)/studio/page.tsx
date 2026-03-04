import { Wand2 } from 'lucide-react'

export default function StudioPage() {
    return (
        <div className="p-6 animate-fade-in">
            <div className="page-header">
                <div>
                    <h1 className="text-xl font-bold text-gray-900">콘텐츠 스튜디오</h1>
                    <p className="text-sm text-gray-500 mt-0.5">AI 기반 마케팅 콘텐츠를 생성하세요</p>
                </div>
            </div>
            <div className="card p-16 text-center">
                <Wand2 size={48} className="mx-auto text-gray-200 mb-4" />
                <p className="text-gray-600 font-medium">콘텐츠 스튜디오</p>
                <p className="text-sm text-gray-400 mt-1.5">
                    프로젝트 상세 페이지에서 블로그, 카드뉴스, 쇼츠 콘텐츠를 생성할 수 있습니다
                </p>
            </div>
        </div>
    )
}
