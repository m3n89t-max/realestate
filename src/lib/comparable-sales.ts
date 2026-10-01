import type { RealPriceItem } from './types'

/**
 * 실거래 비교군(주변 시세) 판정 로직.
 *
 * 이 모듈은 저장된 실거래 배열(projects.real_price_data)과 매물 정보만 보고
 * "이 비교군으로 금액을 말해도 되는가"를 판정한다. 네트워크·DB에 접근하지 않는다.
 *
 * 세 가지 실제 결함을 막는다.
 *  1) 매물 종류 불일치: 상가 매물의 비교군이 전부 아파트 거래였고 그 평균이 주변 금액으로 표시됐다.
 *  2) 지역 구성 왜곡: 연동 매물의 비교군 60건 중 연동이 9건(15%)인데 '연동' 이름으로 표시됐다.
 *  3) 면적 미정규화: 84.97㎡ 매물의 비교군에 151.008㎡ 거래가 섞여 평균이 두 배 가까이 부풀었다.
 *
 * 국토교통부 실거래가 API는 LAWD_CD(시군구 5자리) + DEAL_YMD로만 조회된다.
 * 동(洞) 단위 조회는 API에 없으므로 '해당 동만 수집'은 불가능하다.
 * 그래서 비교군은 시군구 단위로 모이고, 이 모듈이 구성비를 밝히는 책임을 진다.
 */

/** 매물 종류 → 국토교통부 실거래가 서비스명. supabase/functions/collect-real-price/index.ts와 같아야 한다. */
export const COMPARABLE_DEAL_SERVICE_MAP: Record<string, string> = {
  apartment:  'RTMSDataSvcAptTrade',
  officetel:  'RTMSDataSvcOffiTrade',
  villa:      'RTMSDataSvcRHTrade',
  house:      'RTMSDataSvcSHTrade',
  commercial: 'RTMSDataSvcNrgTrade',
  land:       'RTMSDataSvcLandTrade',
}

/** 수집 대상 기간(개월). 수집기와 표기가 어긋나면 화면이 거짓이 된다. */
export const COMPARABLE_COLLECTION_MONTHS = 6

/** 비교군 저장 상한(건). */
export const COMPARABLE_SALES_LIMIT = 60

/** 같은 면적대로 볼 허용 비율. 전용면적 ±20%. */
export const AREA_BAND_RATIO = 0.2

/** 면적대 평균을 계산하기 위한 최소 표본(건). */
export const AREA_BAND_MIN_SAMPLE = 3

/** 명명된 동 이름으로 비교군을 부르기 위한 최소 비중. 과반을 넘어야 한다. */
export const REGION_LABEL_MAJORITY_RATIO = 0.5

export type ComparableSalesStatus =
  /** 아직 수집하지 않았다. */
  | 'not_collected'
  /** 수집을 시도했으나 실패했다. '거래 없음'과 절대 같은 문장을 쓰지 않는다. */
  | 'failed'
  /** 이 매물 종류는 공개 실거래 자료 자체가 없다. */
  | 'unsupported'
  /** 수집했고 조회 기간에 같은 종류 거래가 0건이었다. */
  | 'empty'
  /** 저장된 비교군이 이 매물과 다른 종류의 거래다(과거 수집 결함). */
  | 'asset_type_mismatch'
  /** 같은 종류 거래가 모였다. */
  | 'available'

/** 평균·최고·최저를 어떤 근거로 계산했는지(또는 왜 계산하지 않았는지). */
export type ComparableStatsBasis =
  /** 같은 면적대 거래만으로 계산했다. 유일하게 금액을 보여줄 수 있는 경우. */
  | 'area_band'
  /** 매물 전용면적이 없어 면적대를 맞출 수 없다. */
  | 'missing_area'
  /** 같은 면적대 거래가 최소 표본보다 적다. */
  | 'band_too_small'
  /** 금액이 기록된 거래가 없다. */
  | 'missing_amount'
  /** 비교할 거래 자체가 없다. */
  | 'no_comparables'

export interface ComparableSalesStats {
  count: number
  average: number
  max: number
  min: number
}

export interface ComparableDongShare {
  dong: string
  count: number
  /** 0~1. 비교군 전체 대비 비중. */
  ratio: number
}

export interface ComparableSalesInput {
  /** projects.property_type. 비교군 자산 종류는 이 값에서만 유도한다. */
  propertyType?: string | null
  /** projects.legal_dong. 라벨 후보가 되는 '명명된 동'. */
  legalDong?: string | null
  /** 매물 전용면적(㎡). */
  area?: number | null
  /** 저장된 실거래 배열. null/undefined는 '미수집'이다. */
  items?: RealPriceItem[] | null
  /** 이번 수집 호출이 실패했는지. 실패를 '거래 없음'으로 표시하지 않기 위해 분리한다. */
  collectionFailed?: boolean
}

