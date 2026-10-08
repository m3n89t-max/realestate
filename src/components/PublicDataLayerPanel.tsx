'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Info, ExternalLink } from 'lucide-react'
import {
  PUBLIC_DATA_LAYERS,
  confidenceOf,
  describeLayerStatus,
  detectRegion,
  getLayer,
  getPanelLayers,
  type LayerStatus,
  type PublicDataLayer,
  type PublicDataLayerResult,
} from '@/lib/public-data-layers'

/**
 * 무료 공공 데이터 레이어 패널.
 *
 * 백조 원칙: 첫 화면은 쉬운 한 문장과 상태 배지만 보여주고,
 * 산식·출처·기준기간·표본 한계는 `산정 기준 보기` 안에 넣는다.
 */

const CONFIDENCE_STYLE: Record<string, string> = {
  높음: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  보통: 'bg-amber-50 text-amber-700 border-amber-200',
  참고: 'bg-slate-50 text-slate-600 border-slate-200',
}

const STATUS_STYLE: Record<LayerStatus, string> = {
  available: 'bg-emerald-500',
  not_collected: 'bg-slate-300',
  not_implemented: 'bg-slate-200',
  unsupported: 'bg-slate-200',
  unconfigured: 'bg-sky-300',
  failed: 'bg-red-400',
  empty: 'bg-slate-300',
}

const STATUS_BADGE: Record<LayerStatus, string> = {
  available: '자료 있음',
  not_collected: '미수집',
  not_implemented: '연결 예정',
  unsupported: '이 지역 미지원',
  unconfigured: '준비 중',
  failed: '불러오기 실패',
  empty: '확인된 자료 없음',
}

