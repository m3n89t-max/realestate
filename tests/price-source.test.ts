import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  PRICE_VALUE_TYPES,
  PriceSourceError,
  assertRenderablePriceSource,
  buildPriceSourcePromptBlock,
  checkPriceSource,
  formatPriceSourceLabel,
  formatSourceDate,
  resolveValueType,
  REGION_PRICE_CLAIM_BAN_RULES,
} from '../src/lib/price-source'
import { generateCardNews } from '../src/lib/content/card-news'
import { generateSeoBlog } from '../src/lib/content/seo-blog'
import type { Document, LocationAnalysis, Project } from '../src/lib/types'

const baseProject = {
  id: 'p1',
  org_id: 'o1',
  address: '서울시 중구 세종대로 110',
  property_type: 'apartment',
  price: 350_000_000,
  area: 84,
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
} as unknown as Project

const emptyAnalysis = {} as LocationAnalysis
const noDocs: Document[] = []

test("값유형 3종('중개사 제공'/'실거래'/'호가')을 구분한다", () => {
  assert.deepEqual([...PRICE_VALUE_TYPES], ['중개사 제공', '실거래', '호가'])
  // 값유형이 비었거나 알 수 없으면 기존 데이터와 동일하게 '중개사 제공'으로 본다.
  assert.equal(resolveValueType({}), '중개사 제공')
  assert.equal(resolveValueType({ value_type: null }), '중개사 제공')
  assert.equal(resolveValueType({ value_type: '이상한값' }), '중개사 제공')
  assert.equal(resolveValueType({ value_type: '실거래' }), '실거래')
  assert.equal(resolveValueType({ value_type: '호가' }), '호가')
})

test("'중개사 제공'은 출처명·기준일 없이도 렌더를 통과한다", () => {
  for (const kind of ['card_news', 'blog', 'shorts'] as const) {
    const check = checkPriceSource({ value_type: '중개사 제공' }, kind)
    assert.equal(check.ok, true)
    assert.deepEqual(check.missing, [])
    assert.equal(check.message, '')
  }
  // 값유형 자체가 비어 있는 기존 행도 통과한다.
  assert.equal(checkPriceSource({}, 'blog').ok, true)
})

test("'실거래'/'호가'인데 출처명 또는 기준일이 비면 렌더를 막고 어느 필드가 비었는지 알려준다", () => {
  for (const valueType of ['실거래', '호가'] as const) {
    const bothMissing = checkPriceSource({ value_type: valueType }, 'card_news')
    assert.equal(bothMissing.ok, false)
    assert.deepEqual(bothMissing.missing, ['출처명', '기준일'])

    const nameMissing = checkPriceSource({ value_type: valueType, source_date: '2026-03-01' }, 'blog')
    assert.equal(nameMissing.ok, false)
    assert.deepEqual(nameMissing.missing, ['출처명'])

    const dateMissing = checkPriceSource({ value_type: valueType, source_name: '국토교통부 실거래가' }, 'shorts')
    assert.equal(dateMissing.ok, false)
    assert.deepEqual(dateMissing.missing, ['기준일'])

    // 공백만 넣은 값은 비어 있는 것으로 본다 (조용히 넘기지 않는다).
    const whitespace = checkPriceSource({ value_type: valueType, source_name: '   ', source_date: '  ' }, 'blog')
    assert.equal(whitespace.ok, false)
    assert.deepEqual(whitespace.missing, ['출처명', '기준일'])

    // 둘 다 채우면 통과한다.
    const complete = checkPriceSource(
      { value_type: valueType, source_name: '국토교통부 실거래가', source_date: '2026-03-01' },
      'blog',
    )
    assert.equal(complete.ok, true)
  }
})