export interface ComparableSalesView {
  status: ComparableSalesStatus
  /** 첫 화면에 그대로 둘 평문 한 문장. */
  headline: string
  statsBasis: ComparableStatsBasis
  /** 평균을 보여주는/보여주지 않는 이유 한 문장. */
  statsNote: string
  /** false면 평균·최고·최저를 렌더하지 않는다. */
  canShowStats: boolean
  stats: ComparableSalesStats | null
  areaBand: { min: number; max: number } | null
  regionScope: 'named_dong' | 'sigungu'
  /** 비교군에 실제로 들어 있는 범위를 가리키는 라벨. */
  regionLabel: string
  /** 비교군의 동별 구성비(내림차순). */
  composition: ComparableDongShare[]
  /** 실제 데이터에서 읽은 거래 기간. 데이터가 없으면 null. */
  periodLabel: string | null
  /** 매물 종류와 일치하는 거래 수. 화면에 보여줄 목록이다. */
  matchedItems: RealPriceItem[]
  /** 매물 종류와 다른 종류의 거래 수. */
  mismatchedCount: number
  /** 같은 면적대로 추려진 거래 수. */
  bandCount: number
  /** 다시 수집해야 하는 상태인지. */
  needsRecollect: boolean
}

/** 매물 종류에 대응하는 실거래 서비스명. 매핑에 없으면 null(아파트로 대체하지 않는다). */
export function dealServiceNameFor(propertyType?: string | null): string | null {
  if (!propertyType) return null
  return COMPARABLE_DEAL_SERVICE_MAP[propertyType] ?? null
}

/** '역삼1동' → '역삼'. 숫자와 끝의 '동'을 떼고 비교한다. */
export function normalizeDongName(dong?: string | null): string {
  if (!dong) return ''
  return dong.replace(/[0-9]/g, '').replace(/동$/, '').trim()
}

/**
 * 상태별 사용자 문장. 화면은 문장을 다시 만들지 않고 이 함수만 쓴다.
 * 모든 상태가 서로 다른 문장을 반환한다.
 */
export function describeComparableSalesStatus(status: ComparableSalesStatus): string {
  switch (status) {
    case 'not_collected':
      return '주변 실거래 자료를 아직 가져오지 않았습니다.'
    case 'failed':
      return '주변 실거래 자료를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.'
    case 'unsupported':
      return '이 매물 종류는 국토교통부가 공개하는 실거래 자료가 없어 비교군을 만들 수 없습니다.'
    case 'empty':
      return '조회한 기간에 같은 종류의 실거래가 한 건도 없었습니다.'
    case 'asset_type_mismatch':
      return '저장된 비교군이 이 매물과 다른 종류의 거래여서 금액을 보여주지 않습니다.'
    case 'available':
      return '같은 종류의 최근 실거래를 모았습니다.'
  }
}

/** 평균을 계산한/계산하지 않은 이유 문장. 모든 근거가 서로 다른 문장을 반환한다. */
export function describeComparableStatsBasis(basis: ComparableStatsBasis, bandCount = 0): string {
  switch (basis) {
    case 'area_band':
      return `이 매물과 비슷한 면적(±${Math.round(AREA_BAND_RATIO * 100)}%)의 거래 ${bandCount}건만으로 계산한 금액입니다.`
    case 'missing_area':
      return '매물 전용면적이 없어 같은 면적대만 골라낼 수 없습니다. 평균 금액을 표시하지 않습니다.'
    case 'band_too_small':
      return `비슷한 면적의 거래가 ${bandCount}건뿐이라 평균 금액을 표시하지 않습니다.`
    case 'missing_amount':
      return '금액이 기록된 거래가 없어 평균 금액을 표시하지 않습니다.'
    case 'no_comparables':
      return '비교할 거래가 없어 평균 금액을 표시하지 않습니다.'
  }
}

function buildPeriodLabel(items: RealPriceItem[]): string | null {
  const yms = items.map(it => it.deal_ym).filter((v): v is string => typeof v === 'string' && /^\d{6}$/.test(v)).sort()
  if (yms.length === 0) return null
  const fmt = (ym: string) => `${ym.slice(0, 4)}.${ym.slice(4, 6)}`
  const first = fmt(yms[0])
  const last = fmt(yms[yms.length - 1])
  return first === last ? first : `${first}~${last}`
}

