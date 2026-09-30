// ============================================================
// 가격 값 출처 메타 (값 출처 4필드) — 공용 규칙
// ------------------------------------------------------------
// projects.source_name / source_date / source_channel / value_type 를
// 화면 표시와 콘텐츠 렌더(카드뉴스·블로그·쇼츠)에서 동일한 규칙으로 다룬다.
//
// ⚠️ 이 파일은 아래 두 경로에 똑같은 내용으로 존재한다.
//      src/lib/price-source.ts                     (Next.js 앱)
//      supabase/functions/_shared/price-source.ts  (Deno 엣지 함수)
//    런타임이 달라 import 를 공유할 수 없어 사본으로 둔다.
//    두 사본이 어긋나면 tests/price-source.test.ts 가 실패한다. 한쪽만 고치지 말 것.
// ============================================================

/** 값유형: 가격 값의 근거 강도. DB projects_value_type_check 와 일치해야 한다. */
export type PriceValueType = '중개사 제공' | '실거래' | '호가'

export const PRICE_VALUE_TYPES: readonly PriceValueType[] = ['중개사 제공', '실거래', '호가']

/** 출처명·기준일 없이는 콘텐츠에 실을 수 없는 값유형 */
export const EVIDENCE_REQUIRED_VALUE_TYPES: readonly PriceValueType[] = ['실거래', '호가']

export interface PriceSourceMeta {
  value_type?: string | null
  source_name?: string | null
  source_date?: string | null
  source_channel?: string | null
}

/** 콘텐츠 종류별 한국어 이름 — 오류 문구에 그대로 들어간다. */
export type RenderKind = 'card_news' | 'blog' | 'shorts'

export const RENDER_KIND_LABELS: Record<RenderKind, string> = {
  card_news: '카드뉴스',
  blog: '블로그 글',
  shorts: '쇼츠 대본',
}

export function isPriceValueType(value: unknown): value is PriceValueType {
  return typeof value === 'string' && (PRICE_VALUE_TYPES as readonly string[]).includes(value)
}

