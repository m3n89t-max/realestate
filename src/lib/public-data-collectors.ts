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
  kaptListApiKey?: string | null
  kaptBasicApiKey?: string | null
  /** 테스트에서만 짧게 조정한다. 운영 기본값은 8초다. */
  kaptRequestTimeoutMs?: number
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
  /** 법정동코드 앞 5자리. 지역사랑상품권 API의 사용처지역코드다. */
  sigunguCode?: string | null
  /** 법정동코드 뒤 5자리. 앞 3자리를 시군구코드와 합쳐 읍면동코드로 쓴다. */
  bjdongCode?: string | null
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

// ── K-apt 공동주택 단지·세대수 ─────────────────────────────────

export interface KaptApartmentListItem {
  bjdCode: string
  kaptCode: string
  kaptName: string
  sido: string
  sigungu: string
  eupmyeondong: string
  ri: string | null
}

export interface KaptApartmentListPage {
  items: KaptApartmentListItem[]
  pageNo: number
  numOfRows: number
  totalCount: number
}

export interface KaptApartmentBasic {
  bjdCode: string
  kaptCode: string
  kaptName: string
  legalAddress: string | null
  roadAddress: string | null
  /** K-apt의 공식 세대수(kaptdaCnt). 거주인구가 아니다. */
  households: number
  /** K-apt의 호수(hoCnt). 세대수 대체값으로 사용하지 않는다. */
  units: number | null
  buildingCount: number | null
}

export interface KaptApartmentHouseholds {
  bjdCode: string
  regionLabel: string | null
  complexCount: number
  totalHouseholds: number
  complexes: KaptApartmentBasic[]
  provenance: DataProvenance
}

export function parseKaptApartmentList(raw: unknown, requestedBjdCode: string): KaptApartmentListPage | null {
  if (!/^\d{10}$/.test(requestedBjdCode) || !raw || typeof raw !== 'object') return null
  const root = raw as Record<string, any>
  if (String(root.header?.resultCode ?? '') !== '00') return null

  const body = root.body
  const pageNo = toNullableNumber(body?.pageNo)
  const numOfRows = toNullableNumber(body?.numOfRows)
  const totalCount = toNullableNumber(body?.totalCount)
  if (
    pageNo == null || !Number.isInteger(pageNo) || pageNo < 1 ||
    numOfRows == null || !Number.isInteger(numOfRows) || numOfRows < 1 ||
    totalCount == null || !Number.isInteger(totalCount) || totalCount < 0
  ) return null

  const rawItems = Array.isArray(body?.items)
    ? body.items
    : Array.isArray(body?.items?.item)
      ? body.items.item
      : body?.items?.item
        ? [body.items.item]
        : []

  const items: KaptApartmentListItem[] = []
  for (const item of rawItems) {
    const bjdCode = String(item?.bjdCode ?? '')
    const kaptCode = String(item?.kaptCode ?? '').trim()
    const kaptName = String(item?.kaptName ?? '').trim()
    if (bjdCode !== requestedBjdCode || !kaptCode || !kaptName) return null
    items.push({
      bjdCode,
      kaptCode,
      kaptName,
      sido: String(item.as1 ?? '').trim(),
      sigungu: String(item.as2 ?? '').trim(),
      eupmyeondong: String(item.as3 ?? '').trim(),
      ri: item.as4 ? String(item.as4).trim() || null : null,
    })
  }

  if (items.length > numOfRows || (totalCount === 0 && items.length > 0)) return null
  return { items, pageNo, numOfRows, totalCount }
}

