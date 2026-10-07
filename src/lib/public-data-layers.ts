import type { MetricSemantics } from './location-data-truthfulness'

/**
 * 무료로 이용 가능한 공공 데이터 레이어 정의.
 *
 * 각 레이어는 제공기관, 지표 의미, 공간단위, 기준기간, 라이선스, 공식 URL을 반드시 갖는다.
 * 하나라도 비어 있으면 화면에 렌더링하지 않는다.
 *
 * 조사 근거: docs/research/ 및 각 레이어의 officialUrl (2026-09-29 확인).
 */

export type LayerRegion = 'seoul' | 'busan' | 'jeju' | 'gyeonggi' | 'other' | 'unknown'

/** 레이어가 적용되는 범위. 'nationwide'는 모든 지역, 그 외는 해당 지역 전용. */
export type LayerScope = 'nationwide' | 'seoul' | 'busan' | 'jeju' | 'gyeonggi'

export type LayerStatus =
  | 'available'
  | 'not_collected'
  | 'not_implemented'
  | 'unsupported'
  | 'unconfigured'
  | 'failed'
  | 'empty'

/**
 * 이 레이어가 어디서 값을 받는지.
 * - `collector`: 이 패널의 수집기가 값을 가져온다.
 * - `other_panel`: 화면의 다른 영역이 이미 담당한다. 이 패널에서는 렌더하지 않는다.
 *                  같은 지표가 한 화면에서 '있음'과 '미수집'으로 동시에 보이는 것을 막는다.
 * - `planned`: 아직 수집기가 없다. '준비 중'과 다른 문장을 준다.
 */
export type LayerDelivery = 'collector' | 'other_panel' | 'planned'

/** 지도 표현 방식. */
export type LayerRender = 'circle' | 'points' | 'panel' | 'chart'

export interface PublicDataLayer {
  id: string
  /** 사용자에게 보이는 이름. 데이터를 만들어낸 방법대로 부른다. */
  label: string
  /** 처음 쓰는 사람도 이해할 수 있는 한 문장. */
  plainSentence: string
  /** 발행 기관. 중계 벤더가 아니라 원 제공기관을 적는다. */
  source: string
  metricSemantics: MetricSemantics
  spatialUnit: string
  /** 숫자가 만들어지는 방식을 한 문장으로. */
  method: string
  /** 표본 한계, 조회 상한, 제외 항목 등. */
  coverageNote: string | null
  license: string
  officialUrl: string
  scope: LayerScope
  render: LayerRender
  /** 값을 어디서 받는지. `other_panel`은 이 패널에서 렌더하지 않는다. */
  delivery: LayerDelivery
  /** 기본으로 켜 둘 레이어인지. 첫 화면은 단순하게 유지한다. */
  defaultVisible: boolean
}

/** 사용자 표시 문장에 등장하면 안 되는 문구. 회귀 테스트 fixture로 함께 관리한다. */
export const FORBIDDEN_LAYER_PHRASES = [
  '유효 배후인구',
  '유동인구 히트맵',
  '전국 적용 카드 사용량 기반',
  '월 카드매출',
  '상권 총매출',
  '실측 유동인구',
  '최우수 상권',
] as const

