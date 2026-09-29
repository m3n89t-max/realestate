import type { DataProvenance } from './location-data-truthfulness'
import {
  PUBLIC_DATA_LAYERS,
  detectRegion,
  extractSido,
  type LayerStatus,
  type PublicDataLayerResult,
} from './public-data-layers'

/**
 * 무료 공공 데이터 수집기.
 *
 * 규칙:
 * - API 키 부재는 'unconfigured'로 정상 반환한다. 예외를 던지지 않는다.
 * - 지역 전용 레이어는 해당 지역이 아니면 'unsupported'로 값 없이 반환한다.
 * - 각 수집기는 독립 실행되어 하나의 실패가 형제를 취소하지 않는다.
 * - 구간으로 공개된 금액은 구간으로 보존한다. 평균을 내어 단일 값으로 만들지 않는다.
 */

export interface CollectorEnv {
  seoulOpenApiKey: string | null
  dataGoKrKey: string | null
  fetchImpl?: typeof fetch
}

export interface CollectorTarget {
  address: string | null
  lat: number | null
  lng: number | null
  /** 서울 실시간 상권 API는 장소명으로만 조회되므로 별도로 전달한다. */
  seoulPlaceName?: string | null
  /** 지역화폐 조회용 시군구명. 없으면 주소에서 추출한다. */
  sigunguName?: string | null
  /** 시도명. 동명 시군구를 구분하는 데 필수다. */
  sidoName?: string | null
}

// ── 서울 실시간 상권현황 ──────────────────────────────────────

export interface SeoulCommercialCategory {
  largeCategory: string
  midCategory: string
  paymentLevel: string
  /** 결측은 null로 유지한다. 0으로 강제하면 '0건'이라는 거짓이 화면에 뜬다. */
  paymentCount: number | null
  paymentAmountMin: number | null
  paymentAmountMax: number | null
  merchantCount: number | null
  merchantAsOf: string | null
}

export interface SeoulCommercial {
  placeName: string
  placeCode: string | null
  congestionLevel: string
  paymentCount: number | null
  paymentAmountMin: number | null
  paymentAmountMax: number | null
  categories: SeoulCommercialCategory[]
  maleRate: number | null
  femaleRate: number | null
  personalRate: number | null
  corporationRate: number | null
  provenance: DataProvenance
}

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''))
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

/**
 * 결측을 0으로 바꾸지 않고 null로 유지한다.
 * 금액·건수 필드가 비어 있을 때 0을 쓰면 사용자가 '결제금액 0원'이라는 거짓을 본다.
 */
function toNullableNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''))
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export function parseSeoulCommercial(raw: unknown, placeName: string): SeoulCommercial | null {
  if (!raw || typeof raw !== 'object') return null
  const root = raw as Record<string, any>
  const status = root.LIVE_CMRCL_STTS
  if (!status || typeof status !== 'object') return null
  if (!status.AREA_CMRCL_LVL) return null

  const rawCategories: any[] = Array.isArray(status.CMRCL_RSB) ? status.CMRCL_RSB : []
  const categories: SeoulCommercialCategory[] = rawCategories.map(item => ({
    largeCategory: String(item.RSB_LRG_CTGR ?? ''),
    midCategory: String(item.RSB_MID_CTGR ?? ''),
    paymentLevel: String(item.RSB_PAYMENT_LVL ?? ''),
    paymentCount: toNullableNumber(item.RSB_SH_PAYMENT_CNT),
    paymentAmountMin: toNullableNumber(item.RSB_SH_PAYMENT_AMT_MIN),
    paymentAmountMax: toNullableNumber(item.RSB_SH_PAYMENT_AMT_MAX),
    merchantCount: toNullableNumber(item.RSB_MCT_CNT),
    merchantAsOf: item.RSB_MCT_TIME ? String(item.RSB_MCT_TIME) : null,
  }))

  return {
    placeName: String(root.AREA_NM ?? placeName),
    placeCode: root.AREA_CD ? String(root.AREA_CD) : null,
    congestionLevel: String(status.AREA_CMRCL_LVL),
    paymentCount: toNullableNumber(status.AREA_SH_PAYMENT_CNT),
    paymentAmountMin: toNullableNumber(status.AREA_SH_PAYMENT_AMT_MIN),
    paymentAmountMax: toNullableNumber(status.AREA_SH_PAYMENT_AMT_MAX),
    categories,
    maleRate: toNullableNumber(status.CMRCL_MALE_RATE),
    femaleRate: toNullableNumber(status.CMRCL_FEMALE_RATE),
    personalRate: toNullableNumber(status.CMRCL_PERSONAL_RATE),
    corporationRate: toNullableNumber(status.CMRCL_CORPORATION_RATE),
    provenance: {
      source: '서울특별시 실시간 상권현황 (신한카드 제공)',
      metric_semantics: 'sample_observed',
      source_as_of: status.CMRCL_TIME ? String(status.CMRCL_TIME) : null,
      collected_at: new Date().toISOString(),
      spatial_unit: '서울 주요 장소',
      method: '신한카드 내국인 결제 건수와 4단계 혼잡 등급',
      coverage_note: '결제금액은 구간값으로만 공개되며 단일 카드사 표본입니다.',
    },
  }
}

