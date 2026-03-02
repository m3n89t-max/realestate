// 개인정보 마스킹 유틸리티 (AI 전송 전 필터링)

const PATTERNS = {
  // 주민등록번호: 6자리-7자리
  ssn: /\b(\d{6})-?(\d{7})\b/g,
  // 전화번호
  phone: /\b(0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4})\b/g,
  // 이메일
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  // 계좌번호 (숫자-숫자 패턴)
  accountNumber: /\b\d{3,6}-\d{2,6}-\d{6,10}\b/g,
  // 카드번호
  cardNumber: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
}

export function maskPersonalInfo(text: string): string {
  let masked = text

  masked = masked.replace(PATTERNS.ssn, '******-*******')
  masked = masked.replace(PATTERNS.phone, '010-****-****')
  masked = masked.replace(PATTERNS.email, '****@****.***')
  masked = masked.replace(PATTERNS.accountNumber, '***-***-******')
  masked = masked.replace(PATTERNS.cardNumber, '**** **** **** ****')

  return masked
}

export function maskForLog(text: string, maxLength = 200): string {
  const masked = maskPersonalInfo(text)
  return masked.length > maxLength ? masked.slice(0, maxLength) + '...' : masked
}