export function parseKaptApartmentBasic(raw: unknown, requestedKaptCode: string): KaptApartmentBasic | null {
  if (!requestedKaptCode || !raw || typeof raw !== 'object') return null
  const root = raw as Record<string, any>
  if (String(root.header?.resultCode ?? '') !== '00') return null
  const item = root.body?.item
  if (!item || typeof item !== 'object') return null

  const kaptCode = String(item.kaptCode ?? '').trim()
  const bjdCode = String(item.bjdCode ?? '')
  const kaptName = String(item.kaptName ?? '').trim()
  const households = toNullableNumber(item.kaptdaCnt)
  if (
    kaptCode !== requestedKaptCode || !/^\d{10}$/.test(bjdCode) || !kaptName ||
    households == null || !Number.isInteger(households) || households < 0
  ) return null

  const units = toNullableNumber(item.hoCnt)
  const buildingCount = toNullableNumber(item.kaptDongCnt)
  return {
    bjdCode,
    kaptCode,
    kaptName,
    legalAddress: item.kaptAddr ? String(item.kaptAddr).trim() || null : null,
    roadAddress: item.doroJuso ? String(item.doroJuso).trim() || null : null,
    households,
    units: units != null && Number.isInteger(units) && units >= 0 ? units : null,
    buildingCount: buildingCount != null && Number.isInteger(buildingCount) && buildingCount >= 0 ? buildingCount : null,
  }
}

function normalizeServiceKey(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

async function fetchJsonWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  timeoutMs: number,
): Promise<{ ok: boolean; status: number; json: unknown }> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  let response: Response | null = null
  const operation = (async () => {
    response = await fetchImpl(url, { signal: controller.signal })
    const json = await response.json()
    return { ok: response.ok, status: response.status, json }
  })()

  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort()
          void response?.body?.cancel().catch(() => undefined)
          reject(new Error('K-apt request timed out'))
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
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