// ── 지역사랑상품권 업종별 결제 ────────────────────────────────

export interface LocalCurrencyCategory {
  industry: string
  settlementAmount: number
  settlementCount: number | null
}

export interface LocalCurrencySpending {
  region: string
  /** 응답이 실제로 어느 시도·시군구를 가리키는지. 요청 지역과의 대조에 쓴다. */
  sido: string | null
  sigungu: string | null
  categories: LocalCurrencyCategory[]
  totalAmount: number
  provenance: DataProvenance
}

export function parseLocalCurrencySpending(raw: unknown): LocalCurrencySpending | null {
  if (!raw || typeof raw !== 'object') return null
  const response = (raw as Record<string, any>).response
  if (!response || typeof response !== 'object') return null
  const resultCode = String(response.header?.resultCode ?? '')
  if (resultCode && resultCode !== '00') return null

  const items: any[] = Array.isArray(response.body?.items)
    ? response.body.items
    : Array.isArray(response.body?.items?.item)
      ? response.body.items.item
      : []
  if (items.length === 0) return null

  const categories: LocalCurrencyCategory[] = items
    .map(item => ({
      industry: String(item.induty ?? item.indutyNm ?? '업종 미표기'),
      settlementAmount: toNumber(item.setlAmt),
      settlementCount: toNullableNumber(item.setlCnt),
    }))
    .filter(item => item.settlementAmount > 0)
    .sort((a, b) => b.settlementAmount - a.settlementAmount)

  if (categories.length === 0) return null

  const first = items[0] ?? {}
  const sido = first.ctpvNm ? String(first.ctpvNm) : null
  const sigungu = first.sggNm ? String(first.sggNm) : null
  const region = [sido, sigungu, first.emdNm].filter(Boolean).join(' ') || '지역 미표기'

  return {
    region,
    sido,
    sigungu,
    categories,
    totalAmount: categories.reduce((sum, item) => sum + item.settlementAmount, 0),
    provenance: {
      source: '한국조폐공사 지역사랑상품권',
      metric_semantics: 'local_currency',
      source_as_of: first.crtrYm ? String(first.crtrYm) : null,
      collected_at: new Date().toISOString(),
      spatial_unit: '시군구 · 읍면동 × 업종',
      method: '지역사랑상품권 결제금액과 결제건수를 업종별로 집계',
      coverage_note: '지역화폐로 결제한 금액만 포함되어 지역 전체 소비 규모와는 다릅니다.',
    },
  }
}

// ── 수집 오케스트레이션 ───────────────────────────────────────

function emptyResult(layerId: string, status: LayerStatus): PublicDataLayerResult {
  return { layerId, status, value: null, collectedAt: null, sourceAsOf: null }
}

/** 주소에서 시군구 수준 지명을 뽑는다. 실패하면 null. */
export function extractSigungu(address?: string | null): string | null {
  const text = (address ?? '').trim()
  if (!text) return null
  const match = text.match(/([가-힣]+(?:시|군|구))/g)
  if (!match) return null
  // 광역시도명(서울특별시 등)을 제외하고 첫 시군구를 고른다.
  const candidate = match.find(token => !/(특별시|광역시|특별자치시|특별자치도)$/.test(token))
  return candidate ?? null
}

async function collectSeoulCommercial(
  target: CollectorTarget,
  env: CollectorEnv,
): Promise<PublicDataLayerResult> {
  const layerId = 'seoul_realtime_commercial'
  if (detectRegion(target.address) !== 'seoul') return emptyResult(layerId, 'unsupported')
  if (!env.seoulOpenApiKey) return emptyResult(layerId, 'unconfigured')

  const placeName = target.seoulPlaceName
  if (!placeName) return emptyResult(layerId, 'empty')

  const doFetch = env.fetchImpl ?? fetch
  // https만 사용한다. 키가 경로 세그먼트에 실리므로 평문 http는 키 노출이다.
  const url = `https://openapi.seoul.go.kr:8088/${env.seoulOpenApiKey}/json/citydata_cmrcl/1/5/${encodeURIComponent(placeName)}`

  try {
    const res = await doFetch(url)
    if (!res.ok) return emptyResult(layerId, 'failed')
    const json = await res.json()
    const parsed = parseSeoulCommercial(json, placeName)
    if (!parsed) return emptyResult(layerId, 'empty')
    return {
      layerId,
      status: 'available',
      value: parsed,
      collectedAt: parsed.provenance.collected_at ?? null,
      sourceAsOf: parsed.provenance.source_as_of,
    }
  } catch {
    return emptyResult(layerId, 'failed')
  }
}