export const PUBLIC_DATA_LAYERS: PublicDataLayer[] = [
  {
    id: 'sgis_resident_population',
    label: '거주인구 추정',
    plainSentence: '이 동네에 사는 사람이 대략 몇 명인지 보여줘요.',
    source: '통계청 SGIS',
    metricSemantics: 'estimated',
    spatialUnit: '행정구역 평균 인구밀도 → 반경 500m 원',
    method: '행정구역 평균 인구밀도를 매물 주변 500m 원 면적에 단순 환산합니다.',
    coverageNote: '동네 안에서 사람이 몰린 곳과 빈 곳을 구분하지 못합니다.',
    license: '통계청 SGIS 오픈API 이용약관',
    officialUrl: 'https://sgis.kostat.go.kr/developer/html/newOpenApi/api/dataApi.html',
    scope: 'nationwide',
    render: 'circle',
    delivery: 'other_panel',
    defaultVisible: true,
  },
  {
    id: 'kapt_apartment_households',
    label: '법정동 공동주택 세대수',
    plainSentence: '같은 법정동에 등록된 K-apt 공동주택 단지와 공식 세대수를 보여줘요. 500m 반경 값은 아니에요.',
    source: '국토교통부 K-apt',
    metricSemantics: 'administrative_observed',
    spatialUnit: '법정동 내 K-apt 등록 공동주택',
    method: '법정동 코드로 단지 목록을 모두 조회한 뒤 각 단지의 기본정보에 있는 공식 세대수를 합산합니다.',
    coverageNote: '좌표가 확인되지 않았으므로 반경 500m 공동주택이나 거주인구 추정에는 사용하지 않습니다.',
    license: '이용허락범위 제한 없음',
    officialUrl: 'https://www.data.go.kr/data/15058453/openapi.do',
    scope: 'nationwide',
    render: 'panel',
    delivery: 'collector',
    defaultVisible: true,
  },
  {
    id: 'kakao_facility_density',
    label: '시설 밀집 참고도',
    plainSentence: '가게와 편의시설이 어디에 모여 있는지 보여줘요.',
    source: '카카오 로컬 API',
    metricSemantics: 'proxy',
    spatialUnit: '장소 좌표',
    method: '검색된 장소 좌표에 시각화용 가중치를 부여해 밀집 정도를 그립니다.',
    coverageNote: '사람 수를 센 값이 아니라 시설 위치를 모아 그린 참고 그림입니다.',
    license: '카카오 개발자 서비스 약관',
    officialUrl: 'https://developers.kakao.com/docs/latest/ko/local/dev-guide',
    scope: 'nationwide',
    render: 'points',
    delivery: 'other_panel',
    defaultVisible: false,
  },
  {
    id: 'sbiz_store_mix',
    label: '주변 점포·업종 구성',
    plainSentence: '주변에 어떤 업종의 가게가 몇 개 있는지 보여줘요.',
    source: '소상공인시장진흥공단',
    metricSemantics: 'sample_observed',
    spatialUnit: '점포 좌표 · 반경 조회',
    method: '공공데이터포털 상가정보에서 반경 내 점포를 조회해 업종별로 집계합니다.',
    coverageNote: '한 번에 조회되는 점포 수에 상한이 있어 전체 점포 수가 아닙니다.',
    license: '이용허락범위 제한 없음',
    officialUrl: 'https://www.data.go.kr/data/15012005/openapi.do',
    scope: 'nationwide',
    render: 'panel',
    delivery: 'other_panel',
    defaultVisible: true,
  },
  {
    id: 'local_currency_spending',
    label: '지역화폐 업종별 소비',
    plainSentence: '이 동네에서 지역화폐가 어떤 업종에 많이 쓰이는지 보여줘요.',
    source: '한국조폐공사',
    metricSemantics: 'local_currency',
    spatialUnit: '읍면동 · 시군구 × 업종',
    method: '지역사랑상품권 결제금액과 결제건수를 업종별로 집계한 값입니다.',
    coverageNote: '지역화폐로 결제한 금액만 담겨 있어 전체 소비 규모와는 다릅니다.',
    license: '이용허락범위 제한 없음',
    officialUrl: 'https://www.data.go.kr/data/15149767/openapi.do',
    scope: 'nationwide',
    render: 'chart',
    delivery: 'collector',
    defaultVisible: true,
  },
  {
    id: 'seoul_realtime_commercial',
    label: '서울 주요 상권 실시간 결제 동향',
    plainSentence: '서울 주요 상권이 지금 붐비는지 한산한지 보여줘요.',
    source: '서울특별시 (신한카드 제공)',
    metricSemantics: 'sample_observed',
    spatialUnit: '서울 주요 장소 82곳',
    method: '신한카드 내국인 결제 건수와 4단계 혼잡 등급을 10분 간격으로 제공합니다.',
    coverageNote: '결제금액은 정확한 금액이 아니라 구간값으로만 공개되고, 과거 이력은 제공되지 않습니다.',
    license: '공공누리 제1유형 (출처표시)',
    officialUrl: 'https://data.seoul.go.kr/dataList/OA-22385/A/1/datasetView.do',
    scope: 'seoul',
    render: 'panel',
    delivery: 'collector',
    defaultVisible: true,
  },
  {
    id: 'seoul_living_population',
    label: '서울 생활인구 추계',
    plainSentence: '서울은 시간대별로 이 동네에 머무는 사람 수를 볼 수 있어요.',
    source: '서울특별시',
    metricSemantics: 'redistributed_estimate',
    spatialUnit: '행정동 × 시간대',
    method: '통신 기지국 신호를 행정동 단위로 추계한 체류 인구입니다.',
    coverageNote: '개인을 센 값이 아니라 통계적으로 추계한 값입니다.',
    license: '공공누리 제1유형 (출처표시)',
    officialUrl: 'https://data.seoul.go.kr/dataList/OA-14979/S/1/datasetView.do',
    scope: 'seoul',
    render: 'chart',
    delivery: 'planned',
    defaultVisible: true,
  },
  {
    id: 'seoul_trade_area_sales',
    label: '서울 상권 추정매출',
    plainSentence: '서울은 상권별로 대략 얼마나 팔리는지 추정치를 볼 수 있어요.',
    source: '서울특별시 · 서울신용보증재단',
    metricSemantics: 'estimated',
    spatialUnit: '상권 · 행정동',
    method: '신한카드 결제금액을 서울신용보증재단 보정비율로 나눠 전체 규모를 추정합니다.',
    coverageNote: '단일 카드사 표본을 보정한 추정치이며, 2021년 이전 값과 2024년 이후 공간단위는 이어 붙일 수 없습니다.',
    license: '공공누리 제1유형 (출처표시)',
    officialUrl: 'https://data.seoul.go.kr/dataList/OA-15572/S/1/datasetView.do',
    scope: 'seoul',
    render: 'chart',
    delivery: 'planned',
    defaultVisible: true,
  },
  {
    id: 'busan_living_population',
    label: '부산 생활인구 (주거·직장·방문)',
    plainSentence: '부산은 사는 사람, 일하는 사람, 찾아오는 사람을 나눠서 볼 수 있어요.',
    source: '부산광역시',
    metricSemantics: 'estimated',
    spatialUnit: '행정동 × 시간대',
    method: '통신 기지국 기반으로 주거·직장·방문 인구를 나눠 월별 일평균으로 추계합니다.',
    coverageNote: '월별 일평균이라 특정 날짜의 값은 알 수 없습니다.',
    license: '이용허락범위 제한 없음',
    officialUrl: 'https://www.data.go.kr/data/15164444/openapi.do',
    scope: 'busan',
    render: 'chart',
    delivery: 'planned',
    defaultVisible: true,
  },
  {
    id: 'gyeonggi_floating_population',
    label: '경기 행정동 시간대별 통행인구',
    plainSentence: '경기도는 시간대별로 이 동네를 지나는 사람 수를 볼 수 있어요.',
    source: '경기도',
    metricSemantics: 'estimated',
    spatialUnit: '행정동 × 시간대',
    method: '행정동 단위로 시간대별 통행 인구를 추계한 값입니다.',
    coverageNote: '행정동 전체 값이라 매물 바로 앞의 수치는 아닙니다.',
    license: '경기데이터드림 이용조건',
    officialUrl: 'https://data.gg.go.kr/portal/mainPage.do',
    scope: 'gyeonggi',
    render: 'chart',
    delivery: 'planned',
    defaultVisible: true,
  },
  {
    id: 'jeju_floating_population',
    label: '제주 읍면동 통행인구',
    plainSentence: '제주는 읍면동 단위로 오가는 사람 수를 볼 수 있어요.',
    source: '제주특별자치도',
    metricSemantics: 'estimated',
    spatialUnit: '읍면동',
    method: '읍면동 단위 내국인·외국인 통행 인구를 집계한 값입니다.',
    coverageNote: '읍면동 전체 값이고 기준기간이 오래된 구간이 있어 확인이 필요합니다.',
    license: '이용허락범위 제한 없음',
    officialUrl: 'https://www.data.go.kr/data/15074268/openapi.do',
    scope: 'jeju',
    render: 'chart',
    delivery: 'planned',
    defaultVisible: true,
  },
]

