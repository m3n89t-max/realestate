import { createCanvas, GlobalFonts, loadImage, type SKRSContext2D } from '@napi-rs/canvas'
import path from 'node:path'
import {
  assertRenderablePriceSource,
  formatPriceSourceLabel,
  PRICE_UNKNOWN_TEXT,
  type PriceSourceMeta,
} from './price-source'
import type { CardPlatform, CardSlideData, SpecGridItem } from './card-news-contract'

export const COLOR = {
  INK: '#141a36',
  PAPER: '#faf8f4',
  WHITE: '#ffffff',
  BRAND: '#186557',
  ACCENT: '#f59e0b',
  ACCENT_SOFT: '#fcd34d',
  LINE: '#e8eaf0',
  TEXT_MUTE: '#6b7280',
} as const

const PRESETS = {
  instagram: { width: 1080, height: 1080, margin: 72, captionSize: 26, featurePhotoHeight: 540, coverPhotoHeight: 713 },
  kakao: { width: 1080, height: 1080, margin: 64, captionSize: 30, featurePhotoHeight: 432, coverPhotoHeight: 626 },
} as const

export type PhotoFallbackReason = 'no_assets' | 'fetch_failed' | 'decode_failed' | 'too_small'

export interface CardRenderInput {
  card: Omit<CardSlideData, 'platform'> & { platform?: CardPlatform }
  platform: CardPlatform
  priceSource: PriceSourceMeta
  region?: string
  contact?: { officeName?: string; phone?: string; registrationNumber?: string; kakaoId?: string }
  photoBuffer?: Buffer
  photoFallbackReason?: PhotoFallbackReason
}

export interface CardRenderResult {
  png: Buffer
  layoutUsed: CardSlideData['layout'] | 'text_only'
  photoFallbackReason?: PhotoFallbackReason
  priceSourceLabel?: string
}

let fontsReady = false
function ensureFonts(): void {
  if (fontsReady) return
  const dir = path.join(process.cwd(), 'public', 'fonts')
  GlobalFonts.registerFromPath(path.join(dir, 'NanumGothic-Regular.ttf'), 'NanumGothic')
  GlobalFonts.registerFromPath(path.join(dir, 'NanumGothic-Bold.ttf'), 'NanumGothic Bold')
  GlobalFonts.registerFromPath(path.join(dir, 'NanumGothic-ExtraBold.ttf'), 'NanumGothic ExtraBold')
  fontsReady = true
}

const normalizeText = (value: unknown): string => String(value ?? '')
  .replace(/㎡/g, 'm²')
  .replace(/㎥/g, 'm³')
  .replace(/\r\n?/g, '\n')
  .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '')
  .replace(/[\p{Extended_Pictographic}\uFE0F]/gu, '')
  .replace(/[ \t]+/g, ' ')
  .replace(/\n{3,}/g, '\n\n')
  .trim()

function splitLongWord(ctx: SKRSContext2D, word: string, maxWidth: number): string[] {
  const chunks: string[] = []
  let current = ''
  for (const char of Array.from(word)) {
    const candidate = current + char
    if (current && ctx.measureText(candidate).width > maxWidth) {
      chunks.push(current)
      current = char
    } else {
      current = candidate
    }
  }
  if (current) chunks.push(current)
  return chunks
}

function ellipsize(ctx: SKRSContext2D, value: string, maxWidth: number): string {
  if (ctx.measureText(value).width <= maxWidth) return value
  let output = value
  while (output && ctx.measureText(`${output}…`).width > maxWidth) output = output.slice(0, -1)
  return output ? `${output}…` : ''
}

/** Canvas equivalent of Korean keep-all: explicit newlines, then word boundaries, then character fallback. */
export function wrapKeepAll(ctx: SKRSContext2D, value: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = []
  const paragraphs = normalizeText(value).split('\n')
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean).flatMap(word =>
      ctx.measureText(word).width > maxWidth ? splitLongWord(ctx, word, maxWidth) : [word],
    )
    let line = ''
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word
      if (!line || ctx.measureText(candidate).width <= maxWidth) line = candidate
      else {
        lines.push(line)
        line = word
      }
    }
    if (line) lines.push(line)
  }
  if (lines.length > maxLines) {
    const visible = lines.slice(0, maxLines)
    let last = visible[maxLines - 1]
    while (last && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1)
    visible[maxLines - 1] = last ? `${last}…` : ''
    return visible
  }
  return lines
}

