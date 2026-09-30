// QA 감사 고위험 3·4 회귀 테스트
// ------------------------------------------------------------------
// [고위험 3] 지역 시세 단정 금칙이 톤·스타일·focus 옵션으로 우회되지 않는다
// [고위험 4] AI가 만든 시세 서술(price_trend)이 다음 모델의 '데이터'로
//            재활용되는 출처 세탁 사이클이 절단됐다

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  AI_TREND_NOTICE,
  AI_TREND_TITLE,
  REGION_PRICE_CLAIM_BAN_REMINDER,
  REGION_PRICE_CLAIM_BAN_RULES,
  buildAiTrendPromptLine,
} from '../src/lib/price-source'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p: string) => readFileSync(join(repoRoot, p), 'utf8')

const seoPrompt = read('supabase/functions/_shared/seo-prompt.ts')
const analyzeLocation = read('supabase/functions/analyze-location/index.ts')

// ── [고위험 3] 톤·스타일·focus 우회 차단 ────────────────────────────────────

test('[고위험 3] analytical 톤이 근거 없는 수치 분석 표현을 지시하지 않는다', () => {
  // 변경 전: analytical 톤 가이드가 "~대비 ~% 수준", "시세 분석 결과" 표현을
  // 쓰라고 직접 지시했고, UI(BlogTab)에서 선택 가능해 금칙을 되살렸다.
  const analytical = /analytical: '([^']*)'/.exec(seoPrompt)
  assert.ok(analytical, 'analytical 톤 가이드를 찾을 수 없음')
  const guide = analytical![1]
  // 변경 후 가이드는 이 표현들을 '쓰라'가 아니라 '쓰지 말라'고 말해야 한다.
  // 문구가 등장하더라도 반드시 금지 문맥이어야 하므로, 사용 지시형 문구를 직접 배제한다.
  for (const instruction of [
    '등 근거 중심 표현 사용',
    '표현 사용.',
    '표현을 사용',
  ]) {
    assert.ok(
      !guide.includes(instruction),
      `analytical 톤이 여전히 수치 분석 표현을 '사용'하라고 지시함: ${instruction}`,
    )
  }
  // 금지 문맥임을 확인 — 해당 표현들이 '근거 없이 쓰는 것은 금지'로 묶여 있다
  assert.match(guide, /같은 비교·분석 표현을 근거 없이 쓰는 것은 금지다/)
  assert.match(guide, /제공되지 않은 수치를 만들어 쓰거나/)
  // 대신 '제공된 데이터만' 이라는 조건이 붙어 있어야 한다
  assert.match(guide, /실제로 제공된 데이터/)
  assert.match(guide, /만 인용하고 출처를 문장에 밝힌다/)
})

test("[고위험 3] focus: price 가 가격 '합리성·가성비' 단정을 지시하지 않는다", () => {
  const priceFocus = /price: '([^']*)'/.exec(seoPrompt)
  assert.ok(priceFocus, 'focus price 가이드를 찾을 수 없음')
  const guide = priceFocus![1]
  // 변경 전: '가격의 합리성, 가성비 ... 가격 경쟁력을 강조하세요'
  // → seo-prompt 의 "합리적 단정 금지"(시세 주의 규칙)를 focus 옵션으로 되살렸다.
  assert.ok(!/합리성/.test(guide), "focus: price 가 여전히 '합리성'을 강조하라고 지시함")
  assert.ok(!/가성비, /.test(guide), "focus: price 가 여전히 '가성비' 강조를 지시함")
  assert.match(guide, /판단해 주지 마세요/)
  assert.match(guide, /문의 바랍니다/)
})

