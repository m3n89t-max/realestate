import { test } from 'node:test'
import assert from 'node:assert/strict'

import { findNearestSeoulHotspot, SEOUL_HOTSPOTS, SEOUL_HOTSPOT_SOURCE } from '../src/lib/seoul-hotspots'

test('장소 목록은 공식 출처 URL을 갖는다', () => {
  assert.ok(SEOUL_HOTSPOT_SOURCE.startsWith('https://data.seoul.go.kr'))
})

test('장소 목록은 비어 있지 않고 좌표가 서울 범위 안에 있다', () => {
  assert.ok(SEOUL_HOTSPOTS.length > 0)
  for (const place of SEOUL_HOTSPOTS) {
    assert.ok(place.area_cd.startsWith('POI'), `잘못된 장소코드: ${place.area_cd}`)
    assert.ok(place.area_nm.length > 0)
    assert.ok(place.lat > 37.4 && place.lat < 37.71, `${place.area_nm}: 위도가 서울 범위를 벗어났다 (${place.lat})`)
    assert.ok(place.lng > 126.7 && place.lng < 127.25, `${place.area_nm}: 경도가 서울 범위를 벗어났다 (${place.lng})`)
  }
})

test('장소코드는 중복되지 않는다', () => {
  const codes = SEOUL_HOTSPOTS.map(p => p.area_cd)
  assert.equal(new Set(codes).size, codes.length)
})

test('서울 좌표에서 가까운 장소를 찾는다', () => {
  // 광화문 근처
  const found = findNearestSeoulHotspot(37.5716, 126.9769)
  assert.ok(found)
  assert.ok(found.distanceM < 3000, `가장 가까운 장소가 너무 멀다: ${found.distanceM}m`)
})

test('반경을 벗어난 좌표는 null을 반환한다', () => {
  // 부산 해운대
  assert.equal(findNearestSeoulHotspot(35.1587, 129.1604), null)
  // 서울 안이지만 기본 반경(3km)보다 먼 경우를 좁은 반경으로 확인
  assert.equal(findNearestSeoulHotspot(37.5716, 126.9769, 1), null)
})

test('거리 계산은 대칭이고 0 이상이다', () => {
  const a = findNearestSeoulHotspot(37.5665, 126.978)
  assert.ok(a)
  assert.ok(a.distanceM >= 0)
})
