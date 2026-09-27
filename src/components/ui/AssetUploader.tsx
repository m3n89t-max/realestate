'use client'

import { useCallback, useEffect, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { FileText, Image, Loader2, RotateCcw, Upload, Video, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AssetUploadResult } from '@/lib/project-asset-upload'

export type { AssetUploadResult } from '@/lib/project-asset-upload'
type UploadStatus = 'uploading' | 'complete' | 'failed'
type QueuedFile = AssetUploadResult & { id: string; category?: string; status: UploadStatus }

interface AssetUploaderProps {
  accept?: Record<string, string[]>
  maxFiles?: number
  maxSize?: number
  onUpload?: (files: File[]) => Promise<AssetUploadResult[]>
  onUploadingChange?: (isUploading: boolean) => void
  className?: string
}

function FileIcon({ type }: { type: string }) {
  if (type.startsWith('image/')) return <Image size={16} className="text-blue-600" />
  if (type.startsWith('video/')) return <Video size={16} className="text-purple-600" />
  return <FileText size={16} className="text-slate-500" />
}

export default function AssetUploader({
  accept = { 'image/*': ['.jpg', '.jpeg', '.png', '.webp'], 'video/*': ['.mp4', '.mov', '.avi', '.webm'] },
  maxFiles = 20,
  maxSize = 100 * 1024 * 1024,
  onUpload,
  onUploadingChange,
  className,
}: AssetUploaderProps) {
  const [files, setFiles] = useState<QueuedFile[]>([])
  const uploading = files.some((file) => file.status === 'uploading')

  useEffect(() => onUploadingChange?.(uploading), [onUploadingChange, uploading])

  const uploadFiles = useCallback(async (newFiles: QueuedFile[]) => {
    if (!onUpload) {
      setFiles((previous) => previous.map((item) => newFiles.some((file) => file.id === item.id) ? { ...item, status: 'complete' } : item))
      return
    }
    try {
      const results = await onUpload(newFiles.map((item) => item.file))
      const resultByFile = new Map(results.map((result) => [result.file, result]))
      setFiles((previous) => previous.map((item) => {
        if (!newFiles.some((file) => file.id === item.id)) return item
        const result = resultByFile.get(item.file)
        return result?.success
          ? { ...item, status: 'complete', error: undefined }
          : { ...item, status: 'failed', error: result?.error ?? '업로드에 실패했습니다.', retryable: result?.retryable }
      }))
    } catch {
      setFiles((previous) => previous.map((item) => newFiles.some((file) => file.id === item.id) ? { ...item, status: 'failed', error: '업로드에 실패했습니다.' } : item))
    }
  }, [onUpload])

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const queued = acceptedFiles.map((file): QueuedFile => ({ id: crypto.randomUUID(), file, success: false, status: 'uploading' }))
    setFiles((previous) => [...previous, ...queued])
    void uploadFiles(queued)
  }, [uploadFiles])

  const { getInputProps, getRootProps, isDragActive } = useDropzone({ onDrop, accept, maxFiles, maxSize, disabled: uploading })
  const retryFile = (id: string) => {
    const target = files.find((file) => file.id === id)
  if (!target || target.status !== 'failed' || target.retryable === false) return
    const retrying = { ...target, status: 'uploading' as const, error: undefined }
    setFiles((previous) => previous.map((file) => file.id === id ? retrying : file))
    void uploadFiles([retrying])
  }
  const formatSize = (bytes: number) => bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)}KB` : `${(bytes / (1024 * 1024)).toFixed(1)}MB`

  return <div className={cn('space-y-4', className)}>
    <div {...getRootProps()} className={cn('cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors', isDragActive ? 'border-brand-400 bg-brand-50' : 'border-slate-300 hover:border-brand-400 hover:bg-slate-50')}>
      <input {...getInputProps()} />
      <div className="flex flex-col items-center gap-3"><span className="grid size-12 place-items-center rounded-full bg-slate-100"><Upload size={20} /></span><div><p className="text-sm font-semibold text-slate-800">{isDragActive ? '파일을 여기에 놓으세요' : '클릭하거나 파일을 드래그하세요'}</p><p className="mt-1 text-xs text-slate-500">최대 {maxFiles}개 · 파일당 최대 {formatSize(maxSize)}</p></div></div>
    </div>
    {files.length > 0 && <div className="space-y-2" aria-live="polite"><p className="text-sm font-semibold text-slate-700">추가한 파일 ({files.length}개)</p>{files.map((file) => <div key={file.id} className={cn('flex items-center gap-3 rounded-lg border p-3', file.status === 'failed' && 'border-red-200 bg-red-50')}><FileIcon type={file.file.type} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-800">{file.file.name}</p><p className={cn('text-xs', file.status === 'failed' ? 'text-red-700' : 'text-slate-500')}>{formatSize(file.file.size)} · {file.status === 'uploading' ? '올리는 중' : file.status === 'complete' ? '완료' : `실패${file.error ? `: ${file.error}` : ''}`}</p></div>{file.status === 'uploading' && <Loader2 className="animate-spin text-brand-600" size={17} aria-label="올리는 중" />}{file.status === 'failed' && file.retryable !== false && <button type="button" className="btn-secondary min-h-11 px-3 text-xs" onClick={() => retryFile(file.id)}><RotateCcw size={14} />다시 시도</button>}{file.status !== 'uploading' && <button type="button" className="min-h-11 rounded-lg px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100" onClick={() => setFiles((previous) => previous.filter((item) => item.id !== file.id))}><X size={14} className="mr-1 inline" />목록에서 숨기기</button>}</div>)}</div>}
  </div>
}
