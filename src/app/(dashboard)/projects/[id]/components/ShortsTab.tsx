'use client'

import { useState } from 'react'
import { Video, Copy, Check, Loader2, Download } from 'lucide-react'
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

export default function ShortsTab({ projectId }: ShortsTabProps) {
  const supabase = createClient()
  const [generating, setGenerating] = useState(false)
  const [script, setScript] = useState<ShortsScript | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const { data, error } = await supabase.functions.invoke('generate-shorts-script', {
        body: { project_id: projectId },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      if (error) throw error
      setScript(data?.data ?? data)
      toast.success('쇼츠 스크립트가 생성되었습니다!')
    } catch {
      toast.error('생성에 실패했습니다. 잠시 후 다시 시도해주세요.')
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

  const exportScript = () => {
    if (!script) return
    const lines = [
      `[후킹] ${script.hook}`,
      '',
      ...script.scenes.map(s =>
        `[장면 ${s.scene_number} - ${s.duration_sec}초]\n화면: ${s.visual_description}\n나레이션: ${s.narration}${s.cta ? `\nCTA: ${s.cta}` : ''}`
      ),
      '',
      `[해시태그] ${script.hashtags.join(' ')}`,
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `shorts-script-${projectId}.txt`
    a.click()
    URL.revokeObjectURL(url)
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
              <button onClick={exportScript} className="btn-secondary">
                <Download size={14} />
                내보내기
              </button>
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

          {/* 장면 카드 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {script.scenes.map(scene => (
              <div key={scene.scene_number} className="card p-4 space-y-3">
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
                  <p className="text-sm text-gray-700">{scene.visual_description}</p>
                </div>

                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">나레이션</p>
                  <p className="text-sm text-gray-800 font-medium">{scene.narration}</p>
                </div>

                {scene.cta && (
                  <div className="pt-2 border-t border-gray-100">
                    <p className="text-xs font-bold text-orange-600">CTA: {scene.cta}</p>
                  </div>
                )}

                <button
                  onClick={() => copyText(`화면: ${scene.visual_description}\n나레이션: ${scene.narration}`, `scene-${scene.scene_number}`)}
                  className="w-full text-xs text-gray-400 hover:text-gray-600 flex items-center justify-center gap-1 pt-1"
                >
                  {copied === `scene-${scene.scene_number}`
                    ? <><Check size={11} className="text-green-500" /> 복사됨</>
                    : <><Copy size={11} /> 복사</>
                  }
                </button>
              </div>
            ))}
          </div>

          {/* 해시태그 */}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-700">해시태그 ({script.hashtags.length}개)</h4>
              <button
                onClick={() => copyText(script.hashtags.join(' '), 'hashtags')}
                className="btn-secondary py-1.5 text-xs"
              >
                {copied === 'hashtags' ? <><Check size={11} /> 복사됨</> : <><Copy size={11} /> 전체 복사</>}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {script.hashtags.map(tag => (
                <span key={tag} className="px-2.5 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
