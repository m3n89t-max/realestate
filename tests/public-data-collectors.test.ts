import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  collectPublicDataLayers,
  parseKaptApartmentBasic,
  parseKaptApartmentList,
  parseSeoulCommercial,
  parseLocalCurrencySpending,
  type CollectorEnv,
} from '../src/lib/public-data-collectors'

const KAPT_LIST_SAMPLE = {
  header: { resultCode: '00', resultMsg: 'NORMAL SERVICE.' },
  body: {
    items: [
      { bjdCode: '5011013700', kaptCode: 'A10027875', kaptName: '연동센트럴', as1: '제주특별자치도', as2: '제주시', as3: '연동', as4: '' },
      { bjdCode: '5011013700', kaptCode: 'A10027876', kaptName: '연동그린', as1: '제주특별자치도', as2: '제주시', as3: '연동', as4: '' },
    ],
    numOfRows: '100',
    pageNo: '1',
    totalCount: '2',
  },
}

const KAPT_BASIC_SAMPLE = {
  header: { resultCode: '00', resultMsg: 'NORMAL SERVICE.' },
  body: {
    item: {
      bjdCode: '5011013700',
      kaptCode: 'A10027875',
      kaptName: '연동센트럴',
      kaptAddr: '제주특별자치도 제주시 연동 1',
      doroJuso: '제주특별자치도 제주시 신대로 1',
      kaptdaCnt: '480',
      hoCnt: 500,
      kaptDongCnt: 4,
    },
  },
}

test('K-apt 목록 응답은 10자리 법정동과 단지코드를 보존한다', () => {
  const parsed = parseKaptApartmentList(KAPT_LIST_SAMPLE, '5011013700')
  assert.ok(parsed)
  assert.equal(parsed.pageNo, 1)
  assert.equal(parsed.totalCount, 2)
  assert.equal(parsed.items[0].kaptCode, 'A10027875')
  assert.equal(parsed.items[0].bjdCode, '5011013700')
})

test('K-apt 기본정보는 kaptdaCnt만 공식 세대수로 사용한다', () => {
  const parsed = parseKaptApartmentBasic(KAPT_BASIC_SAMPLE, 'A10027875')
  assert.ok(parsed)
  assert.equal(parsed.households, 480)
  assert.equal(parsed.units, 500)
  assert.equal(parsed.buildingCount, 4)
  assert.equal((parsed as unknown as Record<string, unknown>).population, undefined)
})

test('K-apt 수집기는 법정동의 전체 단지 기본정보를 합산하되 500m 값은 만들지 않는다', async () => {
  const requestedUrls: string[] = []
  const fetchImpl: typeof fetch = async input => {
    const url = String(input)
    requestedUrls.push(url)
    if (url.includes('/AptListService4/getLegaldongAptList4')) {
      return new Response(JSON.stringify(KAPT_LIST_SAMPLE), { status: 200 })
    }
    if (url.includes('kaptCode=A10027875')) {
      return new Response(JSON.stringify(KAPT_BASIC_SAMPLE), { status: 200 })
    }
    if (url.includes('kaptCode=A10027876')) {
      return new Response(JSON.stringify({
        ...KAPT_BASIC_SAMPLE,
        body: { item: { ...KAPT_BASIC_SAMPLE.body.item, kaptCode: 'A10027876', kaptName: '연동그린', kaptdaCnt: '320' } },
      }), { status: 200 })
    }
    return new Response('{}', { status: 404 })
  }

  const results = await collectPublicDataLayers(
    {
      address: '제주특별자치도 제주시 연동', lat: 33.48, lng: 126.49,
      sidoName: '제주특별자치도', sigunguName: '제주시', sigunguCode: '50110', bjdongCode: '13700',
    },
    {
      seoulOpenApiKey: null, dataGoKrKey: null,
      kaptListApiKey: 'list-key', kaptBasicApiKey: 'basic-key', fetchImpl,
    },
  )

  const result = results.find(item => item.layerId === 'kapt_apartment_households')
  assert.equal(result?.status, 'available')
  const value = result?.value as Record<string, any>
  assert.equal(value.bjdCode, '5011013700')
  assert.equal(value.complexCount, 2)
  assert.equal(value.totalHouseholds, 800)
  assert.equal(value.provenance.spatial_unit, '법정동 내 K-apt 등록 공동주택')
  assert.equal(value.radiusMeters, undefined)
  assert.equal(value.estimatedPopulation, undefined)
  assert.ok(requestedUrls.some(url => url.includes('bjdCode=5011013700')))
  assert.equal(requestedUrls.filter(url => url.includes('/getAphusBassInfoV5')).length, 2)
})

