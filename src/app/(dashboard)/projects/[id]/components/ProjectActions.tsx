'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle, Trash2, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

interface ProjectActionsProps {
    projectId: string
    currentStatus: string
}

export default function ProjectActions({ projectId, currentStatus }: ProjectActionsProps) {
    const router = useRouter()
    const supabase = createClient()
    const [loadingComplete, setLoadingComplete] = useState(false)
    const [loadingDelete, setLoadingDelete] = useState(false)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

    const isCompleted = currentStatus === 'completed'

    const handleComplete = async () => {
        setLoadingComplete(true)
        try {
            const newStatus = isCompleted ? 'active' : 'completed'
            const { error } = await supabase
                .from('projects')
                .update({ status: newStatus })
                .eq('id', projectId)

            if (error) throw error
            toast.success(isCompleted ? '매물을 다시 활성화했습니다' : '매물을 완료 처리했습니다')
            router.refresh()
        } catch (err) {
            toast.error('상태 변경에 실패했습니다')
            console.error(err)
        } finally {
            setLoadingComplete(false)
        }
    }

    const handleDelete = async () => {
        setLoadingDelete(true)
        try {
            const { error } = await supabase
                .from('projects')
                .update({ status: 'archived' })
                .eq('id', projectId)

            if (error) throw error
            toast.success('매물이 삭제되었습니다')
            router.push('/projects')
        } catch (err) {
            toast.error('삭제에 실패했습니다')
            console.error(err)
            setLoadingDelete(false)
            setShowDeleteConfirm(false)
        }
    }

    return (
        <>
            {/* 완료 버튼 */}
            <button
                onClick={handleComplete}
                disabled={loadingComplete}
                className={isCompleted
                    ? 'btn-secondary text-green-700 border-green-200 hover:bg-green-50'
                    : 'btn-secondary'
                }
            >
                {loadingComplete
                    ? <Loader2 size={14} className="animate-spin" />
                    : <CheckCircle size={14} className={isCompleted ? 'text-green-600' : ''} />
                }
                {isCompleted ? '완료됨' : '완료'}
            </button>

            {/* 삭제 버튼 */}
            {!showDeleteConfirm ? (
                <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="btn-secondary text-red-600 border-red-200 hover:bg-red-50"
                >
                    <Trash2 size={14} />
                    삭제
                </button>
            ) : (
                <div className="flex items-center gap-1">
                    <span className="text-xs text-red-600 font-medium">삭제하시겠습니까?</span>
                    <button
                        onClick={handleDelete}
                        disabled={loadingDelete}
                        className="btn-danger px-3 py-1.5 text-xs"
                    >
                        {loadingDelete ? <Loader2 size={12} className="animate-spin" /> : '확인'}
                    </button>
                    <button
                        onClick={() => setShowDeleteConfirm(false)}
                        className="btn-secondary px-3 py-1.5 text-xs"
                    >
                        취소
                    </button>
                </div>
            )}
        </>
    )
}