const LAYER_BY_ID = new Map(PUBLIC_DATA_LAYERS.map(layer => [layer.id, layer]))

export function getLayer(id: string): PublicDataLayer | undefined {
  return LAYER_BY_ID.get(id)
}

/**
 * 주소 문자열에서 지역을 판별한다.
 * 지역 전용 데이터를 다른 지역 매물에 붙이지 않기 위한 유일한 관문이다.
 *
 * 모든 패턴은 문자열 선두에 앵커한다. 부분일치를 허용하면
 * `경기도 부천시 부산로 12`가 부산으로, `전라남도 목포시 제주로 3`이 제주로
 * 오분류된다. 그런 도로명은 전국에 실존한다.
 */
export function detectRegion(address?: string | null): LayerRegion {
  const text = (address ?? '').trim()
  if (!text) return 'unknown'
  if (/^서울(특별시|시)?(\s|$)/.test(text)) return 'seoul'
  if (/^부산(광역시|시)?(\s|$)/.test(text)) return 'busan'
  if (/^제주(특별자치도|도)?(\s|$)/.test(text)) return 'jeju'
  if (/^경기(도)?(\s|$)/.test(text)) return 'gyeonggi'
  return 'other'
}

/**
 * 주소에서 시도명을 뽑는다. 동명 시군구를 구분하는 데 필수다.
 * 특정할 수 없으면 null — 조회 자체를 하지 않는다.
 */