test('[고위험 3] investment 스타일·focus 가 가치 상승을 단정하지 않는다', () => {
  const investmentStyle = /investment: '([^']*투자자[^']*)'/.exec(seoPrompt)
  assert.ok(investmentStyle, 'investment 스타일 가이드를 찾을 수 없음')
  const styleGuide = investmentStyle![1]
  // 변경 전: '투자자를 위한 시세분석 및 수익률 관점의 글. 시장 동향/가치 상승 요인 강조.'
  assert.ok(!/시세분석/.test(styleGuide), "investment 스타일이 여전히 '시세분석'을 요구함")
  assert.ok(!/가치 상승 요인 강조/.test(styleGuide))
  assert.match(styleGuide, /근거 있는 사실만/)
  assert.match(styleGuide, /문의 바랍니다/)

  // focus: investment 도 단정형이 아니어야 한다
  assert.ok(
    !seoPrompt.includes('향후 가치 상승 여력, 수익률, 개발 호재 등 투자 가치를 중점적으로 강조하세요'),
    'focus: investment 의 단정형 지시가 남아 있음',
  )
  assert.match(seoPrompt, /단정하지 말고 "직접 확인이 필요한 항목"으로 제시하세요/)
})

test('[고위험 3] passionate 톤이 긴박감 조성 문구를 지시하지 않는다', () => {
  assert.ok(
    !seoPrompt.includes('"정말", "꼭", "놓치면 안 돼요" 등의 표현 사용'),
    'passionate 톤이 여전히 과장·긴박감 표현 사용을 지시함 (같은 파일의 과장 금지 규칙과 충돌)',
  )
  const passionate = /passionate: '([^']*)'/.exec(seoPrompt)
  assert.ok(passionate)
  assert.match(passionate![1], /과장 형용사와 긴박감 조성 문구/)
})

test('[고위험 3] 금칙이 톤·스타일·focus 어떤 조합에서도 우선한다고 명시된다', () => {
  // 규칙 본문에 우선순위 선언이 있다
  assert.match(REGION_PRICE_CLAIM_BAN_RULES, /이 금칙의 우선순위 — 어떤 옵션보다 위에 있다/)
  assert.match(REGION_PRICE_CLAIM_BAN_RULES, /스타일이 '투자', 말투가 '분석적', 강조 포인트가 '가격비교'로 지정되어도 마찬가지/)
  assert.match(REGION_PRICE_CLAIM_BAN_RULES, /옵션과 이 금칙이 부딪히면 반드시 이 금칙을 따르고/)

  // 옵션 가이드 뒤에 리마인더가 한 번 더 붙어, 뒤쪽 지시가 앞쪽 금칙을 덮지 못한다
  assert.match(REGION_PRICE_CLAIM_BAN_REMINDER, /위 옵션보다 우선하는 규칙/)
  assert.match(REGION_PRICE_CLAIM_BAN_REMINDER, /어떤 옵션이 지정되었더라도/)
  assert.ok(
    seoPrompt.includes('${REGION_PRICE_CLAIM_BAN_REMINDER}'),
    '사용자 프롬프트의 톤·스타일 지시 뒤에 금칙 리마인더가 주입되지 않음',
  )

  // 리마인더가 스타일/말투 블록보다 뒤에 온다 (순서로 우선순위를 보장)
  const toneIdx = seoPrompt.indexOf('[말투]')
  const reminderIdx = seoPrompt.indexOf('${REGION_PRICE_CLAIM_BAN_REMINDER}')
  assert.ok(toneIdx > 0 && reminderIdx > toneIdx, '금칙 리마인더가 말투 지시보다 앞에 있음')
})

test('[고위험 3] 시세 주의 4줄 금칙이 삭제되지 않았다 (회귀 금지 항목)', () => {
  assert.match(seoPrompt, /⚠️ 시세·실거래가 주의/)
  assert.match(seoPrompt, /데이터가 실제로 제공된 경우에만 구체적 금액\/평단가\/거래사례를 언급하라/)
  assert.match(seoPrompt, /절대 지어내지 말고, "정확한 시세는 문의 바랍니다"로 처리하라/)
  assert.match(seoPrompt, /"가격이 합리적"이라고 단정하지 말 것/)
  // 공용 금칙 블록도 그대로 주입된다
  assert.ok(seoPrompt.includes('${REGION_PRICE_CLAIM_BAN_RULES}'))
})

