import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  PUBLIC_DATA_LAYERS,
  detectRegion,
  getApplicableLayers,
  describeLayerStatus,
  summarizeLayers,
  FORBIDDEN_LAYER_PHRASES,
  type PublicDataLayerResult,
} from '../src/lib/public-data-layers'

test('모든 레이어는 출처·의미·공간단위·라이선스를 갖춘다', () => {
  assert.ok(PUBLIC_DATA_LAYERS.length > 0)
  for (const layer of PUBLIC_DATA_LAYERS) {
    assert.ok(layer.id, '레이어 id가 필요하다')
    assert.ok(layer.label, `${layer.id}: 사용자 표시 이름이 필요하다`)
    assert.ok(layer.source, `${layer.id}: 제공기관이 필요하다`)
    assert.ok(layer.metricSemantics, `${layer.id}: 지표 의미가 필요하다`)
    assert.ok(layer.spatialUnit, `${layer.id}: 공간단위가 필요하다`)
    assert.ok(layer.license, `${layer.id}: 이용 라이선스가 필요하다`)
    assert.ok(layer.officialUrl.startsWith('https://'), `${layer.id}: 공식 URL이 필요하다`)
    assert.ok(layer.plainSentence.length > 0, `${layer.id}: 초보자용 한 문장 설명이 필요하다`)
  }
})

test('레이어 id는 중복되지 않는다', () => {
  const ids = PUBLIC_DATA_LAYERS.map(layer => layer.id)
  assert.equal(new Set(ids).size, ids.length)
})

test('사용자 표시 문장에 금지 문구가 등장하지 않는다', () => {
  for (const layer of PUBLIC_DATA_LAYERS) {
    const surfaces = [layer.label, layer.plainSentence, layer.method, layer.coverageNote ?? '']
    for (const surface of surfaces) {
      for (const phrase of FORBIDDEN_LAYER_PHRASES) {
        assert.ok(
          !surface.includes(phrase),
          `${layer.id}: 금지 문구 "${phrase}"가 "${surface}"에 포함됐다`,
        )
      }
    }
  }
})

test('지역화폐 레이어는 전체 카드매출로 표기되지 않는다', () => {
  const layer = PUBLIC_DATA_LAYERS.find(item => item.id === 'local_currency_spending')
  assert.ok(layer)
  assert.equal(layer.metricSemantics, 'local_currency')
  assert.ok(layer.label.includes('지역화폐'))
})

test('서울 상권 결제 레이어는 금액이 구간값임을 명시한다', () => {
  const layer = PUBLIC_DATA_LAYERS.find(item => item.id === 'seoul_realtime_commercial')
  assert.ok(layer)
  assert.ok(
    `${layer.method}${layer.coverageNote ?? ''}`.includes('구간'),
    '결제금액이 구간 마스킹임을 반드시 밝혀야 한다',
  )
})

test('주소에서 지역을 판별한다', () => {
  assert.equal(detectRegion('서울특별시 종로구 세종대로 110'), 'seoul')
  assert.equal(detectRegion('서울 마포구 월드컵북로 21'), 'seoul')
  assert.equal(detectRegion('부산광역시 해운대구 우동 1500'), 'busan')
  assert.equal(detectRegion('제주특별자치도 제주시 첨단로 242'), 'jeju')
  assert.equal(detectRegion('경기도 성남시 분당구 판교역로 235'), 'gyeonggi')
  assert.equal(detectRegion('대전광역시 서구 둔산로 100'), 'other')
  assert.equal(detectRegion(''), 'unknown')
})

test('도로명에 다른 지역명이 들어간 주소를 오분류하지 않는다', () => {
  // 전국에 실존하는 도로명 함정. 시도명은 선두에만 있어야 판별된다.
  assert.equal(detectRegion('경기도 부천시 부산로 12'), 'gyeonggi')
  assert.equal(detectRegion('울산광역시 남구 부산로 5'), 'other')
  assert.equal(detectRegion('경상남도 김해시 부산대로 100'), 'other')
  assert.equal(detectRegion('전라남도 목포시 제주로 3'), 'other')
  assert.equal(detectRegion('충청북도 청주시 경기대로 7'), 'other')
  assert.equal(detectRegion('서울특별시 중구 제주대로 1'), 'seoul')
  assert.equal(detectRegion('인천광역시 연수구 경기로 9'), 'other')
})

test('지역 전용 레이어는 다른 지역 매물에 붙지 않는다', () => {
  const busanLayers = getApplicableLayers('부산광역시 해운대구 우동').map(layer => layer.id)
  assert.ok(!busanLayers.includes('seoul_realtime_commercial'))
  assert.ok(!busanLayers.includes('jeju_floating_population'))
  assert.ok(busanLayers.includes('busan_living_population'))

  const seoulLayers = getApplicableLayers('서울특별시 강남구 역삼동').map(layer => layer.id)
  assert.ok(seoulLayers.includes('seoul_realtime_commercial'))
  assert.ok(!seoulLayers.includes('busan_living_population'))
})

test('전국 레이어는 모든 지역에 적용된다', () => {
  for (const address of ['서울특별시 중구', '부산광역시 중구', '전라남도 목포시', '강원특별자치도 춘천시']) {
    const ids = getApplicableLayers(address).map(layer => layer.id)
    assert.ok(ids.includes('local_currency_spending'), `${address}: 전국 레이어가 빠졌다`)
    assert.ok(ids.includes('sgis_resident_population'), `${address}: 전국 레이어가 빠졌다`)
  }
})

test('상태별 안내 문장이 서로 구분된다', () => {
  const sentences = new Set(
    (['available', 'not_collected', 'not_implemented', 'unsupported', 'unconfigured', 'failed', 'empty'] as const).map(
      status => describeLayerStatus(status),
    ),
  )
  assert.equal(sentences.size, 7, '각 상태는 서로 다른 문장을 가져야 한다')
})

test('미설정 안내에 환경변수 이름을 노출하지 않는다', () => {
  const message = describeLayerStatus('unconfigured')
  assert.ok(!/[A-Z_]{6,}/.test(message), `환경변수 이름이 노출됐다: ${message}`)
})

test('수집 실패와 결과 없음은 다른 문장을 만든다', () => {
  assert.notEqual(describeLayerStatus('failed'), describeLayerStatus('empty'))
})

test('요약은 사용 가능한 레이어와 준비 중 레이어를 분리한다', () => {
  const results: PublicDataLayerResult[] = [
    { layerId: 'sgis_resident_population', status: 'available', value: null, collectedAt: null, sourceAsOf: '2025' },
    { layerId: 'seoul_realtime_commercial', status: 'unconfigured', value: null, collectedAt: null, sourceAsOf: null },
    { layerId: 'local_currency_spending', status: 'failed', value: null, collectedAt: null, sourceAsOf: null },
    { layerId: 'busan_living_population', status: 'unsupported', value: null, collectedAt: null, sourceAsOf: null },
  ]
  const summary = summarizeLayers(results)
  assert.deepEqual(summary.available, ['sgis_resident_population'])
  assert.deepEqual(summary.pending, ['seoul_realtime_commercial'])
  assert.deepEqual(summary.failed, ['local_currency_spending'])
  assert.deepEqual(summary.unsupported, ['busan_living_population'])
})

test('값이 없는 레이어는 표시 대상이 아니다', () => {
  const summary = summarizeLayers([
    { layerId: 'seoul_realtime_commercial', status: 'available', value: null, collectedAt: null, sourceAsOf: null },
  ])
  assert.deepEqual(summary.available, [], '기준기간이 없으면 사용 가능으로 분류하지 않는다')
})