test('K-apt 목록은 totalCount까지 모든 페이지를 조회한 뒤 합산한다', async () => {
  const requestedListPages: string[] = []
  const fetchImpl: typeof fetch = async input => {
    const url = new URL(String(input))
    if (url.pathname.includes('/AptListService4/getLegaldongAptList4')) {
      const pageNo = url.searchParams.get('pageNo') ?? ''
      requestedListPages.push(pageNo)
      const item = pageNo === '1' ? KAPT_LIST_SAMPLE.body.items[0] : KAPT_LIST_SAMPLE.body.items[1]
      return new Response(JSON.stringify({
        header: KAPT_LIST_SAMPLE.header,
        body: { items: [item], numOfRows: '1', pageNo, totalCount: '2' },
      }), { status: 200 })
    }
    const kaptCode = url.searchParams.get('kaptCode') ?? ''
    const households = kaptCode === 'A10027875' ? '480' : '320'
    return new Response(JSON.stringify({
      ...KAPT_BASIC_SAMPLE,
      body: { item: { ...KAPT_BASIC_SAMPLE.body.item, kaptCode, kaptName: kaptCode === 'A10027875' ? '연동센트럴' : '연동그린', kaptdaCnt: households } },
    }), { status: 200 })
  }

  const results = await collectPublicDataLayers(
    {
      address: '제주특별자치도 제주시 연동', lat: 33.48, lng: 126.49,
      sigunguCode: '50110', bjdongCode: '13700',
    },
    {
      seoulOpenApiKey: null, dataGoKrKey: null,
      kaptListApiKey: 'list-key', kaptBasicApiKey: 'basic-key', fetchImpl,
    },
  )

  const result = results.find(item => item.layerId === 'kapt_apartment_households')
  assert.deepEqual(requestedListPages, ['1', '2'])
  assert.equal(result?.status, 'available')
  assert.equal((result?.value as Record<string, unknown>).totalHouseholds, 800)
})

test('K-apt 목록 중간 페이지가 비면 부분 합계를 폐기한다', async () => {
  const fetchImpl: typeof fetch = async input => {
    const url = new URL(String(input))
    const pageNo = url.searchParams.get('pageNo') ?? '1'
    if (pageNo === '1') {
      return new Response(JSON.stringify({
        header: KAPT_LIST_SAMPLE.header,
        body: { items: [KAPT_LIST_SAMPLE.body.items[0]], numOfRows: '1', pageNo: '1', totalCount: '2' },
      }), { status: 200 })
    }
    return new Response(JSON.stringify({
      header: KAPT_LIST_SAMPLE.header,
      body: { items: [], numOfRows: '1', pageNo: '2', totalCount: '2' },
    }), { status: 200 })
  }

  const results = await collectPublicDataLayers(
    { address: '제주특별자치도 제주시 연동', lat: null, lng: null, sigunguCode: '50110', bjdongCode: '13700' },
    {
      seoulOpenApiKey: null, dataGoKrKey: null,
      kaptListApiKey: 'list-key', kaptBasicApiKey: 'basic-key', fetchImpl,
    },
  )

  const result = results.find(item => item.layerId === 'kapt_apartment_households')
  assert.equal(result?.status, 'failed')
  assert.equal(result?.value, null)
})

