'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Video, Copy, Check, Loader2, Download, ChevronLeft, ChevronRight, Play, Pause, FileText, FileJson, Film, Clapperboard, MessageSquarePlus, ChevronDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'

/* ── Canvas 텍스트 줄바꿈 유틸 ── */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  align: CanvasTextAlign = 'center'
): number {
  ctx.textAlign = align
  const chars = text.split('')
  let line = ''
  let curY = y
  for (const ch of chars) {
    const test = line + ch
    if (ctx.measureText(test).width > maxWidth && line !== '') {
      ctx.fillText(line, x, curY)
      line = ch
      curY += lineHeight
    } else {
      line = test
    }
  }
  if (line) ctx.fillText(line, x, curY)
  ctx.textAlign = 'left'
  return curY + lineHeight
}

/* ── Canvas에 둥근 사각형 그리기 ── */
function fillRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
  ctx.fill()
}

/* ── 이미지/비디오를 캔버스에 center-crop으로 채우기 ── */
function drawMediaCover(
  ctx: CanvasRenderingContext2D,
  media: HTMLImageElement | HTMLVideoElement,
  W: number,
  H: number
) {
  const srcW = media instanceof HTMLVideoElement ? media.videoWidth : (media as HTMLImageElement).naturalWidth
  const srcH = media instanceof HTMLVideoElement ? media.videoHeight : (media as HTMLImageElement).naturalHeight
  if (!srcW || !srcH) return
  const scale = Math.max(W / srcW, H / srcH)
  const dw = srcW * scale
  const dh = srcH * scale
  ctx.drawImage(media, (W - dw) / 2, (H - dh) / 2, dw, dh)
}

