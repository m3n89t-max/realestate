export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { PROPERTY_TYPE_LABELS } from '@/lib/types'
import { FileArchive, Plus, ArrowRight, Download } from 'lucide-react'
import Link from 'next/link'

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  building_register: '건축물대장',
  cadastral_map: '지적도',
  floor_plan: '평면도',
  permit_history: '허가이력',
  risk_report: '리스크보고서',
  package_pdf: 'PDF패키지',
}

export default async function DocsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: membership } = await supabase
    .from('memberships')
    .select('org_id')
    .eq('user_id', user!.id)
    .not('joined_at', 'is', null)
    .limit(1)
    .single()

  const orgId = membership?.org_id

  const { data: documents } = await supabase
    .from('documents')
    .select('id, project_id, type, file_name, file_url, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  const projectIds = [...new Set((documents ?? []).map(d => d.project_id))]

  const { data: projects } = projectIds.length > 0
    ? await supabase
        .from('projects')
        .select('id, address, property_type')
        .in('id', projectIds)
    : { data: [] }

  const projectMap = new Map((projects ?? []).map(p => [p.id, p]))

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">서류</h1>
          <p className="text-sm text-gray-500 mt-0.5">건축물대장, 지적도 등 수집된 서류를 확인합니다</p>
        </div>
        <Link href="/projects/new" className="btn-primary">
          <Plus size={16} />
          새 매물 등록
        </Link>
      </div>

      {(!documents || documents.length === 0) ? (
        <div className="card p-16 text-center">
          <FileArchive size={48} className="mx-auto text-gray-200 mb-4" />
          <p className="text-gray-600 font-medium">아직 없습니다</p>
          <p className="text-sm text-gray-400 mt-1.5">매물 상세 페이지의 서류 탭에서 건축물대장, 지적도 등을 수집할 수 있습니다</p>
          <Link href="/projects" className="btn-primary mt-6 inline-flex">
            매물 목록 보기
          </Link>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="divide-y divide-gray-50">
            {documents.map(doc => {
              const project = projectMap.get(doc.project_id)
              const propertyLabel = project?.property_type
                ? PROPERTY_TYPE_LABELS[project.property_type as keyof typeof PROPERTY_TYPE_LABELS] ?? project.property_type
                : '-'
              const docTypeLabel = DOCUMENT_TYPE_LABELS[doc.type] ?? doc.type
              const createdDate = new Date(doc.created_at).toLocaleDateString('ko-KR')

              return (
                <div key={doc.id} className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 bg-green-50 rounded-lg flex items-center justify-center flex-shrink-0">
                      <FileArchive size={16} className="text-green-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {project?.address ?? '-'}
                      </p>
                      <p className="text-xs text-gray-400">
                        {propertyLabel} · {doc.file_name ?? '-'} · {createdDate}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                      {docTypeLabel}
                    </span>
                    {doc.file_url && (
                      <a
                        href={doc.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 font-medium"
                      >
                        <Download size={12} />
                        다운로드
                      </a>
                    )}
                    <Link
                      href={`/projects/${doc.project_id}`}
                      className="flex items-center gap-1 text-xs text-brand-600 hover:underline font-medium"
                    >
                      보기
                      <ArrowRight size={12} />
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
