'use client'

import { useState } from 'react'
import { Copy, Plus, Check } from 'lucide-react'
import StatusBadge from '@/components/ui/StatusBadge'
import { generateAgentKey } from './actions'
import toast from 'react-hot-toast'

interface Agent {
    id: string
    name: string
    status: string
    platform: string
    version: string
    last_seen_at?: string
    agent_key: string
}

export default function AgentManager({ orgId, initialAgents }: { orgId: string, initialAgents: Agent[] }) {
    const [isGenerating, setIsGenerating] = useState(false)
    const [copiedKey, setCopiedKey] = useState<string | null>(null)

    const handleCopy = (key: string) => {
        navigator.clipboard.writeText(key)
        setCopiedKey(key)
        toast.success('연결키가 복사되었습니다.')
        setTimeout(() => setCopiedKey(null), 2000)
    }

    const handleGenerate = async () => {
        try {
            setIsGenerating(true)
            const res = await generateAgentKey(orgId)
            if (res.success) {
                toast.success('새 연결키가 발급되었습니다.')
                handleCopy(res.key)
            }
        } catch (e: any) {
            toast.error(e.message || '연결키 발급에 실패했습니다.')
        } finally {
            setIsGenerating(false)
        }
    }

    return (
        <>
            {initialAgents.length === 0 ? (
                <div className="text-center py-6">
                    <p className="text-sm text-gray-500 mb-3">연결된 에이전트가 없습니다</p>
                    <div className="flex flex-col gap-2 items-center justify-center">
                        <button
                            onClick={handleGenerate}
                            disabled={isGenerating}
                            className="btn-primary inline-flex items-center gap-2"
                        >
                            새 에이전트 연결키 발급
                        </button>
                        <a href="/Setup.exe" download className="text-sm text-brand-600 hover:underline inline-flex items-center gap-2 mt-2">
                            에이전트 Windows 설치 (Setup.exe) 다운로드
                        </a>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-2">발급된 키를 설치된 에이전트에 등록하세요.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {initialAgents.map(agent => (
                        <div key={agent.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-200">
                            <div>
                                <div className="flex items-center gap-2">
                                    <StatusBadge status={agent.status} size="sm" />
                                    <p className="text-sm font-medium text-gray-800">{agent.name ?? '에이전트'}</p>
                                </div>
                                <p className="text-xs text-gray-400 mt-0.5">
                                    {agent.platform} · v{agent.version}
                                    {agent.last_seen_at && ` · 마지막 연결: ${new Date(agent.last_seen_at).toLocaleDateString('ko-KR')}`}
                                </p>
                                <p className="text-xs text-brand-600 mt-1 font-mono">{agent.agent_key}</p>
                            </div>
                            <button
                                onClick={() => handleCopy(agent.agent_key)}
                                className="text-xs text-gray-500 hover:text-gray-800 flex items-center gap-1 bg-gray-50 px-2 py-1 rounded"
                            >
                                {copiedKey === agent.agent_key ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                                {copiedKey === agent.agent_key ? '복사됨' : '키 복사'}
                            </button>
                        </div>
                    ))}
                    <button
                        onClick={handleGenerate}
                        disabled={isGenerating}
                        className="btn-secondary text-xs w-full justify-center py-2 mt-2 disabled:opacity-50"
                    >
                        <Plus size={12} />
                        새 에이전트 연결키 발급
                    </button>
                </div>
            )}
        </>
    )
}