/* ── 각 장면을 720×1280 캔버스에 렌더링 ── */
function drawSceneToCanvas(
  canvas: HTMLCanvasElement,
  scene: Scene,
  hook: string,
  totalScenes: number,
  globalProgress: number, // 0~1
  background?: HTMLImageElement | HTMLVideoElement | null
) {
  const ctx = canvas.getContext('2d')!
  const W = canvas.width
  const H = canvas.height

  const PALETTES = [
    ['#0f0c29', '#302b63', '#24243e'],
    ['#0f2027', '#203a43', '#2c5364'],
    ['#1a1a2e', '#16213e', '#0f3460'],
    ['#200122', '#6f0000', '#3d0000'],
    ['#0d0d0d', '#1c1c1c', '#1a1a2e'],
    ['#0f2027', '#1a1a2e', '#0f0c29'],
  ]
  const ACCENTS = ['#00d4aa', '#00bcd4', '#4fc3f7', '#ef5350', '#7e57c2', '#ff8f00']
  const palette = PALETTES[(scene.scene_number - 1) % PALETTES.length]
  const accent = ACCENTS[(scene.scene_number - 1) % ACCENTS.length]

  if (background) {
    // 실제 매물 사진/영상 배경 (center-crop)
    drawMediaCover(ctx, background, W, H)
  } else {
    // 배경 없을 때 그라디언트 폴백
    const grad = ctx.createLinearGradient(0, 0, 0, H)
    palette.forEach((c, i) => grad.addColorStop(i / (palette.length - 1), c))
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, H)
  }

  // 어두운 오버레이 (사진이 있으면 그라디언트 오버레이, 없으면 비네트)
  if (background) {
    // Top dark gradient (for badges)
    const topGrad = ctx.createLinearGradient(0, 0, 0, H * 0.4)
    topGrad.addColorStop(0, 'rgba(0,0,0,0.7)')
    topGrad.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = topGrad
    ctx.fillRect(0, 0, W, H * 0.4)
    // Bottom dark gradient (for narration)
    const botGrad = ctx.createLinearGradient(0, H * 0.5, 0, H)
    botGrad.addColorStop(0, 'rgba(0,0,0,0)')
    botGrad.addColorStop(1, 'rgba(0,0,0,0.85)')
    ctx.fillStyle = botGrad
    ctx.fillRect(0, H * 0.5, W, H * 0.5)
  } else {
    // Subtle vignette for gradient background
    const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.8)
    vig.addColorStop(0, 'transparent')
    vig.addColorStop(1, 'rgba(0,0,0,0.55)')
    ctx.fillStyle = vig
    ctx.fillRect(0, 0, W, H)
  }

  // Top accent stripe
  ctx.fillStyle = accent
  ctx.fillRect(0, 0, W, 8)

  // Scene badge (top left)
  ctx.fillStyle = `${accent}cc`
  fillRoundRect(ctx, 30, 35, 140, 48, 24)
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 26px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(`장면 ${scene.scene_number}`, 100, 67)

  // Duration badge (top right)
  ctx.fillStyle = 'rgba(255,255,255,0.18)'
  fillRoundRect(ctx, W - 130, 35, 100, 44, 22)
  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  ctx.font = '22px "Malgun Gothic", sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(`${scene.duration_sec}초`, W - 80, 64)

  // Scene progress dots (top center)
  const dotR = 7
  const dotSpacing = 28
  const dotsStartX = W / 2 - ((totalScenes - 1) * dotSpacing) / 2
  for (let i = 0; i < totalScenes; i++) {
    ctx.beginPath()
    ctx.arc(dotsStartX + i * dotSpacing, 58, dotR, 0, Math.PI * 2)
    ctx.fillStyle = i === scene.scene_number - 1 ? accent : 'rgba(255,255,255,0.3)'
    ctx.fill()
  }

  // Hook (scene 1 only)
  if (scene.scene_number === 1 && hook) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    fillRoundRect(ctx, 30, 200, W - 60, 160, 20)
    ctx.fillStyle = '#FFD700'
    ctx.font = 'bold 38px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif'
    wrapText(ctx, `"${hook}"`, W / 2, 255, W - 100, 52)
  }

  // Visual description (center, dim hint)
  ctx.fillStyle = 'rgba(255,255,255,0.22)'
  ctx.font = '28px "Malgun Gothic", sans-serif'
  wrapText(ctx, scene.visual_description, W / 2, H / 2 - 60, W - 80, 40)

  // Narration overlay (bottom)
  const narH = scene.cta ? 300 : 260
  const narY = H - narH - 60
  ctx.fillStyle = 'rgba(0,0,0,0.72)'
  fillRoundRect(ctx, 24, narY, W - 48, narH, 24)

  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 36px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif'
  wrapText(ctx, scene.narration, W / 2, narY + 55, W - 90, 48)

  if (scene.cta) {
    ctx.fillStyle = '#FFD700'
    ctx.font = 'bold 28px "Malgun Gothic", sans-serif'
    wrapText(ctx, `📞 ${scene.cta}`, W / 2, narY + narH - 55, W - 90, 36)
  }

  // Bottom progress bar
  ctx.fillStyle = 'rgba(255,255,255,0.15)'
  ctx.fillRect(0, H - 10, W, 10)
  ctx.fillStyle = accent
  ctx.fillRect(0, H - 10, W * globalProgress, 10)
  ctx.textAlign = 'left'
}

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
  assets?: { file_url: string; type: string; file_name?: string; is_cover?: boolean }[]
}