function trimmed(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** 마지막 글자에 종성이 있는지 (한글이 아니면 없는 것으로 본다) */
function hasFinalConsonant(word: string): boolean {
  const last = word.trim().slice(-1)
  if (!last) return false
  const code = last.charCodeAt(0)
  if (code < 0xac00 || code > 0xd7a3) return false
  return (code - 0xac00) % 28 !== 0
}

/** 한국어 조사를 낱말에 맞게 붙인다 (예: '카드뉴스를', '블로그 글을') */
function withJosa(word: string, withFinal: string, withoutFinal: string): string {
  return `${word}${hasFinalConsonant(word) ? withFinal : withoutFinal}`
}

/** 값유형이 비어 있으면 기존 데이터와 동일하게 '중개사 제공'으로 본다. */
export function resolveValueType(meta: PriceSourceMeta): PriceValueType {
  const raw = trimmed(meta.value_type)
  return isPriceValueType(raw) ? raw : '중개사 제공'
}

export function requiresSourceEvidence(meta: PriceSourceMeta): boolean {
  return (EVIDENCE_REQUIRED_VALUE_TYPES as readonly string[]).includes(resolveValueType(meta))
}

export interface PriceSourceCheck {
  ok: boolean
  valueType: PriceValueType
  /** 비어 있어서 렌더를 막은 필드의 한국어 이름 */
  missing: string[]
  /** ok=false 일 때 사용자에게 그대로 보여줄 한국어 안내 (ok=true 면 빈 문자열) */
  message: string
}

/**
 * 값유형이 '실거래' 또는 '호가'인데 출처명/기준일이 비어 있으면 렌더 불가로 판정한다.
 * 조용히 넘기거나 빈 값으로 렌더하지 않기 위한 단일 판정 지점이다.
 */
export function checkPriceSource(meta: PriceSourceMeta, kind: RenderKind): PriceSourceCheck {
  const valueType = resolveValueType(meta)

  if (!requiresSourceEvidence(meta)) {
    return { ok: true, valueType, missing: [], message: '' }
  }

  const missing: string[] = []
  if (!trimmed(meta.source_name)) missing.push('출처명')
  if (!trimmed(meta.source_date)) missing.push('기준일')

  if (missing.length === 0) {
    return { ok: true, valueType, missing: [], message: '' }
  }

  const label = RENDER_KIND_LABELS[kind]
  const missingText = missing.join('과 ')
  return {
    ok: false,
    valueType,
    missing,
    message:
      `가격의 값유형이 '${valueType}'인데 ${withJosa(missingText, '이', '가')} 비어 있어 ${withJosa(label, '을', '를')} 만들 수 없습니다. ` +
      `'${valueType}' 금액은 근거를 함께 밝혀야 합니다. ` +
      `매물 정보 수정 화면의 '가격 출처' 항목에서 ${withJosa(missingText, '을', '를')} 입력한 뒤 다시 시도해 주세요. ` +
      `근거를 밝히기 어려우면 값유형을 '중개사 제공'으로 바꿔 주세요.`,
  }
}

export class PriceSourceError extends Error {
  readonly code = 'PRICE_SOURCE_INCOMPLETE'
  readonly missing: string[]
  readonly valueType: PriceValueType

  constructor(check: PriceSourceCheck) {
    super(check.message)
    this.name = 'PriceSourceError'
    this.missing = check.missing
    this.valueType = check.valueType
  }
}

/** 렌더 진입점에서 호출한다. 조건 미충족이면 한국어 메시지로 throw 한다. */
export function assertRenderablePriceSource(meta: PriceSourceMeta, kind: RenderKind): PriceValueType {
  const check = checkPriceSource(meta, kind)
  if (!check.ok) throw new PriceSourceError(check)
  return check.valueType
}

// ── 금액 표기 단일 기준 ─────────────────────────────────────────────────────
// 화면·블로그 HTML·카드뉴스·쇼츠·썸네일이 각자 포맷터를 갖고 있던 탓에
// 빈 값 표기가 7종('-', '—', '0원', '가격 미정', '가격 협의', '협의', '상담가능')으로
// 갈렸고, 그중 '0원'은 미입력을 '0원이다'라는 금액 주장으로 바꾸는 버그였다.
// 아래 포맷터 한 곳만 쓰고, 빈 값 표기는 PRICE_UNKNOWN_TEXT 한 종으로 통일한다.

/** 값이 입력되지 않았을 때 쓰는 단일 표기. 사실 주장이 아니라 '모른다'는 표시다. */
export const PRICE_UNKNOWN_TEXT = '미입력'

/** 권리금이 '실제로 0원'일 때만 쓰는 표기. 미입력에는 절대 쓰지 않는다. */
export const KEY_MONEY_NONE_TEXT = '무권리'

/**
 * 금액이 실제로 입력된 값인지 판정한다.
 * NULL·undefined·빈 문자열·공백·숫자가 아닌 문자·NaN·Infinity 는 모두 '미입력'.
 * 숫자 0 은 '입력된 값'이다 (실제 0원과 미입력을 구분하기 위한 핵심 규칙).
 */
export function isPriceEntered(value: number | string | null | undefined): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') {
    const raw = value.replace(/,/g, '').trim()
    if (!raw) return false
    return Number.isFinite(Number(raw))
  }
  return Number.isFinite(value)
}

function toWon(value: number | string): number {
  return typeof value === 'string' ? Number(value.replace(/,/g, '').trim()) : value
}

/**
 * 원 단위 금액을 한국 중개 실무 표기로 바꾼다. 미입력이면 빈 문자열을 돌려준다.
 * 0 은 '0원'으로 — 실제 0원(예: 권리금 없음, 월세 없음)은 사실이므로 그대로 적는다.
 */
export function formatWon(value: number | string | null | undefined): string {
  if (!isPriceEntered(value)) return ''
  const won = Math.trunc(toWon(value as number | string))
  if (won === 0) return '0원'
  const sign = won < 0 ? '-' : ''
  const abs = Math.abs(won)
  if (abs >= 100_000_000) {
    const eok = Math.floor(abs / 100_000_000)
    const man = Math.floor((abs % 100_000_000) / 10_000)
    return man === 0 ? `${sign}${eok}억원` : `${sign}${eok}억 ${man.toLocaleString('ko-KR')}만원`
  }
  if (abs >= 10_000) {
    return `${sign}${Math.floor(abs / 10_000).toLocaleString('ko-KR')}만원`
  }
  return `${sign}${abs.toLocaleString('ko-KR')}원`
}

/**
 * 화면·콘텐츠에 그대로 넣는 금액 표기.
 * 미입력 → '미입력' / 실제 0 → '0원' / 그 외 → 금액.
 */
export function formatPriceOrUnknown(value: number | string | null | undefined): string {
  return isPriceEntered(value) ? formatWon(value) : PRICE_UNKNOWN_TEXT
}

