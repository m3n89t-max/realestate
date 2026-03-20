export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { PROPERTY_TYPE_LABELS } from '@/lib/types'
import { Newspaper, Plus, ArrowRight } from 'lucide-react'
import Link from 'next/link'

export default async function BlogPage() {
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

  const { data: contents } = await supabase
    .from('generated_contents')
    .select('id, project_id, title, version, created_at, is_published, published_url, seo_score')
    .eq('org_id', orgId)
    .eq('type', 'blog')
    .order('created_at', { ascending: false })

  const { data: projects } = await supabase
    .from('projects')
    .select('id, address, property_type')
    .eq('org_id', orgId)

  const projectMap = new Map((projects ?? []).map(p => [p.id, p]))

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">블로그자동화</h1>
          <p className="text-sm text-gray-500 mt-0.5">전체 매물의 블로그 생성 현황을 확인합니다</p>
        </div>
        <Link href="/projects/new" className="btn-primary">
          <Plus size={16} />
          새 매물 등록
        </Link>
      </div>

      {(!contents || contents.length === 0) ? (
        <div className="card p-16 text-center">
          <Newspaper size={48} className="mx-auto text-gray-200 mb-4" />
          <p className="text-gray-600 font-medium">아직 없습니다</p>
          <p className="text-sm text-gray-400 mt-1.5">매물 상세 페이지에서 블로그를 생성하면 여기에 나타납니다</p>
          <Link href="/projects" className="btn-primary mt-6 inline-flex">
            매물 목록 보기
          </Link>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="divide-y divide-gray-50">
            {contents.map(content => {
              const project = projectMap.get(content.project_id)
              const propertyLabel = project?.property_type
                ? PROPERTY_TYPE_LABELS[project.property_type as keyof typeof PROPERTY_TYPE_LABELS] ?? project.property_type
                : '-'
              const seoScore = (content.seo_score as any)?.total_score ?? null
              const createdDate = new Date(content.created_at).toLocaleDateString('ko-KR')

              return (
                <div key={content.id} className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 bg-purple-50 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Newspaper size={16} className="text-purple-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {content.title ?? project?.address ?? '-'}
                      </p>
                      <p className="text-xs text-gray-400">
                        {project?.address ? `${project.address} · ` : ''}{propertyLabel} · v{content.version} · {createdDate}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {seoScore !== null && (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        seoScore >= 80 ? 'bg-green-100 text-green-700' :
                        seoScore >= 60 ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        SEO {seoScore}
                      </span>
                    )}
                    {content.is_published ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        발행됨
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                        미발행
                      </span>
                    )}
                    <Link
                      href={`/projects/${content.project_id}`}
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
