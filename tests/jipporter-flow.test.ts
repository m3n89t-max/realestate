import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  FLOW_STAGES,
  MINIMAL_ENTRY_FIELDS,
  describeStage,
  resolveProjectStage,
  summarizeFlow,
} from '../src/lib/jipporter-flow'

test('4단계 흐름은 한 번 입력 → 생성 → 검토 → 발행 준비 순서를 고정한다', () => {
  assert.equal(FLOW_STAGES.length, 4)
  assert.deepEqual(
    FLOW_STAGES.map((stage) => stage.id),
    ['input', 'generate', 'review', 'publish'],
  )
  assert.deepEqual(
    FLOW_STAGES.map((stage) => stage.number),
    ['01', '02', '03', '04'],
  )
  assert.equal(FLOW_STAGES[0].title, '한 번 입력')
  assert.equal(FLOW_STAGES[2].title, '중개사가 최종 검토')
  assert.equal(FLOW_STAGES[3].title, '채널별 발행 준비')

  for (const stage of FLOW_STAGES) {
    assert.ok(stage.description.length > 0, `${stage.id} 설명이 비어 있습니다.`)
    assert.ok(stage.nextAction.length > 0, `${stage.id} 다음 행동이 비어 있습니다.`)
    assert.ok(stage.href.startsWith('/'), `${stage.id} 이동 경로가 잘못됐습니다.`)
  }
})

test('최소 입력 항목은 주소·사진·특징 세 가지뿐이다', () => {
  assert.deepEqual(
    MINIMAL_ENTRY_FIELDS.map((field) => field.id),
    ['address', 'photos', 'features'],
  )
  assert.equal(MINIMAL_ENTRY_FIELDS.filter((field) => field.required).length, 1)
  assert.equal(MINIMAL_ENTRY_FIELDS[0].id, 'address')
  assert.equal(MINIMAL_ENTRY_FIELDS[0].required, true)
})

test('주소만 있는 매물은 입력 단계에 머문다', () => {
  const stage = resolveProjectStage({
    address: '제주시 연동 123',
    photoCount: 0,
    featureCount: 0,
    contentCount: 0,
    approvedContentCount: 0,
    preparedChannelCount: 0,
  })

  assert.equal(stage.id, 'input')
  assert.equal(stage.done, false)
  assert.match(stage.nextAction, /사진|특징/)
})

test('주소·사진·특징이 모두 있으면 생성 단계로 넘어간다', () => {
  const stage = resolveProjectStage({
    address: '제주시 연동 123',
    photoCount: 4,
    featureCount: 2,
    contentCount: 0,
    approvedContentCount: 0,
    preparedChannelCount: 0,
  })

  assert.equal(stage.id, 'generate')
  assert.equal(stage.done, false)
})

test('생성된 홍보물이 있으면 검토 단계, 검토가 끝나면 발행 준비 단계가 된다', () => {
  const review = resolveProjectStage({
    address: '제주시 연동 123',
    photoCount: 4,
    featureCount: 2,
    contentCount: 2,
    approvedContentCount: 0,
    preparedChannelCount: 0,
  })
  assert.equal(review.id, 'review')
  assert.match(review.nextAction, /검토|확인/)

  const publish = resolveProjectStage({
    address: '제주시 연동 123',
    photoCount: 4,
    featureCount: 2,
    contentCount: 2,
    approvedContentCount: 2,
    preparedChannelCount: 0,
  })
  assert.equal(publish.id, 'publish')
  assert.equal(publish.done, false)
})

test('채널 준비까지 끝나면 발행 준비 단계가 완료로 표시된다', () => {
  const stage = resolveProjectStage({
    address: '제주시 연동 123',
    photoCount: 4,
    featureCount: 2,
    contentCount: 2,
    approvedContentCount: 2,
    preparedChannelCount: 3,
  })

  assert.equal(stage.id, 'publish')
  assert.equal(stage.done, true)
})

test('주소가 없으면 입력 단계이며 주소를 먼저 요구한다', () => {
  const stage = resolveProjectStage({
    address: '',
    photoCount: 9,
    featureCount: 9,
    contentCount: 9,
    approvedContentCount: 9,
    preparedChannelCount: 9,
  })

  assert.equal(stage.id, 'input')
  assert.match(stage.nextAction, /주소/)
})

test('단계 설명은 번호와 제목을 함께 제공한다', () => {
  assert.equal(describeStage('review'), '03 중개사가 최종 검토')
  assert.equal(describeStage('input'), '01 한 번 입력')
})

test('흐름 요약은 단계별 매물 수를 집계한다', () => {
  const summary = summarizeFlow([
    { address: '가', photoCount: 0, featureCount: 0, contentCount: 0, approvedContentCount: 0, preparedChannelCount: 0 },
    { address: '나', photoCount: 2, featureCount: 1, contentCount: 0, approvedContentCount: 0, preparedChannelCount: 0 },
    { address: '다', photoCount: 2, featureCount: 1, contentCount: 1, approvedContentCount: 0, preparedChannelCount: 0 },
    { address: '라', photoCount: 2, featureCount: 1, contentCount: 1, approvedContentCount: 1, preparedChannelCount: 2 },
  ])

  assert.equal(summary.input, 1)
  assert.equal(summary.generate, 1)
  assert.equal(summary.review, 1)
  assert.equal(summary.publish, 1)
  assert.equal(summary.total, 4)
})

test('랜딩과 대시보드는 같은 단계 정의를 쓰고 문구를 중복 선언하지 않는다', () => {
  const landing = readFileSync(join(process.cwd(), 'src/app/page.tsx'), 'utf8')
  const dashboard = readFileSync(join(process.cwd(), 'src/app/(dashboard)/dashboard/page.tsx'), 'utf8')

  assert.match(landing, /jipporter-flow/, '랜딩이 공용 흐름 정의를 가져와야 합니다.')
  assert.match(dashboard, /jipporter-flow/, '대시보드가 공용 흐름 정의를 가져와야 합니다.')

  for (const source of [landing, dashboard]) {
    assert.ok(
      !/number: '01'/.test(source),
      '단계 문구를 화면에서 다시 선언하면 랜딩과 대시보드가 어긋납니다.',
    )
  }
})