function LayerDetail({ layer }: { layer: PublicDataLayer }) {
  return (
    <div className="mt-2 pt-2 border-t border-gray-100 space-y-1 text-[10px] text-gray-500">
      <div className="flex gap-1.5">
        <span className="text-gray-400 w-14 flex-shrink-0">제공기관</span>
        <span className="text-gray-600">{layer.source}</span>
      </div>
      <div className="flex gap-1.5">
        <span className="text-gray-400 w-14 flex-shrink-0">공간단위</span>
        <span className="text-gray-600">{layer.spatialUnit}</span>
      </div>
      <div className="flex gap-1.5">
        <span className="text-gray-400 w-14 flex-shrink-0">산정방식</span>
        <span className="text-gray-600">{layer.method}</span>
      </div>
      {layer.coverageNote && (
        <div className="flex gap-1.5">
          <span className="text-gray-400 w-14 flex-shrink-0">한계</span>
          <span className="text-orange-600">{layer.coverageNote}</span>
        </div>
      )}
      <div className="flex gap-1.5">
        <span className="text-gray-400 w-14 flex-shrink-0">이용조건</span>
        <span className="text-gray-600">{layer.license}</span>
      </div>
      <a
        href={layer.officialUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-[10px] text-brand-600 hover:underline pt-0.5"
      >
        <ExternalLink size={9} />
        공식 자료 페이지
      </a>
    </div>
  )
}

function LayerCard({
  layer,
  result,
}: {
  layer: PublicDataLayer
  result: PublicDataLayerResult | undefined
}) {
  const [open, setOpen] = useState(false)
  const status: LayerStatus = result?.status ?? 'not_collected'
  // 값이 없는 카드에 신뢰도 배지를 달면 배지의 의미가 희석된다.
  const hasValue = status === 'available'
  const confidence = confidenceOf(layer)
  const kaptValue = layer.id === 'kapt_apartment_households' && result?.value && typeof result.value === 'object'
    ? result.value as {
        regionLabel?: string | null
        complexCount?: number
        totalHouseholds?: number
        complexes?: Array<{ kaptCode: string; kaptName: string; households: number }>
      }
    : null
  const residentValue = layer.id === 'resident_registration_population' && result?.value && typeof result.value === 'object'
    ? result.value as {
        regionLabel?: string
        totalPopulation?: number
        totalHouseholds?: number
        membersPerHousehold?: number | null
      }
    : null

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_STYLE[status]}`} />
          <p className="text-[11px] font-bold text-gray-700 truncate">{layer.label}</p>
        </div>
        {hasValue && (
          <span
            className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border flex-shrink-0 ${CONFIDENCE_STYLE[confidence]}`}
          >
            {confidence}
          </span>
        )}
      </div>

      <p className="text-[10px] text-gray-500 leading-relaxed mt-1.5">{layer.plainSentence}</p>

      {hasValue && kaptValue && Number.isFinite(kaptValue.complexCount) && Number.isFinite(kaptValue.totalHouseholds) && (
        <div className="mt-2 rounded-lg bg-emerald-50 px-2.5 py-2">
          <p className="text-xs font-bold text-emerald-800">
            같은 법정동 {kaptValue.complexCount!.toLocaleString()}개 단지 · {kaptValue.totalHouseholds!.toLocaleString()}세대
          </p>
          {kaptValue.regionLabel && (
            <p className="mt-0.5 text-[10px] text-emerald-700">{kaptValue.regionLabel}</p>
          )}
          <p className="mt-1 text-[10px] font-medium text-orange-700">반경 500m 값이 아니며 거주인구로 환산하지 않습니다.</p>
        </div>
      )}

      {hasValue && residentValue && Number.isFinite(residentValue.totalPopulation) && Number.isFinite(residentValue.totalHouseholds) && (
        <div className="mt-2 rounded-lg bg-sky-50 px-2.5 py-2">
          <p className="text-xs font-bold text-sky-800">
            {residentValue.regionLabel || '소속 법정동·리'} 전체 {residentValue.totalPopulation!.toLocaleString()}명 · {residentValue.totalHouseholds!.toLocaleString()}세대
          </p>
          {residentValue.membersPerHousehold != null && Number.isFinite(residentValue.membersPerHousehold) && (
            <p className="mt-0.5 text-[10px] text-sky-700">세대당 {residentValue.membersPerHousehold.toLocaleString()}명</p>
          )}
          <p className="mt-1 text-[10px] font-medium text-orange-700">법정동·리 전체 값이며 반경 500m 값이 아닙니다.</p>
        </div>
      )}

      <div className="flex items-center justify-between mt-2">
        <span className="text-[9px] text-gray-400">{STATUS_BADGE[status]}</span>
        {result?.sourceAsOf && (
          <span className="text-[9px] text-gray-400">
            {layer.id === 'kapt_apartment_households' ? '조회' : '기준'} {result.sourceAsOf.replace(/^(\d{4})(\d{2})$/, '$1-$2')}
          </span>
        )}
      </div>

      {!hasValue && (
        <p className="text-[9px] text-gray-400 mt-1 leading-relaxed">{describeLayerStatus(status)}</p>
      )}

      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600 mt-2"
      >
        {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        산정 기준 보기
      </button>

      {open && (
        <>
          <LayerDetail layer={layer} />
          {kaptValue?.complexes && kaptValue.complexes.length > 0 && (
            <div className="mt-2 border-t border-gray-100 pt-2">
              <p className="text-[10px] font-semibold text-gray-600">등록 단지</p>
              <ul className="mt-1 space-y-1">
                {kaptValue.complexes.map(complex => (
                  <li key={complex.kaptCode} className="flex justify-between gap-2 text-[10px] text-gray-500">
                    <span className="truncate">{complex.kaptName}</span>
                    <span className="flex-shrink-0 font-medium text-gray-700">{complex.households.toLocaleString()}세대</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function PublicDataLayerPanel({
  address,
  results,
}: {
  address: string | null
  results: PublicDataLayerResult[] | null | undefined
}) {
  const region = detectRegion(address)
  const resultById = new Map((results ?? []).map(item => [item.layerId, item]))

  // 이 패널이 담당하는 레이어만 보여준다.
  // 화면의 다른 영역이 이미 다루는 지표(거주인구·시설 밀집도·점포 구성)는 제외한다 —
  // 같은 지표가 한 화면에서 '있음'과 '미수집'으로 동시에 보이면 안 된다.
  const applicable = getPanelLayers(address)
  const regionOnly = PUBLIC_DATA_LAYERS.filter(
    layer => layer.scope !== 'nationwide' && layer.scope !== region,
  )

  const availableCount = applicable.filter(
    layer => resultById.get(layer.id)?.status === 'available',
  ).length

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-1.5 bg-sky-50 border border-sky-100 rounded-xl px-3 py-2">
        <Info size={12} className="text-sky-600 flex-shrink-0 mt-0.5" />
        <p className="text-[10px] text-sky-800 leading-relaxed">
          공공기관이 무료로 공개한 자료만 사용해요. 지역에 따라 제공되는 자료가 달라요.
          {availableCount > 0 && ` 지금 ${availableCount}개 자료를 불러왔어요.`}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {applicable.map(layer => (
          <LayerCard key={layer.id} layer={layer} result={resultById.get(layer.id)} />
        ))}
      </div>

      {regionOnly.length > 0 && (
        <p className="text-[9px] text-gray-400 leading-relaxed px-1">
          다른 지역 전용 자료 {regionOnly.length}개는 이 매물 위치에 적용되지 않아요
          {': '}
          {regionOnly.map(layer => getLayer(layer.id)?.label).filter(Boolean).join(', ')}.
        </p>
      )}
    </div>
  )
}
