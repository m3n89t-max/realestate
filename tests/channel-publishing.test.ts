import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CHANNELS,
  CHANNEL_STATUSES,
  buildChannelListing,
  checkChannelReadiness,
  summarizeChannelReadiness,
  type ChannelListingInput,
} from '../src/lib/channel-publishing'

const FULL: ChannelListingInput = {
  address: '제주시 연동 123',
  propertyTypeLabel: '아파트',
  transactionTypeLabel: '매매',
  priceText: '5억원',
  areaText: '84.95㎡',
  features: ['역세권', '신축'],
  photoCount: 6,
  blogBody: '본문입니다. '.repeat(20),
  cardNewsTitle: '연동 신축 아파트',
}

test('채널 목록은 조사 문서의 다섯 채널을 모두 포함한다', () => {
  assert.equal(CHANNELS.length, 5)
  const names = CHANNELS.map((channel) => channel.name)
  for (const expected of ['네이버부동산', '직방', '다방', '지역 오일장', '교차로']) {
    assert.ok(names.includes(expected), `채널 누락: ${expected}`)
  }
})

test('모든 채널 상태는 명세의 허용값만 쓴다', () => {
  for (const channel of CHANNELS) {
    assert.ok(CHANNEL_STATUSES.includes(channel.status), `명세 밖 상태값: ${channel.status}`)
  }
})

test('공개 등록 API가 확인되지 않았으므로 자동 전송 채널은 한 곳도 없다', () => {
  for (const channel of CHANNELS) {
    assert.notEqual(channel.status, 'API 직접등록', `${channel.name}에 자동 전송을 켜면 안 됩니다.`)
    assert.equal(channel.autoSubmit, false, `${channel.name}의 autoSubmit은 false여야 합니다.`)
  }
})

test('채널마다 공식 등록 경로와 오늘 할 일을 함께 제공한다', () => {
  for (const channel of CHANNELS) {
    assert.ok(channel.officialUrl.startsWith('https://'), `${channel.name} 공식 경로가 없습니다.`)
    assert.ok(channel.todo.length > 0, `${channel.name} 오늘 할 일이 비어 있습니다.`)
  }
})

test('필요한 사실값이 모두 있으면 준비 완료로 판정한다', () => {
  const naver = CHANNELS.find((channel) => channel.name === '네이버부동산')!
  const readiness = checkChannelReadiness(naver, FULL)

  assert.equal(readiness.ready, true)
  assert.deepEqual(readiness.missing, [])
})

test('가격이 비어 있으면 준비되지 않았다고 판정하고 무엇이 없는지 알려준다', () => {
  const naver = CHANNELS.find((channel) => channel.name === '네이버부동산')!
  const readiness = checkChannelReadiness(naver, { ...FULL, priceText: '' })

  assert.equal(readiness.ready, false)
  assert.ok(readiness.missing.some((item) => item.includes('가격')), `missing=${readiness.missing}`)
})

test('사진이 없으면 사진 부족을 알린다', () => {
  const naver = CHANNELS.find((channel) => channel.name === '네이버부동산')!
  const readiness = checkChannelReadiness(naver, { ...FULL, photoCount: 0 })

  assert.equal(readiness.ready, false)
  assert.ok(readiness.missing.some((item) => item.includes('사진')), `missing=${readiness.missing}`)
})

test('홍보 문구가 없으면 준비되지 않았다고 판정한다', () => {
  const naver = CHANNELS.find((channel) => channel.name === '네이버부동산')!
  const readiness = checkChannelReadiness(naver, { ...FULL, blogBody: '', cardNewsTitle: '' })

  assert.equal(readiness.ready, false)
  assert.ok(readiness.missing.some((item) => item.includes('문구')), `missing=${readiness.missing}`)
})

test('채널 등록 문구에는 입력한 사실값만 들어가고 없는 값은 아예 빠진다', () => {
  const naver = CHANNELS.find((channel) => channel.name === '네이버부동산')!
  const listing = buildChannelListing(naver, { ...FULL, priceText: '', areaText: '' })

  assert.ok(listing.includes('제주시 연동 123'))
  assert.ok(!listing.includes('undefined'), '빈 값이 undefined로 새면 안 됩니다.')
  assert.ok(!listing.includes('null'))
  assert.ok(!/가격:\s*$/m.test(listing), '빈 가격 줄을 남기면 안 됩니다.')
  assert.ok(!listing.includes('가격:'), '가격이 없으면 가격 줄 자체가 없어야 합니다.')
})

test('등록 문구는 보장 표현과 자동등록 표현을 쓰지 않는다', () => {
  for (const channel of CHANNELS) {
    const listing = buildChannelListing(channel, FULL)
    for (const phrase of ['자동 등록', '자동등록', '즉시 노출 보장', '수익 보장', '무조건', '원클릭']) {
      assert.ok(!listing.includes(phrase), `${channel.name} 문구에 금지 표현: ${phrase}`)
    }
  }
})

test('준비 현황 요약은 준비된 채널 수와 전체 수를 센다', () => {
  const summary = summarizeChannelReadiness(FULL)
  assert.equal(summary.total, CHANNELS.length)
  assert.equal(summary.ready, CHANNELS.length)

  const empty = summarizeChannelReadiness({ ...FULL, priceText: '', photoCount: 0, blogBody: '', cardNewsTitle: '' })
  assert.equal(empty.ready, 0)
  assert.equal(empty.total, CHANNELS.length)
})

test('채널 정의는 조사 문서의 제휴 필요 판정과 어긋나지 않는다', () => {
  const spec = readFileSync(join(process.cwd(), 'docs/jipporter-channel-integration.md'), 'utf8')
  // 조사 문서가 다섯 채널 모두 `제휴 필요`로 판정했으므로 직접 발행 채널이 있으면 안 된다.
  assert.equal((spec.match(/판정: (?:지역사별 )?`제휴 필요`/g) ?? []).length, 5)
  for (const channel of CHANNELS) {
    assert.equal(channel.status, '연동 필요', `${channel.name} 상태가 조사 판정과 어긋납니다.`)
  }
})

test('매물 상세에 채널 준비 탭이 연결돼 있다', () => {
  const page = readFileSync(join(process.cwd(), 'src/app/(dashboard)/projects/[id]/page.tsx'), 'utf8')
  assert.match(page, /id: 'channels'/, '채널 준비 탭이 TABS에 없습니다.')
  assert.match(page, /ChannelsTab/, '채널 준비 탭 컴포넌트가 연결되지 않았습니다.')
})

test('대시보드가 안내하는 채널 탭 경로와 실제 탭 id가 일치한다', () => {
  const flow = readFileSync(join(process.cwd(), 'src/lib/jipporter-flow.ts'), 'utf8')
  const publishHref = flow.match(/id: 'publish'[\s\S]*?href: '([^']+)'/)
  assert.ok(publishHref, 'publish 단계 경로를 찾지 못했습니다.')
  assert.match(publishHref[1], /tab=channels/)
})
