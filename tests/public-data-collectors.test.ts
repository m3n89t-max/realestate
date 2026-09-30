import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  collectPublicDataLayers,
  parseSeoulCommercial,
  parseLocalCurrencySpending,
  type CollectorEnv,
} from '../src/lib/public-data-collectors'

const SEOUL_SAMPLE = {
  list_total_count: 6,
  AREA_NM: '광화문·덕수궁',
  AREA_CD: 'POI014',
  LIVE_CMRCL_STTS: {
    AREA_CMRCL_LVL: '한산한',
    AREA_SH_PAYMENT_CNT: '130',
    AREA_SH_PAYMENT_AMT_MIN: 1000000,
    AREA_SH_PAYMENT_AMT_MAX: 1100000,
    CMRCL_RSB: [
      {
        RSB_LRG_CTGR: '음식·음료',
        RSB_MID_CTGR: '한식',
        RSB_PAYMENT_LVL: '한산한',
        RSB_SH_PAYMENT_CNT: 7,
        RSB_SH_PAYMENT_AMT_MIN: 50000,
        RSB_SH_PAYMENT_AMT_MAX: 60000,
        RSB_MCT_CNT: 375,
        RSB_MCT_TIME: '202608',
      },
      {
        RSB_LRG_CTGR: '유통',
        RSB_MID_CTGR: '편의점',
        RSB_PAYMENT_LVL: '보통',
        RSB_SH_PAYMENT_CNT: 25,
        RSB_SH_PAYMENT_AMT_MIN: 100000,
        RSB_SH_PAYMENT_AMT_MAX: 150000,
        RSB_MCT_CNT: 38,
        RSB_MCT_TIME: '202608',
      },
    ],
    CMRCL_MALE_RATE: 42.8,
    CMRCL_FEMALE_RATE: 57.2,
    CMRCL_PERSONAL_RATE: 88.1,
    CMRCL_CORPORATION_RATE: 11.9,
    CMRCL_TIME: '20260929 0850',
  },
}

test('서울 상권 응답은 금액을 구간으로 보존한다', () => {
  const parsed = parseSeoulCommercial(SEOUL_SAMPLE, '광화문·덕수궁')
  assert.ok(parsed)
  assert.equal(parsed.congestionLevel, '한산한')
  assert.equal(parsed.paymentCount, 130)
  assert.equal(parsed.paymentAmountMin, 1000000)
  assert.equal(parsed.paymentAmountMax, 1100000)
  assert.equal(
    (parsed as unknown as Record<string, unknown>).paymentAmount,
    undefined,
    '단일 금액 필드를 만들면 구간값이 확정값으로 오해된다',
  )
})

test('서울 상권 응답의 업종 항목도 구간을 유지한다', () => {
  const parsed = parseSeoulCommercial(SEOUL_SAMPLE, '광화문·덕수궁')
  assert.ok(parsed)
  assert.equal(parsed.categories.length, 2)
  const first = parsed.categories[0]
  assert.equal(first.midCategory, '한식')
  assert.equal(first.paymentAmountMin, 50000)
  assert.equal(first.paymentAmountMax, 60000)
  assert.equal(first.merchantCount, 375)
})

test('서울 상권 응답의 provenance는 표본 관측으로 표기된다', () => {
  const parsed = parseSeoulCommercial(SEOUL_SAMPLE, '광화문·덕수궁')
  assert.ok(parsed)
  assert.equal(parsed.provenance.metric_semantics, 'sample_observed')
  assert.ok(parsed.provenance.source.includes('서울'))
  assert.equal(parsed.provenance.source_as_of, '20260929 0850')
  assert.ok(parsed.provenance.coverage_note?.includes('구간'))
})

test('서울 상권 데이터가 없는 장소는 null을 반환한다', () => {
  assert.equal(parseSeoulCommercial({ RESULT: { CODE: 'INFO-200' } }, '없는곳'), null)
  assert.equal(parseSeoulCommercial({ LIVE_CMRCL_STTS: null }, '없는곳'), null)
})

const LOCAL_CURRENCY_SAMPLE = {
  response: {
    header: { resultCode: '00', resultMsg: 'NORMAL SERVICE' },
    body: {
      totalCount: 3,
      items: [
        { crtrYm: '202607', ctpvNm: '경기도', sggNm: '성남시', induty: '일반음식점', setlAmt: '812345600', setlCnt: '41200' },
        { crtrYm: '202607', ctpvNm: '경기도', sggNm: '성남시', induty: '슈퍼마켓', setlAmt: '412345600', setlCnt: '28100' },
        { crtrYm: '202607', ctpvNm: '경기도', sggNm: '성남시', induty: '학원', setlAmt: '112345600', setlCnt: '3100' },
      ],
    },
  },
}