test('렌더 실패 메시지는 콘텐츠 종류별 한국어 이름과 다음 행동을 담는다', () => {
  const card = checkPriceSource({ value_type: '실거래' }, 'card_news')
  // 조사가 낱말에 맞게 붙는지 확인 ('카드뉴스를', '블로그 글을' — '카드뉴스을' 같은 비문 금지)
  assert.match(card.message, /카드뉴스를 만들 수 없습니다/)
  assert.match(card.message, /출처명과 기준일이 비어 있어/)
  assert.ok(!card.message.includes('이(가)'), '조사 자동 선택 실패: 이(가) 가 남아 있음')
  assert.ok(!card.message.includes('을(를)'), '조사 자동 선택 실패: 을(를) 가 남아 있음')
  assert.match(card.message, /'실거래'/)
  assert.match(card.message, /출처명과 기준일/)
  assert.match(card.message, /'중개사 제공'으로 바꿔 주세요/)

  assert.match(checkPriceSource({ value_type: '호가' }, 'blog').message, /블로그 글을 만들 수 없습니다/)
  assert.match(checkPriceSource({ value_type: '호가' }, 'shorts').message, /쇼츠 대본을 만들 수 없습니다/)
  // 한 필드만 빈 경우의 조사도 확인
  const onlyDate = checkPriceSource({ value_type: '호가', source_name: '매도인 제시' }, 'card_news')
  assert.match(onlyDate.message, /기준일이 비어 있어 카드뉴스를 만들 수 없습니다/)

  // 영어가 섞이지 않은 한국어 안내인지 확인 (따옴표/공백 제외)
  assert.ok(!/[A-Za-z]/.test(card.message), `영문이 섞여 있음: ${card.message}`)
})

test('assertRenderablePriceSource는 조건 미충족 시 PriceSourceError로 던진다', () => {
  assert.throws(
    () => assertRenderablePriceSource({ value_type: '실거래', source_name: '국토교통부' }, 'card_news'),
    (error: unknown) => {
      assert.ok(error instanceof PriceSourceError)
      assert.equal(error.code, 'PRICE_SOURCE_INCOMPLETE')
      assert.equal(error.valueType, '실거래')
      assert.deepEqual(error.missing, ['기준일'])
      assert.match(error.message, /기준일이 비어 있어 카드뉴스를 만들 수 없습니다/)
      return true
    },
  )
  // 통과 시에는 값유형을 돌려준다.
  assert.equal(
    assertRenderablePriceSource({ value_type: '호가', source_name: '매도인 제시', source_date: '2026-02-10' }, 'shorts'),
    '호가',
  )
})

test('카드뉴스 렌더: 출처 미비면 실패하고, 빈 값으로 렌더하지 않는다', async () => {
  const incomplete = { ...baseProject, value_type: '호가' } as Project
  await assert.rejects(
    () => generateCardNews(incomplete, { project_id: 'p1' }),
    (error: unknown) => {
      assert.ok(error instanceof PriceSourceError)
      assert.match((error as Error).message, /카드뉴스를 만들 수 없습니다/)
      return true
    },
  )

  // 출처를 채우면 렌더되고, 가격 카드에 출처명·기준일이 함께 들어간다.
  const complete = {
    ...baseProject,
    value_type: '호가',
    source_name: '매도인 제시',
    source_date: '2026-02-10',
  } as Project
  const slides = await generateCardNews(complete, { project_id: 'p1' })
  const priceSlide = slides.find((slide) => slide.order === 2)
  assert.ok(priceSlide)
  assert.match(priceSlide!.body, /호가/)
  assert.match(priceSlide!.body, /매도인 제시/)
  assert.match(priceSlide!.body, /2026년 2월 10일 기준/)
})

test('블로그 렌더: 출처 미비면 실패하고, 통과 시 본문에 출처가 들어간다', async () => {
  const incomplete = { ...baseProject, value_type: '실거래', source_date: '2026-03-01' } as Project
  await assert.rejects(
    () => generateSeoBlog(incomplete, emptyAnalysis, noDocs, { project_id: 'p1' }),
    (error: unknown) => {
      assert.ok(error instanceof PriceSourceError)
      assert.deepEqual((error as PriceSourceError).missing, ['출처명'])
      return true
    },
  )

  const complete = {
    ...baseProject,
    value_type: '실거래',
    source_name: '국토교통부 실거래가',
    source_date: '2026-03-01',
  } as Project
  const blog = await generateSeoBlog(complete, emptyAnalysis, noDocs, { project_id: 'p1' })
  assert.match(blog.content, /가격 출처: 실거래 · 국토교통부 실거래가 · 2026년 3월 1일 기준/)
  // 지역 시세 단정 서술이 템플릿에 남아 있지 않은지 확인
  assert.ok(!/이 지역 시세는/.test(blog.content))
  assert.match(blog.content, /이 매물 1건의 가격입니다/)
})