export function extractSido(address?: string | null): string | null {
  const text = (address ?? '').trim()
  if (!text) return null
  const match = text.match(
    /^(서울특별시|서울시|서울|부산광역시|부산|대구광역시|대구|인천광역시|인천|광주광역시|광주|대전광역시|대전|울산광역시|울산|세종특별자치시|세종|경기도|경기|강원특별자치도|강원도|강원|충청북도|충북|충청남도|충남|전북특별자치도|전라북도|전북|전라남도|전남|경상북도|경북|경상남도|경남|제주특별자치도|제주도|제주)(?=\s|$)/,
  )
  if (!match) return null

  // 공공데이터 API가 쓰는 정식 시도명으로 정규화한다.
  const CANONICAL: Record<string, string> = {
    서울: '서울특별시', 서울시: '서울특별시', 서울특별시: '서울특별시',
    부산: '부산광역시', 부산광역시: '부산광역시',
    대구: '대구광역시', 대구광역시: '대구광역시',
    인천: '인천광역시', 인천광역시: '인천광역시',
    광주: '광주광역시', 광주광역시: '광주광역시',
    대전: '대전광역시', 대전광역시: '대전광역시',
    울산: '울산광역시', 울산광역시: '울산광역시',
    세종: '세종특별자치시', 세종특별자치시: '세종특별자치시',
    경기: '경기도', 경기도: '경기도',
    강원: '강원특별자치도', 강원도: '강원특별자치도', 강원특별자치도: '강원특별자치도',
    충북: '충청북도', 충청북도: '충청북도',
    충남: '충청남도', 충청남도: '충청남도',
    전북: '전북특별자치도', 전라북도: '전북특별자치도', 전북특별자치도: '전북특별자치도',
    전남: '전라남도', 전라남도: '전라남도',
    경북: '경상북도', 경상북도: '경상북도',
    경남: '경상남도', 경상남도: '경상남도',
    제주: '제주특별자치도', 제주도: '제주특별자치도', 제주특별자치도: '제주특별자치도',
  }
  return CANONICAL[match[1]] ?? null
}

