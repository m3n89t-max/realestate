'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Video, Copy, Check, Loader2, Download, ChevronLeft, ChevronRight, Play, Pause, FileText, FileJson } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'

interface Scene {
  scene_number: number
  duration_sec: number
  visual_description: string
  narration: string
  cta: string | null
}

interface ShortsScript {
  hook: string
  total_duration_sec: number
  scenes: Scene[]
  hashtags: string[]
}

interface ShortsTabProps {
  projectId: string
}

/* ── 폰 미리보기 컴포넌트 ── */
function PhonePreview({ script, activeScene, onScene }: {
  script: ShortsScript
  activeScene: number
  onScene: (i: number) => void
}) {
  const scenes = script.scenes ?? []
  const scene = scenes[activeScene]
  const [playing, setPlaying] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const advance = useCallback(() => {
    if (activeScene < scenes.length - 1) {
      onScene(activeScene + 1)
    } else {
      setPlaying(false)
    }
  }, [activeScene, scenes.length, onScene])

  useEffect(() => {
    if (!playing) return
    timerRef.current = setTimeout(advance, (scene?.duration_sec ?? 10) * 1000)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [playing, activeScene, advance, scene?.duration_sec])

  if (!scene) return null

  const gradients = [
    'from-blue-900 via-blue-800 to-indigo-900',
    'from-emerald-900 via-teal-800 to-cyan-900',
    'from-purple-900 via-violet-800 to-indigo-900',
    'from-rose-900 via-pink-800 to-purple-900',
    'from-amber-900 via-orange-800 to-red-900',
    'from-gray-900 via-gray-800 to-slate-900',
  ]
  const bg = gradients[activeScene % gradients.length]

  return (
    <div className="flex flex-col items-center gap-4 sticky top-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">📱 쇼츠 미리보기</p>

      {/* Phone shell */}
      <div
        className="relative rounded-[44px] border-[5px] border-gray-800 bg-gray-900 shadow-2xl overflow-hidden"
        style={{ width: 236, height: 420 }}
      >
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-14 h-4 bg-gray-900 rounded-b-xl z-30" />

        {/* Progress strips */}
        <div className="absolute top-5 left-3 right-3 flex gap-0.5 z-20">
          {scenes.map((_, i) => (
            <button
              key={i}
              onClick={() => onScene(i)}
              className={cn(
                'h-[3px] flex-1 rounded-full transition-all',
                i < activeScene ? 'bg-white' :
                i === activeScene ? 'bg-brand-400' : 'bg-white/25'
              )}
            />
          ))}
        </div>

        {/* Background gradient */}
        <div className={cn('absolute inset-0 bg-gradient-to-b', bg)} />

        {/* Scene badge */}
        <div className="absolute top-9 left-3 z-20">
          <span className={cn(
            'text-[10px] font-bold px-2 py-0.5 rounded-full',
            scene.scene_number === 1 ? 'bg-brand-500 text-white' :
            scene.scene_number === 6 ? 'bg-orange-500 text-white' :
            'bg-black/40 text-white'
          )}>
            장면 {scene.scene_number}
          </span>
        </div>
        <div className="absolute top-9 right-3 z-20">
          <span className="text-[10px] text-white/60 bg-black/30 px-1.5 py-0.5 rounded-full">
            {scene.duration_sec}초
          </span>
        </div>

        {/* Hook (scene 1) */}
        {activeScene === 0 && (
          <div className="absolute top-1/4 left-4 right-4 z-20 text-center">
            <p className="text-white text-xs font-bold leading-snug drop-shadow-lg">
              &ldquo;{script.hook}&rdquo;
            </p>
          </div>
        )}

        {/* Visual hint */}
        <div className="absolute top-1/2 -translate-y-1/2 left-4 right-4 z-10 text-center">
          <Video size={22} className="mx-auto text-white/20 mb-2" />
          <p className="text-white/30 text-[10px] leading-relaxed italic line-clamp-3">
            {scene.visual_description}
          </p>
        </div>

        {/* Narration overlay */}
        <div className="absolute bottom-4 left-3 right-3 z-20 space-y-1.5">
          <div className="bg-black/60 backdrop-blur-sm rounded-2xl p-3">
            <p className="text-white text-[11px] font-medium leading-relaxed">{scene.narration}</p>
            {scene.cta && (
              <p className="text-yellow-400 text-[10px] font-bold mt-1.5 pt-1.5 border-t border-white/10">
                📞 {scene.cta}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onScene(Math.max(0, activeScene - 1))}
          disabled={activeScene === 0}
          className="p-1.5 rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-30 transition-colors"
        >
          <ChevronLeft size={15} />
        </button>

        <button
          onClick={() => setPlaying(p => !p)}
          className={cn(
            'px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 transition-colors',
            playing ? 'bg-orange-100 text-orange-700' : 'bg-brand-100 text-brand-700'
          )}
        >
          {playing ? <><Pause size={11} /> 일시정지</> : <><Play size={11} /> 재생</>}
        </button>

        <button
          onClick={() => onScene(Math.min(scenes.length - 1, activeScene + 1))}
          disabled={activeScene === scenes.length - 1}
          className="p-1.5 rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-30 transition-colors"
        >
          <ChevronRight size={15} />
        </button>
      </div>

      <p className="text-xs text-gray-400">{activeScene + 1} / {scenes.length} 장면 · 총 {script.total_duration_sec ?? 60}초</p>
    </div>
  )
}

/* ── 메인 컴포넌트 ── */
export default function ShortsTab({ projectId }: ShortsTabProps) {
  const supabase = createClient()
  const [generating, setGenerating] = useState(false)
  const [script, setScript] = useState<ShortsScript | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [activeScene, setActiveScene] = useState(0)

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        toast.error('로그인이 필요합니다. 페이지를 새로고침해주세요.')
        return
      }
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-shorts-script`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        },
        body: JSON.stringify({ project_id: projectId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '생성에 실패했습니다')
      const data = json.data ?? json
      setScript({ hook: data.hook, total_duration_sec: data.total_duration_sec ?? 60, scenes: data.scenes ?? [], hashtags: data.hashtags ?? [] })
      setActiveScene(0)
      toast.success('쇼츠 스크립트가 생성되었습니다!')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '생성에 실패했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setGenerating(false)
    }
  }

  const copyText = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
    toast.success('복사되었습니다')
  }

  const downloadTxt = () => {
    if (!script) return
    const lines = [
      `[후킹] ${script.hook}`,
      '',
      ...(script.scenes ?? []).map(s =>
        `[장면 ${s.scene_number} - ${s.duration_sec}초]\n화면: ${s.visual_description}\n나레이션: ${s.narration}${s.cta ? `\nCTA: ${s.cta}` : ''}`
      ),
      '',
      `[해시태그] ${(script.hashtags ?? []).join(' ')}`,
    ]
    const blob = new Blob([lines.join('\n\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `shorts-script-${projectId}.txt`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('TXT 파일로 저장되었습니다')
  }

  const downloadJson = () => {
    if (!script) return
    const blob = new Blob([JSON.stringify(script, null, 2)], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `shorts-script-${projectId}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('JSON 파일로 저장되었습니다')
  }

  return (
    <div className="space-y-5">
      {/* 생성 컨트롤 */}
      <div className="card p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <Video size={16} className="text-brand-500" />
              유튜브 쇼츠 스크립트
            </h3>
            <p className="text-sm text-gray-400 mt-0.5">60초 6장면 쇼츠 스크립트를 AI가 자동 생성합니다</p>
          </div>
          <div className="flex items-center gap-2">
            {script && (
              <>
                <button onClick={downloadTxt} className="btn-secondary gap-1.5">
                  <FileText size={13} />
                  TXT
                </button>
                <button onClick={downloadJson} className="btn-secondary gap-1.5">
                  <FileJson size={13} />
                  JSON
                </button>
              </>
            )}
            <button onClick={handleGenerate} disabled={generating} className="btn-primary">
              {generating
                ? <><Loader2 size={14} className="animate-spin" /> 생성중...</>
                : <><Video size={14} /> 스크립트 생성</>
              }
            </button>
          </div>
        </div>
      </div>

      {!script && !generating && (
        <div className="card p-12 text-center">
          <Video size={40} className="mx-auto text-gray-200 mb-3" />
          <p className="text-gray-500 font-medium">아직 생성된 스크립트가 없습니다</p>
          <p className="text-sm text-gray-400 mt-1">위의 &quot;스크립트 생성&quot; 버튼을 눌러 시작하세요</p>
        </div>
      )}

      {generating && (
        <div className="card p-12 text-center">
          <Loader2 size={32} className="mx-auto text-brand-400 animate-spin mb-3" />
          <p className="text-gray-500 font-medium">AI가 스크립트를 작성 중입니다...</p>
        </div>
      )}

      {script && (
        <>
          {/* 후킹 멘트 */}
          <div className="card p-4 border-l-4 border-brand-500">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-brand-600 uppercase tracking-wide">후킹 멘트 (첫 1초)</span>
              <button onClick={() => copyText(script.hook, 'hook')} className="p-1 rounded hover:bg-gray-100">
                {copied === 'hook' ? <Check size={13} className="text-green-500" /> : <Copy size={13} className="text-gray-400" />}
              </button>
            </div>
            <p className="text-lg font-bold text-gray-900">&quot;{script.hook}&quot;</p>
          </div>

          {/* 메인 영역: 장면 카드 + 폰 미리보기 */}
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_260px] gap-5 items-start">

            {/* 장면 카드 그리드 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {(script.scenes ?? []).map(scene => (
                <button
                  key={scene.scene_number}
                  onClick={() => setActiveScene(scene.scene_number - 1)}
                  className={cn(
                    'card p-4 space-y-3 text-left transition-all',
                    activeScene === scene.scene_number - 1
                      ? 'ring-2 ring-brand-400 shadow-md'
                      : 'hover:shadow-md'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className={cn(
                      'text-xs font-bold px-2.5 py-1 rounded-full',
                      scene.scene_number === 1 ? 'bg-brand-100 text-brand-700' :
                        scene.scene_number === 6 ? 'bg-orange-100 text-orange-700' :
                          'bg-gray-100 text-gray-600'
                    )}>
                      장면 {scene.scene_number}
                    </span>
                    <span className="text-xs text-gray-400">{scene.duration_sec}초</span>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">화면 구성</p>
                    <p className="text-sm text-gray-700 line-clamp-2">{scene.visual_description}</p>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">나레이션</p>
                    <p className="text-sm text-gray-800 font-medium line-clamp-2">{scene.narration}</p>
                  </div>

                  {scene.cta && (
                    <div className="pt-2 border-t border-gray-100">
                      <p className="text-xs font-bold text-orange-600 truncate">📞 {scene.cta}</p>
                    </div>
                  )}

                  <div
                    role="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      copyText(`화면: ${scene.visual_description}\n나레이션: ${scene.narration}`, `scene-${scene.scene_number}`)
                    }}
                    className="w-full text-xs text-gray-400 hover:text-gray-600 flex items-center justify-center gap-1 pt-1 cursor-pointer"
                  >
                    {copied === `scene-${scene.scene_number}`
                      ? <><Check size={11} className="text-green-500" /> 복사됨</>
                      : <><Copy size={11} /> 복사</>
                    }
                  </div>
                </button>
              ))}
            </div>

            {/* 폰 미리보기 (xl 이상에서 우측 고정) */}
            <div className="hidden xl:block">
              <PhonePreview
                script={script}
                activeScene={activeScene}
                onScene={setActiveScene}
              />
            </div>
          </div>

          {/* 모바일용 폰 미리보기 (xl 미만) */}
          <div className="xl:hidden flex justify-center">
            <PhonePreview
              script={script}
              activeScene={activeScene}
              onScene={setActiveScene}
            />
          </div>

          {/* 해시태그 */}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-700">
                해시태그 ({(script.hashtags ?? []).length}개)
              </h4>
              <button
                onClick={() => copyText((script.hashtags ?? []).join(' '), 'hashtags')}
                className="btn-secondary py-1.5 text-xs"
              >
                {copied === 'hashtags' ? <><Check size={11} /> 복사됨</> : <><Copy size={11} /> 전체 복사</>}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(script.hashtags ?? []).map(tag => (
                <span key={tag} className="px-2.5 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* 다운로드 안내 */}
          <div className="card p-4 bg-gray-50 border-dashed">
            <div className="flex items-center gap-3">
              <Download size={16} className="text-gray-400 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-700">스크립트 다운로드</p>
                <p className="text-xs text-gray-400 mt-0.5">TXT는 편집용, JSON은 영상 편집 툴 연동용으로 활용하세요</p>
              </div>
              <div className="flex gap-2">
                <button onClick={downloadTxt} className="btn-secondary text-xs gap-1">
                  <FileText size={12} /> TXT 저장
                </button>
                <button onClick={downloadJson} className="btn-secondary text-xs gap-1">
                  <FileJson size={12} /> JSON 저장
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