test('가격 옆 출처 한 줄은 값유형·출처명·기준일을 사람이 읽는 형태로 만든다', () => {
  assert.equal(
    formatPriceSourceLabel({ value_type: '실거래', source_name: '국토교통부 실거래가', source_date: '2026-03-01' }),
    '실거래 · 국토교통부 실거래가 · 2026년 3월 1일 기준',
  )
  // 값유형만 있으면 값유형만 보여준다 (빈 괄호·빈 문자열이 남지 않는다).
  assert.equal(formatPriceSourceLabel({ value_type: '중개사 제공' }), '중개사 제공')
  assert.equal(formatPriceSourceLabel({}), '중개사 제공')
  assert.equal(formatSourceDate('2026-12-25'), '2026년 12월 25일')
  assert.equal(formatSourceDate(''), '')
  assert.equal(formatSourceDate(null), '')
})

test('지역 시세 단정 금칙이 프롬프트 규칙에 명시되어 있다', () => {
  for (const banned of [
    '이 지역 시세는 3억원대입니다',
    '평당가는 2,000만원 수준입니다',
    '주변 시세 대비 저렴합니다',
  ]) {
    assert.ok(
      REGION_PRICE_CLAIM_BAN_RULES.includes(banned),
      `금칙 예시가 규칙에 없음: ${banned}`,
    )
  }
  assert.match(REGION_PRICE_CLAIM_BAN_RULES, /지역 전체 시세를 단정하는 서술/)
  assert.match(REGION_PRICE_CLAIM_BAN_RULES, /이 매물 1건/)
})

test('프롬프트 출처 블록은 4필드를 모두 넣고 지역 시세 근거로 쓰지 말라고 못박는다', () => {
  const block = buildPriceSourcePromptBlock({
    value_type: '실거래',
    source_name: '국토교통부 실거래가',
    source_date: '2026-03-01',
    source_channel: '공공데이터 API',
  })
  assert.match(block, /값유형: 실거래/)
  assert.match(block, /출처명: 국토교통부 실거래가/)
  assert.match(block, /기준일: 2026-03-01/)
  assert.match(block, /수집경로: 공공데이터 API/)
  assert.match(block, /지역 전체 시세의 근거로 쓰지 마세요/)

  // 비어 있으면 기존 데이터 기준값으로 채워 빈 값이 프롬프트에 새지 않게 한다.
  const fallback = buildPriceSourcePromptBlock({})
  assert.match(fallback, /값유형: 중개사 제공/)
  assert.match(fallback, /출처명: 중개사 제공/)
  assert.match(fallback, /기준일: 없음/)
  assert.match(fallback, /수집경로: 중개사 직접 입력/)
})

test('앱과 엣지 함수의 price-source 사본이 동일하다', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const app = readFileSync(join(root, 'src/lib/price-source.ts'), 'utf8')
  const edge = readFileSync(join(root, 'supabase/functions/_shared/price-source.ts'), 'utf8')
  assert.equal(
    app,
    edge,
    'src/lib/price-source.ts 와 supabase/functions/_shared/price-source.ts 내용이 다릅니다. 한쪽만 고치지 마세요.',
  )
})

test('마이그레이션이 4필드·제약·백필을 모두 담고 있다', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const sql = readFileSync(
    join(root, 'supabase/migrations/20260930120000_add_price_source_metadata.sql'),
    'utf8',
  )
  for (const column of ['source_name', 'source_date', 'source_channel', 'value_type']) {
    assert.ok(sql.includes(`ADD COLUMN IF NOT EXISTS ${column}`), `컬럼 추가 누락: ${column}`)
    assert.ok(sql.includes(`COMMENT ON COLUMN public.projects.${column}`), `한글 COMMENT 누락: ${column}`)
  }
  // 값유형 3종 CHECK 제약
  assert.match(sql, /projects_value_type_check/)
  for (const valueType of ['중개사 제공', '실거래', '호가']) {
    assert.ok(sql.includes(`'${valueType}'`), `CHECK 제약 값 누락: ${valueType}`)
  }
  // 기존 데이터 백필
  assert.match(sql, /UPDATE public\.projects/)
  assert.match(sql, /value_type\s*=\s*COALESCE\(value_type, '중개사 제공'\)/)
  assert.match(sql, /'중개사 제공'\)/)
})
