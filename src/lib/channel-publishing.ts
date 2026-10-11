/**
 * 채널별 발행 준비 정의.
 *
 * 근거: docs/jipporter-channel-integration.md (확인일 2026-10-11).
 * 조사 대상 다섯 채널 모두 공개 매물 등록 API가 확인되지 않아 `제휴 필요` 판정이다.
 * 따라서 어떤 채널도 자동 전송하지 않는다 — 문구·사진을 준비하고
 * 중개사가 공식 등록화면에서 직접 최종 제출한다.
 *
 * 서면 제휴가 완료된 채널만 status를 바꾸고 autoSubmit을 켠다.
 * 그때도 등록·수정·거래완료 삭제까지 실제 테스트를 통과해야 한다.
 */

export const CHANNEL_STATUSES = ['API 직접등록', '파일 다운로드', '문구 복사', '연동 필요', '지원 예정'] as const
export type ChannelStatus = typeof CHANNEL_STATUSES[number]

export interface Channel {
  id: string
  name: string
  status: ChannelStatus
  /** 중개사가 지금 당장 할 행동 */
  todo: string
  /** 왜 이 상태인지 */
  detail: string
  /** 공식 등록·문의 경로. 비공개 엔드포인트가 아니라 공개 안내 페이지다. */
  officialUrl: string
  /**
   * 자동 전송 여부. 전부 false다.
   * 공개 등록 API가 확인되지 않은 채널에 true를 넣으면 약관 위반이 된다.
   */
  autoSubmit: false
  /** 이 채널 등록화면이 요구하는 사실 항목 */
  requires: Array<'price' | 'area' | 'photos' | 'copy'>
}

export const CHANNELS: readonly Channel[] = [
  {
    id: 'naver',
    name: '네이버부동산',
    status: '연동 필요',
    todo: '문구를 복사하고 사진을 내려받아 공식 등록화면에서 직접 등록',
    detail: '등록·수정은 제휴 정보업체를 통해 처리합니다. 일반 중개사용 공개 등록 API는 확인되지 않았습니다.',
    officialUrl: 'https://help.naver.com/support/contents/contents.help?serviceNo=746&categoryNo=10388',
    autoSubmit: false,
    requires: ['price', 'area', 'photos', 'copy'],
  },
  {
    id: 'zigbang',
    name: '직방',
    status: '연동 필요',
    todo: '등록 자료를 내려받아 중개사 사이트 광고상품에서 직접 등록',
    detail: '일반 공인중개사는 중개사 사이트 광고상품으로 등록합니다. 제휴 문의는 partnership@zigbang.com.',
    officialUrl: 'https://www.zigbang.com/',
    autoSubmit: false,
    requires: ['price', 'area', 'photos', 'copy'],
  },
  {
    id: 'dabang',
    name: '다방',
    status: '연동 필요',
    todo: '다방프로 지정 양식에 맞춘 문구·사진을 내려받아 직접 등록',
    detail: '다방프로에서 공인중개사 회원이 지정 양식으로 등록합니다. 사업제휴 문의는 biz@station3.co.kr.',
    officialUrl: 'https://www.dabangapp.com/',
    autoSubmit: false,
    requires: ['price', 'photos', 'copy'],
  },
  {
    id: 'oilmarket',
    name: '지역 오일장',
    status: '연동 필요',
    todo: '오일장용 문구와 사진 묶음을 내려받아 회원 등록화면에서 직접 등록',
    detail: '회원용 등록화면은 있으나 공개 등록 API는 확인되지 않았습니다. 광고문의로 연동 여부를 확인해야 합니다.',
    officialUrl: 'https://www.jejuoiljang.com/',
    autoSubmit: false,
    requires: ['price', 'copy'],
  },
  {
    id: 'crossroad',
    name: '교차로',
    status: '연동 필요',
    todo: '지역사 공식 등록화면에 문구를 붙여 넣어 직접 등록',
    detail: '지역별 법인·상품·고객센터가 달라 한 곳의 승인이 전국 권한을 뜻하지 않습니다.',
    officialUrl: 'https://www.icross.co.kr/',
    autoSubmit: false,
    requires: ['copy'],
  },
] as const

export interface ChannelListingInput {
  address: string
  propertyTypeLabel: string
  transactionTypeLabel: string
  /** 비어 있으면 '미입력'이다. 0이나 임의값으로 채우지 않는다. */
  priceText: string
  areaText: string
  features: string[]
  photoCount: number
  /** 검토를 마친 블로그 본문 */
  blogBody: string
  /** 검토를 마친 카드뉴스 제목 */
  cardNewsTitle: string
}

export interface ChannelReadiness {
  ready: boolean
  /** 무엇이 없어서 준비가 안 됐는지. 사람이 읽는 문구다. */
  missing: string[]
}

const MIN_PHOTOS = 1

/**
 * 채널 등록화면에 넣을 사실값이 갖춰졌는지 본다.
 * 없는 값을 추정하지 않고, 없다고만 알린다.
 */
export function checkChannelReadiness(channel: Channel, input: ChannelListingInput): ChannelReadiness {
  const missing: string[] = []

  if (channel.requires.includes('price') && !input.priceText.trim()) {
    missing.push('가격 정보가 없습니다')
  }
  if (channel.requires.includes('area') && !input.areaText.trim()) {
    missing.push('면적 정보가 없습니다')
  }
  if (channel.requires.includes('photos') && input.photoCount < MIN_PHOTOS) {
    missing.push('사진이 없습니다')
  }
  if (channel.requires.includes('copy') && !input.blogBody.trim() && !input.cardNewsTitle.trim()) {
    missing.push('검토를 마친 홍보 문구가 없습니다')
  }

  return { ready: missing.length === 0, missing }
}

/**
 * 채널 등록화면에 붙여 넣을 문구를 만든다.
 * 입력된 사실값만 줄로 넣고, 없는 항목은 줄 자체를 만들지 않는다.
 */
export function buildChannelListing(channel: Channel, input: ChannelListingInput): string {
  const lines: string[] = []

  lines.push(`[${channel.name} 등록용]`)
  lines.push('')

  if (input.address.trim()) lines.push(`주소: ${input.address.trim()}`)
  if (input.propertyTypeLabel.trim()) lines.push(`종류: ${input.propertyTypeLabel.trim()}`)
  if (input.transactionTypeLabel.trim()) lines.push(`거래: ${input.transactionTypeLabel.trim()}`)
  if (input.priceText.trim()) lines.push(`가격: ${input.priceText.trim()}`)
  if (input.areaText.trim()) lines.push(`면적: ${input.areaText.trim()}`)

  const features = input.features.filter((feature) => feature.trim().length > 0)
  if (features.length > 0) lines.push(`특징: ${features.join(', ')}`)
  if (input.photoCount > 0) lines.push(`사진: ${input.photoCount}장`)

  const body = input.blogBody.trim() || input.cardNewsTitle.trim()
  if (body) {
    lines.push('')
    lines.push('[홍보 문구]')
    lines.push(body)
  }

  lines.push('')
  lines.push(`※ ${channel.name} 공식 등록화면에서 중개사가 내용을 확인한 뒤 제출하세요.`)

  return lines.join('\n')
}

export interface ChannelReadinessSummary {
  ready: number
  total: number
}

/** 전체 채널 중 몇 곳이 준비됐는지 센다. */
export function summarizeChannelReadiness(input: ChannelListingInput): ChannelReadinessSummary {
  let ready = 0
  for (const channel of CHANNELS) {
    if (checkChannelReadiness(channel, input).ready) ready += 1
  }
  return { ready, total: CHANNELS.length }
}
