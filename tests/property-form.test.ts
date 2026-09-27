import test from 'node:test'
import assert from 'node:assert/strict'
import { formatKoreanPrice, parseOptionalNumber, parsePositivePrice, validateOptionalNumbers, validateOptionalPrice, validatePropertyBasics } from '../src/lib/property-form'

test('초보자용 매물 등록은 핵심 정보가 없으면 다음 단계로 진행하지 않는다', () => {
  assert.deepEqual(validatePropertyBasics({
    address: '',
    propertyType: '',
    transactionType: 'sale',
    price: '',
    deposit: '',
    monthlyRent: '',
  }), {
    address: '주소를 입력해 주세요.',
    propertyType: '매물 종류를 선택해 주세요.',
    price: '매매가를 입력해 주세요.',
  })

  assert.deepEqual(validatePropertyBasics({
    address: '서울시 중구 세종대로 110',
    propertyType: 'apartment',
    transactionType: 'rent',
    price: '',
    deposit: '5000',
    monthlyRent: '',
  }), {
    monthlyRent: '월세를 입력해 주세요.',
  })
})

test('만원 단위 가격을 읽기 쉬운 한국어 금액으로 보여준다', () => {
  assert.equal(formatKoreanPrice('35000'), '3억 5,000만원')
  assert.equal(formatKoreanPrice('100000'), '10억원')
  assert.equal(formatKoreanPrice(''), '')
})

test('가격은 부분 숫자나 0, 안전하지 않은 큰 수를 허용하지 않는다', () => {
  for (const value of ['0', '-1', '12만원', '10.5', '9000000001']) {
    assert.equal(parsePositivePrice(value), null)
  }
  assert.equal(parsePositivePrice('35,000'), 35000)

  assert.deepEqual(validatePropertyBasics({
    address: '서울시 중구 세종대로 110',
    propertyType: 'apartment',
    transactionType: 'sale',
    price: '12만원',
    deposit: '',
    monthlyRent: '',
  }), { price: '매매가는 0보다 큰 정수로 입력해 주세요.' })
})

test('지하층은 음수 정수로 보존하고 잘못된 선택 숫자는 오류로 알린다', () => {
  assert.equal(parseOptionalNumber('-1', { signed: true }), -1)
  assert.equal(parseOptionalNumber('', { signed: true }), null)
  assert.equal(parseOptionalNumber('지하1층', { signed: true }), undefined)
  assert.equal(parseOptionalNumber('10.5', { decimal: true }), 10.5)

  assert.deepEqual(validateOptionalNumbers({
    floor: '-1',
    total_floors: '20층',
    area: '84.5',
    rooms_count: '방3',
  }), {
    total_floors: '전체 층은 정수로 입력해 주세요.',
    rooms_count: '방 개수는 정수로 입력해 주세요.',
  })
})

test('선택 숫자는 DB 열 범위를 넘기지 않고 권리금 오류를 숨기지 않는다', () => {
  assert.equal(parseOptionalNumber('2147483648', { max: 2_147_483_647 }), undefined)
  assert.equal(parseOptionalNumber('84.555', { decimal: true, maxDecimalPlaces: 2 }), undefined)
  assert.equal(validateOptionalPrice('', '권리금'), undefined)
  assert.equal(validateOptionalPrice('-1', '권리금'), '권리금은 0보다 큰 정수로 입력해 주세요.')

  assert.deepEqual(validateOptionalNumbers({
    area: '1000000',
    land_area: '99999999.999',
    rooms_count: '2147483648',
  }), {
    area: '전용면적은 0 이상 999,999.99 이하의 숫자로 입력해 주세요.',
    land_area: '대지면적은 0 이상 99,999,999.99 이하의 숫자로 입력해 주세요.',
    rooms_count: '방 개수는 0 이상 2,147,483,647 이하의 정수로 입력해 주세요.',
  })
})
