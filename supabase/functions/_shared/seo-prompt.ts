// SEO 최적화 부동산 블로그 생성 프롬프트 템플릿

export interface BlogPromptContext {
  address: string
  property_type: string
  price?: number
  area?: number
  floor?: number
  total_floors?: number
  direction?: string
  features?: string[]
  location_advantages?: string[]
  nearby_facilities?: Record<string, unknown>
  style: 'informative' | 'investment' | 'lifestyle'
  photo_urls?: { url: string; alt: string; category?: string }[]
}

export function buildBlogSystemPrompt(): string {
  return `당신은 대한민국 부동산 SEO 전문가이자 공인중개사 마케팅 전문가입니다.
네이버 블로그 검색 상위 노출을 목표로, 실제 잠재 구매자/임차인이 검색하는 방식의 키워드를 반영한 블로그 글을 작성하세요.

[필수 SEO 규칙 - 반드시 준수]
1. 제목(H1): 지역명 + 매물유형 + 핵심강점 (예: 강남구 역삼동 아파트 매매 - 역세권·학군우수·남향 84㎡ 완벽 분석)

2. 본문 최소 1,500자 이상 작성 (자연스러운 한국어 작성)

3. H2 섹션 고정 구조 (아래 순서대로 반드시 작성):
   - ## 매물 개요
   - ## 입지 장점 7가지
   - ## 주변 인프라 분석
   - ## 상권 또는 생활환경 분석
   - ## 추천 수요층
   - ## 투자 또는 운영 관점
   - ## FAQ
   - ## 문의 안내

4. 블로그 제목 5개 제안 (아래 5가지 스타일을 각각 1개씩 작성):
   - [정보형] 지역명+매물유형+핵심강점 나열 (예: 강남구 역삼동 아파트 매매 - 역세권·학군우수·남향 84㎡ 완벽 분석)
   - [후킹형] 숫자/임팩트 강조 (예: "이 아파트 하나면 끝" - 역삼동 84㎡, 지금 안 보면 후회합니다)
   - [질문형] 독자 궁금증 자극 (예: 역삼동 아파트 왜 이 가격? 직접 가보고 알게 된 이유)
   - [감성형] 라이프스타일·스토리텔링 (예: 매일 아침 한강 뷰로 시작하는 삶 - 역삼동 고층 아파트 실거주 후기)
   - [숫자형] 구체적 데이터 강조 (예: 지하철 3분·학원가 5분·편의점 1분 - 역삼동 역세권 아파트 실측 입지 분석)
   FAQ 5개 제안, 해시태그 30개 제안

5. 사진 삽입 규칙 (매물 사진이 제공된 경우 반드시 준수):
   - 제공된 사진 마크다운(![alt](url))을 각 H2 섹션 본문 안에 즉시 삽입 (절대로 글 맨 마지막에 몰아서 배치하지 말 것)
   - 사진1 → "## 매물 개요" 섹션 본문 내, 사진2 → "## 입지 장점" 섹션 내, 사진3 → "## 주변 인프라" 섹션 내 순서로 분산 배치
   - 각 사진 바로 아래에 *▲ 캡션* 형태의 이탤릭 캡션 필수 추가
   - 이미지 ALT 태그(대체 텍스트) 필수 생성
   - 사진이 없는 경우 이미지 ALT 태그 텍스트 3개 이상 제안

6. 키워드를 전반적으로 자연스럽게 분포시킬 것

[출력 형식: JSON]
{
  "titles": ["제목1", "제목2", "제목3", "제목4", "제목5"],
  "meta_description": "150자 이내 메타 설명 (검색결과 클릭률 최적화)",
  "content": "마크다운 본문 (H1~H2 구조 전면 반영)",
  "tags": ["해시태그1", "해시태그2", ...], // 정확히 30개
  "faq": [{"q": "질문", "a": "답변"}, ...], // 정확히 5개
  "alt_tags": ["ALT태그1", "ALT태그2", ...],
  "seo_score": {
    "keyword_in_title": true/false,
    "min_length": true/false,
    "has_h2": true/false,
    "has_faq": true/false,
    "has_alt": true/false,
    "longtail_keywords": true/false,
    "total_score": 0-100
  }
}`
}