function drawLines(ctx: SKRSContext2D, text: string, x: number, y: number, maxWidth: number, maxLines: number, lineHeight: number): number {
  const lines = wrapKeepAll(ctx, text, maxWidth, maxLines)
  lines.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight))
  return lines.length * lineHeight
}

function pill(ctx: SKRSContext2D, x: number, y: number, text: string, font: string, bg: string, fg: string, padX = 28, padY = 14): { width: number; height: number } {
  ctx.font = font
  const metric = ctx.measureText(text)
  const height = (metric.actualBoundingBoxAscent + metric.actualBoundingBoxDescent) + padY * 2
  const width = metric.width + padX * 2
  ctx.fillStyle = bg
  ctx.beginPath()
  ctx.roundRect(x, y, width, height, height / 2)
  ctx.fill()
  ctx.fillStyle = fg
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(text, x + padX, y + padY + metric.actualBoundingBoxAscent)
  ctx.textBaseline = 'top'
  return { width, height }
}

function drawTextOnlyBackground(ctx: SKRSContext2D, width: number, height: number): void {
  ctx.fillStyle = COLOR.INK
  ctx.fillRect(0, 0, width, height)
  // 장식 원을 먼저 그리고 브랜드 띠를 마지막에 그린다. 반대 순서면
  // 우상단 원이 띠를 덮어 중간에서 끊긴 렌더링처럼 보인다.
  ctx.fillStyle = COLOR.BRAND
  ctx.globalAlpha = 0.12
  ctx.beginPath(); ctx.arc(-60, height + 40, 300, 0, Math.PI * 2); ctx.fill()
  ctx.globalAlpha = 0.07
  ctx.fillStyle = COLOR.ACCENT
  ctx.beginPath(); ctx.arc(width + 60, -60, 240, 0, Math.PI * 2); ctx.fill()
  ctx.globalAlpha = 1
  ctx.fillStyle = COLOR.BRAND
  ctx.fillRect(0, 0, width, 14)
}