// ── [고위험 4] 출처 세탁 경로 절단 ──────────────────────────────────────────

test('[고위험 4-a] price_trend 는 실거래 근거가 있을 때만 생성을 요구한다', () => {
  // 변경 전: 출력 스키마가 "모든 필드 필수"이고 price_trend 가 무조건 포함돼,
  // 실거래 데이터가 없어도 모델이 시세 문장을 채워야 했다.
  assert.ok(
    !analyzeLocation.includes('[출력 형식: JSON - 모든 필드 필수]'),
    "'모든 필드 필수' 지시가 남아 있어 price_trend 가 여전히 강제된다",
  )
  assert.match(analyzeLocation, /주석으로 '출력하지 마세요'라고 적힌 필드는 제외한다/)

  // 근거 유무 플래그가 실제 데이터에서 계산된다
  assert.match(analyzeLocation, /const hasRealPriceEvidence/)
  assert.match(analyzeLocation, /Array\.isArray\(project\.real_price_data\) && project\.real_price_data\.length > 0/)

  // 스키마에서 근거 없으면 필드를 아예 요구하지 않는다
  assert.match(analyzeLocation, /price_trend 필드는 이번 요청에서 출력하지 마세요/)
  assert.ok(
    !analyzeLocation.includes('"price_trend": "실거래가 동향 분석 (1-2문장)"'),
    '무조건적 price_trend 스키마 항목이 남아 있음',
  )
})

test('[고위험 4-a] 근거가 없으면 모델이 보낸 price_trend 를 저장하지 않는다', () => {
  // 저장 시점에서도 차단한다 — 프롬프트 지시만으로는 LLM 출력을 보증할 수 없다.
  assert.match(
    analyzeLocation,
    /price_trend:\s*hasRealPriceEvidence \? \(analysis\.price_trend \?\? null\) : null/,
  )
  assert.ok(
    !/price_trend:\s*analysis\.price_trend \?\? null,/.test(analyzeLocation),
    '무조건 저장 경로가 남아 있음',
  )
})

test('[고위험 4-a] 데이터가 없을 때 시세 평가 지시가 금지 지시로 바뀐다', () => {
  assert.ok(
    !analyzeLocation.includes('- 실거래가 동향을 기반으로 시세 수준과 투자 매력도 평가'),
    '무조건적 시세·투자 매력도 평가 지시가 남아 있음',
  )
  assert.ok(
    !analyzeLocation.includes('- 실거래가 동향 분석 포함`'),
    '무조건적 실거래가 동향 분석 지시가 남아 있음',
  )
  assert.match(analyzeLocation, /시세 수준·투자 매력도·평단가를 추정해 쓰지 말 것/)
  assert.match(analyzeLocation, /몇 건 기준인지/)
})

test("[고위험 4-b] 화면 노출 시 '실거래가 동향' 제목을 쓰지 않고 AI 생성임을 밝힌다", () => {
  const analysisTab = read('src/app/(dashboard)/projects/[id]/components/AnalysisTab.tsx')
  // 변경 전: 제목이 '실거래가 동향' 이라 공식 실거래 데이터로 오인될 소지가 있었다.
  assert.ok(
    !analysisTab.includes("'실거래가 동향'"),
    "AnalysisTab 에 '실거래가 동향' 제목이 남아 있음 (공적 데이터 오인 소지)",
  )
  assert.match(analysisTab, /AI_TREND_TITLE/)
  assert.match(analysisTab, /AI_TREND_NOTICE/)

  // 제목·안내 문구가 쉬운 한글로 사실을 밝힌다
  assert.match(AI_TREND_TITLE, /AI 자동 생성/)
  assert.match(AI_TREND_NOTICE, /공식 실거래 자료가 아니라/)
  assert.match(AI_TREND_NOTICE, /인용하지 마세요/)
  // 고대비 경고 스타일로 눈에 띄게 (조용히 섞이지 않게)
  assert.match(analysisTab, /border-amber-300/)
})

