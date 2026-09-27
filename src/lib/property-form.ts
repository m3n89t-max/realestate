export interface PropertyBasics {
  address: string
  propertyType: string
  transactionType: 'sale' | 'lease' | 'rent'
  price: string
  deposit: string
  monthlyRent: string
}

export const MAX_SAFE_PRICE_IN_MAN = 9_000_000_000

export function parsePositivePrice(value: string): number | null {
  const normalized = value.replace(/,/g, '').trim()
  if (!/^\d+$/.test(normalized)) return null
  const amount = Number(normalized)
  return Number.isSafeInteger(amount) && amount > 0 && amount <= MAX_SAFE_PRICE_IN_MAN ? amount : null
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
