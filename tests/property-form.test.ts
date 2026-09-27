import test from 'node:test'
import assert from 'node:assert/strict'
import { formatKoreanPrice, parsePositivePrice, validatePropertyBasics } from '../src/lib/property-form'

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