export function parseLocalCurrencySpending(
  raw: unknown,
  requestedRegion?: {
    sido: string | null
    sigungu: string | null
    sigunguCode?: string | null
    emdCode?: string | null
  },
): LocalCurrencySpending | null {
  if (!raw || typeof raw !== 'object') return null
  const root = raw as Record<string, any>
  const response = root.response
  const resultCode = String(response?.header?.resultCode ?? '')
  if (resultCode && resultCode !== '00') return null

  const items: any[] = Array.isArray(root.data)
    ? root.data
    : Array.isArray(response?.body?.items)
      ? response.body.items
      : Array.isArray(response?.body?.items?.item)
        ? response.body.items.item
        : []
  if (items.length === 0) return null

  const regionItems = Array.isArray(root.data) && requestedRegion?.sigunguCode
    ? items.filter(item => {
        if (String(item.usage_rgn_cd ?? '') !== requestedRegion.sigunguCode) return false
        return !requestedRegion.emdCode || String(item.emd_cd ?? '') === requestedRegion.emdCode
      })
    : items
  if (regionItems.length === 0) return null

  const latestPeriod = regionItems
    .map(item => String(item.crtr_ym ?? item.crtrYm ?? ''))
    .filter(Boolean)
    .sort()
    .at(-1) ?? null
  const latestItems = latestPeriod
    ? regionItems.filter(item => String(item.crtr_ym ?? item.crtrYm ?? '') === latestPeriod)
    : regionItems

  const grouped = new Map<string, LocalCurrencyCategory>()
  for (const item of latestItems) {
    const industry = String(item.ksic_nm ?? item.induty ?? item.indutyNm ?? '업종 미표기')
    const settlementAmount = toNumber(item.stlm_amt ?? item.setlAmt)
    const settlementCount = toNullableNumber(item.stlm_nocs ?? item.setlCnt)
    if (settlementAmount <= 0) continue

    const previous = grouped.get(industry)
    grouped.set(industry, {
      industry,
      settlementAmount: (previous?.settlementAmount ?? 0) + settlementAmount,
      settlementCount:
        previous?.settlementCount == null && settlementCount == null
          ? null
          : (previous?.settlementCount ?? 0) + (settlementCount ?? 0),
    })
  }

  const categories: LocalCurrencyCategory[] = [...grouped.values()]
    .sort((a, b) => b.settlementAmount - a.settlementAmount)

  if (categories.length === 0) return null

  const first = latestItems[0] ?? {}
  const sido = first.ctpvNm ? String(first.ctpvNm) : requestedRegion?.sido ?? null
  const sigungu = first.sggNm ? String(first.sggNm) : requestedRegion?.sigungu ?? null
  const emdName = first.emd_nm ?? first.emdNm
  const region = [sido, sigungu, emdName].filter(Boolean).join(' ') || '지역 미표기'

  return {
    region,
    sido,
    sigungu,
    categories,
    totalAmount: categories.reduce((sum, item) => sum + item.settlementAmount, 0),
    provenance: {
      source: '한국조폐공사 지역사랑상품권',
      metric_semantics: 'local_currency',
      source_as_of: latestPeriod,
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

/**
 * 공공데이터포털 게이트웨이가 "등록되지 않은 서비스키"를 반환했는지 판정한다.
 *
 * 포털은 계정당 하나의 인증키를 모든 승인 서비스에 공통으로 쓴다.
 * 전용 환경변수에 다른 값이 들어가면 활용신청이 승인 상태여도 이 오류가 나온다.
 */
function isServiceKeyNotRegistered(json: unknown): boolean {
  if (!json || typeof json !== 'object') return false
  const header = (json as Record<string, any>).OpenAPI_ServiceResponse?.cmmMsgHeader
  if (!header || typeof header !== 'object') return false
  return String(header.errMsg ?? '') === 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR'
    || String(header.returnReasonCode ?? '') === '30'
}

/**
 * 게이트웨이/서비스 응답에서 실패 사유만 뽑는다.
 * 인증키나 요청 URL은 절대 포함하지 않는다.
 */
function readGatewayReason(json: unknown): { message: string | null; code: string | null } {
  if (!json || typeof json !== 'object') return { message: null, code: null }
  const root = json as Record<string, any>
  const gateway = root.OpenAPI_ServiceResponse?.cmmMsgHeader
  if (gateway && typeof gateway === 'object') {
    return {
      message: gateway.errMsg ? String(gateway.errMsg) : null,
      code: gateway.returnReasonCode != null ? String(gateway.returnReasonCode) : null,
    }
  }
  const serviceHeader = root.header
  if (serviceHeader && typeof serviceHeader === 'object') {
    return {
      message: serviceHeader.resultMsg ? String(serviceHeader.resultMsg) : null,
      code: serviceHeader.resultCode != null ? String(serviceHeader.resultCode) : null,
    }
  }
  return { message: null, code: null }
}

function failedWithDiagnostics(
  layerId: string,
  stage: string,
  options: { httpStatus?: number | null; json?: unknown } = {},
): PublicDataLayerResult {
  const reason = readGatewayReason(options.json)
  return {
    ...emptyResult(layerId, 'failed'),
    diagnostics: {
      stage,
      httpStatus: options.httpStatus ?? null,
      gatewayMessage: reason.message,
      gatewayCode: reason.code,
      shape: stage.endsWith('_parse') ? describeShape(options.json) : null,
    },
  }
}

/**
 * 응답의 구조만 문자열로 요약한다. 키 이름과 타입만 담고 값은 담지 않는다.
 * 인증키가 값으로 들어올 경로가 없도록 문자열 값은 길이만 남긴다.
 */
function describeShape(value: unknown, depth = 0): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) {
    return depth >= 3
      ? `array(${value.length})`
      : `array(${value.length})[${value.length ? describeShape(value[0], depth + 1) : ''}]`
  }
  const type = typeof value
  if (type === 'string') return `string(len=${(value as string).length})`
  if (type === 'number' || type === 'boolean' || type === 'undefined') return type
  if (type !== 'object') return type
  if (depth >= 3) return 'object'
  const entries = Object.entries(value as Record<string, unknown>).slice(0, 12)
  return `{${entries.map(([k, v]) => `${k}:${describeShape(v, depth + 1)}`).join(',')}}`
}

async function collectKaptApartmentHouseholds(
  target: CollectorTarget,
  env: CollectorEnv,
): Promise<PublicDataLayerResult> {
  const layerId = 'kapt_apartment_households'
  if (!env.kaptListApiKey || !env.kaptBasicApiKey) return emptyResult(layerId, 'unconfigured')

  const sigunguCode = target.sigunguCode?.trim() ?? ''
  const bjdongCode = target.bjdongCode?.trim() ?? ''
  const fullBjdCode = `${sigunguCode}${bjdongCode}`
  if (!/^\d{10}$/.test(fullBjdCode)) return emptyResult(layerId, 'empty')

  // 전용 키가 미등록으로 거부되면 이미 검증된 포털 공통 키로 한 번만 재시도한다.
  const keyPairs: Array<{ listKey: string; basicKey: string }> = [
    { listKey: env.kaptListApiKey, basicKey: env.kaptBasicApiKey },
  ]
  if (env.dataGoKrKey && env.dataGoKrKey !== env.kaptListApiKey) {
    keyPairs.push({ listKey: env.dataGoKrKey, basicKey: env.dataGoKrKey })
  }

  let lastResult = emptyResult(layerId, 'failed')
  for (const pair of keyPairs) {
    const attempt = await collectKaptWithKeys(target, env, fullBjdCode, pair)
    if (!attempt.keyNotRegistered) return attempt.result
    lastResult = attempt.result
  }
  return lastResult
}

async function collectKaptWithKeys(
  target: CollectorTarget,
  env: CollectorEnv,
  fullBjdCode: string,
  keys: { listKey: string; basicKey: string },
): Promise<{ result: PublicDataLayerResult; keyNotRegistered: boolean }> {
  const layerId = 'kapt_apartment_households'
  const failed = (
    stage: string,
    options: { httpStatus?: number | null; json?: unknown; keyNotRegistered?: boolean } = {},
  ) => ({
    result: failedWithDiagnostics(layerId, stage, { httpStatus: options.httpStatus, json: options.json }),
    keyNotRegistered: options.keyNotRegistered ?? false,
  })
  const doFetch = env.fetchImpl ?? fetch
  const requestTimeoutMs = Number.isFinite(env.kaptRequestTimeoutMs) && (env.kaptRequestTimeoutMs ?? 0) > 0
    ? env.kaptRequestTimeoutMs!
    : 8_000
  const listEndpoint = 'https://apis.data.go.kr/1613000/AptListService4/getLegaldongAptList4'
  const basicEndpoint = 'https://apis.data.go.kr/1613000/AptBasisInfoServiceV5/getAphusBassInfoV5'

  try {
    const listItems: KaptApartmentListItem[] = []
    const kaptCodes = new Set<string>()
    let expectedTotal: number | null = null

    for (let pageNo = 1; pageNo <= 100; pageNo += 1) {
      const params = new URLSearchParams({
        serviceKey: normalizeServiceKey(keys.listKey),
        bjdCode: fullBjdCode,
        pageNo: String(pageNo),
        numOfRows: '100',
      })
      const response = await fetchJsonWithTimeout(doFetch, `${listEndpoint}?${params}`, requestTimeoutMs)
      if (!response.ok) {
        return failed('list_http', {
          httpStatus: response.status,
          json: response.json,
          keyNotRegistered: isServiceKeyNotRegistered(response.json),
        })
      }
      const parsed = parseKaptApartmentList(response.json, fullBjdCode)
      if (!parsed || parsed.pageNo !== pageNo) {
        return failed('list_parse', { httpStatus: response.status, json: response.json })
      }

      expectedTotal ??= parsed.totalCount
      if (parsed.totalCount !== expectedTotal || listItems.length + parsed.items.length > expectedTotal) {
        return failed('list_total_mismatch', { httpStatus: response.status })
      }
      for (const item of parsed.items) {
        if (kaptCodes.has(item.kaptCode)) return failed('list_duplicate_complex')
        kaptCodes.add(item.kaptCode)
        listItems.push(item)
      }

      if (listItems.length === expectedTotal) break
      if (parsed.items.length === 0 || pageNo === 100) return failed('list_incomplete_pages')
    }

    if (expectedTotal === 0) return { result: emptyResult(layerId, 'empty'), keyNotRegistered: false }
    if (expectedTotal == null || listItems.length !== expectedTotal) return failed('list_incomplete_total')

    const complexes: KaptApartmentBasic[] = []
    let basicKeyNotRegistered = false
    let basicFailureStatus: number | null = null
    let basicFailureJson: unknown = null
    let basicFailureStage = 'basic_parse'
    for (let offset = 0; offset < listItems.length; offset += 5) {
      const chunk = listItems.slice(offset, offset + 5)
      const resolved = await Promise.all(chunk.map(async listItem => {
        const params = new URLSearchParams({
          serviceKey: normalizeServiceKey(keys.basicKey),
          kaptCode: listItem.kaptCode,
        })
        const response = await fetchJsonWithTimeout(doFetch, `${basicEndpoint}?${params}`, requestTimeoutMs)
        if (!response.ok) {
          if (isServiceKeyNotRegistered(response.json)) basicKeyNotRegistered = true
          basicFailureStage = 'basic_http'
          basicFailureStatus = response.status
          basicFailureJson = response.json
          return null
        }
        const parsed = parseKaptApartmentBasic(response.json, listItem.kaptCode)
        if (!parsed || parsed.bjdCode !== fullBjdCode) {
          basicFailureStage = 'basic_parse'
          basicFailureStatus = response.status
          basicFailureJson = response.json
          return null
        }
        return parsed
      }))
      if (resolved.some(item => item == null)) {
        return failed(basicFailureStage, {
          httpStatus: basicFailureStatus,
          json: basicFailureJson,
          keyNotRegistered: basicKeyNotRegistered,
        })
      }
      complexes.push(...resolved as KaptApartmentBasic[])
    }

    complexes.sort((a, b) => a.kaptName.localeCompare(b.kaptName, 'ko'))
    const collectedAt = new Date().toISOString()
    const first = listItems[0]
    const regionLabel = [first?.sido, first?.sigungu, first?.eupmyeondong, first?.ri]
      .filter(Boolean)
      .join(' ') || null
    const value: KaptApartmentHouseholds = {
      bjdCode: fullBjdCode,
      regionLabel,
      complexCount: complexes.length,
      totalHouseholds: complexes.reduce((sum, item) => sum + item.households, 0),
      complexes,
      provenance: {
        source: '국토교통부 K-apt 공동주택 단지 목록·기본정보',
        metric_semantics: 'administrative_observed',
        source_as_of: collectedAt.slice(0, 10),
        collected_at: collectedAt,
        spatial_unit: '법정동 내 K-apt 등록 공동주택',
        method: '법정동 단지 목록을 모두 조회하고 각 단지의 공식 세대수(kaptdaCnt)를 합산',
        coverage_note: 'API 조회일 기준 등록정보입니다. 좌표가 없어 반경 500m 값과 거주인구 추정에는 사용하지 않습니다.',
      },
    }

    return {
      result: {
        layerId,
        status: 'available',
        value,
        collectedAt,
        sourceAsOf: value.provenance.source_as_of,
      },
      keyNotRegistered: false,
    }
  } catch {
    return failed('request_error')
  }
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
  // 서울 열린데이터광장 openapi는 https를 제공하지 않는다 (2026-09-29 확인:
  // 8088 https는 SSL 오류, 443은 타임아웃). http가 유일한 경로다.
  //
  // 키가 경로 세그먼트에 실리므로 이 URL은 절대 로그·에러 응답에 남기지 않는다.
  // catch 블록에서 에러 객체를 그대로 흘리면 키가 노출된다.
  const url = `http://openapi.seoul.go.kr:8088/${env.seoulOpenApiKey}/json/citydata_cmrcl/1/5/${encodeURIComponent(placeName)}`

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
  const sigunguCode = target.sigunguCode?.trim() ?? ''
  const bjdongCode = target.bjdongCode?.trim() ?? ''
  const emdCode = /^\d{5}$/.test(bjdongCode) ? `${sigunguCode}${bjdongCode.slice(0, 3)}` : null
  // 시도를 특정할 수 없으면 조회하지 않는다.
  // '중구'는 서울·부산·대구·인천·대전·울산에 모두 있어 시군구명만으로는 다른 지역 값을 가져온다.
  // 읍면동 코드 없이 시군구 전체를 합산하면 첫 읍면동 값처럼 오표시될 수 있으므로 조회하지 않는다.
  if (!sigungu || !sido || !/^\d{5}$/.test(sigunguCode) || !emdCode) {
    return emptyResult(layerId, 'empty')
  }

  const doFetch = env.fetchImpl ?? fetch
  let serviceKey = env.dataGoKrKey
  try {
    // 공공데이터포털에서 인코딩 키를 전달받아도 URLSearchParams가 이중 인코딩하지 않도록 한 번 복원한다.
    serviceKey = decodeURIComponent(serviceKey)
  } catch {
    // 올바른 percent-encoding이 아닌 키는 원문을 사용한다.
  }
  const params = new URLSearchParams({
    serviceKey,
    page: '1',
    perPage: '1000',
    returnType: 'JSON',
    'cond[usage_rgn_cd::EQ]': sigunguCode,
    'cond[emd_cd::EQ]': emdCode,
  })
  const endpoint = 'https://apis.data.go.kr/B190001/localGiftsKsciPaymentV1/paymentsV1'

  try {
    const allData: unknown[] = []
    const pageSignatures = new Set<string>()
    let firstResponse: Record<string, unknown> | null = null
    let expectedMatchCount: number | null = null

    for (let page = 1; page <= 100; page += 1) {
      params.set('page', String(page))
      const res = await doFetch(`${endpoint}?${params}`)
      if (!res.ok) return emptyResult(layerId, 'failed')
      const json = await res.json() as Record<string, unknown>

      // 구형 응답 형식은 페이지 메타데이터가 없으므로 기존 파서에 그대로 넘긴다.
      if (!Array.isArray(json.data)) {
        const parsed = parseLocalCurrencySpending(json, { sido, sigungu, sigunguCode, emdCode })
        if (!parsed) return emptyResult(layerId, 'empty')
        if (!matchesRequestedRegion(parsed, sido, sigungu)) return emptyResult(layerId, 'empty')
        return {
          layerId,
          status: 'available',
          value: parsed,
          collectedAt: parsed.provenance.collected_at ?? null,
          sourceAsOf: parsed.provenance.source_as_of,
        }
      }

      const responsePage = Number(json.page)
      const currentCount = Number(json.currentCount)
      const matchCount = Number(json.matchCount)
      if (
        json.page == null ||
        json.currentCount == null ||
        json.matchCount == null ||
        !Number.isInteger(responsePage) ||
        !Number.isInteger(currentCount) ||
        !Number.isInteger(matchCount) ||
        responsePage !== page ||
        currentCount !== json.data.length ||
        matchCount < 0
      ) {
        return emptyResult(layerId, 'failed')
      }

      const pageSignature = JSON.stringify(json.data)
      if (pageSignatures.has(pageSignature)) return emptyResult(layerId, 'failed')
      pageSignatures.add(pageSignature)

      expectedMatchCount ??= matchCount
      if (matchCount !== expectedMatchCount || allData.length + json.data.length > expectedMatchCount) {
        return emptyResult(layerId, 'failed')
      }

      firstResponse ??= json
      allData.push(...json.data)
      if (allData.length === expectedMatchCount) break
      if (json.data.length === 0 || page === 100) return emptyResult(layerId, 'failed')
    }

    const mergedResponse = { ...firstResponse, currentCount: allData.length, data: allData }
    const parsed = parseLocalCurrencySpending(mergedResponse, { sido, sigungu, sigunguCode, emdCode })
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
    collectKaptApartmentHouseholds(target, env),
    collectSeoulCommercial(target, env),
    collectLocalCurrency(target, env),
  ])

  const collectedLayerIds = [
    'kapt_apartment_households',
    'seoul_realtime_commercial',
    'local_currency_spending',
  ] as const
  const collected: PublicDataLayerResult[] = settled.map((outcome, index) => {
    if (outcome.status === 'fulfilled') return outcome.value
    return emptyResult(collectedLayerIds[index], 'failed')
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
