'use client'

import { useState } from 'react'
import { Wand2, Copy, Check, ChevronDown, ChevronUp, AlertCircle, Upload, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { GeneratedContent, SeoScore } from '@/lib/types'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'

interface BlogTabProps {
  projectId: string
  orgId: string
  contents: GeneratedContent[]
}

interface SeoCheckItem {
  key: keyof SeoScore
  label: string
  description: string
}

const SEO_CHECKS: SeoCheckItem[] = [
  { key: 'keyword_in_title', label: '지역 키워드', description: '제목에 지역명 + 매물유형 포함' },
  { key: 'min_length', label: '글자수 1,500자+', description: '검색엔진 최소 권장 길이' },
  { key: 'has_h2', label: 'H2 구조', description: '섹션 헤딩 7개 이상' },
  { key: 'has_faq', label: 'FAQ 포함', description: '자주 묻는 질문 섹션' },
  { key: 'has_alt', label: 'ALT 태그', description: '이미지 대체 텍스트' },
  { key: 'longtail_keywords', label: '롱테일 키워드', description: '장문 검색어 자연 삽입' },
]

function SeoScorePanel({ score }: { score: SeoScore }) {
  const passed = Object.values(score).filter((v, i) => i < SEO_CHECKS.length && v === true).length

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-gray-700">SEO 체크</h4>
        <div className="flex items-center gap-2">
          <div className={cn(
            'text-sm font-bold',
            score.total_score >= 80 ? 'text-green-600' : score.total_score >= 60 ? 'text-amber-600' : 'text-red-600'
          )}>
            {score.total_score}점
          </div>
          <span className="text-xs text-gray-400">({passed}/{SEO_CHECKS.length})</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {SEO_CHECKS.map(item => {
          const passed = score[item.key] === true
          return (
            <div key={item.key} className="flex items-center gap-2 text-xs">
              <span className={cn(
                'w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0',
                passed ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'
              )}>
                {passed ? '✓' : '×'}
              </span>
              <span className={passed ? 'text-gray-700' : 'text-gray-400'}>
                {item.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function BlogTab({ projectId, orgId, contents }: BlogTabProps) {
  const supabase = createClient()
  const [generating, setGenerating] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [style, setStyle] = useState<'informative' | 'investment' | 'lifestyle'>('informative')
  const [selectedId, setSelectedId] = useState<string | null>(contents[0]?.id ?? null)
  const [editContent, setEditContent] = useState<string>(contents[0]?.content ?? '')
  const [copiedTitle, setCopiedTitle] = useState<string | null>(null)
  const [showAllTitles, setShowAllTitles] = useState(false)

  const selected = contents.find(c => c.id === selectedId)

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-blog`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ project_id: projectId, style }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '생성 실패')

      toast.success('블로그 글이 생성되었습니다!')
      window.location.reload()
    } catch (err: any) {
      toast.error(err.message || '생성에 실패했습니다.')
      console.error(err)
    } finally {
      setGenerating(false)
    }
  }

  const handleNaverUpload = async () => {
    if (!selectedId) return
    setUploading(true)
    try {
      const { error } = await supabase.from('tasks').insert({
        org_id: orgId,
        project_id: projectId,
        type: 'upload_naver_blog',
        status: 'pending',
        payload: { content_id: selectedId, project_id: projectId },
      })
      if (error) throw error
      toast.success('네이버 블로그 업로드 작업이 등록되었습니다. 에이전트가 실행하면 자동 업로드됩니다.')
    } catch (err) {
      toast.error('작업 등록에 실패했습니다')
      console.error(err)
    } finally {
      setUploading(false)
    }
  }

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedTitle(id)
    setTimeout(() => setCopiedTitle(null), 2000)
    toast.success('클립보드에 복사되었습니다')
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* 좌측: 생성 컨트롤 + 버전 목록 */}
      <div className="space-y-4">
        {/* 생성 버튼 */}
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">블로그 글 생성</h3>

          <div className="mb-3">
            <label className="label text-xs">글 스타일</label>
            <div className="grid grid-cols-3 gap-1.5">
              {([
                ['informative', '정보형'],
                ['investment', '투자형'],
                ['lifestyle', '라이프'],
              ] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setStyle(val)}
                  className={cn(
                    'py-1.5 text-xs rounded-lg border font-medium transition-colors',
                    style === val
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'border-gray-200 text-gray-600 hover:border-brand-300'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={generating}
            className="btn-primary w-full justify-center"
          >
            {generating ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                AI 생성중...
              </>
            ) : (
              <>
                <Wand2 size={15} />
                블로그 글 생성
              </>
            )}
          </button>

          <p className="text-xs text-gray-400 mt-2 text-center">
            SEO 최적화 · 1,500자 이상 · FAQ 포함
          </p>
        </div>

        {/* 네이버 업로드 */}
        {selectedId && (
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">자동 업로드</h3>
            <p className="text-xs text-gray-400 mb-3">
              로컬 에이전트가 실행 중이어야 합니다
            </p>
            <button
              onClick={handleNaverUpload}
              disabled={uploading}
              className="btn-secondary w-full justify-center text-green-700 border-green-200 hover:bg-green-50"
            >
              {uploading
                ? <><Loader2 size={14} className="animate-spin" /> 등록 중...</>
                : <><Upload size={14} /> 네이버 블로그 업로드</>
              }
            </button>
            {selected?.is_published && selected.published_url && (
              <a
                href={selected.published_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 flex items-center gap-1 text-xs text-brand-600 hover:underline"
              >
                발행된 글 보기 →
              </a>
            )}
          </div>
        )}

        {/* 버전 목록 */}
        {contents.length > 0 && (
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              생성 버전 ({contents.length}개)
            </h3>
            <div className="space-y-2">
              {contents.map(c => (
                <button
                  key={c.id}
                  onClick={() => {
                    setSelectedId(c.id)
                    setEditContent(c.content)
                  }}
                  className={cn(
                    'w-full text-left p-2.5 rounded-lg border text-xs transition-colors',
                    selectedId === c.id
                      ? 'bg-brand-50 border-brand-200 text-brand-700'
                      : 'border-gray-100 hover:bg-gray-50 text-gray-600'
                  )}
                >
                  <p className="font-medium truncate">{c.title ?? `버전 ${c.version}`}</p>
                  <p className="text-gray-400 mt-0.5">
                    {new Date(c.created_at).toLocaleDateString('ko-KR')}
                    {c.seo_score && ` · SEO ${c.seo_score.total_score}점`}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 우측: 편집기 */}
      <div className="lg:col-span-2 space-y-4">
        {!selected ? (
          <div className="card p-12 text-center">
            <Wand2 size={40} className="mx-auto text-gray-200 mb-3" />
            <p className="text-gray-500 font-medium">아직 생성된 블로그 글이 없습니다</p>
            <p className="text-sm text-gray-400 mt-1">왼쪽에서 &quot;블로그 글 생성&quot;을 눌러 시작하세요</p>
          </div>
        ) : (
          <>
            {/* 제목 목록 */}
            {selected.title && (
              <div className="card p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-gray-700">추천 제목 (5개)</h4>
                  <button
                    onClick={() => setShowAllTitles(!showAllTitles)}
                    className="text-xs text-gray-400 flex items-center gap-1"
                  >
                    {showAllTitles ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    {showAllTitles ? '접기' : '펼치기'}
                  </button>
                </div>
                <div className="space-y-1.5">
                  {(showAllTitles ? [selected.title] : [selected.title]).map((title, i) => (
                    <div key={i} className="flex items-center gap-2 group">
                      <span className="text-xs text-gray-400 w-4 flex-shrink-0">{i + 1}.</span>
                      <p className="text-sm text-gray-700 flex-1 truncate">{title}</p>
                      <button
                        onClick={() => copyToClipboard(title, `title-${i}`)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-100"
                      >
                        {copiedTitle === `title-${i}`
                          ? <Check size={12} className="text-green-500" />
                          : <Copy size={12} className="text-gray-400" />
                        }
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SEO 점수 */}
            {selected.seo_score && (
              <SeoScorePanel score={selected.seo_score} />
            )}

            {/* 본문 편집기 */}
            <div className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-gray-700">본문 편집</h4>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">
                    {editContent.length.toLocaleString()}자
                    {editContent.length < 1500 && (
                      <span className="text-amber-600 ml-1">
                        <AlertCircle size={12} className="inline mr-0.5" />
                        {1500 - editContent.length}자 부족
                      </span>
                    )}
                  </span>
                  <button
                    onClick={() => copyToClipboard(editContent, 'content')}
                    className="btn-secondary py-1.5 text-xs"
                  >
                    {copiedTitle === 'content' ? <Check size={12} /> : <Copy size={12} />}
                    복사
                  </button>
                </div>
              </div>
              <textarea
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                rows={20}
                className="w-full text-sm text-gray-700 border border-gray-200 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
              />
            </div>

            {/* FAQ */}
            {selected.faq && selected.faq.length > 0 && (
              <div className="card p-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">
                  FAQ ({selected.faq.length}개)
                </h4>
                <div className="space-y-3">
                  {selected.faq.map((item, i) => (
                    <div key={i} className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-sm font-medium text-gray-800">Q. {item.q}</p>
                      <p className="text-sm text-gray-600 mt-1">A. {item.a}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