test('지역화폐 응답은 결제금액 기준으로 내림차순 정렬된다', () => {
  const parsed = parseLocalCurrencySpending(LOCAL_CURRENCY_SAMPLE)
  assert.ok(parsed)
  assert.equal(parsed.categories.length, 3)
  assert.equal(parsed.categories[0].industry, '일반음식점')
  assert.ok(parsed.categories[0].settlementAmount > parsed.categories[1].settlementAmount)
})

test('지역화폐 provenance는 local_currency 의미를 갖는다', () => {
  const parsed = parseLocalCurrencySpending(LOCAL_CURRENCY_SAMPLE)
  assert.ok(parsed)
  assert.equal(parsed.provenance.metric_semantics, 'local_currency')
  assert.equal(parsed.provenance.source_as_of, '202607')
  assert.ok(!parsed.provenance.coverage_note?.includes('전체 카드매출'))
})

test('지역화폐 응답 오류코드는 null을 반환한다', () => {
  assert.equal(
    parseLocalCurrencySpending({ response: { header: { resultCode: '30', resultMsg: 'SERVICE KEY IS NOT REGISTERED' } } }),
    null,
  )
  assert.equal(parseLocalCurrencySpending({}), null)
})

test('API 키가 없으면 실패가 아니라 준비 중 상태를 반환한다', async () => {
  const env: CollectorEnv = { seoulOpenApiKey: null, dataGoKrKey: null, fetchImpl: async () => { throw new Error('호출되면 안 된다') } }
  const results = await collectPublicDataLayers({ address: '서울특별시 중구 세종대로 110', lat: 37.5665, lng: 126.978 }, env)

  const seoul = results.find(r => r.layerId === 'seoul_realtime_commercial')
  assert.ok(seoul)
  assert.equal(seoul.status, 'unconfigured', '키 부재는 failed가 아니라 unconfigured다')

  const localCurrency = results.find(r => r.layerId === 'local_currency_spending')
  assert.ok(localCurrency)
  assert.equal(localCurrency.status, 'unconfigured')
})

test('지역 전용 레이어는 다른 지역 매물에 unsupported로 표기된다', async () => {
  const env: CollectorEnv = { seoulOpenApiKey: 'key', dataGoKrKey: 'key', fetchImpl: async () => new Response('{}', { status: 200 }) }
  const results = await collectPublicDataLayers({ address: '부산광역시 해운대구 우동', lat: 35.16, lng: 129.16 }, env)

  const seoul = results.find(r => r.layerId === 'seoul_realtime_commercial')
  assert.ok(seoul, '지역 전용 레이어도 결과에 상태로 등장해야 한다')
  assert.equal(seoul.status, 'unsupported')
  assert.equal(seoul.value, null, '미지원 지역에는 값을 만들지 않는다')
})

test('한 수집기의 실패가 나머지를 취소하지 않는다', async () => {
  const env: CollectorEnv = {
    seoulOpenApiKey: 'key',
    dataGoKrKey: 'key',
    fetchImpl: async (input) => {
      const url = String(input)
      if (url.includes('openapi.seoul.go.kr')) throw new Error('서울 API 장애')
      return new Response(JSON.stringify(LOCAL_CURRENCY_SAMPLE), { status: 200 })
    },
  }
  const results = await collectPublicDataLayers(
    { address: '서울특별시 중구 세종대로 110', lat: 37.5665, lng: 126.978, seoulPlaceName: '광화문·덕수궁' },
    env,
  )

  const seoul = results.find(r => r.layerId === 'seoul_realtime_commercial')
  const localCurrency = results.find(r => r.layerId === 'local_currency_spending')
  assert.equal(seoul?.status, 'failed')
  // 형제 수집기가 취소되지 않고 끝까지 실행됐다는 것이 핵심이다.
  // (이 fixture는 경기도 응답이라 지역 대조에서 걸러지므로 available이 아니다)
  assert.ok(localCurrency && localCurrency.status !== 'not_collected', '형제 수집기는 계속 진행되어야 한다')
})

test('지역화폐: 다른 지역 응답이 오면 이 매물 지표로 쓰지 않는다', async () => {
  // '중구'는 서울·부산·대구·인천·대전·울산에 모두 있다.
  // 시군구명만으로 조회하면 남의 동네 값이 내 매물 지표로 표시된다.
  const env: CollectorEnv = {
    seoulOpenApiKey: null,
    dataGoKrKey: 'key',
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          response: {
            header: { resultCode: '00' },
            body: {
              items: [
                { crtrYm: '202607', ctpvNm: '서울특별시', sggNm: '중구', induty: '일반음식점', setlAmt: '900000000', setlCnt: '1000' },
              ],
            },
          },
        }),
        { status: 200 },
      ),
  }
  const results = await collectPublicDataLayers(
    { address: '인천광역시 중구 신포로 15', lat: 37.47, lng: 126.62 },
    env,
  )
  const localCurrency = results.find(r => r.layerId === 'local_currency_spending')
  assert.equal(localCurrency?.status, 'empty', '요청 지역과 다른 응답은 버린다')
  assert.equal(localCurrency?.value, null)
})