function drawCoverPhoto(ctx: SKRSContext2D, image: Awaited<ReturnType<typeof loadImage>>, width: number, photoHeight: number): void {
  const scale = Math.max(width / image.width, photoHeight / image.height)
  const drawWidth = image.width * scale
  const drawHeight = image.height * scale
  ctx.save()
  ctx.beginPath(); ctx.rect(0, 0, width, photoHeight); ctx.clip()
  ctx.drawImage(image, (width - drawWidth) / 2, (photoHeight - drawHeight) / 2, drawWidth, drawHeight)
  const gradient = ctx.createLinearGradient(0, photoHeight - 160, 0, photoHeight)
  gradient.addColorStop(0, 'rgba(11,15,26,0)')
  gradient.addColorStop(1, 'rgba(11,15,26,0.55)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, photoHeight - 160, width, 160)
  ctx.restore()
}

function priceText(card: CardRenderInput['card']): string {
  const value = normalizeText(card.price_badge)
  // 완전일치로 비교하면 프롬프트 규칙이 지시한 '미입력 (중개사에게 문의)' 가
  // 금액으로 오인된다. 접두 비교로 맞춘다.
  return value.startsWith(PRICE_UNKNOWN_TEXT) ? '' : value
}

// 탐지 전용 정규화. 렌더용 normalizeText 는 공백을 1개로 줄일 뿐 지우지 않으므로
// '3,000 만원' 처럼 숫자와 단위 사이에 공백만 넣어도 탐지를 빠져나갔다.
// 비교 직전에 모든 공백을 지우고 전각 문자를 반각으로 접는다.
const amountProbe = (value: string): string =>
  value.normalize('NFKC').replace(/[\s\u00a0]/g, '')

const SINO_NUM = '[일이삼사오육칠팔구십]'

const AMOUNT_PATTERNS: RegExp[] = [
  // 숫자 + 억 (3억, 2.5억, 12억원)
  /\d[\d,]*(?:\.\d+)?억/,
  // 숫자 + 만/천/백만 단위 (3000만원, 5천만원, 3백만원)
  /\d[\d,]*(?:\.\d+)?(?:천만|백만|천|만)원/,
  // 한글 수사 금액 (삼천만원, 오천만원)
  new RegExp(`${SINO_NUM}+(?:천만|백만|천|만)원`),
  new RegExp(`${SINO_NUM}+억`),
  // 통화 기호·코드 (₩3000, KRW 3000)
  /(?:₩|KRW)\d/i,
  // 쉼표 3묶음 이상 또는 7자리 이상 숫자 (30,000,000)
  /\d{1,3}(?:,\d{3}){2,}/,
  /\d{7,}/,
  // 가격 키워드 바로 뒤의 숫자 (보증금 3천/월 250)
  /(?:보증금|월세|매매|전세|권리금|임대료|분양가|관리비|시세|가격|호가)\D{0,4}\d/,
  // 보증금/월세 슬래시 표기 (3000/250)
  /\d{3,}\/\d{2,}/,
  // 숫자 + 원. 뒤에 한글이 붙으면 '원칙·원색·원룸' 이므로 제외한다.
  /\d[\d,]*원(?![가-힣])/,
]

const hasAmount = (value: string): boolean => {
  const probe = amountProbe(value)
  return AMOUNT_PATTERNS.some(pattern => pattern.test(probe))
}

export function cardContainsAmount(input: CardRenderInput): boolean {
  const { card, platform } = input
  const badge = priceText(card)
  if (badge && hasAmount(badge)) return true
  // 실제로 그려지는 문자열만 검사한다. 그려지지 않는 필드로 차단하면
  // 이미지에 없는 금액 때문에 정상 카드 생성이 막힌다.
  // highlight 는 현재 어떤 draw* 도 읽지 않아 제외한다. 렌더에 추가하면 여기도 되살려야 한다.
  const drawn = [
    card.title,
    card.subtitle,
    card.body,
    card.address,
    card.cta,
    input.region,
    input.contact?.officeName,
    ...(card.checkpoints ?? []),
    ...(card.points ?? []),
    ...(card.spec_grid ?? []).flatMap(item => [item.label, item.value]),
    // 해시태그는 instagram 에서만 그려진다.
    ...(platform === 'instagram' ? (card.hashtags ?? []) : []),
  ]
    .map(normalizeText)
    .join(' ')
  return hasAmount(drawn)
}

function drawCaption(ctx: SKRSContext2D, label: string, platform: CardPlatform, y: number): void {
  const preset = PRESETS[platform]
  ctx.font = `${preset.captionSize}px "NanumGothic"`
  ctx.fillStyle = COLOR.LINE
  drawLines(ctx, label, preset.margin, y, preset.width - preset.margin * 2, 2, Math.round(preset.captionSize * 1.45))
}

function drawCover(ctx: SKRSContext2D, input: CardRenderInput, hasPhoto: boolean, sourceLabel: string): void {
  const { card, platform } = input
  const preset = PRESETS[platform]
  const photoHeight = preset.coverPhotoHeight
  if (hasPhoto) {
    ctx.fillStyle = COLOR.INK
    ctx.fillRect(0, photoHeight, preset.width, preset.height - photoHeight)
  }
  if (input.region && input.region.length <= 8) pill(ctx, preset.margin, hasPhoto ? 72 : 120, input.region, '34px "NanumGothic Bold"', COLOR.ACCENT, COLOR.INK, 24, 12)
  const titleY = hasPhoto ? photoHeight + 42 : 250
  const titleSize = hasPhoto ? 76 : 112
  ctx.font = `${titleSize}px "NanumGothic ExtraBold"`
  ctx.fillStyle = COLOR.WHITE
  const titleHeight = drawLines(ctx, normalizeText(card.title), preset.margin, titleY, preset.width - preset.margin * 2, hasPhoto ? 2 : 3, Math.round(titleSize * 1.45))
  let y = titleY + titleHeight + (hasPhoto ? 14 : 26)
  if (card.subtitle) {
    ctx.font = `${hasPhoto ? 34 : 40}px "NanumGothic"`
    ctx.fillStyle = COLOR.LINE
    y += drawLines(ctx, normalizeText(card.subtitle), preset.margin, y, preset.width - preset.margin * 2, hasPhoto ? 1 : 2, hasPhoto ? 49 : 58) + 16
  }
  const price = priceText(card)
  if (price) pill(ctx, preset.margin, y, price, `${hasPhoto ? 44 : 56}px "NanumGothic Bold"`, COLOR.BRAND, COLOR.WHITE, 28, 14)
  if (sourceLabel) drawCaption(ctx, sourceLabel, platform, preset.height - (platform === 'kakao' ? 108 : 94))
}

function featureItems(card: CardRenderInput['card']): string[] {
  if (card.layout === 'location' || card.layout === 'interior') return (card.checkpoints ?? []).slice(0, 4)
  if (card.layout === 'investment') return (card.points ?? []).slice(0, 2)
  return (card.points ?? []).slice(0, 4)
}

function drawGrid(ctx: SKRSContext2D, grid: SpecGridItem[], x: number, y: number, width: number): number {
  const gap = 28
  const cellWidth = (width - gap) / 2
  grid.slice(0, 2).forEach((item, index) => {
    const cellX = x + index * (cellWidth + gap)
    ctx.fillStyle = 'rgba(255,255,255,0.07)'
    ctx.beginPath(); ctx.roundRect(cellX, y, cellWidth, 154, 20); ctx.fill()
    ctx.strokeStyle = 'rgba(232,234,240,0.22)'; ctx.stroke()
    ctx.font = '30px "NanumGothic Bold"'; ctx.fillStyle = COLOR.ACCENT_SOFT
    ctx.fillText(ellipsize(ctx, normalizeText(item.label), cellWidth - 56), cellX + 28, y + 22)
    ctx.font = '34px "NanumGothic"'; ctx.fillStyle = COLOR.WHITE
    drawLines(ctx, normalizeText(item.value), cellX + 28, y + 66, cellWidth - 56, 2, 46)
  })
  return 154
}

function drawFeature(ctx: SKRSContext2D, input: CardRenderInput, hasPhoto: boolean, sourceLabel: string): void {
  const { card, platform } = input
  const preset = PRESETS[platform]
  const panelY = hasPhoto ? preset.featurePhotoHeight : 0
  if (hasPhoto) {
    ctx.fillStyle = COLOR.INK
    ctx.fillRect(0, panelY, preset.width, preset.height - panelY)
  }
  const x = preset.margin
  const maxWidth = preset.width - x * 2
  let y = hasPhoto ? panelY + 38 : 140
  ctx.font = `${hasPhoto ? 56 : 72}px "NanumGothic ExtraBold"`
  ctx.fillStyle = COLOR.WHITE
  ctx.fillText(ellipsize(ctx, normalizeText(card.title), maxWidth), x, y)
  y += hasPhoto ? 82 : 104
  ctx.fillStyle = COLOR.ACCENT
  ctx.beginPath(); ctx.roundRect(x, y, hasPhoto ? 96 : 120, hasPhoto ? 5 : 6, 3); ctx.fill()
  y += 28
  if (card.address || card.body) {
    ctx.font = '32px "NanumGothic"'; ctx.fillStyle = COLOR.LINE
    ctx.fillText(ellipsize(ctx, normalizeText(card.address || card.body), maxWidth), x, y)
    y += 58
  }
  if (card.layout === 'composition' && card.spec_grid?.length) {
    y += drawGrid(ctx, card.spec_grid, x, y, maxWidth) + 24
  }
  const items = featureItems(card)
  const itemFont = hasPhoto ? 36 : 40
  const itemHeight = hasPhoto ? 66 : 128
  items.forEach((item, index) => {
    if (y + itemHeight > preset.height - 120) return
    if (!hasPhoto) {
      ctx.fillStyle = 'rgba(255,255,255,0.06)'
      ctx.beginPath(); ctx.roundRect(x, y, maxWidth, itemHeight, 22); ctx.fill()
      ctx.fillStyle = COLOR.ACCENT
      ctx.beginPath(); ctx.arc(x + 62, y + itemHeight / 2, 26, 0, Math.PI * 2); ctx.fill()
      ctx.font = '30px "NanumGothic Bold"'; ctx.fillStyle = COLOR.INK
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(String(index + 1), x + 62, y + itemHeight / 2)
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    } else {
      ctx.fillStyle = COLOR.ACCENT_SOFT
      ctx.beginPath(); ctx.arc(x + 12, y + 23, 7, 0, Math.PI * 2); ctx.fill()
    }
    ctx.font = `${itemFont}px "NanumGothic Bold"`; ctx.fillStyle = COLOR.WHITE
    drawLines(ctx, normalizeText(item), hasPhoto ? x + 44 : x + 124, y + (hasPhoto ? 0 : 26), hasPhoto ? maxWidth - 44 : maxWidth - 152, 2, Math.round(itemFont * 1.45))
    y += itemHeight + (hasPhoto ? 10 : 20)
  })
  if (sourceLabel) drawCaption(ctx, sourceLabel, platform, preset.height - (platform === 'kakao' ? 108 : 94))
}

const FORBIDDEN = /문의 폭주|조회수 급상승|매출 상승|수익 보장|완판|\d+\s*%\s*수익률|자동 등록|자동 업로드|원클릭 등록|자동 게시|자동 전송|시세 대비 저렴|주변보다 싸게|평단가|가치 상승|오를 것|마감 임박|오늘만|선착순/
function safeClaim(value: unknown): string {
  const text = normalizeText(value)
  if (!FORBIDDEN.test(text)) return text
  console.warn('[card-image] 보장하거나 지원하지 않는 문구를 렌더링에서 제외했습니다.')
  return ''
}

export function sanitizeCardClaims(card: CardRenderInput['card']): CardRenderInput['card'] {
  return {
    ...card,
    title: safeClaim(card.title),
    subtitle: safeClaim(card.subtitle),
    body: safeClaim(card.body),
    highlight: safeClaim(card.highlight),
    address: safeClaim(card.address),
    checkpoints: card.checkpoints?.map(safeClaim).filter(Boolean),
    points: card.points?.map(safeClaim).filter(Boolean),
    spec_grid: card.spec_grid?.map(item => ({
      label: safeClaim(item.label),
      value: safeClaim(item.value),
    })).filter(item => item.label || item.value),
    cta: safeClaim(card.cta),
    hashtags: card.hashtags?.map(safeClaim).filter(Boolean),
  }
}

function drawCta(ctx: SKRSContext2D, input: CardRenderInput, sourceLabel: string): void {
  const { card, platform } = input
  const preset = PRESETS[platform]
  drawTextOnlyBackground(ctx, preset.width, preset.height)
  const x = preset.margin
  const maxWidth = preset.width - x * 2
  ctx.font = '72px "NanumGothic ExtraBold"'; ctx.fillStyle = COLOR.WHITE
  const titleHeight = drawLines(ctx, safeClaim(card.title), x, 150, maxWidth, 2, 104)
  let y = 150 + titleHeight + 28
  const price = priceText(card)
  if (price) {
    const badge = pill(ctx, x, y, price, '48px "NanumGothic Bold"', COLOR.BRAND, COLOR.WHITE, 30, 16)
    y += badge.height + 18
  }
  if (sourceLabel) drawCaption(ctx, sourceLabel, platform, y)
  ctx.strokeStyle = 'rgba(232,234,240,0.2)'; ctx.beginPath(); ctx.moveTo(x, 650); ctx.lineTo(preset.width - x, 650); ctx.stroke()
  const officeName = normalizeText(input.contact?.officeName)
  const phone = normalizeText(input.contact?.phone)
  const registrationNumber = normalizeText(input.contact?.registrationNumber)
  const kakaoId = platform === 'kakao' ? normalizeText(input.contact?.kakaoId) : ''
  if (officeName) {
    ctx.font = '40px "NanumGothic Bold"'; ctx.fillStyle = COLOR.WHITE
    ctx.fillText(ellipsize(ctx, officeName, maxWidth), x, 700)
  }
  if (phone) {
    ctx.font = `${platform === 'kakao' ? 52 : 46}px "NanumGothic Bold"`; ctx.fillStyle = COLOR.ACCENT_SOFT
    ctx.fillText(ellipsize(ctx, phone, maxWidth), x, 754)
  }
  if (registrationNumber) {
    ctx.font = '26px "NanumGothic"'; ctx.fillStyle = COLOR.LINE
    ctx.fillText(ellipsize(ctx, `등록번호 ${registrationNumber}`, maxWidth), x, 816)
  }
  if (kakaoId) {
    ctx.font = '36px "NanumGothic Bold"'; ctx.fillStyle = COLOR.WHITE
    ctx.fillText(ellipsize(ctx, `카카오 ${kakaoId}`, maxWidth), x, 858)
  }
  const cta = safeClaim(card.cta || (platform === 'kakao' ? card.title : '자세한 조건은 문의해 주세요'))
  if (cta) pill(ctx, x, platform === 'kakao' ? 930 : 862, ellipsize(ctx, cta, maxWidth - 72), '44px "NanumGothic Bold"', COLOR.ACCENT, COLOR.INK, 36, 20)
  if (platform === 'instagram' && card.hashtags?.length) {
    ctx.font = '28px "NanumGothic"'; ctx.fillStyle = COLOR.LINE
    drawLines(ctx, card.hashtags.slice(0, 8).join(' '), x, 970, maxWidth, 2, 40)
  }
}

export async function renderCardImage(input: CardRenderInput): Promise<CardRenderResult> {
  ensureFonts()
  const safeInput: CardRenderInput = { ...input, card: sanitizeCardClaims(input.card) }
  const preset = PRESETS[safeInput.platform]
  const canvas = createCanvas(preset.width, preset.height)
  const ctx = canvas.getContext('2d')
  ctx.textBaseline = 'top'

  // 금액 탐지는 sanitize '이전' 원본으로 한다. sanitizeCardClaims 가 금지문구를
  // 통째로 빈 문자열로 지우면 그 안의 금액도 함께 사라져 출처 게이트를 빠져나갔다.
  const amount = cardContainsAmount(input)
  let priceSourceLabel = ''
  if (amount) {
    assertRenderablePriceSource(input.priceSource, 'card_news')
    priceSourceLabel = formatPriceSourceLabel(input.priceSource)
  }

  // 금지문구 때문에 제목이 통째로 지워졌다면 제목 없는 깨진 카드가 발행되지 않도록 거부한다.
  if (normalizeText(input.card.title) && !safeInput.card.title) {
    throw new Error('카드 제목에 사용할 수 없는 문구가 있어 이미지를 만들지 않았습니다. 제목을 수정해 주세요.')
  }

  let image: Awaited<ReturnType<typeof loadImage>> | undefined
  let fallbackReason = safeInput.photoFallbackReason
  if (safeInput.card.layout !== 'cta' && safeInput.photoBuffer && !fallbackReason) {
    try {
      image = await loadImage(safeInput.photoBuffer)
      if (image.width < 600 || image.height < 600) {
        image = undefined
        fallbackReason = 'too_small'
      }
    } catch {
      fallbackReason = 'decode_failed'
    }
  }
  if (safeInput.card.layout !== 'cta' && !image && !fallbackReason) fallbackReason = 'no_assets'
  const hasPhoto = Boolean(image)

  if (hasPhoto && image) {
    const photoHeight = safeInput.card.layout === 'cover' ? preset.coverPhotoHeight : preset.featurePhotoHeight
    drawCoverPhoto(ctx, image, preset.width, photoHeight)
  } else {
    drawTextOnlyBackground(ctx, preset.width, preset.height)
  }

  if (safeInput.card.layout === 'cta') drawCta(ctx, safeInput, priceSourceLabel)
  else if (safeInput.card.layout === 'cover') drawCover(ctx, safeInput, hasPhoto, priceSourceLabel)
  else drawFeature(ctx, safeInput, hasPhoto, priceSourceLabel)

  return {
    png: await canvas.encode('png'),
    layoutUsed: safeInput.card.layout === 'cta' ? 'cta' : hasPhoto ? safeInput.card.layout : 'text_only',
    photoFallbackReason: safeInput.card.layout === 'cta' ? undefined : fallbackReason,
    priceSourceLabel: priceSourceLabel || undefined,
  }
}