/** 해당 주소에 실제로 적용할 수 있는 레이어만 반환한다. */
export function getApplicableLayers(address?: string | null): PublicDataLayer[] {
  const region = detectRegion(address)
  return PUBLIC_DATA_LAYERS.filter(layer => {
    if (layer.scope === 'nationwide') return true
    return layer.scope === region
  })
}

/**
 * 이 패널에서 카드로 렌더할 레이어.
 * `other_panel`은 화면의 다른 영역이 이미 담당하므로 제외한다 —
 * 같은 지표가 한 화면에서 '있음'과 '미수집'으로 동시에 보이면 안 된다.
 */
export function getPanelLayers(address?: string | null): PublicDataLayer[] {
  return getApplicableLayers(address).filter(layer => layer.delivery !== 'other_panel')
}

const STATUS_MESSAGE: Record<LayerStatus, string> = {
  available: '자료를 불러왔습니다.',
  not_collected: '아직 수집하지 않았습니다.',
  not_implemented: '아직 제품에 연결되지 않은 자료예요.',
  unsupported: '이 지역은 공개된 자료가 없습니다.',
  unconfigured: '관리자가 자료 연결을 준비하고 있습니다.',
  failed: '자료를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
  empty: '조회 범위에서 확인된 자료가 없습니다.',
}

/** 상태를 사용자 문장으로 바꾼다. 환경변수 이름 등 내부 정보는 절대 노출하지 않는다. */
export function describeLayerStatus(status: LayerStatus): string {
  return STATUS_MESSAGE[status]
}

export interface PublicDataLayerResult {
  layerId: string
  status: LayerStatus
  value: unknown
  collectedAt: string | null
  sourceAsOf: string | null
}

export interface LayerSummary {
  available: string[]
  pending: string[]
  failed: string[]
  unsupported: string[]
  notImplemented: string[]
}

/**
 * 레이어 결과를 표시 가능 / 준비 중 / 실패 / 미지원 / 미연결로 분류한다.
 * 기준기간(sourceAsOf)이 없으면 사용 가능으로 분류하지 않는다.
 */
export function summarizeLayers(results: PublicDataLayerResult[]): LayerSummary {
  const summary: LayerSummary = {
    available: [],
    pending: [],
    failed: [],
    unsupported: [],
    notImplemented: [],
  }

  for (const result of results) {
    switch (result.status) {
      case 'available':
        if (result.sourceAsOf) summary.available.push(result.layerId)
        else summary.pending.push(result.layerId)
        break
      case 'unconfigured':
      case 'not_collected':
        summary.pending.push(result.layerId)
        break
      case 'not_implemented':
        summary.notImplemented.push(result.layerId)
        break
      case 'failed':
        summary.failed.push(result.layerId)
        break
      case 'unsupported':
        summary.unsupported.push(result.layerId)
        break
      case 'empty':
        break
    }
  }

  return summary
}

/** 입력 품질에 따른 신뢰도 등급. 약한 추정이 강한 관측처럼 보이지 않게 한다. */
export type ConfidenceTier = '높음' | '보통' | '참고'

export function confidenceOf(layer: PublicDataLayer): ConfidenceTier {
  switch (layer.metricSemantics) {
    case 'observed':
    case 'administrative_observed':
      return '높음'
    case 'sample_observed':
      return '보통'
    default:
      return '참고'
  }
}
