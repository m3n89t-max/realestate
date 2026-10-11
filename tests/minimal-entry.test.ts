import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { validateMinimalEntry } from '../src/lib/property-form'

const NEW_PROJECT_PAGE = join(process.cwd(), 'src/app/(dashboard)/projects/new/page.tsx')

test('최소 입력 검증은 주소만 필수로 요구한다', () => {
  assert.deepEqual(validateMinimalEntry({ address: '', features: [] }), {
    address: '주소를 입력해 주세요.',
  })

  assert.deepEqual(validateMinimalEntry({ address: '제주시 연동 123', features: [] }), {})
  assert.deepEqual(validateMinimalEntry({ address: '제주시 연동 123', features: ['신축'] }), {})
})

test('공백만 있는 주소는 입력으로 보지 않는다', () => {
  assert.deepEqual(validateMinimalEntry({ address: '   ', features: [] }), {
    address: '주소를 입력해 주세요.',
  })
})

test('첫 단계에서는 가격·면적·매물종류를 필수로 묻지 않는다', () => {
  const source = readFileSync(NEW_PROJECT_PAGE, 'utf8')
  const steps = source.match(/const STEPS = \[[\s\S]*?\n\]/)
  assert.ok(steps, 'STEPS 정의를 찾지 못했습니다.')

  assert.match(steps[0], /id: 'address'/, '첫 단계는 주소 입력이어야 합니다.')
  assert.ok(
    !/필수 정보/.test(source),
    '최소 입력 화면에서 "필수 정보" 묶음으로 가격·면적을 함께 요구하면 안 됩니다.',
  )
  assert.ok(
    !/validatePropertyBasics/.test(source),
    '첫 단계에서 가격·매물종류를 필수로 보는 검증을 쓰면 안 됩니다.',
  )
  assert.match(source, /가격·면적 입력 \(선택\)/, '가격·면적은 선택 항목으로 접어 두어야 합니다.')
})

test('새 매물 화면은 주소·사진·특징 세 단계로 시작한다', () => {
  const source = readFileSync(NEW_PROJECT_PAGE, 'utf8')
  const steps = [...source.matchAll(/id: '(basic|address|photos|features|analysis|details)'/g)].map((match) => match[1])

  assert.deepEqual(steps.slice(0, 3), ['address', 'photos', 'features'])
})

test('새 매물 화면은 공용 최소 입력 정의를 가져온다', () => {
  const source = readFileSync(NEW_PROJECT_PAGE, 'utf8')
  assert.match(source, /MINIMAL_ENTRY_FIELDS|jipporter-flow/, '최소 입력 정의를 공용 모듈에서 가져와야 합니다.')
})

test('가격 출처 검증 규칙은 그대로 유지한다', () => {
  const source = readFileSync(NEW_PROJECT_PAGE, 'utf8')
  assert.match(source, /checkPriceSource/, '가격 출처 검증은 제거하면 안 됩니다.')
})