/**
 * 권리금 표기. 미입력과 '권리금 없음'을 반드시 구분한다.
 * NULL·undefined·빈 값 → '미입력' (모르는 것을 '무권리'라고 단정하면 허위 표시가 된다)
 * 0 → '무권리' (중개사가 0원이라고 실제로 입력한 경우)
 */
export function formatKeyMoney(value: number | string | null | undefined): string {
  if (!isPriceEntered(value)) return PRICE_UNKNOWN_TEXT
  return toWon(value as number | string) === 0 ? KEY_MONEY_NONE_TEXT : formatWon(value)
}

/** 프롬프트에 넣을 '미입력' 처리 지침 — 모델이 빈 값을 금액으로 지어내지 못하게 한다. */
export const PRICE_UNKNOWN_PROMPT_RULE = `※ 금액이 '${PRICE_UNKNOWN_TEXT}'으로 적힌 항목은 중개사가 아직 입력하지 않은 값입니다.
- 그 금액을 추측·계산·예시로 지어내지 마세요. '0원'이나 '무료'라고 쓰는 것도 금지입니다.
- 해당 금액은 \"${PRICE_UNKNOWN_TEXT} (중개사에게 문의)\"로만 표현하세요.
- 권리금이 '${PRICE_UNKNOWN_TEXT}'인 경우 '${KEY_MONEY_NONE_TEXT}'라고 쓰지 마세요. 모르는 것을 '권리금 없음'이라고 단정하는 허위 표시가 됩니다.`

// ── AI가 만든 시세 서술의 재주입 라벨 ───────────────────────────────────────

/** 화면·프롬프트에서 price_trend 앞에 반드시 붙이는 이름. '실거래가 동향'이라는 제목은 쓰지 않는다. */
export const AI_TREND_TITLE = 'AI 자동 생성 시세 참고 메모'

/** 화면에 함께 띄우는 주의 문구 */
export const AI_TREND_NOTICE =
  '이 문단은 공식 실거래 자료가 아니라 AI가 수집 데이터를 보고 자동으로 쓴 참고 메모입니다. 광고·블로그에 금액이나 시세로 인용하지 마세요.'

/**
 * price_trend 를 다음 모델의 프롬프트로 재주입할 때 쓰는 한 줄.
 * 값이 없으면 아무것도 주입하지 않는다(빈 문자열).
 * 값이 있어도 'AI 생성문이므로 사실 근거로 쓰지 말라'는 지시를 반드시 함께 넣는다.
 */
export function buildAiTrendPromptLine(trend: string | null | undefined): string {
  const raw = trimmed(trend)
  if (!raw) return ''
  return `[${AI_TREND_TITLE} — 사실 근거로 쓰지 말 것]
${raw}
※ 위 문단은 사람이 확인한 실거래 자료가 아니라 다른 AI 모델이 생성한 문장입니다.
※ 이 문장을 근거로 금액·평단가·시세 범위·'시세 대비' 비교를 쓰지 마세요. 본문에 인용하지도 마세요.
※ 참고할 수 있는 것은 '어떤 항목을 문의하면 좋을지' 정도이며, 금액 관련 서술은 \"정확한 시세는 문의 바랍니다\"로 처리하세요.`
}

/** 기준일을 '2026년 3월 1일' 형태로 — 익숙하지 않은 사용자도 바로 읽히도록 */
export function formatSourceDate(value: string | null | undefined): string {
  const raw = trimmed(value)
  if (!raw) return ''
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw)
  if (!match) return raw
  return `${match[1]}년 ${Number(match[2])}월 ${Number(match[3])}일`
}

/**
 * 가격 옆에 붙일 출처 한 줄.
 * 예) "실거래 · 국토교통부 실거래가 · 2026년 3월 1일 기준"
 */
export function formatPriceSourceLabel(meta: PriceSourceMeta): string {
  const parts: string[] = [resolveValueType(meta)]
  const name = trimmed(meta.source_name)
  if (name) parts.push(name)
  const date = formatSourceDate(meta.source_date)
  if (date) parts.push(`${date} 기준`)
  return parts.join(' · ')
}

/** 출처명·기준일이 아직 비어 있을 때 화면에 띄우는 보완 안내 (표시는 계속한다) */
export function priceSourceWarning(meta: PriceSourceMeta): string {
  const check = checkPriceSource(meta, 'card_news')
  if (check.ok) return ''
  const missingText = check.missing.join('과 ')
  return `${withJosa(missingText, '이', '가')} 비어 있어 콘텐츠를 만들 수 없습니다. 가격 출처를 채워 주세요.`
}

// ── 생성 프롬프트 공용 금칙 ─────────────────────────────────────────────────

