// QA 감사 고위험 1·2 및 부수 5·6 회귀 테스트
// ------------------------------------------------------------------
// 핵심 주장: '미입력(모름)'을 사실 주장으로 바꾸지 않는다.
//  - 빈 가격이 '0원'이라는 금액 주장으로 렌더되지 않는다
//  - 빈 권리금이 '무권리'(= 권리금 없음)라는 사실 주장으로 렌더되지 않는다
//  - 실제로 입력된 0 은 '0원' / '무권리'로 그대로 표기된다 (0 과 미입력의 구분)

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  KEY_MONEY_NONE_TEXT,
  PRICE_UNKNOWN_PROMPT_RULE,
  PRICE_UNKNOWN_TEXT,
  formatKeyMoney,
  formatPriceOrUnknown,
  formatWon,
  isPriceEntered,
} from '../src/lib/price-source'
import { formatPrice } from '../src/lib/utils'
import { parseManInputToWon, validateManInput } from '../src/lib/property-form'
import { buildPropertyInfoTableHtml } from '../src/components/ui/PropertyInfoTable'
import type { Project } from '../src/lib/types'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p: string) => readFileSync(join(repoRoot, p), 'utf8')

// ── [고위험 2] formatPrice: 미입력 vs 실제 0 ────────────────────────────────

test('[고위험 2] 미입력 가격은 0원이 아니라 미입력으로 표기된다 (변경 전: 0원)', () => {
  // 변경 전 동작: src/lib/utils.ts 의 `if (!priceInWon) return '0원'`
  // → null/undefined 가 '0원'이라는 금액 주장으로 렌더됐다.
  assert.equal(formatPrice(null), PRICE_UNKNOWN_TEXT)
  assert.equal(formatPrice(undefined), PRICE_UNKNOWN_TEXT)
  assert.equal(formatPrice(NaN), PRICE_UNKNOWN_TEXT)
  assert.equal(formatPrice(Infinity), PRICE_UNKNOWN_TEXT)
  assert.equal(PRICE_UNKNOWN_TEXT, '미입력')

  // 어떤 미입력 경로에서도 '0원'이 새 나오지 않는다.
  for (const empty of [null, undefined, NaN, '', '   ']) {
    assert.notEqual(
      formatPriceOrUnknown(empty as never),
      '0원',
      `미입력 값(${String(empty)})이 '0원'으로 렌더됨 — 금액 허위 표시`,
    )
  }
})

test('[고위험 2] 실제로 입력된 삽지 0 은 0원으로 표기된다 (미입력과 구분)', () => {
  assert.equal(formatPrice(0), '0원')
  assert.equal(formatPriceOrUnknown(0), '0원')
  assert.equal(formatPriceOrUnknown('0'), '0원')
  // 판정 함수 자체가 0 을 '입력된 값'으로 본다.
  assert.equal(isPriceEntered(0), true)
  assert.equal(isPriceEntered('0'), true)
  assert.equal(isPriceEntered(null), false)
  assert.equal(isPriceEntered(undefined), false)
  assert.equal(isPriceEntered(''), false)
  assert.equal(isPriceEntered('   '), false)
  assert.equal(isPriceEntered('abc'), false)
  assert.equal(isPriceEntered(NaN), false)
})

test('[고위험 2] 금액 포맷은 원 단위를 한국 실무 표기로 바꾼다', () => {
  assert.equal(formatWon(350_000_000), '3억 5,000만원')
  assert.equal(formatWon(300_000_000), '3억원')
  assert.equal(formatWon(15_000_000), '1,500만원')
  assert.equal(formatWon(1_500_000), '150만원')
  assert.equal(formatWon(5_000), '5,000원')
  assert.equal(formatWon(0), '0원')
  assert.equal(formatWon(null), '')
})

