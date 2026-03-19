'use client'

import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, X, Image, FileText, Video, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface UploadedFile {
  id: string
  name: string
  size: number
  type: string
  url?: string
  category?: string
  uploading?: boolean
  error?: string
}

interface AssetUploaderProps {
  accept?: Record<string, string[]>
  maxFiles?: number
  maxSize?: number
  onUpload?: (files: File[]) => Promise<void>
  className?: string
}

const IMAGE_CATEGORIES = ['거실', '주방', '방', '욕실', '외관', '뷰', '주차', '기타']

const FileIcon = ({ type }: { type: string }) => {
  if (type.startsWith('image/')) return <Image size={16} className="text-blue-500" />
  if (type.startsWith('video/')) return <Video size={16} className="text-purple-500" />
  return <FileText size={16} className="text-gray-500" />
}

export default function AssetUploader({
  accept = {
    'image/*': ['.jpg', '.jpeg', '.png', '.webp'],
    'video/*': ['.mp4', '.mov', '.avi', '.webm'],
  },
  maxFiles = 20,
  maxSize = 200 * 1024 * 1024,
  onUpload,
  className,
}: AssetUploaderProps) {
  const [files, setFiles] = useState<UploadedFile[]>([])

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const newFiles: UploadedFile[] = acceptedFiles.map(file => ({
      id: Math.random().toString(36).slice(2),
      name: file.name,
      size: file.size,
      type: file.type,
      uploading: true,
    }))

    setFiles(prev => [...prev, ...newFiles])

    if (onUpload) {
      try {
        await onUpload(acceptedFiles)
        setFiles(prev =>
          prev.map(f =>
            newFiles.find(n => n.id === f.id)
              ? { ...f, uploading: false }
              : f
          )
        )
      } catch {
        setFiles(prev =>
          prev.map(f =>
            newFiles.find(n => n.id === f.id)
              ? { ...f, uploading: false, error: '업로드 실패' }
              : f
          )
        )
      }
    } else {
      setTimeout(() => {
        setFiles(prev =>
          prev.map(f =>
            newFiles.find(n => n.id === f.id)
              ? { ...f, uploading: false }
              : f
          )
        )
      }, 1000)
    }
  }, [onUpload])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    maxFiles,
    maxSize,
  })

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id))
  }

  const updateCategory = (id: string, category: string) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, category } : f))
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* 드롭존 */}
      <div
        {...getRootProps()}
        className={cn(
          'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors duration-150',
          isDragActive
            ? 'border-brand-400 bg-brand-50'
            : 'border-gray-200 hover:border-brand-300 hover:bg-gray-50'
        )}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-3">
          <div className={cn(
            'w-12 h-12 rounded-full flex items-center justify-center transition-colors',
            isDragActive ? 'bg-brand-100' : 'bg-gray-100'
          )}>
            <Upload size={20} className={isDragActive ? 'text-brand-600' : 'text-gray-400'} />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700">
              {isDragActive ? '파일을 여기에 놓으세요' : '클릭하거나 파일을 드래그하세요'}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              JPG, PNG, WEBP · MP4, MOV, AVI, WEBM
            </p>
            <p className="text-xs text-gray-400">
              최대 {maxFiles}개 · 파일당 최대 {formatSize(maxSize)}
            </p>
          </div>
        </div>
      </div>

      {/* 업로드된 파일 목록 */}
      {files.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">
            업로드된 파일 ({files.length}개)
          </p>
          <div className="grid grid-cols-1 gap-2">
            {files.map(file => (
              <div
                key={file.id}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-lg border transition-colors',
                  file.error ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'
                )}
              >
                <FileIcon type={file.type} />

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{file.name}</p>
                  <p className="text-xs text-gray-400">{formatSize(file.size)}</p>
                </div>

                {/* 카테고리 선택 (이미지인 경우) */}
                {file.type.startsWith('image/') && !file.uploading && !file.error && (
                  <select
                    value={file.category ?? ''}
                    onChange={e => updateCategory(file.id, e.target.value)}
                    className="text-xs border border-gray-200 rounded px-2 py-1 text-gray-600 bg-white"
                  >
                    <option value="">카테고리</option>
                    {IMAGE_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                )}

                {/* 상태 표시 */}
                {file.uploading && (
                  <Loader2 size={16} className="text-brand-500 animate-spin flex-shrink-0" />
                )}
                {file.error && (
                  <span className="text-xs text-red-600">{file.error}</span>
                )}

                {/* 삭제 버튼 */}
                <button
                  onClick={() => removeFile(file.id)}
                  className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600 flex-shrink-0"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