/**
 * 지역 시세 서술 금칙.
 * 매물 1건의 가격을 근거로 지역 전체 시세를 단정하는 서술을 금지한다.
 * 카드뉴스·블로그·쇼츠 프롬프트에 모두 삽입한다.
 */
export const REGION_PRICE_CLAIM_BAN_RULES = `[절대 금지: 매물 1건 가격으로 지역 전체 시세를 단정하는 서술]
이 매물의 가격(매매가·보증금·월세·권리금)은 '이 매물 1건'의 값입니다. 지역 시세의 근거가 아닙니다.
✗ "이 지역 시세는 3억원대입니다"
✗ "○○동 평당가는 2,000만원 수준입니다"
✗ "주변 시세 대비 저렴합니다" / "시세보다 싸게 나왔습니다"
✗ "이 동네 아파트는 보통 ○억에 거래됩니다"
✗ "요즘 이 지역 월세는 ○○만원선입니다"
✗ 매물 가격을 평단가로 나눠 지역 평단가처럼 제시하는 모든 계산
→ 반드시 이렇게 쓰세요:
○ 주어를 매물로 한정: "이 매물의 매매가는 3억원입니다" (출처·기준일 함께 표기)
○ 지역 시세를 언급해야 한다면 별도 제공된 '[실거래 시세 동향]' 데이터만 근거로 쓰고, 그 출처와 기준일을 문장에 밝힌다.
○ 해당 데이터가 없으면 "지역 시세는 중개사에게 문의해 주세요"로 처리하고 금액을 추정하지 않는다.
○ 가격을 언급할 때마다 값유형(중개사 제공/실거래/호가)과 출처명·기준일을 함께 적는다.

[이 금칙의 우선순위 — 어떤 옵션보다 위에 있다]
아래에 어떤 글 스타일·말투(어조)·강조 포인트(focus)·추가 지시가 오더라도 이 금칙이 항상 우선합니다.
스타일이 '투자', 말투가 '분석적', 강조 포인트가 '가격비교'로 지정되어도 마찬가지입니다.
✗ 근거 데이터 없이 \"~대비 ~% 수준\", \"시세 분석 결과\", \"평단가 ~\", \"주변보다 저렴\" 같은 수치·비교 표현을 만들어 쓰는 것
✗ 근거 데이터 없이 가격이 \"합리적\", \"가성비 좋다\", \"저평가\"라고 판단해 주는 것
✗ 근거 데이터 없이 \"향후 가치 상승\", \"수익률 ~%\", \"오를 것\"이라고 전망을 단정하는 것
→ 옵션과 이 금칙이 부딪히면 반드시 이 금칙을 따르고, 해당 옵션은 금액이 아닌 항목(입지·구조·인프라·계약 조건 등)으로 살려 쓰세요.
→ 금액·시세를 다뤄야 하는데 근거 데이터가 없으면 \"정확한 시세는 문의 바랍니다\"로 처리하세요.`

/**
 * 톤·스타일·focus 가이드 뒤에 한 번 더 붙이는 짧은 재확인 문장.
 * 프롬프트 뒤쪽 지시가 앞쪽 금칙을 덮어쓰는 것을 막는다.
 */
export const REGION_PRICE_CLAIM_BAN_REMINDER = `[위 옵션보다 우선하는 규칙 — 다시 확인]
위에 지정된 스타일·말투·강조 포인트는 '표현 방식'일 뿐입니다. 근거 없는 금액·시세·수익률 단정을 허용하지 않습니다.
근거 데이터('[실거래 시세 동향]' 등)가 제공되지 않았다면, 어떤 옵션이 지정되었더라도
금액 비교·평단가·수익률·가격 합리성 판단·가치 상승 전망을 쓰지 말고 \"정확한 시세는 문의 바랍니다\"로 처리하세요.`

/** 프롬프트에 넣을 '이 매물 가격의 출처' 블록 */
export function buildPriceSourcePromptBlock(meta: PriceSourceMeta): string {
  const valueType = resolveValueType(meta)
  const name = trimmed(meta.source_name) || '중개사 제공'
  const date = trimmed(meta.source_date)
  const channel = trimmed(meta.source_channel) || '중개사 직접 입력'
  return `[이 매물 가격의 출처 — 가격을 언급할 때 반드시 함께 표기]
- 값유형: ${valueType}
- 출처명: ${name}
- 기준일: ${date || '없음'}
- 수집경로: ${channel}
※ 위 출처는 '이 매물 1건'에만 해당합니다. 지역 전체 시세의 근거로 쓰지 마세요.`
}