test('K-apt 전용 키가 미등록 오류를 받으면 포털 공통 인증키로 재시도한다', async () => {
  // 공공데이터포털은 계정당 하나의 인증키를 모든 승인 서비스에 공통 사용한다.
  // 전용 환경변수에 다른 서비스의 키가 들어가면 승인 상태와 무관하게 403이 반환되므로,
  // 미등록 오류일 때만 이미 검증된 포털 공통 키로 한 번 재시도한다.
  const usedKeys: string[] = []
  const fetchImpl: typeof fetch = async input => {
    const url = new URL(String(input))
    const key = url.searchParams.get('serviceKey') ?? ''
    if (url.pathname.endsWith('getLegaldongAptList4')) usedKeys.push(key)
    if (key === 'wrong-kapt-key') {
      return new Response(JSON.stringify({
        OpenAPI_ServiceResponse: {
          cmmMsgHeader: {
            errMsg: 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR',
            returnAuthMsg: '등록되지 않은 서비스키',
            returnReasonCode: '30',
          },
        },
      }), { status: 403 })
    }
    if (url.pathname.endsWith('getLegaldongAptList4')) {
      return new Response(JSON.stringify({
        header: KAPT_LIST_SAMPLE.header,
        body: { items: [KAPT_LIST_SAMPLE.body.items[0]], numOfRows: '100', pageNo: '1', totalCount: '1' },
      }), { status: 200 })
    }
    return new Response(JSON.stringify(KAPT_BASIC_SAMPLE), { status: 200 })
  }

  const results = await collectPublicDataLayers(
    { address: '제주특별자치도 제주시 연동', lat: null, lng: null, sigunguCode: '50110', bjdongCode: '13700' },
    {
      seoulOpenApiKey: null,
      dataGoKrKey: 'portal-common-key',
      kaptListApiKey: 'wrong-kapt-key',
      kaptBasicApiKey: 'wrong-kapt-key',
      fetchImpl,
    },
  )

  const result = results.find(item => item.layerId === 'kapt_apartment_households')
  assert.deepEqual(usedKeys, ['wrong-kapt-key', 'portal-common-key'])
  assert.equal(result?.status, 'available')
  assert.equal((result?.value as Record<string, unknown>).totalHouseholds, 480)
})

test('K-apt 키 후보가 모두 미등록이면 실패로 닫고 합계를 만들지 않는다', async () => {
  const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({
    OpenAPI_ServiceResponse: {
      cmmMsgHeader: {
        errMsg: 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR',
        returnAuthMsg: '등록되지 않은 서비스키',
        returnReasonCode: '30',
      },
    },
  }), { status: 403 })

  const results = await collectPublicDataLayers(
    { address: '제주특별자치도 제주시 연동', lat: null, lng: null, sigunguCode: '50110', bjdongCode: '13700' },
    {
      seoulOpenApiKey: null,
      dataGoKrKey: 'portal-common-key',
      kaptListApiKey: 'wrong-kapt-key',
      kaptBasicApiKey: 'wrong-kapt-key',
      fetchImpl,
    },
  )

  const result = results.find(item => item.layerId === 'kapt_apartment_households')
  assert.equal(result?.status, 'failed')
  assert.equal(result?.value, null)
})

test('K-apt 요청이 응답하지 않아도 수집 전체가 제한시간 안에 실패로 끝난다', async () => {
  const fetchImpl: typeof fetch = async () => new Promise<Response>(() => {})
  const collection = collectPublicDataLayers(
    { address: '제주특별자치도 제주시 연동', lat: null, lng: null, sigunguCode: '50110', bjdongCode: '13700' },
    {
      seoulOpenApiKey: null, dataGoKrKey: null,
      kaptListApiKey: 'list-key', kaptBasicApiKey: 'basic-key', kaptRequestTimeoutMs: 20, fetchImpl,
    },
  )

  const outcome = await Promise.race([
    collection,
    new Promise<'still-pending'>(resolve => setTimeout(() => resolve('still-pending'), 100)),
  ])
  assert.notEqual(outcome, 'still-pending')
  assert.ok(Array.isArray(outcome))
  const result = outcome.find(item => item.layerId === 'kapt_apartment_households')
  assert.equal(result?.status, 'failed')
})

