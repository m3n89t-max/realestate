export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { PROPERTY_TYPE_LABELS } from '@/lib/types'
import { LayoutGrid, Plus, ArrowRight } from 'lucide-react'
import Link from 'next/link'

const PLATFORM_LABELS: Record<string, string> = {
  instagram: '인스타',
  kakao: '카카오',
  card_news: '카드뉴스',
}

export default async function CardNewsPage() {
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
    .select('id, project_id, title, type, version, created_at')
    .eq('org_id', orgId)
    .in('type', ['instagram', 'kakao', 'card_news'])
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
          <h1 className="text-xl font-bold text-gray-900">카드뉴스</h1>
          <p className="text-sm text-gray-500 mt-0.5">전체 매물의 카드뉴스 생성 현황을 확인합니다</p>
        </div>
        <Link href="/projects/new" className="btn-primary">
          <Plus size={16} />
          새 매물 등록
        </Link>
      </div>

      {(!contents || contents.length === 0) ? (
        <div className="card p-16 text-center">
          <LayoutGrid size={48} className="mx-auto text-gray-200 mb-4" />
          <p className="text-gray-600 font-medium">아직 없습니다</p>
          <p className="text-sm text-gray-400 mt-1.5">매물 상세 페이지에서 카드뉴스를 생성하면 여기에 나타납니다</p>
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
              const platformLabel = PLATFORM_LABELS[content.type] ?? content.type
              const platformColor = content.type === 'instagram'
                ? 'bg-pink-100 text-pink-700'
                : content.type === 'kakao'
                ? 'bg-yellow-100 text-yellow-700'
                : 'bg-blue-100 text-blue-700'
              const createdDate = new Date(content.created_at).toLocaleDateString('ko-KR')

              return (
                <div key={content.id} className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 bg-pink-50 rounded-lg flex items-center justify-center flex-shrink-0">
                      <LayoutGrid size={16} className="text-pink-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {project?.address ?? '-'}
                      </p>
                      <p className="text-xs text-gray-400">
                        {propertyLabel} · v{content.version} · {createdDate}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${platformColor}`}>
                      {platformLabel}
                    </span>
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
