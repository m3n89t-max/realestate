'use client'

import { useState } from 'react'
import {
  FileText, Download, RefreshCw, AlertTriangle, CheckCircle,
  Building, Loader2, ChevronDown, ChevronUp
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Document, DocumentSummary, RiskItem } from '@/lib/types'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'
import BuildingRegisterPrint from './BuildingRegisterPrint'

interface DocsTabProps {
  projectId: string
  documents: Document[]
}

const DOC_TYPE_LABELS: Record<string, string> = {
  building_register: '건축물대장',
  floor_plan: '설계도면',
  permit_history: '인허가 이력',
  risk_report: '리스크 리포트',
  package_pdf: '패키지 PDF',
}

const RISK_STATUS_CONFIG = {
  safe: { label: '안전', color: 'text-green-600 bg-green-50', icon: CheckCircle },
  caution: { label: '주의', color: 'text-amber-600 bg-amber-50', icon: AlertTriangle },
  danger: { label: '위험', color: 'text-red-600 bg-red-50', icon: AlertTriangle },
}

function DocumentCard({ doc }: { doc: Document }) {
  const [expanded, setExpanded] = useState(false)
  const rawSummary = doc.summary
  // summary가 문자열인 경우(Edge Function이 텍스트로 저장) summary_text로 래핑
  const summary: DocumentSummary | null = typeof rawSummary === 'string'
    ? { summary_text: rawSummary as string }
    : (rawSummary as DocumentSummary | null)
  const riskItems = doc.risk_items as RiskItem[] | null

  return (
    <div className="card overflow-hidden">
      <div className="p-4 flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
            <FileText size={16} className="text-blue-500" />
          </div>
          <div>
            <p className="font-medium text-gray-800 text-sm">{DOC_TYPE_LABELS[doc.type] ?? doc.type}</p>
            {doc.file_name && <p className="text-xs text-gray-400 mt-0.5">{doc.file_name}</p>}
            <p className="text-xs text-gray-400">{new Date(doc.created_at).toLocaleDateString('ko-KR')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {doc.file_url && (
            <a href={doc.file_url} download className="btn-secondary py-1.5 text-xs">
              <Download size={12} />
              다운로드
            </a>
          )}
          {(summary || riskItems || doc.raw_data) && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="btn-secondary py-1.5 text-xs"
            >
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {doc.raw_data ? '서류 보기' : '분석 결과'}
            </button>
          )}
        </div>
      </div>

      {expanded && doc.raw_data && (
        <div className="border-t border-gray-100 p-4 bg-white">
          <BuildingRegisterPrint
            data={doc.raw_data}
            fetchedAt={doc.created_at}
          />
        </div>
      )}

      {expanded && !doc.raw_data && summary && (
        <div className="border-t border-gray-100 p-4 space-y-3 bg-gray-50">
          <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">요약 정보</h4>
          <div className="grid grid-cols-2 gap-3">
            {summary.usage && (
              <div>
                <p className="text-xs text-gray-400">건축물 용도</p>
                <p className="text-sm font-medium text-gray-800">{summary.usage}</p>
              </div>
            )}
            {summary.floors && (
              <div>
                <p className="text-xs text-gray-400">층수</p>
                <p className="text-sm font-medium text-gray-800">{summary.floors}</p>
              </div>
            )}
            {summary.approved_date && (
              <div>
                <p className="text-xs text-gray-400">사용승인일</p>
                <p className="text-sm font-medium text-gray-800">{summary.approved_date}</p>
              </div>
            )}
            {summary.total_area && (
              <div>
                <p className="text-xs text-gray-400">연면적</p>
                <p className="text-sm font-medium text-gray-800">{summary.total_area}㎡</p>
              </div>
            )}
          </div>
          {summary.violation !== undefined && (
            <div className={cn(
              'flex items-center gap-2 p-2.5 rounded-lg text-sm',
              summary.violation ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
            )}>
              {summary.violation
                ? <AlertTriangle size={14} />
                : <CheckCircle size={14} />
              }
              {summary.violation ? '위반건축물 내역 있음' : '위반 건축물 없음'}
            </div>
          )}
          {summary.summary_text && (
            <div className="bg-white rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-1">AI 요약</p>
              <p className="text-sm text-gray-700 leading-relaxed">{summary.summary_text}</p>
            </div>
          )}
        </div>
      )}

      {expanded && riskItems && riskItems.length > 0 && (
        <div className="border-t border-gray-100 p-4 space-y-2 bg-gray-50">
          <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">리스크 체크</h4>
          {riskItems.map((item, i) => {
            const config = RISK_STATUS_CONFIG[item.status]
            const Icon = config.icon
            return (
              <div key={i} className={cn('flex items-start gap-2 p-2 rounded-lg text-xs', config.color)}>
                <Icon size={12} className="mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">{item.item}</p>
                  {item.detail && <p className="opacity-80 mt-0.5">{item.detail}</p>}
                </div>
                <span className="ml-auto font-bold flex-shrink-0">{config.label}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function DocsTab({ projectId, documents }: DocsTabProps) {
  const supabase = createClient()
  const [requesting, setRequesting] = useState<string | null>(null)

  const requestDocument = async (type: string) => {
    setRequesting(type)
    try {
      if (type === 'building_register') {
        // 건축물대장 Edge Function 직접 호출
        const { error } = await supabase.functions.invoke('download-building-register', {
          body: { project_id: projectId },
        })
        if (error) throw error
        toast.success('건축물대장 수집이 완료되었습니다.')
        window.location.reload()
      } else if (type === 'seumteo') {
        // 세움터 API는 서버에서 직접 처리
        const { error } = await supabase.functions.invoke('seumteo-api', {
          body: { project_id: projectId, action: 'permit_history' },
        })
        if (error) throw error
        toast.success('세움터 조회가 완료되었습니다')
        window.location.reload()
      }
    } catch (err) {
      toast.error('요청에 실패했습니다')
      console.error(err)
    } finally {
      setRequesting(null)
    }
  }

  const buildingDocs = documents.filter(d => d.type === 'building_register')
  const floorPlanDocs = documents.filter(d => d.type === 'floor_plan')
  const permitDocs = documents.filter(d => d.type === 'permit_history')
  const riskDocs = documents.filter(d => d.type === 'risk_report')

  return (
    <div className="space-y-6">
      {/* 액션 버튼 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="card p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <Building size={18} className="text-blue-500" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-gray-800 text-sm">건축물대장 자동 수집</p>
              <p className="text-xs text-gray-400 mt-0.5">공공데이터포털 건축HUB API로 자동 수집</p>
              <button
                onClick={() => requestDocument('building_register')}
                disabled={requesting === 'building_register'}
                className="btn-primary mt-3 text-xs py-1.5"
              >
                {requesting === 'building_register'
                  ? <><Loader2 size={12} className="animate-spin" /> 요청중...</>
                  : <>다운로드 요청</>
                }
              </button>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <FileText size={18} className="text-green-500" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-gray-800 text-sm">세움터 인허가 조회</p>
              <p className="text-xs text-gray-400 mt-0.5">건축허가/사용승인/변경이력 자동 조회</p>
              <button
                onClick={() => requestDocument('seumteo')}
                disabled={requesting === 'seumteo'}
                className="btn-secondary mt-3 text-xs py-1.5"
              >
                {requesting === 'seumteo'
                  ? <><Loader2 size={12} className="animate-spin" /> 조회중...</>
                  : <><RefreshCw size={12} /> 세움터 조회</>
                }
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 서류 목록 */}
      {documents.length === 0 ? (
        <div className="card p-12 text-center">
          <FileText size={40} className="mx-auto text-gray-200 mb-3" />
          <p className="text-gray-500 font-medium">아직 수집된 서류가 없습니다</p>
          <p className="text-sm text-gray-400 mt-1">위의 버튼을 눌러 서류를 자동 수집하세요</p>
        </div>
      ) : (
        <div className="space-y-4">
          {buildingDocs.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">건축물대장 ({buildingDocs.length})</h3>
              <div className="space-y-2">
                {buildingDocs.map(doc => <DocumentCard key={doc.id} doc={doc} />)}
              </div>
            </div>
          )}
          {permitDocs.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">인허가 이력 ({permitDocs.length})</h3>
              <div className="space-y-2">
                {permitDocs.map(doc => <DocumentCard key={doc.id} doc={doc} />)}
              </div>
            </div>
          )}
          {floorPlanDocs.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">설계도면 ({floorPlanDocs.length})</h3>
              <div className="space-y-2">
                {floorPlanDocs.map(doc => <DocumentCard key={doc.id} doc={doc} />)}
              </div>
            </div>
          )}
          {riskDocs.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">리스크 리포트 ({riskDocs.length})</h3>
              <div className="space-y-2">
                {riskDocs.map(doc => <DocumentCard key={doc.id} doc={doc} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