export function buildBlogUserPrompt(ctx: BlogPromptContext): string {
  const styleGuide = {
    informative: '실거주자를 위한 정보 중심 글. 입지/인프라/생활환경을 상세히 설명.',
    investment: '투자자를 위한 시세분석 및 수익률 관점의 글. 시장 동향/가치 상승 요인 강조.',
    lifestyle: '라이프스타일 중심의 감성적 글. 동네 분위기/생활 편의/커뮤니티 강조.',
  }[ctx.style]

  const priceText = ctx.price
    ? `${Math.floor(ctx.price / 100000000)}억 ${Math.floor((ctx.price % 100000000) / 10000) > 0 ? Math.floor((ctx.price % 100000000) / 10000) + '만원' : ''}`
    : '가격 협의'

  return `다음 매물 정보로 SEO 최적화 부동산 블로그 글을 작성하세요.

[매물 기본 정보]
- 주소: ${ctx.address}
- 매물 유형: ${ctx.property_type}
- 가격: ${priceText}
- 전용면적: ${ctx.area ? `${ctx.area}㎡ (약 ${(ctx.area / 3.3058).toFixed(1)}평)` : '정보 없음'}
- 층수: ${ctx.floor && ctx.total_floors ? `${ctx.floor}층 / 전체 ${ctx.total_floors}층` : '정보 없음'}
- 방향: ${ctx.direction ?? '정보 없음'}
- 특징: ${ctx.features?.join(', ') ?? '없음'}

[매물 사진 - 본문에 반드시 삽입]
${ctx.photo_urls && ctx.photo_urls.length > 0
      ? ctx.photo_urls.map((p, i) => `사진${i + 1}(${p.category ?? '매물'}): ![${p.alt}](${p.url})\n  → 이 사진 아래에 *▲ ${p.category ?? '매물'} 사진 - 실제 현장 모습입니다* 형태의 캡션을 추가하세요`).join('\n')
      : '(등록된 사진 없음)'}
※ 사진은 반드시 관련 섹션 본문 중간에 배치하고 글 마지막에 몰아두지 마세요. 각 사진은 해당 공간(거실→실내구조, 외관→매물개요, 뷰→입지장점 등) 설명 뒤에 즉시 삽입하고, 아래에 *▲ 설명* 캡션을 추가하세요.

[입지 분석 결과]
${ctx.location_advantages?.map((a, i) => `${i + 1}. ${a}`).join('\n') ?? '입지 분석 결과 없음 (주소 기반으로 추론하여 작성)'}

[글 스타일]
${styleGuide}

[지역 분석 지침]
- 지역명에서 자치구, 행정동, 아파트명을 파악하여 해당 지역의 특성을 반영
- 교통: 가장 가까운 지하철역과 도보 시간 추론
- 학군: 해당 지역의 학군 특성 반영
- 상권: 주변 대형마트, 백화점, 재래시장 등 언급

위 정보를 바탕으로 검색 상위 노출이 가능한 완성도 높은 블로그 글을 JSON 형식으로 작성하세요.`
}

// ── 서버사이드 SEO 점수 계산 ────────────────────────────────────────────────

export interface SeoScoreDetailed {
  total: number
  breakdown: {
    has_h1: boolean
    h2_count: number
    char_count: number
    keyword_density: number
    has_faq: boolean
    faq_count: number
    has_alt_tags: boolean
    has_cta: boolean
    has_hashtags: boolean
  }
}

export function calculateSeoScore(content: string, keywords: string[]): SeoScoreDetailed {
  const hasH1 = content.includes('# ') || /<h1/i.test(content)
  const h2Matches = content.match(/## |<h2/gi) || []
  const charCount = content.replace(/[#<>*\[\]]/g, '').length

  const totalWords = content.split(/\s+/).length
  const keywordOccurrences = keywords.reduce((count, kw) => {
    const regex = new RegExp(kw, 'gi')
    return count + (content.match(regex) || []).length
  }, 0)
  const density = totalWords > 0 ? (keywordOccurrences / totalWords) * 100 : 0

  const hasFaq = content.toLowerCase().includes('faq') || content.includes('자주 묻는')
  const faqMatches = content.match(/\?/g) || []
  const hasAltTags = content.includes('alt=') || content.includes('[사진')
  const hasCta = content.includes('문의') || content.includes('연락') || content.includes('상담')
  const hasHashtags = content.includes('#')

  let total = 0
  if (hasH1) total += 10
  if (h2Matches.length >= 7) total += 15
  else if (h2Matches.length >= 5) total += 10
  if (charCount >= 1500) total += 20
  else if (charCount >= 1000) total += 10
  if (density >= 1 && density <= 3) total += 15
  if (hasFaq) total += 15
  if (hasAltTags) total += 10
  if (hasCta) total += 10
  if (hasHashtags) total += 5

  return {
    total,
    breakdown: {
      has_h1: hasH1,
      h2_count: h2Matches.length,
      char_count: charCount,
      keyword_density: Math.round(density * 100) / 100,
      has_faq: hasFaq,
      faq_count: faqMatches.length,
      has_alt_tags: hasAltTags,
      has_cta: hasCta,
      has_hashtags: hasHashtags,
    },
  }
}
