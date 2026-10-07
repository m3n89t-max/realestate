import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import {
  MAP_DATA_LAYER_DEFINITIONS,
  buildMapDataLayerOptions,
} from '../src/lib/map-data-layer-controls'

test('지도 레이어는 모든 입지정보 범주를 한 곳에서 제공한다', () => {
  assert.deepEqual(
    MAP_DATA_LAYER_DEFINITIONS.map(layer => layer.id),
    ['facilities', 'population', 'activity', 'spending', 'land'],
  )
  for (const layer of MAP_DATA_LAYER_DEFINITIONS) {
    assert.ok(layer.label)
    assert.ok(layer.description)
    assert.ok(layer.scopeLabel)
    assert.ok(layer.sourceLabel)
  }
})

test('수집된 데이터가 없는 레이어는 숨기지 않고 준비 상태로 구분한다', () => {
  const options = buildMapDataLayerOptions({
    facilities: true,
    population: false,
    activity: true,
    spending: false,
  })

  assert.equal(options.find(layer => layer.id === 'facilities')?.available, true)
  assert.equal(options.find(layer => layer.id === 'population')?.available, false)
  assert.equal(options.find(layer => layer.id === 'activity')?.available, true)
  assert.equal(options.find(layer => layer.id === 'spending')?.available, false)
  assert.equal(options.find(layer => layer.id === 'land')?.available, true)
})

test('매물 상세 지도는 한 번에 한 레이어만 선택하는 접근 가능한 컨트롤을 제공한다', () => {
  const source = readFileSync(path.join(process.cwd(), 'src/components/KakaoMap.tsx'), 'utf8')

  assert.match(source, /aria-label="지도 정보 레이어"/)
  assert.match(source, /aria-pressed=/)
  assert.match(source, /buildMapDataLayerOptions/)
  assert.match(source, /activeLayer === 'population'/)
  assert.match(source, /activeLayer === 'activity'/)
  assert.match(source, /activeLayer === 'spending'/)
  assert.match(source, /activeLayer === 'land'/)
})

test('행정구역 소비 통계는 매물 지점의 값이 아니라고 지도에 명시한다', () => {
  const source = readFileSync(path.join(process.cwd(), 'src/components/KakaoMap.tsx'), 'utf8')
  assert.match(source, /행정구역 통계 · 매물 지점 값 아님/)
})

test('모바일 지도에서 인구 정보 카드와 공통 설명 카드를 겹쳐 표시하지 않는다', () => {
  const source = readFileSync(path.join(process.cwd(), 'src/components/KakaoMap.tsx'), 'utf8')
  assert.match(source, /activeLayerOption && activeLayer !== 'population'/)
  assert.match(source, /text-\[10px\] text-gray-600">범위: \{activeLayerOption\.scopeLabel\}/)
})

test('카카오지도 링크는 하단 레이어 선택 영역을 가리지 않는다', () => {
  const source = readFileSync(
    path.join(process.cwd(), 'src/app/(dashboard)/projects/[id]/components/AnalysisTab.tsx'),
    'utf8',
  )
  const linkStart = source.indexOf('https://map.kakao.com/link/map/')
  const linkEnd = source.indexOf('</a>', linkStart)
  const linkSource = source.slice(linkStart, linkEnd)
  assert.ok(linkStart >= 0)
  assert.doesNotMatch(linkSource, /absolute bottom-2 right-2/)
})

test('하단 레이어 선택 영역은 카카오 지도 로고와 저작권 영역을 가리지 않는다', () => {
  const source = readFileSync(path.join(process.cwd(), 'src/components/KakaoMap.tsx'), 'utf8')
  assert.match(source, /absolute bottom-10 left-2 right-2/)
})

test('유동 레이어는 임의의 300m 원을 만들거나 소비 레이어의 대체값으로 섞이지 않는다', () => {
  const source = readFileSync(path.join(process.cwd(), 'src/components/KakaoMap.tsx'), 'utf8')
  assert.doesNotMatch(source, /const flRadius = 300/)
  assert.doesNotMatch(source, /cardNoDataRef/)
  assert.match(source, /제공기관 집계 범위/)
})
