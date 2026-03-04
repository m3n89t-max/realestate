import { FileText } from 'lucide-react'

export default function DocsPage() {
    return (
        <div className="p-6 animate-fade-in">
            <div className="page-header">
                <div>
                    <h1 className="text-xl font-bold text-gray-900">서류 자동화</h1>
                    <p className="text-sm text-gray-500 mt-0.5">건축물대장, 지적도 등 서류를 자동 수집합니다</p>
                </div>
            </div>
            <div className="card p-16 text-center">
                <FileText size={48} className="mx-auto text-gray-200 mb-4" />
                <p className="text-gray-600 font-medium">서류 자동화</p>
                <p className="text-sm text-gray-400 mt-1.5">
                    프로젝트 상세 페이지의 서류 탭에서 건축물대장, 지적도 등을 수집할 수 있습니다
                </p>
            </div>
        </div>
    )
}
