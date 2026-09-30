export interface PropertyBasics {
  address: string
  propertyType: string
  transactionType: 'sale' | 'lease' | 'rent'
  price: string
  deposit: string
  monthlyRent: string
}

export const MAX_SAFE_PRICE_IN_MAN = 9_000_000_000

export function parseOptionalNumber(
  value: string,
  options: { decimal?: boolean; signed?: boolean; min?: number; max?: number; maxDecimalPlaces?: number } = {},
): number | null | undefined {
  const normalized = value.trim()
  if (!normalized) return null
  const sign = options.signed ? '-?' : ''
  const fraction = options.decimal ? '(?:\\.\\d+)?' : ''
  if (!(new RegExp(`^${sign}\\d+${fraction}$`)).test(normalized)) return undefined
  const number = Number(normalized)
  if (!Number.isFinite(number)) return undefined
  if (!options.decimal && !Number.isSafeInteger(number)) return undefined
  const fractionLength = normalized.split('.')[1]?.length ?? 0
  if (options.maxDecimalPlaces !== undefined && fractionLength > options.maxDecimalPlaces) return undefined
  if (options.min !== undefined && number < options.min) return undefined
  if (options.max !== undefined && number > options.max) return undefined
  return number
}

const POSTGRES_INTEGER_MIN = -2_147_483_648
const POSTGRES_INTEGER_MAX = 2_147_483_647
const OPTIONAL_NUMBER_FIELDS = {
  area: { label: '전용면적은', decimal: true, min: 0, max: 999_999.99, maxDecimalPlaces: 2 },
  land_area: { label: '대지면적은', decimal: true, min: 0, max: 99_999_999.99, maxDecimalPlaces: 2 },
  total_area: { label: '연면적은', decimal: true, min: 0, max: 99_999_999.99, maxDecimalPlaces: 2 },
  floor: { label: '해당 층은', signed: true, min: POSTGRES_INTEGER_MIN, max: POSTGRES_INTEGER_MAX },
  total_floors: { label: '전체 층은', min: 0, max: POSTGRES_INTEGER_MAX },
  rooms_count: { label: '방 개수는', min: 0, max: POSTGRES_INTEGER_MAX },
  bathrooms_count: { label: '욕실 개수는', min: 0, max: POSTGRES_INTEGER_MAX },
  parking_legal: { label: '법정 주차 대수는', min: 0, max: POSTGRES_INTEGER_MAX },
  parking_actual: { label: '실제 주차 대수는', min: 0, max: POSTGRES_INTEGER_MAX },
} as const

export function validateOptionalNumbers(values: Partial<Record<keyof typeof OPTIONAL_NUMBER_FIELDS, string>>): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const [key, options] of Object.entries(OPTIONAL_NUMBER_FIELDS)) {
    const value = values[key as keyof typeof OPTIONAL_NUMBER_FIELDS]
    if (value === undefined || !value.trim()) continue
    const numberOptions: { decimal?: boolean; signed?: boolean; min?: number; max?: number; maxDecimalPlaces?: number } = {
      decimal: 'decimal' in options ? options.decimal : false,
      signed: 'signed' in options ? options.signed : false,
      min: options.min,
      max: options.max,
      maxDecimalPlaces: 'maxDecimalPlaces' in options ? options.maxDecimalPlaces : undefined,
    }
    if (parseOptionalNumber(value, { decimal: numberOptions.decimal, signed: numberOptions.signed }) === undefined) {
      errors[key] = `${options.label} ${numberOptions.decimal ? '숫자' : '정수'}로 입력해 주세요.`
    } else if (parseOptionalNumber(value, numberOptions) === undefined) {
      errors[key] = `${options.label} ${numberOptions.min?.toLocaleString('ko-KR')} 이상 ${numberOptions.max?.toLocaleString('ko-KR')} 이하의 ${numberOptions.decimal ? '숫자' : '정수'}로 입력해 주세요.`
    }
  }
  return errors
}

export function validateOptionalPrice(value: string, label: string): string | undefined {
  if (!value.trim()) return undefined
  return parsePositivePrice(value) === null ? `${label}은 0보다 큰 정수로 입력해 주세요.` : undefined
}