test('[고위험 2] 빈 값 표기가 미입력 한 종으로 통일됐다 (기존 7종 혼재 해소)', () => {
  // 기존 7종: '-', '—', '0원', '가격 미정', '가격 협의', '협의', '상담가능'
  const legacy = ['0원', '가격 미정', '가격 협의', '협의', '상담가능', '-', '—']
  for (const value of [null, undefined, '', '   ']) {
    const rendered = formatPriceOrUnknown(value as never)
    assert.equal(rendered, PRICE_UNKNOWN_TEXT)
    assert.ok(!legacy.includes(rendered), `구 표기가 남아 있음: ${rendered}`)
  }
})

test('[고위험 2] 포맷터가 한 곳으로 모였다 — utils.formatPrice 는 price-source 로 위임한다', () => {
  const utils = read('src/lib/utils.ts')
  assert.ok(!utils.includes("return '0원'"), "src/lib/utils.ts 에 `return '0원'` 이 남아 있음")
  assert.match(utils, /from '\.\/price-source'/)

  // PropertyInfoTable 의 동명 별도 포맷터(변경 전 '-' 리턴)가 제거됐다.
  const table = read('src/components/ui/PropertyInfoTable.tsx')
  assert.ok(
    !/function formatPrice\(won/.test(table),
    'PropertyInfoTable.tsx 에 자체 formatPrice 정의가 남아 있음 (표기 분기 원인)',
  )
  assert.match(table, /formatPriceOrUnknown/)

  // 엣지 함수 generate-blog 의 자체 fmt 도 공용 포맷터로 위임한다.
  const blogFn = read('supabase/functions/generate-blog/index.ts')
  assert.ok(
    !/const fmt = \(won\?: number\) => \{/.test(blogFn),
    'generate-blog/index.ts 에 자체 fmt 구현이 남아 있음',
  )
  assert.match(blogFn, /const fmt = formatPriceOrUnknown/)
})

// ── [고위험 1] '무권리' 단정 제거 ────────────────────────────────────────────

test("[고위험 1] 권리금 미입력은 '무권리'가 아니라 '미입력'이다 (변경 전: 무권리)", () => {
  // 변경 전 동작: `project.key_money ? formatPrice(...) : '무권리'`
  // → 미입력(모름)을 '권리금 없음'이라는 사실 주장으로 바꿨다 (허위 표시 소지).
  assert.equal(formatKeyMoney(null), PRICE_UNKNOWN_TEXT)
  assert.equal(formatKeyMoney(undefined), PRICE_UNKNOWN_TEXT)
  assert.equal(formatKeyMoney(''), PRICE_UNKNOWN_TEXT)
  assert.equal(formatKeyMoney('   '), PRICE_UNKNOWN_TEXT)
  assert.equal(formatKeyMoney(NaN), PRICE_UNKNOWN_TEXT)

  for (const empty of [null, undefined, '', '   ', NaN]) {
    assert.notEqual(
      formatKeyMoney(empty as never),
      KEY_MONEY_NONE_TEXT,
      `권리금 미입력(${String(empty)})이 '무권리'로 단정됨`,
    )
  }
})

test("[고위험 1] 권리금 0 은 '무권리'로 표기된다 (실제 '권리금 없음'은 사실)", () => {
  assert.equal(formatKeyMoney(0), KEY_MONEY_NONE_TEXT)
  assert.equal(formatKeyMoney('0'), KEY_MONEY_NONE_TEXT)
  assert.equal(KEY_MONEY_NONE_TEXT, '무권리')
  // 0 이 아닌 값은 금액으로
  assert.equal(formatKeyMoney(30_000_000), '3,000만원')
})

test('[고위험 1] 블로그 삽입용 HTML 표: 권리금 미입력은 미입력, 0 이면 무권리', () => {
  const base = {
    id: 'p1',
    org_id: 'o1',
    address: '서울시 중구 세종대로 110',
    property_type: 'commercial',
    transaction_type: 'rent',
    deposit: 10_000_000,
    monthly_rent: 1_500_000,
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  } as unknown as Project

  // 미입력(NULL)
  const unknownHtml = buildPropertyInfoTableHtml({ ...base, key_money: null } as unknown as Project)
  assert.ok(
    !unknownHtml.includes(KEY_MONEY_NONE_TEXT),
    `블로그 HTML에 '무권리' 단정이 남아 있음:\n${unknownHtml}`,
  )
  assert.ok(unknownHtml.includes(PRICE_UNKNOWN_TEXT), '블로그 HTML에 미입력 표기가 없음')

  // 실제 0원
  const zeroHtml = buildPropertyInfoTableHtml({ ...base, key_money: 0 } as Project)
  assert.ok(zeroHtml.includes(KEY_MONEY_NONE_TEXT), "권리금 0 인데 '무권리'가 표기되지 않음")

  // 빈 가격이 '0원'으로 새지 않는다
  const noPriceHtml = buildPropertyInfoTableHtml({
    ...base,
    transaction_type: 'sale',
    deposit: null,
    monthly_rent: null,
    price: null,
    key_money: null,
  } as unknown as Project)
  assert.ok(!noPriceHtml.includes('0원'), `빈 가격이 '0원'으로 렌더됨:\n${noPriceHtml}`)
})

test("[고위험 1] 소스에 '무권리' 단정 분기가 남아 있지 않다", () => {
  // 감사 지적 3곳: PropertyInfoTable.tsx(컴포넌트/HTML), generate-blog/index.ts
  for (const file of [
    'src/components/ui/PropertyInfoTable.tsx',
    'supabase/functions/generate-blog/index.ts',
  ]) {
    const source = read(file)
    assert.ok(
      !/:\s*'무권리'/.test(source),
      `${file} 에 미입력 → '무권리' 단정 분기가 남아 있음`,
    )
    assert.match(source, /formatKeyMoney/, `${file} 가 formatKeyMoney 를 쓰지 않음`)
  }

  // 수정 폼 placeholder 도 '무권리'가 아니어야 한다 (오해 유발)
  const editForm = read('src/app/(dashboard)/projects/[id]/components/ProjectEditForm.tsx')
  assert.ok(
    !/placeholder="무권리"/.test(editForm),
    "ProjectEditForm 권리금 placeholder 가 여전히 '무권리'다",
  )
  assert.match(editForm, /placeholder="비워두면 '미입력'으로 표시됩니다"/)
})

// ── [고위험 2] 수정 폼이 미입력을 0 으로 저장하지 않는다 ─────────────────────

test('[고위험 2] 수정 폼: 빈 금액은 NULL 로 저장된다 (변경 전: 검증 없음)', () => {
  // 변경 전 동작: `form.price ? parseInt(form.price) * 10000 : null`
  // → "0" 은 truthy 라서 0 이 DB 에 저장되고 화면에 '0원'으로 렌더됐다.
  assert.equal(parseManInputToWon(''), null)
  assert.equal(parseManInputToWon('   '), null)
  assert.equal(parseManInputToWon(null), null)
  assert.equal(parseManInputToWon(undefined), null)

  // 실제 0 입력은 0 으로 저장 (미입력과 구분)
  assert.equal(parseManInputToWon('0'), 0)
  assert.equal(parseManInputToWon('3000'), 30_000_000)
  assert.equal(parseManInputToWon('3,000'), 30_000_000)

  // 변경 전에는 문자 입력이 parseInt → NaN 으로 페이로드에 들어갔다.
  assert.equal(parseManInputToWon('무권리'), null)
  assert.equal(parseManInputToWon('abc'), null)
  assert.ok(!Number.isNaN(parseManInputToWon('abc') as never))
})

test('[고위험 2] 수정 폼: 잘못된 금액 입력은 한국어 안내로 저장을 막는다', () => {
  assert.equal(validateManInput('', '매매가'), undefined)
  assert.equal(validateManInput('   ', '권리금'), undefined)
  assert.equal(validateManInput('0', '권리금'), undefined)
  assert.equal(validateManInput('3000', '매매가'), undefined)

  const message = validateManInput('무권리', '권리금')
  assert.ok(message, '문자 입력인데 오류 문구가 없음')
  assert.match(message!, /권리금/)
  assert.match(message!, /숫자만 입력/)
  // 다음 행동이 분명해야 한다
  assert.match(message!, /비워 두세요/)

  const tooBig = validateManInput('999999999999', '매매가')
  assert.ok(tooBig, '한도 초과인데 오류 문구가 없음')
  assert.match(tooBig!, /너무 큽니다/)

  // 수정 폼이 실제로 이 검증을 호출한다
  const editForm = read('src/app/(dashboard)/projects/[id]/components/ProjectEditForm.tsx')
  assert.match(editForm, /validateManInput/)
  assert.match(editForm, /parseManInputToWon/)
  assert.ok(
    !/parseInt\(form\.price\) \* 10000/.test(editForm),
    '수정 폼에 검증 없는 parseInt 저장 경로가 남아 있음',
  )
})

// ── [부수 5] PropertyCard 단위 오표기 ───────────────────────────────────────

test("[부수 5] 매물 카드 월세: 원 단위 값에 '만' 접미를 붙이지 않는다", () => {
  const card = read('src/components/projects/PropertyCard.tsx')
  // 변경 전: `/ 월 {monthly_rent.toLocaleString()}만` → 1,500,000원이 "월 1,500,000만"
  assert.ok(
    !/monthly_rent\.toLocaleString\(\)\}만/.test(card),
    "PropertyCard 에 원 값 + '만' 접미 단위 버그가 남아 있음",
  )
  assert.match(card, /월 \{formatPrice\(monthly_rent\)\}/)
  // 공용 포맷터가 원 단위를 올바르게 변환하는지 값으로 확인
  assert.equal(formatPrice(1_500_000), '150만원')
  // '가격 미정' 표기도 제거됐다
  assert.ok(!card.includes('가격 미정'), "PropertyCard 에 '가격 미정' 표기가 남아 있음")
})

// ── [부수 6] 쇼츠가 전월세 금액을 받는다 ────────────────────────────────────

test('[부수 6] 쇼츠 프롬프트가 보증금·월세·권리금을 모두 전달한다', () => {
  const shorts = read('supabase/functions/generate-shorts-script/index.ts')
  // 변경 전: project.price 만 읽어 전월세는 항상 '가격 협의'
  assert.ok(
    !shorts.includes("'가격 협의'"),
    "쇼츠에 '가격 협의' 추측 표기가 남아 있음",
  )
  assert.match(shorts, /보증금: \$\{formatPriceOrUnknown\(project\.deposit\)\}/)
  assert.match(shorts, /월세: \$\{formatPriceOrUnknown\(project\.monthly_rent\)\}/)
  assert.match(shorts, /권리금: \$\{formatKeyMoney\(project\.key_money\)\}/)
  // 거래유형 분기가 있어 전세·월세도 금액이 들어간다
  assert.match(shorts, /txType === 'rent'/)
  assert.match(shorts, /txType === 'lease'/)
  // 미입력 처리 지침도 함께 주입한다
  assert.match(shorts, /PRICE_UNKNOWN_PROMPT_RULE/)
})

test('미입력 프롬프트 지침이 금액 지어내기와 무권리 단정을 함께 금지한다', () => {
  assert.match(PRICE_UNKNOWN_PROMPT_RULE, /미입력/)
  assert.match(PRICE_UNKNOWN_PROMPT_RULE, /지어내지 마세요/)
  assert.match(PRICE_UNKNOWN_PROMPT_RULE, /'0원'이나 '무료'라고 쓰는 것도 금지/)
  assert.match(PRICE_UNKNOWN_PROMPT_RULE, /'무권리'라고 쓰지 마세요/)
})

// ── [부수 7] price-source 사본 동일성 ───────────────────────────────────────

test('[부수 7] 이번 수정 후에도 price-source 사본 2개가 바이트 동일하다', () => {
  assert.equal(
    read('src/lib/price-source.ts'),
    read('supabase/functions/_shared/price-source.ts'),
    'price-source 사본이 어긋났습니다. 한쪽만 고치지 마세요.',
  )
})
