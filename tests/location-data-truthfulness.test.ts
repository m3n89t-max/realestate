import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildFacilityHeatPoints,
  describeBarrierStatus,
  getPopulationEstimate,
  hasDisplayableMetric,
} from '../src/lib/location-data-truthfulness'

const readProjectFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test('상권등급은 거주인구 추정값을 바꾸지 않는다', () => {
  const estimate = getPopulationEstimate({
    radius_500m_estimated: 1_000,
    commercial_grade: 'S',
    adm_level: '읍면동',
    source_year: '2023',
  })

  assert.equal(estimate?.value, 1_000)
  assert.equal(estimate?.title, '매물 주변 500m 거주인구')
  assert.match(estimate?.description ?? '', /행정구역 평균 인구밀도/)
  assert.match(estimate?.sourceLabel ?? '', /2023년 · 읍면동 통계/)
})

test('시설 히트포인트는 이름과 좌표가 같은 장소를 한 번만 포함한다', () => {
  const points = buildFacilityHeatPoints(
    {
      cafe: [{ name: '해변카페', distance_m: 120, lat: 33.1, lng: 126.1 }],
    },
    {
      radius_m: 500,
      collected_at: '2026-09-29T00:00:00Z',
      categories: {
        CE7: {
          label: '카페',
          total_count: 1,
          items: [{ name: '해변카페', address: '제주시', distance_m: 120, lat: 33.1, lng: 126.1 }],
        },
      },
    },
  )

  assert.equal(points.length, 1)
  assert.equal(points[0]?.name, '해변카페')
})

test('출처와 기준시점이 없는 유동인구·매출은 표시하지 않는다', () => {
  assert.equal(hasDisplayableMetric({ weekday: 10_000 }), false)
  assert.equal(hasDisplayableMetric({
    weekday: 10_000,
    provenance: {
      source: '부산광역시',
      metric_semantics: 'estimated',
      source_as_of: '2025-12',
    },
  }), true)
})

test('장벽 미수집과 조회 결과 없음은 서로 다르게 설명한다', () => {
  assert.equal(describeBarrierStatus({ barrier_status: 'failed' }), '장벽 자료를 확인하지 못했습니다.')
  assert.equal(describeBarrierStatus({ barrier_status: 'available', barrier_names: [] }), '조회 범위에서 주요 장벽이 확인되지 않았습니다.')
})

test('인구 자료가 없는 매물에서도 표시 헬퍼가 죽지 않는다', () => {
  // population_data는 수집 전 매물에서 null이다. 여기서 던지면 입지분석 페이지 전체가
  // 'This page couldn\'t load'로 죽는다(실제 장애: Cannot read properties of null (reading 'barrier_status')).
  for (const empty of [null, undefined]) {
    assert.equal(describeBarrierStatus(empty as never), null)
    assert.equal(getPopulationEstimate(empty as never), null)
  }
})

test('제품 화면은 오해를 부르는 입지분석 문구를 사용하지 않는다', () => {
  const surfaces = [
    readProjectFile('src/components/KakaoMap.tsx'),
    readProjectFile('src/app/(dashboard)/projects/[id]/components/AnalysisTab.tsx'),
  ].join('\n')

  assert.doesNotMatch(surfaces, /유효 배후인구/)
  assert.doesNotMatch(surfaces, /유동인구 히트맵/)
  assert.doesNotMatch(surfaces, /카드 사용량 기반 유동인구 추정 \(전국 적용\)/)
})

test('SGIS 진단 API는 운영 환경에서 공개되지 않는다', () => {
  const source = readProjectFile('src/app/api/test-sgis/route.ts')
  assert.match(source, /process\.env\.NODE_ENV === 'production'/)
  assert.match(source, /status:\s*404/)
})