export function parsePositivePrice(value: string): number | null {
  const normalized = value.replace(/,/g, '').trim()
  if (!/^\d+$/.test(normalized)) return null
  const amount = Number(normalized)
  return Number.isSafeInteger(amount) && amount > 0 && amount <= MAX_SAFE_PRICE_IN_MAN ? amount : null
}

// ── 수정 폼의 만원 단위 금액 입력 ───────────────────────────────────────────
// 신규 등록은 parsePositivePrice(0 초과만 허용)를 쓰지만, 수정 폼은
// '실제 0원'(예: 권리금 없음)을 입력할 수 있어야 하므로 0 을 허용한다.
// 대신 '미입력(빈칸)'과 '0'을 절대 섞지 않는다 — 빈칸은 NULL 로 저장한다.

/**
 * 만원 단위 입력 문자열을 원 단위 정수로 바꾼다.
 * 빈칸·공백 → null (DB에 NULL 로 저장되어 화면에 '미입력'으로 나간다)
 * '0' → 0 (실제 0원)
 * 숫자가 아니거나 범위를 벗어나면 null (저장 전에 validateManInput 이 먼저 막는다)
 */
export function parseManInputToWon(value: string | null | undefined): number | null {
  if (typeof value !== 'string') return null
  const normalized = value.replace(/,/g, '').trim()
  if (!normalized) return null
  if (!/^\d+$/.test(normalized)) return null
  const amount = Number(normalized)
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > MAX_SAFE_PRICE_IN_MAN) return null
  return amount * 10000
}

/**
 * 만원 단위 금액 입력 검증. 통과하면 undefined, 실패하면 한국어 안내 문구.
 * 빈칸은 '미입력'으로 허용한다 (모르는 값을 0으로 저장하지 않기 위함).
 */
export function validateManInput(value: string | null | undefined, label: string): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.replace(/,/g, '').trim()
  if (!normalized) return undefined
  if (!/^\d+$/.test(normalized)) {
    return `${label}은 숫자만 입력해 주세요. 모르는 금액이면 비워 두세요(‘미입력’으로 표시됩니다).`
  }
  const amount = Number(normalized)
  if (!Number.isSafeInteger(amount) || amount > MAX_SAFE_PRICE_IN_MAN) {
    return `${label}이 너무 큽니다. ${MAX_SAFE_PRICE_IN_MAN.toLocaleString('ko-KR')}만원 이하로 입력해 주세요.`
  }
  return undefined
}

export function validatePropertyBasics(values: PropertyBasics): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!values.address.trim()) errors.address = '주소를 입력해 주세요.'
  if (!values.propertyType) errors.propertyType = '매물 종류를 선택해 주세요.'
  const validatePrice = (key: 'price' | 'deposit' | 'monthlyRent', label: string, value: string) => {
    if (!value.trim()) errors[key] = `${label} 입력해 주세요.`
    else if (parsePositivePrice(value) === null) errors[key] = `${label.replace(/(를|을)$/, (particle) => particle === '를' ? '는' : '은')} 0보다 큰 정수로 입력해 주세요.`
  }
  if (values.transactionType === 'sale') validatePrice('price', '매매가를', values.price)
  if (values.transactionType === 'lease') validatePrice('deposit', '전세 보증금을', values.deposit)
  if (values.transactionType === 'rent') {
    validatePrice('deposit', '보증금을', values.deposit)
    validatePrice('monthlyRent', '월세를', values.monthlyRent)
  }
  return errors
}

/** Converts a 만원 amount to a short, familiar Korean amount. */
export function formatKoreanPrice(value: string): string {
  if (!value.trim()) return ''
  const amount = parsePositivePrice(value)
  if (amount === null) return ''
  const eok = Math.floor(amount / 10000)
  const rest = amount % 10000
  if (eok && rest) return `${eok}억 ${rest.toLocaleString('ko-KR')}만원`
  if (eok) return `${eok}억원`
  return `${rest.toLocaleString('ko-KR')}만원`
}