test('지역화폐: 시도를 특정할 수 없으면 조회하지 않는다', async () => {
  let called = false
  const env: CollectorEnv = {
    seoulOpenApiKey: null,
    dataGoKrKey: 'key',
    fetchImpl: async () => { called = true; return new Response('{}', { status: 200 }) },
  }
  const results = await collectPublicDataLayers({ address: '테헤란로 152', lat: 37.5, lng: 127 }, env)
  assert.equal(called, false, '시도가 없으면 외부 API를 호출하지 않는다')
  assert.equal(results.find(r => r.layerId === 'local_currency_spending')?.status, 'empty')
})

test('서울 상권: 금액·건수 결측을 0으로 만들지 않는다', () => {
  const parsed = parseSeoulCommercial(
    {
      AREA_NM: '광화문·덕수궁',
      LIVE_CMRCL_STTS: {
        AREA_CMRCL_LVL: '보통',
        CMRCL_TIME: '20260929 0850',
        CMRCL_RSB: [{ RSB_LRG_CTGR: '음식·음료', RSB_MID_CTGR: '한식', RSB_PAYMENT_LVL: '보통' }],
      },
    },
    '광화문·덕수궁',
  )
  assert.ok(parsed)
  assert.equal(parsed.paymentCount, null, '결측을 0건으로 표시하면 거짓이다')
  assert.equal(parsed.paymentAmountMin, null, '결측을 0원으로 표시하면 거짓이다')
  assert.equal(parsed.paymentAmountMax, null)
  assert.equal(parsed.categories[0].paymentCount, null)
  assert.equal(parsed.categories[0].merchantCount, null)
})

test('서울 상권 호출 실패 시 인증키가 포함된 URL을 밖으로 흘리지 않는다', async () => {
  // 서울 openapi는 https를 제공하지 않아 http가 유일한 경로다(2026-09-29 확인).
  // 키가 경로 세그먼트에 실리므로, 실패 결과에 URL이나 에러 원문이 실리면 키가 노출된다.
  const SECRET = 'super-secret-seoul-key'
  const env: CollectorEnv = {
    seoulOpenApiKey: SECRET,
    dataGoKrKey: null,
    fetchImpl: async (input) => { throw new Error(`요청 실패: ${String(input)}`) },
  }
  const results = await collectPublicDataLayers(
    { address: '서울특별시 중구 세종대로 110', lat: 37.5665, lng: 126.978, seoulPlaceName: '광화문·덕수궁' },
    env,
  )
  const seoul = results.find(r => r.layerId === 'seoul_realtime_commercial')
  assert.equal(seoul?.status, 'failed')
  const serialized = JSON.stringify(results)
  assert.ok(!serialized.includes(SECRET), '수집 결과에 인증키가 실려서는 안 된다')
  assert.ok(!serialized.includes('openapi.seoul.go.kr'), '결과에 요청 URL을 남기지 않는다')
})

test('수집기가 없는 레이어는 미수집이 아니라 미연결로 표기한다', async () => {
  const env: CollectorEnv = { seoulOpenApiKey: null, dataGoKrKey: null, fetchImpl: async () => new Response('{}') }
  const results = await collectPublicDataLayers({ address: '서울특별시 중구 세종대로 110', lat: 37.5, lng: 127 }, env)
  // '아직 수집 안 함'으로 두면 곧 채워질 것이라는 거짓 기대를 만든다.
  assert.equal(results.find(r => r.layerId === 'seoul_living_population')?.status, 'not_implemented')
  assert.equal(results.find(r => r.layerId === 'seoul_trade_area_sales')?.status, 'not_implemented')
})

test('서울 장소명이 없으면 실패가 아니라 결과 없음이다', async () => {
  const env: CollectorEnv = { seoulOpenApiKey: 'key', dataGoKrKey: null, fetchImpl: async () => { throw new Error('호출되면 안 된다') } }
  const results = await collectPublicDataLayers({ address: '서울특별시 중구 세종대로 110', lat: 37.5665, lng: 126.978 }, env)
  assert.equal(results.find(r => r.layerId === 'seoul_realtime_commercial')?.status, 'empty')
})

test('수집 결과는 항상 레이어 정의에 존재하는 id만 사용한다', async () => {
  const { PUBLIC_DATA_LAYERS } = await import('../src/lib/public-data-layers')
  const known = new Set(PUBLIC_DATA_LAYERS.map(l => l.id))
  const env: CollectorEnv = { seoulOpenApiKey: null, dataGoKrKey: null, fetchImpl: async () => new Response('{}') }
  const results = await collectPublicDataLayers({ address: '서울특별시 중구', lat: 37.5, lng: 127 }, env)
  for (const result of results) {
    assert.ok(known.has(result.layerId), `정의되지 않은 레이어 id: ${result.layerId}`)
  }
})
