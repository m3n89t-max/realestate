'use client'

import { useState, useEffect } from 'react'
import { Wand2, Copy, Check, ChevronDown, ChevronUp, AlertCircle, Upload, Loader2, PlayCircle, Save, CreditCard, Star, XCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { GeneratedContent, SeoScore } from '@/lib/types'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'

interface BlogTabProps {
  projectId: string
  orgId: string
  contents: GeneratedContent[]
  assets: any[]
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

function parseBold(text: string): React.ReactNode[] {
  // **bold** 및 중첩 패턴 처리 — 줄 전체가 **...** 인 경우도 포함
  const parts = text.split(/(\*\*[\s\S]+?\*\*)/)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={i} className="font-bold text-gray-900">{part.slice(2, -2)}</strong>
    }
    return part || null
  }).filter(Boolean) as React.ReactNode[]
}

export default function BlogTab({ projectId, orgId, contents, assets }: BlogTabProps) {
  const supabase = createClient()
  const [generating, setGenerating] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [style, setStyle] = useState<'informative' | 'investment' | 'lifestyle'>('informative')
  const [tone, setTone] = useState<'professional' | 'friendly' | 'passionate' | 'storytelling' | 'analytical'>('professional')
  const [format, setFormat] = useState<'default' | 'storytelling' | 'summary' | 'qna'>('default')
  const [focus, setFocus] = useState<'location' | 'investment' | 'interior' | 'price'>('location')
  const [selectedId, setSelectedId] = useState<string | null>(contents[0]?.id ?? null)
  const [editContent, setEditContent] = useState<string>(contents[0]?.content ?? '')
  const [copiedTitle, setCopiedTitle] = useState<string | null>(null)
  const [showAllTitles, setShowAllTitles] = useState(false)
  const [showPhotoLibrary, setShowPhotoLibrary] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [photoLayout, setPhotoLayout] = useState<'individual' | 'collage' | 'slideshow'>('individual')
  const [photoPosition, setPhotoPosition] = useState<'inline' | 'bulk'>('inline')
  const [selectedTitle, setSelectedTitle] = useState<string | null>(null)
  const [regeneratingTitles, setRegeneratingTitles] = useState(false)
  const [localTitles, setLocalTitles] = useState<Record<string, string[]>>({})
  const [realtorName, setRealtorName] = useState('')
  const [realtorAddress, setRealtorAddress] = useState('')
  const [realtorPhone, setRealtorPhone] = useState('')
  const [realtorGreeting, setRealtorGreeting] = useState('')
  const [namecardUrl, setNamecardUrl] = useState('')
  const [namecardFileName, setNamecardFileName] = useState('')
  const [coverImageUrl, setCoverImageUrl] = useState<string>('')
  const [uploadTasks, setUploadTasks] = useState<{ id: string; status: string; created_at: string }[]>([])
  const [namecardUploading, setNamecardUploading] = useState(false)

  // localStorage에서 초기값 로드
  useEffect(() => {
    try {
      const opts = localStorage.getItem('realestate_blog_opts')
      if (opts) {
        const o = JSON.parse(opts)
        if (o.style) setStyle(o.style)
        if (o.tone) setTone(o.tone)
        if (o.format) setFormat(o.format)
        if (o.focus) setFocus(o.focus)
        if (o.photoLayout) setPhotoLayout(o.photoLayout)
        if (o.photoPosition) setPhotoPosition(o.photoPosition)
      }
      const realtor = localStorage.getItem('realestate_realtor')
      if (realtor) {
        const r = JSON.parse(realtor)
        if (r.name) setRealtorName(r.name)
        if (r.address) setRealtorAddress(r.address)
        if (r.phone) setRealtorPhone(r.phone)
        if (r.greeting) setRealtorGreeting(r.greeting)
      }
      const namecard = localStorage.getItem('realestate_namecard')
      if (namecard) {
        const n = JSON.parse(namecard)
        if (n.url) setNamecardUrl(n.url)
        if (n.fileName) setNamecardFileName(n.fileName)
      }
      const cover = localStorage.getItem(`realestate_cover_${projectId}`)
      if (cover) setCoverImageUrl(cover)
    } catch {}
  }, [projectId])

  // 블로그 옵션 변경 시 자동 저장
  useEffect(() => {
    try {
      localStorage.setItem('realestate_blog_opts', JSON.stringify({ style, tone, format, focus, photoLayout, photoPosition }))
    } catch {}
  }, [style, tone, format, focus, photoLayout, photoPosition])

  // 업로드 작업 목록 로드 + Realtime 구독
  useEffect(() => {
    const fetchTasks = async () => {
      const { data } = await supabase
        .from('tasks')
        .select('id, status, created_at')
        .eq('project_id', projectId)
        .eq('type', 'upload_naver_blog')
        .in('status', ['pending', 'running'])
        .order('created_at', { ascending: false })
      if (data) setUploadTasks(data)
    }
    fetchTasks()

    const channel = supabase
      .channel(`blog-tasks-${projectId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'tasks',
        filter: `project_id=eq.${projectId}`,
      }, () => { fetchTasks() })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [projectId, supabase])

  const handleCancelTask = async (taskId: string) => {
    const { error } = await supabase
      .from('tasks')
      .update({ status: 'cancelled' })
      .eq('id', taskId)
    if (error) toast.error('취소 실패')
    else toast.success('업로드 작업이 취소되었습니다')
  }

  const selected = contents.find(c => c.id === selectedId)

  const saveRealtorInfo = () => {
    try {
      localStorage.setItem('realestate_realtor', JSON.stringify({
        name: realtorName, address: realtorAddress, phone: realtorPhone, greeting: realtorGreeting,
      }))
      toast.success('공인중개사 정보가 저장되었습니다')
    } catch { toast.error('저장 실패') }
  }

  const handleNamecardUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setNamecardUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const filePath = `${orgId}/namecard/namecard_${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('project-assets').upload(filePath, file, { upsert: true })
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('project-assets').getPublicUrl(filePath)
      setNamecardUrl(publicUrl)
      setNamecardFileName(file.name)
      localStorage.setItem('realestate_namecard', JSON.stringify({ url: publicUrl, fileName: file.name }))
      toast.success('명함 이미지가 저장되었습니다')
    } catch { toast.error('업로드 실패') } finally { setNamecardUploading(false) }
  }

  // 인사말 — 블로그 글 최상단에 위치
  const buildGreetingHeader = () => {
    if (!realtorGreeting.trim()) return ''
    return `${realtorGreeting.trim()}\n\n`
  }

  // 공인중개사 정보 + 명함 — 블로그 글 최하단에 위치
  const buildRealtorFooter = () => {
    const hasInfo = realtorName || realtorAddress || realtorPhone
    const hasNamecard = namecardUrl
    if (!hasInfo && !hasNamecard) return ''
    let footer = '\n\n---\n\n## 📞 문의 안내\n\n'
    if (hasInfo) {
      footer += `${realtorName ? `- **공인중개사:** ${realtorName}\n` : ''}${realtorAddress ? `- **사무소 주소:** ${realtorAddress}\n` : ''}${realtorPhone ? `- **연락처:** ${realtorPhone}\n` : ''}\n`
      footer += '신뢰할 수 있는 부동산 전문가와 함께 최선의 매물을 찾아드립니다. 언제든지 편하게 문의해 주세요! 😊\n'
    }
    if (hasNamecard) footer += `\n![공인중개사 명함](${namecardUrl})\n`
    return footer
  }

  // 미리보기·업로드에 사용할 전체 내용 (인사말 + 본문 + 공인중개사 정보)
  const buildFullContent = () =>
    buildGreetingHeader() + (editContent || selected?.content || '') + buildRealtorFooter()

  const handleRegenerateTitles = async () => {
    if (!selectedId) return
    setRegeneratingTitles(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-blog`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ titles_only: true, content_id: selectedId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '제목 재생성 실패')
      setLocalTitles(prev => ({ ...prev, [selectedId]: json.titles }))
      setSelectedTitle(null)
      setShowAllTitles(true)
      toast.success('제목 5개가 재생성되었습니다!')
    } catch (err: any) {
      toast.error(err.message || '재생성에 실패했습니다.')
    } finally {
      setRegeneratingTitles(false)
    }
  }

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
        body: JSON.stringify({ project_id: projectId, style, tone, format, focus }),
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
    if (!selectedId || !selected) {
      toast.error('업로드할 블로그 글을 먼저 생성해주세요')
      return
    }
    if (uploadTasks.length > 0) {
      toast.error('이미 대기 중인 업로드 작업이 있습니다. 작업을 취소한 후 다시 시도하세요.')
      return
    }
    setUploading(true)
    try {
      const { error } = await supabase.from('tasks').insert({
        org_id: orgId,
        project_id: projectId,
        type: 'upload_naver_blog',
        status: 'pending',
        scheduled_at: new Date().toISOString(),
        payload: {
          content_id: selectedId,
          project_id: projectId,
          content_title: selectedTitle ?? selected.title,
          content_body: buildFullContent(),
          content_tags: selected.tags ?? [],
          photo_layout: photoLayout,
          photo_position: photoPosition,
          cover_image_url: coverImageUrl || undefined,
        },
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

  const insertImage = (url: string, alt: string) => {
    const markdown = `\n![${alt}](${url})\n*▲ ${alt}*`
    const textarea = document.getElementById('blog-editor') as HTMLTextAreaElement
    if (!textarea) {
      setEditContent(prev => prev + markdown)
      return
    }

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const content = editContent
    const newContent = content.substring(0, start) + markdown + content.substring(end)

    setEditContent(newContent)

    // 포커스 유지 및 커서 이동
    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(start + markdown.length, start + markdown.length)
    }, 0)

    toast.success('이미지가 삽입되었습니다')
  }

  const handleQuickUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const fileName = `${Math.random().toString(36).substring(2, 10)}_${Date.now()}.${ext}`
      const filePath = `${orgId}/${projectId}/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('project-assets')
        .upload(filePath, file)

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('project-assets')
        .getPublicUrl(filePath)

      // DB에도 기록
      await supabase.from('assets').insert({
        project_id: projectId,
        org_id: orgId,
        type: 'image',
        file_name: file.name,
        file_url: publicUrl,
        file_size: file.size,
        mime_type: file.type,
      })

      insertImage(publicUrl, file.name.split('.')[0])
      toast.success('사진이 업로드되고 삽입되었습니다')
    } catch (err) {
      toast.error('업로드 실패')
      console.error(err)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* 좌측: 생성 컨트롤 + 버전 목록 */}
      <div className="space-y-4">
        {/* 생성 버튼 */}
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">블로그 글 생성 옵션</h3>

          <div className="space-y-3 mb-4">
            <div>
              <label className="text-xs text-gray-500 mb-1.5 block font-medium">1. 기본 목적 (기존)</label>
              <div className="grid grid-cols-3 gap-1.5">
                {([
                  ['informative', '정보전달'],
                  ['investment', '투자성'],
                  ['lifestyle', '라이프'],
                ] as const).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setStyle(val)}
                    className={cn(
                      'py-1.5 text-xs rounded border font-medium transition-colors',
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

            <div>
              <label className="text-xs text-gray-500 mb-1.5 block font-medium">2. 매물 강조 포인트</label>
              <div className="grid grid-cols-4 gap-1.5">
                {([
                  ['location', '입지/교통'],
                  ['investment', '투자가치'],
                  ['interior', '내부구조'],
                  ['price', '가격비교'],
                ] as const).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setFocus(val)}
                    className={cn(
                      'py-1 text-[11px] rounded border font-medium transition-colors',
                      focus === val
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'border-gray-200 text-gray-600 hover:border-brand-300'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1.5 block font-medium">3. 포스팅 어조(Tone)</label>
              <div className="grid grid-cols-5 gap-1.5">
                {([
                  ['professional', '전문가형'],
                  ['friendly', '친근한'],
                  ['passionate', '열정적'],
                  ['storytelling', '스토리텔링'],
                  ['analytical', '분석적'],
                ] as const).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setTone(val)}
                    className={cn(
                      'py-1 text-[11px] rounded border font-medium transition-colors',
                      tone === val
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'border-gray-200 text-gray-600 hover:border-brand-300'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1.5 block font-medium">4. 글쓰기 형식</label>
              <div className="grid grid-cols-4 gap-1.5">
                {([
                  ['default', '기본형'],
                  ['storytelling', '스토리텔링'],
                  ['summary', '요약강조'],
                  ['qna', 'Q&A형'],
                ] as const).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setFormat(val)}
                    className={cn(
                      'py-1 text-[11px] rounded border font-medium transition-colors',
                      format === val
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'border-gray-200 text-gray-600 hover:border-brand-300'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1.5 block font-medium">5. 사진 배치</label>
              <div className="grid grid-cols-2 gap-1.5">
                {([
                  ['inline', '글 중간 (인라인)', '각 섹션 내 삽입'],
                  ['bulk', '글 마지막 (일괄)', '본문 뒤 한번에'],
                ] as const).map(([val, label, desc]) => (
                  <button
                    key={val}
                    onClick={() => setPhotoPosition(val)}
                    className={cn(
                      'py-2 px-2 text-left rounded-lg border transition-colors',
                      photoPosition === val
                        ? 'bg-brand-50 border-brand-500 text-brand-700'
                        : 'border-gray-200 text-gray-600 hover:border-brand-300'
                    )}
                  >
                    <div className="text-xs font-medium">{label}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">{desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1.5 block font-medium">6. 사진 형식</label>
              <div className="grid grid-cols-3 gap-1.5">
                {([
                  ['individual', '개별'],
                  ['collage', '콜라주'],
                  ['slideshow', '슬라이드'],
                ] as const).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setPhotoLayout(val)}
                    className={cn(
                      'py-1.5 text-xs rounded-lg border font-medium transition-colors',
                      photoLayout === val
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'border-gray-200 text-gray-600 hover:border-brand-300'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
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

            {/* 공인중개사 정보 */}
            <div className="mb-3 border-t border-gray-100 pt-3 space-y-3">
              {/* 인사말 */}
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block font-medium">인사말 (블로그 최상단 자동 삽입)</label>
                <textarea
                  placeholder={"예: 안녕하세요! 10년 경력의 홍길동 공인중개사입니다.\n부동산 관련 궁금하신 점은 언제든지 연락 주세요."}
                  value={realtorGreeting}
                  onChange={e => setRealtorGreeting(e.target.value)}
                  rows={3}
                  className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-green-400 resize-none"
                />
              </div>

              {/* 공인중개사 연락처 */}
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block font-medium">공인중개사 정보</label>
                <div className="space-y-1.5">
                  <input
                    type="text"
                    placeholder="이름 (예: 홍길동 공인중개사)"
                    value={realtorName}
                    onChange={e => setRealtorName(e.target.value)}
                    className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-green-400"
                  />
                  <input
                    type="text"
                    placeholder="사무소 주소"
                    value={realtorAddress}
                    onChange={e => setRealtorAddress(e.target.value)}
                    className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-green-400"
                  />
                  <input
                    type="text"
                    placeholder="연락처 (예: 010-1234-5678)"
                    value={realtorPhone}
                    onChange={e => setRealtorPhone(e.target.value)}
                    className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-green-400"
                  />
                </div>
              </div>

              {/* 저장 버튼 */}
              <button
                onClick={saveRealtorInfo}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-lg border border-green-200 text-green-700 hover:bg-green-50 transition-colors"
              >
                <Save size={12} /> 인사말 + 정보 저장
              </button>

              {/* 명함 이미지 */}
              <div>
                <label className="text-xs text-gray-500 mb-1.5 flex items-center gap-1 font-medium">
                  <CreditCard size={11} /> 명함/네임카드 (공인중개사 정보 아래 삽입)
                </label>
                {namecardUrl ? (
                  <div className="relative rounded-lg overflow-hidden border border-gray-200 mb-1.5">
                    <img src={namecardUrl} alt="명함" className="w-full object-contain max-h-24 bg-gray-50" />
                    <button
                      onClick={() => {
                        setNamecardUrl('')
                        setNamecardFileName('')
                        localStorage.removeItem('realestate_namecard')
                      }}
                      className="absolute top-1 right-1 w-5 h-5 bg-black/50 text-white rounded-full text-[10px] flex items-center justify-center hover:bg-black/70"
                    >✕</button>
                  </div>
                ) : null}
                <label className={cn(
                  'flex items-center justify-center gap-1.5 w-full py-1.5 text-xs font-medium rounded-lg border cursor-pointer transition-colors',
                  namecardUploading ? 'opacity-50 pointer-events-none' : 'border-dashed border-gray-300 text-gray-500 hover:border-green-400 hover:text-green-600'
                )}>
                  {namecardUploading
                    ? <><Loader2 size={11} className="animate-spin" /> 업로드 중...</>
                    : <><Upload size={11} /> {namecardUrl ? '명함 교체' : '명함 이미지 업로드'}</>
                  }
                  <input type="file" className="hidden" accept="image/*" onChange={handleNamecardUpload} disabled={namecardUploading} />
                </label>
                {namecardFileName && <p className="text-[10px] text-gray-400 mt-1 truncate">{namecardFileName}</p>}
              </div>
            </div>

            <button
              onClick={handleNaverUpload}
              disabled={uploading || uploadTasks.length > 0}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold text-sm bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {uploading
                ? <><Loader2 size={15} className="animate-spin" /> 업로드 등록 중...</>
                : <><Upload size={15} /> 📤 네이버 블로그 자동 업로드</>
              }
            </button>
            {!uploading && uploadTasks.length === 0 && (
              <p className="text-[11px] text-gray-400 text-center mt-1">로컬 에이전트가 자동으로 업로드합니다</p>
            )}

            {/* 진행 중인 업로드 작업 목록 */}
            {uploadTasks.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {uploadTasks.map(task => (
                  <div key={task.id} className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-lg border text-xs',
                    task.status === 'running'
                      ? 'bg-blue-50 border-blue-200'
                      : 'bg-amber-50 border-amber-200'
                  )}>
                    <Loader2 size={12} className={cn(
                      'flex-shrink-0 animate-spin',
                      task.status === 'running' ? 'text-blue-500' : 'text-amber-500'
                    )} />
                    <span className={cn(
                      'flex-1 font-medium',
                      task.status === 'running' ? 'text-blue-700' : 'text-amber-700'
                    )}>
                      {task.status === 'running' ? '에이전트 업로드 진행 중...' : '업로드 대기 중 (에이전트 연결 필요)'}
                    </span>
                    <button
                      onClick={() => handleCancelTask(task.id)}
                      className="flex items-center gap-1 text-red-500 hover:text-red-700 transition-colors font-semibold flex-shrink-0"
                    >
                      <XCircle size={13} /> {task.status === 'running' ? '강제중지' : '취소'}
                    </button>
                  </div>
                ))}
              </div>
            )}
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

        {/* 사진 라이브러리 */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold text-gray-700">사진/동영상 라이브러리</h3>
            <button
              onClick={() => setShowPhotoLibrary(!showPhotoLibrary)}
              className="text-xs text-brand-600 hover:underline"
            >
              {showPhotoLibrary ? '접기' : '모두 보기'}
            </button>
          </div>
          <p className="text-[11px] text-gray-400 mb-2.5">
            <Star size={10} className="inline mr-0.5 text-amber-400" />
            별 아이콘 클릭 → 대표이미지 설정 (업로드 시 첫 번째로 삽입)
          </p>

          {coverImageUrl && (
            <div className="mb-2 flex items-center gap-2 px-2 py-1.5 rounded-lg bg-amber-50 border border-amber-200">
              <img src={coverImageUrl} alt="대표이미지" className="w-8 h-8 rounded object-cover flex-shrink-0" />
              <span className="text-[11px] text-amber-700 font-medium flex-1 truncate">대표이미지 선택됨</span>
              <button
                onClick={() => {
                  setCoverImageUrl('')
                  localStorage.removeItem(`realestate_cover_${projectId}`)
                }}
                className="text-[10px] text-gray-400 hover:text-gray-600 flex-shrink-0"
              >✕</button>
            </div>
          )}

          <div className={cn(
            "grid grid-cols-3 gap-2",
            !showPhotoLibrary && "max-h-36 overflow-hidden relative"
          )}>
            {assets.slice(0, showPhotoLibrary ? undefined : 6).map((asset, i) => {
              const isCover = coverImageUrl === asset.file_url
              return (
                <div key={i} className="relative aspect-square group">
                  <button
                    onClick={() => insertImage(asset.file_url, asset.alt_text || asset.category || '매물사진')}
                    className={cn(
                      'absolute inset-0 rounded-lg overflow-hidden border transition-colors',
                      isCover ? 'border-amber-400 ring-2 ring-amber-300' : 'border-gray-100 hover:border-brand-500'
                    )}
                  >
                    {asset.type === 'video' ? (
                      <>
                        <video src={asset.file_url} className="object-cover w-full h-full" preload="metadata" />
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <PlayCircle className="text-white w-6 h-6 opacity-80 drop-shadow-md" />
                        </div>
                      </>
                    ) : (
                      <img src={asset.file_url} alt="" className="object-cover w-full h-full" />
                    )}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <span className="text-[10px] text-white font-medium">삽입</span>
                    </div>
                  </button>
                  {/* 대표이미지 선택 버튼 */}
                  {asset.type !== 'video' && (
                    <button
                      onClick={e => {
                        e.stopPropagation()
                        const url = isCover ? '' : asset.file_url
                        setCoverImageUrl(url)
                        if (url) localStorage.setItem(`realestate_cover_${projectId}`, url)
                        else localStorage.removeItem(`realestate_cover_${projectId}`)
                        toast.success(url ? '대표이미지로 설정되었습니다' : '대표이미지 해제')
                      }}
                      className={cn(
                        'absolute top-1 left-1 w-5 h-5 rounded-full flex items-center justify-center shadow transition-all z-10',
                        isCover
                          ? 'bg-amber-400 text-white opacity-100'
                          : 'bg-black/50 text-white opacity-0 group-hover:opacity-100'
                      )}
                    >
                      <Star size={10} className={isCover ? 'fill-white' : ''} />
                    </button>
                  )}
                  {isCover && (
                    <div className="absolute bottom-0 inset-x-0 py-0.5 text-center rounded-b-lg" style={{ background: 'rgba(217,119,6,0.85)' }}>
                      <span className="text-[9px] font-bold text-white">대표</span>
                    </div>
                  )}
                </div>
              )
            })}
            {!showPhotoLibrary && assets.length > 6 && (
              <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white to-transparent pointer-events-none" />
            )}
          </div>

          <div className="mt-4">
            <label className="btn-secondary w-full justify-center text-xs cursor-pointer">
              <Upload size={12} />
              사진/동영상 업로드 & 삽입
              <input
                type="file"
                className="hidden"
                accept="image/*,video/*"
                onChange={handleQuickUpload}
                disabled={uploading}
              />
            </label>
          </div>
        </div>
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
                {(() => {
                  // localTitles(재생성) > DB titles > title 단일값 순 우선
                  const allTitles = (localTitles[selectedId!] ?? (selected.titles && selected.titles.length > 0 ? selected.titles : null) ?? [selected.title].filter(Boolean)) as string[]
                  const displayed = showAllTitles ? allTitles : allTitles.slice(0, 1)
                  return (
                    <>
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-semibold text-gray-700">
                          추천 제목 ({allTitles.length}개)
                        </h4>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleRegenerateTitles}
                            disabled={regeneratingTitles}
                            className="text-xs text-brand-600 hover:underline flex items-center gap-1"
                          >
                            {regeneratingTitles
                              ? <><Loader2 size={11} className="animate-spin" />재생성 중...</>
                              : <><Wand2 size={11} />제목 5개 재생성</>
                            }
                          </button>
                          {allTitles.length > 1 && (
                            <button
                              onClick={() => setShowAllTitles(!showAllTitles)}
                              className="text-xs text-gray-400 flex items-center gap-1"
                            >
                              {showAllTitles ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                              {showAllTitles ? '접기' : `+${allTitles.length - 1}개 더 보기`}
                            </button>
                          )}
                        </div>
                      </div>
                      {selectedTitle && (
                        <div className="mb-2 px-2 py-1.5 bg-brand-50 border border-brand-200 rounded-lg flex items-center gap-2">
                          <span className="text-[10px] text-brand-600 font-semibold flex-shrink-0">선택됨</span>
                          <p className="text-xs text-brand-800 flex-1 truncate">{selectedTitle}</p>
                          <button onClick={() => setSelectedTitle(null)} className="text-[10px] text-gray-400 hover:text-gray-600 flex-shrink-0">✕</button>
                        </div>
                      )}
                      <div className="space-y-1.5">
                        {displayed.map((title, i) => {
                          const isSelected = selectedTitle === title
                          return (
                            <div key={i} className={cn("flex items-center gap-2 group rounded-lg px-1.5 py-1 transition-colors cursor-pointer",
                              isSelected ? "bg-brand-50" : "hover:bg-gray-50"
                            )} onClick={() => setSelectedTitle(isSelected ? null : title)}>
                              <span className="text-xs text-gray-400 w-4 flex-shrink-0">{i + 1}.</span>
                              <p className={cn("text-sm flex-1", isSelected ? "text-brand-700 font-medium" : "text-gray-700")}>{title}</p>
                              <button
                                onClick={e => { e.stopPropagation(); copyToClipboard(title, `title-${i}`) }}
                                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-100 flex-shrink-0"
                              >
                                {copiedTitle === `title-${i}`
                                  ? <Check size={12} className="text-green-500" />
                                  : <Copy size={12} className="text-gray-400" />
                                }
                              </button>
                            </div>
                          )
                        })}

                      </div>
                    </>
                  )
                })()}
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
                  <button
                    onClick={() => setShowPreview(!showPreview)}
                    className={cn(
                      "text-xs px-2 py-1 rounded border transition-colors",
                      showPreview ? "bg-brand-50 border-brand-200 text-brand-700" : "bg-white border-gray-200 text-gray-600"
                    )}
                  >
                    {showPreview ? '편집 모드' : '미리보기'}
                  </button>
                  <span className="text-xs text-gray-400">
                    {buildFullContent().length.toLocaleString()}자
                    {buildFullContent().length < 1500 && (
                      <span className="text-amber-600 ml-1">
                        <AlertCircle size={12} className="inline mr-0.5" />
                        {1500 - buildFullContent().length}자 부족
                      </span>
                    )}
                  </span>
                  <button
                    onClick={() => copyToClipboard(buildFullContent(), 'content')}
                    className="btn-secondary py-1.5 text-xs"
                  >
                    {copiedTitle === 'content' ? <Check size={12} /> : <Copy size={12} />}
                    복사
                  </button>
                </div>
              </div>

              {showPreview ? (
                <div className="w-full min-h-[400px] max-h-[600px] overflow-y-auto text-sm text-gray-700 border border-gray-200 rounded-lg p-4 bg-white prose prose-sm max-w-none">
                  {buildFullContent().split('\n').map((line, i) => {
                    const imgMatch = line.match(/!\[(.*?)\]\((.*?)\)/)
                    if (imgMatch) {
                      const url = imgMatch[2];
                      const isVideo = url.match(/\.(mp4|mov|avi|webm)(?:\?.*)?$/i);
                      return (
                        <div key={i} className="my-4">
                          {isVideo ? (
                            <video src={url} controls className="rounded-lg border border-gray-200 max-w-full w-full" />
                          ) : (
                            <img src={url} alt={imgMatch[1]} className="rounded-lg border border-gray-200 max-w-full" />
                          )}
                          <p className="text-center text-xs text-gray-400 mt-1">{imgMatch[1]}</p>
                        </div>
                      )
                    }
                    // 이미지 캡션
                    const captionMatch = line.match(/^\*▲\s*(.*?)\*$/)
                    if (captionMatch) return <p key={i} className="text-center text-xs text-gray-400 -mt-2 mb-3">▲ {captionMatch[1]}</p>

                    if (line.startsWith('### ')) return <h3 key={i} className="text-base font-bold mt-4 mb-1 text-gray-800">{parseBold(line.replace(/^### /, ''))}</h3>
                    if (line.startsWith('## ')) return <h2 key={i} className="text-lg font-bold mt-6 mb-2 border-b border-gray-200 pb-1 text-gray-900">{parseBold(line.replace(/^## /, ''))}</h2>
                    if (line.startsWith('# ')) return <h1 key={i} className="text-xl font-bold mt-8 mb-3 text-gray-900">{parseBold(line.replace(/^# /, ''))}</h1>

                    // FAQ Q: / A: 라인 — 번호 목록보다 먼저 처리
                    const qMatch = line.match(/^(?:\d+\.\s*)?Q[：:]\s*(.+)/)
                    if (qMatch) return (
                      <div key={i} className="mt-3 mb-0.5 flex gap-1.5">
                        <span className="text-brand-600 font-bold text-xs mt-0.5 flex-shrink-0">Q.</span>
                        <span className="font-semibold text-gray-800">{parseBold(qMatch[1])}</span>
                      </div>
                    )
                    const aMatch = line.match(/^(?:\s*\d+\.\s*)?A[：:]\s*(.+)/)
                    if (aMatch) return (
                      <div key={i} className="mb-2 flex gap-1.5 pl-4">
                        <span className="text-green-600 font-bold text-xs mt-0.5 flex-shrink-0">A.</span>
                        <span className="text-gray-600">{parseBold(aMatch[1])}</span>
                      </div>
                    )

                    // HTML 테이블 렌더링
                    if (line.startsWith('<table')) return <div key={i} className="my-4 overflow-x-auto" dangerouslySetInnerHTML={{ __html: line }} />

                    // 리스트 항목 (선행 공백 허용)
                    if (line.match(/^\s*[-*]\s/)) return (
                      <div key={i} className="flex gap-2 mb-1 pl-4">
                        <span className="text-brand-500 mt-0.5 flex-shrink-0">•</span>
                        <span>{parseBold(line.replace(/^\s*[-*]\s/, ''))}</span>
                      </div>
                    )
                    // 번호 리스트 — 중복 숫자 완전 제거 (다단계: "3. 3. 3. 텍스트" → "3. 텍스트")
                    const numMatch = line.match(/^(\d+)\.\s+(.*)/)
                    if (numMatch) {
                      let innerContent = numMatch[2]
                      // 앞에 붙은 "N. " 패턴을 모두 제거
                      while (/^\d+[.)]\s+/.test(innerContent)) {
                        innerContent = innerContent.replace(/^\d+[.)]\s+/, '')
                      }
                      return (
                        <div key={i} className="flex gap-2 mb-1.5 pl-2">
                          <span className="text-brand-500 font-semibold min-w-[1.5rem] flex-shrink-0">{numMatch[1]}.</span>
                          <span className="flex-1">{parseBold(innerContent)}</span>
                        </div>
                      )
                    }

                    if (!line.trim()) return <div key={i} className="h-3" />
                    return <p key={i} className="mb-2 leading-relaxed">{parseBold(line)}</p>
                  })}
                </div>
              ) : (
                <textarea
                  id="blog-editor"
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  rows={20}
                  className="w-full text-sm text-gray-700 border border-gray-200 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
                />
              )}
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