test('K-apt 응답 헤더 뒤 본문이 끝나지 않아도 제한시간 안에 실패로 끝난다', async () => {
  const fetchImpl: typeof fetch = async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"header":'))
    },
  }), { status: 200, headers: { 'content-type': 'application/json' } })
  const collection = collectPublicDataLayers(
    { address: '제주특별자치도 제주시 연동', lat: null, lng: null, sigunguCode: '50110', bjdongCode: '13700' },
    {
      seoulOpenApiKey: null, dataGoKrKey: null,
      kaptListApiKey: 'list-key', kaptBasicApiKey: 'basic-key', kaptRequestTimeoutMs: 20, fetchImpl,
    },
  )

  const outcome = await Promise.race([
    collection,
    new Promise<'still-pending'>(resolve => setTimeout(() => resolve('still-pending'), 100)),
  ])
  assert.notEqual(outcome, 'still-pending')
  assert.ok(Array.isArray(outcome))
  const result = outcome.find(item => item.layerId === 'kapt_apartment_households')
  assert.equal(result?.status, 'failed')
})

test('K-apt 기본정보가 하나라도 실패하면 부분 세대수 합계를 사용하지 않는다', async () => {
  const fetchImpl: typeof fetch = async input => {
    const url = String(input)
    if (url.includes('/AptListService4/getLegaldongAptList4')) {
      return new Response(JSON.stringify(KAPT_LIST_SAMPLE), { status: 200 })
    }
    if (url.includes('kaptCode=A10027875')) {
      return new Response(JSON.stringify(KAPT_BASIC_SAMPLE), { status: 200 })
    }
    return new Response('{}', { status: 503 })
  }

  const results = await collectPublicDataLayers(
    {
      address: '제주특별자치도 제주시 연동', lat: 33.48, lng: 126.49,
      sidoName: '제주특별자치도', sigunguName: '제주시', sigunguCode: '50110', bjdongCode: '13700',
    },
    {
      seoulOpenApiKey: null, dataGoKrKey: null,
      kaptListApiKey: 'list-key', kaptBasicApiKey: 'basic-key', fetchImpl,
    },
  )

  const result = results.find(item => item.layerId === 'kapt_apartment_households')
  assert.equal(result?.status, 'failed')
  assert.equal(result?.value, null)
})

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

const LOCAL_CURRENCY_V1_SAMPLE = {
  currentCount: 3,
  matchCount: 3,
  page: 1,
  perPage: 1000,
  totalCount: 3,
  data: [
    {
      crtr_ym: '202607',
      usage_rgn_cd: '26350',
      ksic: 'I56111',
      ksic_nm: '한식 음식점업',
      par_gend: 'M',
      par_ag: '03',
      stlm_nocs: 120,
      stlm_amt: 3400000,
      emd_cd: '26350105',
      emd_nm: '우동',
    },
    {
      crtr_ym: '202607',
      usage_rgn_cd: '26350',
      ksic: 'I56111',
      ksic_nm: '한식 음식점업',
      par_gend: 'F',
      par_ag: '03',
      stlm_nocs: 80,
      stlm_amt: 2600000,
      emd_cd: '26350105',
      emd_nm: '우동',
    },
    {
      crtr_ym: '202607',
      usage_rgn_cd: '26350',
      ksic: 'G47122',
      ksic_nm: '체인화 편의점',
      par_gend: 'F',
      par_ag: '04',
      stlm_nocs: 50,
      stlm_amt: 1000000,
      emd_cd: '26350105',
      emd_nm: '우동',
    },
  ],
}

test('지역화폐 v1 응답은 같은 업종의 성별·연령 행을 하나로 합산한다', () => {
  const parsed = parseLocalCurrencySpending(LOCAL_CURRENCY_V1_SAMPLE, {
    sido: '부산광역시',
    sigungu: '해운대구',
  })

  assert.ok(parsed)
  assert.equal(parsed.region, '부산광역시 해운대구 우동')
  assert.equal(parsed.categories.length, 2)
  assert.deepEqual(parsed.categories[0], {
    industry: '한식 음식점업',
    settlementAmount: 6000000,
    settlementCount: 200,
  })
  assert.equal(parsed.totalAmount, 7000000)
  assert.equal(parsed.provenance.source_as_of, '202607')
})

