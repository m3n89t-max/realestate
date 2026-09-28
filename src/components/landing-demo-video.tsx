'use client'

import { Pause, Play } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

export function LandingDemoVideo() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPaused, setIsPaused] = useState(true)

  useEffect(() => {
    const video = videoRef.current
    if (video) setIsPaused(video.paused)
  }, [])

  const togglePlayback = async () => {
    const video = videoRef.current
    if (!video) return

    if (!video.paused) {
      video.pause()
      return
    }

    try {
      await video.play()
    } catch {
      setIsPaused(true)
    }
  }

  return (
    <div className="relative mx-auto w-full max-w-2xl">
      <div className="absolute -inset-5 -z-10 rounded-[2.5rem] bg-brand-200/35 blur-2xl" />
      <div className="overflow-hidden rounded-[1.75rem] border border-black/10 bg-white shadow-[0_30px_80px_rgba(19,34,32,0.16)]">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2" aria-hidden="true">
            <span className="size-2.5 rounded-full bg-red-300" />
            <span className="size-2.5 rounded-full bg-amber-300" />
            <span className="size-2.5 rounded-full bg-emerald-300" />
          </div>
          <span id="demo-video-title" className="text-xs font-bold text-slate-600">15초로 보는 집포터 사용 흐름</span>
        </div>
        <div className="relative aspect-video bg-slate-100">
          <video
            ref={videoRef}
            className="size-full object-cover"
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
            poster="/demo/jipporter-demo-poster.webp"
            aria-labelledby="demo-video-title"
            aria-describedby="demo-video-description"
            onPlay={() => setIsPaused(false)}
            onPause={() => setIsPaused(true)}
          >
            <source src="/demo/jipporter-demo.mp4" type="video/mp4" />
            사용 중인 브라우저에서 영상 재생을 지원하지 않습니다.
          </video>
          <button
            type="button"
            onClick={togglePlayback}
            aria-label={isPaused ? '영상 재생' : '영상 일시정지'}
            className="absolute bottom-3 right-3 grid size-11 place-items-center rounded-full border border-white/70 bg-slate-950/75 text-white shadow-lg backdrop-blur transition-colors hover:bg-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2"
          >
            {isPaused ? <Play size={18} fill="currentColor" aria-hidden="true" /> : <Pause size={18} fill="currentColor" aria-hidden="true" />}
          </button>
        </div>
      </div>
      <p id="demo-video-description" className="mt-3 text-center text-xs font-medium leading-5 text-slate-500">
        밝은 중개사무소에서 시작해 집포터 화면으로 전환됩니다. 매물 정보를 한 번 입력하면 입지분석, 블로그 글, 카드뉴스, 쇼츠 스크립트가 준비되는 흐름입니다.
      </p>
    </div>
  )
}