test('[고위험 4-c] 근거 없는 price_trend 는 seo-prompt 로 재주입되지 않는다', () => {
  // 변경 전: `- 실거래 시세 동향: ${ctx.price_trend || '정보 없음'}`
  // → AI 생성문이 '실거래 시세 동향'이라는 이름으로 다음 모델의 데이터가 됐다.
  assert.ok(
    !seoPrompt.includes("- 실거래 시세 동향: ${ctx.price_trend || '정보 없음'}"),
    '라벨 없는 price_trend 재주입 경로가 남아 있음',
  )
  assert.match(seoPrompt, /buildAiTrendPromptLine\(ctx\.price_trend\)/)

  // 값이 없으면 아무것도 주입하지 않는다
  assert.equal(buildAiTrendPromptLine(null), '')
  assert.equal(buildAiTrendPromptLine(undefined), '')
  assert.equal(buildAiTrendPromptLine(''), '')
  assert.equal(buildAiTrendPromptLine('   '), '')

  // 값이 없을 때의 대체 지시가 금액 추정을 막는다
  assert.match(seoPrompt, /제공된 실거래 데이터 없음 — 금액·평단가·시세 범위를 추정하지 말고/)
})

test('[고위험 4-c] 재주입하는 경우 AI 생성문이므로 근거로 쓰지 말라고 못박는다', () => {
  const line = buildAiTrendPromptLine('이 지역은 최근 3개월 상승세입니다.')
  assert.ok(line.includes('이 지역은 최근 3개월 상승세입니다.'), '본문이 전달되지 않음')

  // 라벨: '실거래가 동향'이라는 이름을 쓰지 않는다
  assert.ok(!line.includes('실거래 시세 동향:'), "재주입 라벨이 여전히 '실거래 시세 동향'이다")
  assert.match(line, /AI 자동 생성 시세 참고 메모/)
  assert.match(line, /사실 근거로 쓰지 말 것/)

  // 인용·비교·금액 산출 금지가 명시된다
  assert.match(line, /다른 AI 모델이 생성한 문장입니다/)
  assert.match(line, /금액·평단가·시세 범위·'시세 대비' 비교를 쓰지 마세요/)
  assert.match(line, /본문에 인용하지도 마세요/)
  assert.match(line, /정확한 시세는 문의 바랍니다/)
})

// ── 부수: 카드뉴스 긴박감·가격배지 강제 완화 ────────────────────────────────

test('[부수] 카드뉴스 고정 제목의 긴박감 문구가 제거됐다', () => {
  const cardNews = read('supabase/functions/generate-card-news/index.ts')
  assert.ok(
    !cardNews.includes('지금이 기회'),
    "카드 6장 고정 제목에 '지금이 기회' 긴박감 문구가 남아 있음",
  )
  // 가격 배지를 금액 없이도 채우도록 압박하지 않는다
  assert.ok(
    !cardNews.includes('"price_badge":"매매가 OO억 OO만원"'),
    'price_badge 가 여전히 금액 형식을 필수로 요구함',
  )
  assert.match(cardNews, /절대 금액을 지어내지 말 것/)
  assert.match(cardNews, /'미입력'이면 이 필드를 빈 문자열로 둔다/)
})

test('[부수] 미사용 목업 생성기의 보장·단정 표현이 제거됐다', () => {
  const cardNewsMock = read('src/lib/content/card-news.ts')
  const blogMock = read('src/lib/content/seo-blog.ts')
  for (const [name, source] of [
    ['card-news.ts', cardNewsMock],
    ['seo-blog.ts', blogMock],
  ] as const) {
    for (const banned of ['미래 가치 상승 보장', '놓치면 후회할 가격', '급매!', '베스트 매물', '강력하게 기대']) {
      assert.ok(!source.includes(banned), `${name} 에 금칙 표현이 남아 있음: ${banned}`)
    }
  }
  // 원 단위 숫자 그대로 노출 / 추측 표기도 제거됐다
  assert.ok(!cardNewsMock.includes("'상담가능'"))
  assert.ok(!blogMock.includes("'상담 환영'"))
})