test('지역화폐 수집기는 신청한 v1 endpoint와 법정동 코드 파라미터를 사용한다', async () => {
  const requested: URL[] = []
  const env: CollectorEnv = {
    seoulOpenApiKey: null,
    dataGoKrKey: 'decoded-key',
    fetchImpl: async input => {
      const url = new URL(String(input))
      requested.push(url)
      return new Response(JSON.stringify(LOCAL_CURRENCY_V1_SAMPLE), { status: 200 })
    },
  }

  const results = await collectPublicDataLayers(
    {
      address: '부산광역시 해운대구 우동',
      lat: 35.16,
      lng: 129.16,
      sigunguCode: '26350',
      bjdongCode: '10500',
    },
    env,
  )

  assert.equal(requested.length, 1)
  assert.equal(requested[0].pathname, '/B190001/localGiftsKsciPaymentV1/paymentsV1')
  assert.equal(requested[0].searchParams.get('page'), '1')
  assert.equal(requested[0].searchParams.get('perPage'), '1000')
  assert.equal(requested[0].searchParams.get('returnType'), 'JSON')
  assert.equal(requested[0].searchParams.get('cond[usage_rgn_cd::EQ]'), '26350')
  assert.equal(requested[0].searchParams.get('cond[emd_cd::EQ]'), '26350105')
  assert.equal(results.find(result => result.layerId === 'local_currency_spending')?.status, 'available')
})

test('지역화폐 인증키는 인코딩 키를 받아도 한 번만 인코딩한다', async () => {
  const requested: URL[] = []
  await collectPublicDataLayers(
    {
      address: '부산광역시 해운대구 우동',
      lat: 35.16,
      lng: 129.16,
      sigunguCode: '26350',
      bjdongCode: '10500',
    },
    {
      seoulOpenApiKey: null,
      dataGoKrKey: 'abc%2Bdef%3D',
      fetchImpl: async input => {
        requested.push(new URL(String(input)))
        return new Response(JSON.stringify(LOCAL_CURRENCY_V1_SAMPLE), { status: 200 })
      },
    },
  )

  assert.equal(requested[0].searchParams.get('serviceKey'), 'abc+def=')
  assert.ok(!requested[0].search.includes('%252B'), '인코딩 키를 URLSearchParams가 다시 인코딩하면 인증이 깨진다')
})

test('지역화폐는 읍면동 코드가 없으면 시군구 합계를 특정 동 값처럼 수집하지 않는다', async () => {
  let called = false
  const results = await collectPublicDataLayers(
    {
      address: '부산광역시 해운대구 우동',
      lat: 35.16,
      lng: 129.16,
      sigunguCode: '26350',
      bjdongCode: null,
    },
    {
      seoulOpenApiKey: null,
      dataGoKrKey: 'decoded-key',
      fetchImpl: async () => {
        called = true
        return new Response(JSON.stringify(LOCAL_CURRENCY_V1_SAMPLE), { status: 200 })
      },
    },
  )

  assert.equal(called, false)
  assert.equal(results.find(result => result.layerId === 'local_currency_spending')?.status, 'empty')
})

test('지역화폐는 totalCount까지 후속 페이지를 모두 합친 뒤 집계한다', async () => {
  const pages: number[] = []
  const firstPage = {
    ...LOCAL_CURRENCY_V1_SAMPLE,
    currentCount: 2,
    matchCount: 3,
    totalCount: 3,
    data: LOCAL_CURRENCY_V1_SAMPLE.data.slice(0, 2),
  }
  const secondPage = {
    ...LOCAL_CURRENCY_V1_SAMPLE,
    currentCount: 1,
    matchCount: 3,
    page: 2,
    totalCount: 3,
    data: LOCAL_CURRENCY_V1_SAMPLE.data.slice(2),
  }

  const results = await collectPublicDataLayers(
    {
      address: '부산광역시 해운대구 우동',
      lat: 35.16,
      lng: 129.16,
      sigunguCode: '26350',
      bjdongCode: '10500',
    },
    {
      seoulOpenApiKey: null,
      dataGoKrKey: 'decoded-key',
      fetchImpl: async input => {
        const page = Number(new URL(String(input)).searchParams.get('page'))
        pages.push(page)
        return new Response(JSON.stringify(page === 1 ? firstPage : secondPage), { status: 200 })
      },
    },
  )

  assert.deepEqual(pages, [1, 2])
  const value = results.find(result => result.layerId === 'local_currency_spending')?.value as {
    categories: Array<{ industry: string }>
    totalAmount: number
  }
  assert.equal(value.categories.length, 2)
  assert.equal(value.totalAmount, 7000000)
})

