'use client'

import { useState } from 'react'
import { Check, Copy, Download, ExternalLink, ImageIcon, ShieldCheck, TriangleAlert } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  CHANNELS,
  buildChannelListing,
  checkChannelReadiness,
  summarizeChannelReadiness,
  type ChannelListingInput,
} from '@/lib/channel-publishing'

interface ChannelsTabProps {
  listing: ChannelListingInput
  photoUrls: string[]
}

export default function ChannelsTab({ listing, photoUrls }: ChannelsTabProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const summary = summarizeChannelReadiness(listing)

  const copyListing = async (channelId: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(channelId)
      toast.success('등록용 문구를 복사했습니다')
      setTimeout(() => setCopiedId((current) => (current === channelId ? null : current)), 2000)
    } catch {
      toast.error('복사하지 못했습니다. 문구를 직접 선택해 복사해 주세요.')
    }
  }

  const downloadPhotoList = () => {
    if (photoUrls.length === 0) {
      toast.error('내려받을 사진이 없습니다.')
      return
    }
    const body = photoUrls.map((url, index) => `${index + 1}. ${url}`).join('\n')
    const blob = new Blob([`${listing.address} 사진 목록\n\n${body}\n`], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = '사진-목록.txt'
    anchor.click()
    URL.revokeObjectURL(url)
    toast.success('사진 목록을 내려받았습니다')
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-950">채널별 발행 준비</h2>
            <p className="mt-1.5 text-sm leading-6 text-slate-600">
              채널마다 허용된 방식으로만 준비합니다. 최종 등록은 공식 화면에서 중개사가 직접 확인하고 제출합니다.
            </p>
          </div>
          <p className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
            준비 완료 {summary.ready} / {summary.total}
          </p>
        </div>

        <div className="mt-4 flex items-start gap-3 rounded-xl border border-brand-200 bg-brand-50 p-4">
          <ShieldCheck className="mt-0.5 shrink-0 text-brand-700" size={20} />
          <p className="text-sm leading-6 text-brand-900">
            공개 매물 등록 API가 확인된 채널이 없어 자동 전송은 제공하지 않습니다. 서면 제휴가 완료된 채널만 직접 발행으로
            전환합니다. 채널 보호조치를 우회하는 방식은 쓰지 않습니다.
          </p>
        </div>

        {photoUrls.length > 0 && (
          <button type="button" onClick={downloadPhotoList} className="btn-secondary mt-4">
            <Download size={16} />사진 목록 내려받기 ({photoUrls.length}장)
          </button>
        )}
      </section>

      <ul className="space-y-4">
        {CHANNELS.map((channel) => {
          const readiness = checkChannelReadiness(channel, listing)
          const text = buildChannelListing(channel, listing)
          return (
            <li key={channel.id} className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-950">{channel.name}</h3>
                    <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-900">
                      {channel.status}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm font-semibold text-brand-700">{channel.todo}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{channel.detail}</p>
                </div>
                <span
                  className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-bold ${
                    readiness.ready ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {readiness.ready ? '준비됨' : '정보 부족'}
                </span>
              </div>

              {!readiness.ready && (
                <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-slate-50 p-3">
                  <TriangleAlert className="mt-0.5 shrink-0 text-amber-700" size={16} />
                  <div>
                    <p className="text-xs font-bold text-slate-800">등록 전에 채워야 할 항목</p>
                    <ul className="mt-1 space-y-0.5">
                      {readiness.missing.map((item) => (
                        <li key={item} className="text-xs leading-5 text-slate-600">· {item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              <details className="mt-4 rounded-lg border border-slate-200">
                <summary className="min-h-11 cursor-pointer px-3 pt-3 text-sm font-semibold text-slate-700">
                  등록용 문구 미리보기
                </summary>
                <pre className="overflow-x-auto px-3 pb-3 pt-2 text-xs leading-5 text-slate-700">{text}</pre>
              </details>

              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => copyListing(channel.id, text)} className="btn-secondary">
                  {copiedId === channel.id ? <Check size={16} /> : <Copy size={16} />}
                  {copiedId === channel.id ? '복사했습니다' : '등록용 문구 복사'}
                </button>
                <a
                  href={channel.officialUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary"
                >
                  <ExternalLink size={16} />공식 등록화면 열기
                </a>
              </div>
            </li>
          )
        })}
      </ul>

      {photoUrls.length === 0 && (
        <p className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          <ImageIcon size={16} className="shrink-0 text-slate-400" />
          사진이 없습니다. 개요 탭에서 사진을 추가하면 채널별 등록 자료에 함께 준비됩니다.
        </p>
      )}
    </div>
  )
}