/* ── 폰 미리보기 컴포넌트 ── */
function PhonePreview({ script, activeScene, onScene, photos = [] }: {
  script: ShortsScript
  activeScene: number
  onScene: (i: number) => void
  photos?: string[]
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
  // 장면별 배경 사진 (있는 경우)
  const scenePhoto = photos.length > 0 ? photos[activeScene % photos.length] : null

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

        {/* Background: 매물 사진 or 그라디언트 */}
        {scenePhoto
          ? <img src={scenePhoto} alt="" className="absolute inset-0 w-full h-full object-cover" />
          : <div className={cn('absolute inset-0 bg-gradient-to-b', bg)} />
        }
        {/* 사진 위 어두운 오버레이 */}
        {scenePhoto && <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/50" />}

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
export default function ShortsTab({ projectId, assets = [] }: ShortsTabProps) {
  const supabase = createClient()
  const [generating, setGenerating] = useState(false)
  const [script, setScript] = useState<ShortsScript | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [activeScene, setActiveScene] = useState(0)
  const [rendering, setRendering] = useState(false)
  const [renderProgress, setRenderProgress] = useState(0)
  const [renderScene, setRenderScene] = useState(0)
  const [customInstructions, setCustomInstructions] = useState('')
  const [showInstructions, setShowInstructions] = useState(false)

  // 📝 에디터용 로컬 상태
  const [editedScenes, setEditedScenes] = useState<Record<number, Partial<Scene>>>({})
  const [editedScript, setEditedScript] = useState<Partial<ShortsScript>>({})

  // 사용자 편집 내용이 병합된 최종 스크립트
  const activeScript: ShortsScript | null = script ? {
    ...script,
    ...editedScript,
    scenes: (script.scenes ?? []).map(s => ({ ...s, ...(editedScenes[s.scene_number] ?? {}) }))
  } : null

  const updateScene = (sceneNum: number, updates: Partial<Scene>) => {
    setEditedScenes(prev => ({ ...prev, [sceneNum]: { ...(prev[sceneNum] ?? {}), ...updates } }))
  }
  const updateScript = (updates: Partial<ShortsScript>) => {
    setEditedScript(prev => ({ ...prev, ...updates }))
  }
  const resetScript = () => {
    setEditedScenes({})
    setEditedScript({})
  }

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
        body: JSON.stringify({ project_id: projectId, custom_instructions: customInstructions.trim() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '생성에 실패했습니다')
      const data = json.data ?? json
      setScript({ hook: data.hook, total_duration_sec: data.total_duration_sec ?? 60, scenes: data.scenes ?? [], hashtags: data.hashtags ?? [] })
      resetScript()
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
    if (!activeScript) return
    const lines = [
      `[후킹] ${activeScript.hook}`,
      '',
      ...(activeScript.scenes ?? []).map(s =>
        `[장면 ${s.scene_number} - ${s.duration_sec}초]\n화면: ${s.visual_description}\n나레이션: ${s.narration}${s.cta ? `\nCTA: ${s.cta}` : ''}`
      ),
      '',
      `[해시태그] ${(activeScript.hashtags ?? []).join(' ')}`,
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
    if (!activeScript) return
    const blob = new Blob([JSON.stringify(activeScript, null, 2)], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `shorts-script-${projectId}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('JSON 파일로 저장되었습니다')
  }

  const renderVideo = async () => {
    if (!activeScript || rendering) return
    const scenes = activeScript.scenes ?? []
    if (scenes.length === 0) { toast.error('스크립트가 없습니다'); return }

    setRendering(true)
    setRenderProgress(0)
    setRenderScene(1)

    const hasMedia = assets.length > 0
    toast(`영상 렌더링을 시작합니다. 약 ${activeScript.total_duration_sec ?? 60}초가 소요됩니다.`, { icon: '🎬', duration: 4000 })

    try {
      const W = 720, H = 1280
      const canvas = document.createElement('canvas')
      canvas.width = W
      canvas.height = H

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : MediaRecorder.isTypeSupported('video/webm')
          ? 'video/webm'
          : null

      if (!mimeType) {
        toast.error('이 브라우저는 영상 녹화를 지원하지 않습니다. Chrome을 사용해주세요.')
        setRendering(false)
        return
      }

      // ── 매물 사진/영상 preload ──
      const imageAssets = assets.filter(a => a.type === 'image' || !a.type)
      const videoAssets = assets.filter(a => a.type === 'video')

      // 사진 preload (CORS anonymous)
      const loadedImages: (HTMLImageElement | null)[] = await Promise.all(
        imageAssets.slice(0, 8).map(a =>
          new Promise<HTMLImageElement | null>(resolve => {
            const img = new window.Image()
            img.crossOrigin = 'anonymous'
            img.onload = () => resolve(img)
            img.onerror = () => {
              // CORS 실패 시 crossOrigin 없이 재시도 (오버레이만 표시)
              const img2 = new window.Image()
              img2.onload = () => resolve(img2)
              img2.onerror = () => resolve(null)
              img2.src = a.file_url
            }
            img.src = a.file_url + (a.file_url.includes('?') ? '&' : '?') + 't=' + Date.now()
          })
        )
      )

      // 동영상 preload
      const loadedVideos: (HTMLVideoElement | null)[] = await Promise.all(
        videoAssets.slice(0, 3).map(a =>
          new Promise<HTMLVideoElement | null>(resolve => {
            const vid = document.createElement('video')
            vid.crossOrigin = 'anonymous'
            vid.muted = true
            vid.playsInline = true
            vid.loop = true
            const timer = setTimeout(() => resolve(null), 8000) // 8초 타임아웃
            vid.oncanplay = () => { clearTimeout(timer); resolve(vid) }
            vid.onerror = () => { clearTimeout(timer); resolve(null) }
            vid.src = a.file_url
            vid.load()
          })
        )
      )

      // 유효한 미디어만 필터
      const photos = loadedImages.filter(Boolean) as HTMLImageElement[]
      const videos = loadedVideos.filter(Boolean) as HTMLVideoElement[]

      // 동영상 재생 시작
      for (const vid of videos) {
        try { await vid.play() } catch { /* muted라 괜찮음 */ }
      }

      // 장면별 배경 미디어 결정
      // 동영상이 있으면 중간 장면(2~4)에 동영상 사용, 나머지는 사진 순환
      const getBackground = (sceneNum: number): HTMLImageElement | HTMLVideoElement | null => {
        if (!hasMedia) return null
        // 동영상: 장면 2, 3, 4에 우선 배치
        if (videos.length > 0 && sceneNum >= 2 && sceneNum <= 4) {
          return videos[(sceneNum - 2) % videos.length]
        }
        // 사진: 장면 순서대로 순환 배치
        if (photos.length > 0) {
          // 커버 사진 우선 (장면 1, 6), 나머지는 순환
          const cover = assets.find(a => a.is_cover)
          const coverImg = cover ? photos.find(p => (p as any).src?.includes(cover.file_url.split('/').pop() ?? '')) ?? photos[0] : photos[0]
          if (sceneNum === 1 || sceneNum === 6) return coverImg
          return photos[(sceneNum - 1) % photos.length]
        }
        return null
      }

      const stream = canvas.captureStream(30)
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 })
      const chunks: Blob[] = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }

      const finished = new Promise<void>((resolve) => {
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'video/webm' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `shorts-${projectId}.webm`
          a.click()
          setTimeout(() => URL.revokeObjectURL(url), 2000)
          resolve()
        }
      })

      recorder.start(200)

      const totalDuration = scenes.reduce((s, sc) => s + sc.duration_sec, 0)
      let elapsed = 0

      for (let si = 0; si < scenes.length; si++) {
        const scene = scenes[si]
        setRenderScene(scene.scene_number)
        const bg = getBackground(scene.scene_number)

        const frameDuration = 1000 / 30 // ~33ms per frame
        const frames = scene.duration_sec * 30

        for (let f = 0; f < frames; f++) {
          const globalProgress = (elapsed + (f / 30)) / totalDuration
          drawSceneToCanvas(canvas, scene, activeScript.hook, scenes.length, globalProgress, bg)
          setRenderProgress(Math.round(globalProgress * 100))
          await new Promise(r => setTimeout(r, frameDuration))
        }
        elapsed += scene.duration_sec
      }

      setRenderProgress(100)
      recorder.stop()
      await finished
      toast.success('영상 다운로드 완료! (.webm → YouTube/CapCut 업로드 가능)')
    } catch (err) {
      console.error('[renderVideo]', err)
      toast.error('영상 렌더링에 실패했습니다')
    } finally {
      setRendering(false)
      setRenderProgress(0)
      setRenderScene(0)
    }
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
            <p className="text-sm text-gray-400 mt-0.5">
              60초 6장면 쇼츠 스크립트를 AI가 자동 생성합니다
              {assets.length > 0 && (
                <span className="ml-2 text-brand-500 font-medium">
                  · 사진 {assets.filter(a => a.type === 'image' || !a.type).length}장
                  {assets.filter(a => a.type === 'video').length > 0 && ` · 동영상 ${assets.filter(a => a.type === 'video').length}개`} 포함 예정
                </span>
              )}
            </p>
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
                <button
                  onClick={renderVideo}
                  disabled={rendering}
                  className={cn('btn-secondary gap-1.5', rendering ? 'opacity-60' : 'border-orange-300 text-orange-600 hover:bg-orange-50')}
                >
                  {rendering
                    ? <><Loader2 size={13} className="animate-spin" /> 렌더링 {renderProgress}%</>
                    : <><Film size={13} /> 영상 제작</>
                  }
                </button>
              </>
            )}
            {/* 추가 지시사항 토글 */}
            <button
              onClick={() => setShowInstructions(s => !s)}
              className={cn('btn-secondary text-xs gap-1.5', showInstructions && 'bg-amber-50 border-amber-300 text-amber-700')}
            >
              <MessageSquarePlus size={13} />
              추가 지시사항
              <ChevronDown size={12} className={cn('transition-transform', showInstructions && 'rotate-180')} />
            </button>

            <button onClick={handleGenerate} disabled={generating || rendering} className="btn-primary">
              {generating
                ? <><Loader2 size={14} className="animate-spin" /> 생성중...</>
                : <><Video size={14} /> 스크립트 생성</>
              }
            </button>
          </div>

          {/* 추가 지시사항 패널 */}
          {showInstructions && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="flex flex-wrap gap-1.5 mb-2">
                {[
                  '주차 강조',
                  '역세권 집중',
                  '투자 수익률 부각',
                  '신축 강점 언급',
                  '실거주 가족 타겟',
                  '상업시설 입점 언급',
                  '조용한 주거환경 강조',
                ].map(chip => (
                  <button
                    key={chip}
                    onClick={() => setCustomInstructions(prev => prev ? `${prev}, ${chip}` : chip)}
                    className="px-2.5 py-1 text-[11px] rounded-full border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
                  >
                    + {chip}
                  </button>
                ))}
              </div>
              <textarea
                value={customInstructions}
                onChange={e => setCustomInstructions(e.target.value)}
                placeholder="공인중개사 추가 지시사항을 입력하세요&#10;예) 주차 3대 가능 강조, 1층 편의점 입점 포인트로 언급, 역까지 도보 5분 강조"
                rows={3}
                className="w-full text-sm border border-amber-200 rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-amber-300 bg-amber-50/50 placeholder:text-gray-400"
              />
              <p className="text-[11px] text-gray-400 mt-1">입력한 내용이 AI 스크립트 생성에 최우선으로 반영됩니다</p>
            </div>
          )}
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

      {rendering && (
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <Clapperboard size={20} className="text-orange-500 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-800">영상 렌더링 중... 장면 {renderScene} / {(script?.scenes ?? []).length}</p>
              <p className="text-xs text-gray-400 mt-0.5">브라우저 탭을 닫지 마세요 · 약 {script?.total_duration_sec ?? 60}초 소요</p>
            </div>
            <span className="text-lg font-black text-orange-500">{renderProgress}%</span>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-orange-400 to-orange-600 rounded-full transition-all duration-300"
              style={{ width: `${renderProgress}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-2 text-center">렌더링 완료 시 자동으로 .webm 파일이 다운로드됩니다</p>
        </div>
      )}

      {activeScript && (
        <>
          {/* 후킹 멘트 */}
          <div className="card p-4 border-l-4 border-brand-500">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-brand-600 uppercase tracking-wide">후킹 멘트 (첫 1초)</span>
              <div className="flex gap-1.5 items-center">
                {editedScript.hook !== undefined && (
                  <button onClick={() => updateScript({ hook: undefined })} className="text-[11px] text-red-500 hover:text-red-600 font-medium">
                    초기화
                  </button>
                )}
                <button onClick={() => copyText(activeScript.hook, 'hook')} className="p-1 rounded hover:bg-gray-100">
                  {copied === 'hook' ? <Check size={13} className="text-green-500" /> : <Copy size={13} className="text-gray-400" />}
                </button>
              </div>
            </div>
            <textarea
              className="w-full text-lg font-bold text-gray-900 bg-transparent border-0 outline-none resize-none px-0 py-0 focus:ring-0"
              value={activeScript.hook}
              onChange={e => updateScript({ hook: e.target.value })}
              rows={2}
            />
          </div>

          {/* 메인 영역: 장면 카드 + 폰 미리보기 */}
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_260px] gap-5 items-start">

            {/* 장면 카드 그리드 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {(activeScript.scenes ?? []).map(scene => {
                const isActive = activeScene === scene.scene_number - 1
                return (
                <div
                  key={scene.scene_number}
                  onClick={() => setActiveScene(scene.scene_number - 1)}
                  className={cn(
                    'card p-4 space-y-3 text-left transition-all cursor-pointer',
                    isActive
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
                    <div className="flex items-center gap-2">
                      {editedScenes[scene.scene_number] && (
                        <button onClick={(e) => { e.stopPropagation(); setEditedScenes(prev => { const n = { ...prev }; delete n[scene.scene_number]; return n }) }} className="text-[10px] text-red-400 hover:text-red-500 font-medium">초기화</button>
                      )}
                      <span className="text-xs text-gray-400">{scene.duration_sec}초</span>
                    </div>
                  </div>

                  {isActive ? (
                    <div className="space-y-3 cursor-default" onClick={e => e.stopPropagation()}>
                      <div>
                        <p className="text-[10px] font-medium text-gray-400 mb-0.5">화면 구성 (예상)</p>
                        <textarea
                          value={scene.visual_description}
                          onChange={e => updateScene(scene.scene_number, { visual_description: e.target.value })}
                          className="w-full text-xs text-gray-700 bg-white border border-gray-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-brand-400 resize-none shadow-sm"
                          rows={2}
                        />
                      </div>
                      <div>
                        <p className="text-[10px] font-medium text-gray-400 mb-0.5">나레이션 (쇼츠 자막/음성)</p>
                        <textarea
                          value={scene.narration}
                          onChange={e => updateScene(scene.scene_number, { narration: e.target.value })}
                          className="w-full text-sm font-medium text-gray-800 bg-white border border-gray-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-brand-400 resize-none shadow-sm"
                          rows={3}
                        />
                      </div>
                      {scene.cta !== null && (
                        <div>
                          <p className="text-[10px] font-medium text-gray-400 mb-0.5">CTA 버튼</p>
                          <input
                            type="text"
                            value={scene.cta ?? ''}
                            onChange={e => updateScene(scene.scene_number, { cta: e.target.value })}
                            className="w-full text-xs font-bold text-orange-600 bg-white border border-orange-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-orange-400 shadow-sm"
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <div>
                        <p className="text-[10px] font-medium text-gray-400 mb-1">화면 구성</p>
                        <p className="text-xs text-gray-700 line-clamp-2">{scene.visual_description}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-medium text-gray-400 mb-1">나레이션</p>
                        <p className="text-sm text-gray-800 font-medium line-clamp-2">{scene.narration}</p>
                      </div>
                      {scene.cta && (
                        <div className="pt-2 border-t border-gray-100">
                          <p className="text-xs font-bold text-orange-600 truncate">📞 {scene.cta}</p>
                        </div>
                      )}
                    </>
                  )}

                  <div
                    role="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      copyText(`화면: ${scene.visual_description}\n나레이션: ${scene.narration}`, `scene-${scene.scene_number}`)
                    }}
                    className="w-full text-xs text-gray-400 hover:text-gray-600 flex items-center justify-center gap-1 pt-2 cursor-pointer"
                  >
                    {copied === `scene-${scene.scene_number}`
                      ? <><Check size={11} className="text-green-500" /> 복사됨</>
                      : <><Copy size={11} /> 복사</>
                    }
                  </div>
                </div>
                )
              })}
            </div>

            {/* 폰 미리보기 (xl 이상에서 우측 고정) */}
            <div className="hidden xl:block">
              <PhonePreview
                script={activeScript}
                activeScene={activeScene}
                onScene={setActiveScene}
                photos={assets.filter(a => a.type === 'image' || !a.type).map(a => a.file_url)}
              />
            </div>
          </div>

          {/* 모바일용 폰 미리보기 (xl 미만) */}
          <div className="xl:hidden flex justify-center">
            <PhonePreview
              script={activeScript}
              activeScene={activeScene}
              onScene={setActiveScene}
              photos={assets.filter(a => a.type === 'image' || !a.type).map(a => a.file_url)}
            />
          </div>

          {/* 해시태그 */}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-700">
                해시태그 ({(activeScript.hashtags ?? []).length}개)
              </h4>
              <button
                onClick={() => copyText((activeScript.hashtags ?? []).join(' '), 'hashtags')}
                className="btn-secondary py-1.5 text-xs"
              >
                {copied === 'hashtags' ? <><Check size={11} /> 복사됨</> : <><Copy size={11} /> 전체 복사</>}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(activeScript.hashtags ?? []).map(tag => (
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