test('지역화폐 v1 응답에 페이지 메타데이터가 없으면 부분값을 사용하지 않는다', async () => {
  const missingMetadata: Record<string, unknown> = { ...LOCAL_CURRENCY_V1_SAMPLE }
  delete missingMetadata.currentCount
  delete missingMetadata.matchCount
  delete missingMetadata.page

  const results = await collectPublicDataLayers(
    {
      address: '부산광역시 해운대구 우동',
      lat: 35.16,
      lng: 129.16,
      sigunguCode: '26350',
      bjdongCode: '10500',
    },
    {
      seoulOpenApiKey: null,
      dataGoKrKey: 'decoded-key',
      fetchImpl: async () => new Response(JSON.stringify(missingMetadata), { status: 200 }),
    },
  )

  assert.equal(results.find(result => result.layerId === 'local_currency_spending')?.status, 'failed')
})

test('지역화폐 서버가 같은 페이지를 반복하면 중복 합계를 저장하지 않는다', async () => {
  const pages: number[] = []
  const repeatedFirstPage = {
    ...LOCAL_CURRENCY_V1_SAMPLE,
    currentCount: 2,
    matchCount: 4,
    page: 1,
    data: LOCAL_CURRENCY_V1_SAMPLE.data.slice(0, 2),
  }

  const results = await collectPublicDataLayers(
    {
      address: '부산광역시 해운대구 우동',
      lat: 35.16,
      lng: 129.16,
      sigunguCode: '26350',
      bjdongCode: '10500',
    },
    {
      seoulOpenApiKey: null,
      dataGoKrKey: 'decoded-key',
      fetchImpl: async input => {
        pages.push(Number(new URL(String(input)).searchParams.get('page')))
        return new Response(JSON.stringify(repeatedFirstPage), { status: 200 })
      },
    },
  )

  assert.deepEqual(pages, [1, 2])
  assert.equal(results.find(result => result.layerId === 'local_currency_spending')?.status, 'failed')
})

test('지역화폐 서버가 페이지 번호만 바꿔 같은 데이터를 반복하면 중복 합계를 저장하지 않는다', async () => {
  const pages: number[] = []
  const repeatedData = LOCAL_CURRENCY_V1_SAMPLE.data.slice(0, 2)

  const results = await collectPublicDataLayers(
    {
      address: '부산광역시 해운대구 우동',
      lat: 35.16,
      lng: 129.16,
      sigunguCode: '26350',
      bjdongCode: '10500',
    },
    {
      seoulOpenApiKey: null,
      dataGoKrKey: 'decoded-key',
      fetchImpl: async input => {
        const page = Number(new URL(String(input)).searchParams.get('page'))
        pages.push(page)
        return new Response(JSON.stringify({
          ...LOCAL_CURRENCY_V1_SAMPLE,
          currentCount: 2,
          matchCount: 4,
          page,
          data: repeatedData,
        }), { status: 200 })
      },
    },
  )

  assert.deepEqual(pages, [1, 2])
  assert.equal(results.find(result => result.layerId === 'local_currency_spending')?.status, 'failed')
})

test('지역화폐 v1 응답의 법정동 코드가 요청 지역과 다르면 값을 버린다', async () => {
  const mismatched = {
    ...LOCAL_CURRENCY_V1_SAMPLE,
    data: LOCAL_CURRENCY_V1_SAMPLE.data.map(item => ({
      ...item,
      usage_rgn_cd: '26110',
      emd_cd: '26110101',
      emd_nm: '중앙동',
    })),
  }
  const results = await collectPublicDataLayers(
    {
      address: '부산광역시 해운대구 우동',
      lat: 35.16,
      lng: 129.16,
      sigunguCode: '26350',
      bjdongCode: '10500',
    },
    {
      seoulOpenApiKey: null,
      dataGoKrKey: 'decoded-key',
      fetchImpl: async () => new Response(JSON.stringify(mismatched), { status: 200 }),
    },
  )

  assert.equal(results.find(result => result.layerId === 'local_currency_spending')?.status, 'empty')
})

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