async function collectLocalCurrency(
  target: CollectorTarget,
  env: CollectorEnv,
): Promise<PublicDataLayerResult> {
  const layerId = 'local_currency_spending'
  if (!env.dataGoKrKey) return emptyResult(layerId, 'unconfigured')

  const sigungu = target.sigunguName ?? extractSigungu(target.address)
  const sido = target.sidoName ?? extractSido(target.address)
  // 시도를 특정할 수 없으면 조회하지 않는다.
  // '중구'는 서울·부산·대구·인천·대전·울산에 모두 있어 시군구명만으로는 다른 지역 값을 가져온다.
  if (!sigungu || !sido) return emptyResult(layerId, 'empty')

  const doFetch = env.fetchImpl ?? fetch
  const params = new URLSearchParams({
    serviceKey: env.dataGoKrKey,
    pageNo: '1',
    numOfRows: '30',
    type: 'json',
    ctpvNm: sido,
    sggNm: sigungu,
  })
  const url = `https://apis.data.go.kr/B190001/localGiftCardSettlement/settlementByIndustry?${params}`

  try {
    const res = await doFetch(url)
    if (!res.ok) return emptyResult(layerId, 'failed')
    const json = await res.json()
    const parsed = parseLocalCurrencySpending(json)
    if (!parsed) return emptyResult(layerId, 'empty')

    // 방어선: 응답이 요청한 지역을 가리키지 않으면 버린다.
    // 실패가 아니라 '확인된 자료 없음'이다 — 다른 지역 값을 이 매물 지표로 보여주지 않는다.
    if (!matchesRequestedRegion(parsed, sido, sigungu)) {
      return emptyResult(layerId, 'empty')
    }

    return {
      layerId,
      status: 'available',
      value: parsed,
      collectedAt: parsed.provenance.collected_at ?? null,
      sourceAsOf: parsed.provenance.source_as_of,
    }
  } catch {
    return emptyResult(layerId, 'failed')
  }
}

/** 응답의 시도·시군구가 요청한 지역과 일치하는지. 시도가 응답에 없으면 신뢰하지 않는다. */
export function matchesRequestedRegion(
  parsed: Pick<LocalCurrencySpending, 'sido' | 'sigungu'>,
  requestedSido: string,
  requestedSigungu: string,
): boolean {
  if (!parsed.sido || !parsed.sigungu) return false
  const normalize = (value: string) => value.replace(/\s/g, '')
  return (
    normalize(parsed.sido) === normalize(requestedSido) &&
    normalize(parsed.sigungu) === normalize(requestedSigungu)
  )
}

/**
 * 적용 가능한 모든 레이어의 상태를 반환한다.
 * 아직 수집기가 없는 레이어는 'not_collected'로, 지역 밖 레이어는 'unsupported'로 표기한다.
 */
export async function collectPublicDataLayers(
  target: CollectorTarget,
  env: CollectorEnv,
): Promise<PublicDataLayerResult[]> {
  const region = detectRegion(target.address)

  // 수집기가 구현된 레이어는 독립 실행한다 (allSettled: 하나의 실패가 형제를 취소하지 않는다).
  const settled = await Promise.allSettled([
    collectSeoulCommercial(target, env),
    collectLocalCurrency(target, env),
  ])

  const collected: PublicDataLayerResult[] = settled.map((outcome, index) => {
    if (outcome.status === 'fulfilled') return outcome.value
    const layerId = index === 0 ? 'seoul_realtime_commercial' : 'local_currency_spending'
    return emptyResult(layerId, 'failed')
  })

  const collectedIds = new Set(collected.map(item => item.layerId))

  // 나머지 레이어는 상태만 채운다. 값을 만들어내지 않는다.
  // `other_panel`은 화면의 다른 영역이 담당하므로 이 패널의 관심사가 아니다.
  // `planned`는 수집기 자체가 없다 — '아직 수집 안 함'과 구분해야 '곧 채워질 것'이라는
  // 거짓 기대를 만들지 않는다.
  const rest = PUBLIC_DATA_LAYERS.filter(layer => !collectedIds.has(layer.id)).map(layer => {
    if (layer.scope !== 'nationwide' && layer.scope !== region) {
      return emptyResult(layer.id, 'unsupported')
    }
    if (layer.delivery === 'planned') return emptyResult(layer.id, 'not_implemented')
    return emptyResult(layer.id, 'not_collected')
  })

  return [...collected, ...rest]
}