function buildComposition(items: RealPriceItem[]): ComparableDongShare[] {
  const counts = new Map<string, number>()
  for (const it of items) {
    const dong = it.dong?.trim()
    if (!dong) continue
    counts.set(dong, (counts.get(dong) ?? 0) + 1)
  }
  const total = items.length || 1
  return [...counts.entries()]
    .map(([dong, count]) => ({ dong, count, ratio: count / total }))
    .sort((a, b) => b.count - a.count || a.dong.localeCompare(b.dong, 'ko-KR'))
}

function emptyView(status: ComparableSalesStatus, basis: ComparableStatsBasis): ComparableSalesView {
  return {
    status,
    headline: describeComparableSalesStatus(status),
    statsBasis: basis,
    statsNote: describeComparableStatsBasis(basis),
    canShowStats: false,
    stats: null,
    areaBand: null,
    regionScope: 'sigungu',
    regionLabel: '비교군 없음',
    composition: [],
    periodLabel: null,
    matchedItems: [],
    mismatchedCount: 0,
    bandCount: 0,
    needsRecollect: status === 'failed' || status === 'asset_type_mismatch',
  }
}

/**
 * 저장된 실거래 배열에서 화면에 쓸 판정 결과를 만든다.
 * 숫자를 보정하거나 추정하지 않는다. 보여줄 수 없으면 canShowStats=false로 막는다.
 */
export function buildComparableSalesView(input: ComparableSalesInput): ComparableSalesView {
  if (input.collectionFailed) return emptyView('failed', 'no_comparables')

  const expectedService = dealServiceNameFor(input.propertyType)
  if (!expectedService) return emptyView('unsupported', 'no_comparables')

  const items = input.items
  if (items == null) return emptyView('not_collected', 'no_comparables')

  const matchedItems = items.filter(it => it.type === expectedService)
  const mismatchedCount = items.length - matchedItems.length

  if (matchedItems.length === 0) {
    const status: ComparableSalesStatus = items.length > 0 ? 'asset_type_mismatch' : 'empty'
    const view = emptyView(status, 'no_comparables')
    return { ...view, mismatchedCount }
  }

  const composition = buildComposition(matchedItems)
  const normTarget = normalizeDongName(input.legalDong)
  const namedCount = normTarget
    ? matchedItems.filter(it => normalizeDongName(it.dong) === normTarget).length
    : 0
  const namedRatio = namedCount / matchedItems.length
  const isNamedMajority = Boolean(normTarget) && namedRatio > REGION_LABEL_MAJORITY_RATIO

  const regionScope: ComparableSalesView['regionScope'] = isNamedMajority ? 'named_dong' : 'sigungu'
  const regionLabel = isNamedMajority
    ? `${input.legalDong} 거래 ${matchedItems.length}건`
    : `매물이 속한 시·군·구 전체 거래 ${matchedItems.length}건`

  const area = typeof input.area === 'number' && Number.isFinite(input.area) && input.area > 0 ? input.area : null
  const areaBand = area
    ? { min: area * (1 - AREA_BAND_RATIO), max: area * (1 + AREA_BAND_RATIO) }
    : null

  const bandItems = areaBand
    ? matchedItems.filter(it => typeof it.area === 'number' && it.area !== null && it.area >= areaBand.min && it.area <= areaBand.max)
    : []
  const bandAmounts = bandItems.map(it => it.amount).filter((a): a is number => typeof a === 'number' && a > 0)

  let statsBasis: ComparableStatsBasis
  let stats: ComparableSalesStats | null = null

  if (!areaBand) {
    statsBasis = 'missing_area'
  } else if (bandItems.length < AREA_BAND_MIN_SAMPLE) {
    statsBasis = 'band_too_small'
  } else if (bandAmounts.length === 0) {
    statsBasis = 'missing_amount'
  } else {
    statsBasis = 'area_band'
    stats = {
      count: bandAmounts.length,
      average: Math.round(bandAmounts.reduce((s, a) => s + a, 0) / bandAmounts.length),
      max: Math.max(...bandAmounts),
      min: Math.min(...bandAmounts),
    }
  }

  return {
    status: 'available',
    headline: describeComparableSalesStatus('available'),
    statsBasis,
    statsNote: describeComparableStatsBasis(statsBasis, statsBasis === 'area_band' ? (stats?.count ?? 0) : bandItems.length),
    canShowStats: stats !== null,
    stats,
    areaBand,
    regionScope,
    regionLabel,
    composition,
    periodLabel: buildPeriodLabel(matchedItems),
    matchedItems,
    mismatchedCount,
    bandCount: bandItems.length,
    needsRecollect: mismatchedCount > 0,
  }
}
