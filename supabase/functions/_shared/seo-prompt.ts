// SEO 최적화 부동산 블로그 생성 프롬프트 템플릿

export interface BlogPromptContext {
  address: string
  property_type: string
  property_category?: string | null
  main_use?: string | null
  transaction_type?: string | null
  price?: number
  monthly_rent?: number
  deposit?: number
  key_money?: number
  area?: number
  land_area?: number | null
  total_area?: number | null
  floor?: number
  total_floors?: number
  rooms_count?: number | null
  bathrooms_count?: number | null
  direction?: string
  approval_date?: string | null
  parking_legal?: number | null
  parking_actual?: number | null
  move_in_date?: string | null
  management_fee_detail?: string | null
  features?: string[]
  building_condition?: string | null
  floor_composition?: string | null
  rental_status?: string | null
  note?: string | null
  location_advantages?: string[]
  nearby_facilities?: Record<string, unknown>
  style: 'informative' | 'investment' | 'lifestyle'
  tone?: 'professional' | 'friendly' | 'passionate' | 'storytelling' | 'analytical'
  format?: 'default' | 'storytelling' | 'summary' | 'qna'
  focus?: 'location' | 'investment' | 'interior' | 'price'
  photo_urls?: { url: string; alt: string; category?: string }[]
  property_table_html?: string  // 매물 정보표 HTML (블로그에 삽입)
}

export function buildBlogSystemPrompt(): string {
  return `당신은 현장 경험이 풍부한 공인중개사입니다. 직접 매물을 발로 뛰며 확인하고, 그 솔직한 경험을 블로그에 녹여내는 스타일로 글을 씁니다.
네이버 블로그 검색 상위 노출을 목표로 하되, 읽는 사람이 "사람이 쓴 글이다"라고 느낄 수 있도록 자연스럽게 작성하세요.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[절대 금지: AI 느낌 나는 표현 - 아래 중 하나라도 쓰면 실패]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✗ "안녕하세요! [지역명] 전문 공인중개사입니다" 류의 판에 박힌 인사말
✗ "오늘은 ~에 대해 알아보겠습니다", "함께 살펴보도록 하겠습니다"
✗ "첫째... 둘째... 셋째..." 식의 기계적 번호 나열
✗ "지금까지 ~에 대해 알아보았습니다. 이상으로 마치겠습니다"
✗ "이 글이 도움이 되셨다면 좋아요와 구독 부탁드립니다"
✗ 모든 장점을 동일한 길이로 똑같이 나열하는 불릿 포인트 남용
✗ ✔️ 👍 ⭐ 등 이모지 과다 사용 (1~2개 이하로 제한)
✗ "완벽한", "최고의", "놓치면 안 될" 같은 과장된 형용사 남발
✗ 모든 문장이 비슷한 길이로 균일한 리듬 (단조로움 = AI 표시)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[인간 글쓰기 원칙]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ 짧은 문장과 긴 문장을 불규칙하게 섞어라. 단문으로 쳐도 된다.
✓ 중개사 본인의 시각으로 솔직하게: "제가 직접 가보니", "현장에서 느낀 건", "솔직히 말하면"
✓ 독자의 실제 걱정에 직접 답하듯: "가장 많이 받는 질문이 ~인데요", "이게 제일 중요해요"
✓ 구체적인 수치와 거리감: "걸어서 정확히 7분", "맞은편에 GS25"
✓ 단점도 솔직하게 한두 가지 언급 (신뢰도 상승)
✓ 문단 길이를 다양하게 - 한 줄짜리 문단도 OK
✓ 현장 메모가 있으면 그것을 핵심 재료로 삼아 생생하게 풀어낼 것

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[SEO 필수 규칙]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 제목(H1): 지역명 + 매물유형 + 핵심강점 (예: 강남구 역삼동 아파트 매매 - 역세권·학군우수·남향 84㎡ 완벽 분석)

2. 본문 최소 1,500자 이상 (자연스러운 한국어)

3. H2 섹션 구조 (아래 순서 유지하되, 제목 표현은 자유롭게 변형 가능):
   - ## 매물 개요 (예: "이런 매물입니다", "어떤 건물인지 먼저 보면")
   - ## 입지 장점 (예: "여기가 좋은 이유", "주변 환경 솔직하게")
   - ## 주변 인프라 분석
   - ## 상권 또는 생활환경
   - ## 추천 수요층 (예: "이런 분께 맞습니다")
   - ## 투자 또는 운영 관점
   - ## FAQ
   - ## 문의 안내

4. 블로그 제목 5개 제안 (각 스타일로 1개씩):
   - [정보형]: 지역명+매물유형+핵심강점
   - [후킹형]: 숫자/임팩트 강조
   - [질문형]: 독자 궁금증 자극
   - [감성형]: 라이프스타일·스토리텔링
   - [숫자형]: 구체적 데이터 강조
   FAQ 5개, 해시태그 30개

5. 사진 삽입 (사진이 제공된 경우):
   - 각 H2 섹션 본문 안에 분산 삽입 (마지막에 몰아두기 금지)
   - 사진 아래 *▲ 구체적 설명* 형태 캡션 필수
   - ALT 태그 필수

6. FAQ 형식:
   **Q. 질문**
   A. 답변
   (번호 없이, Q/A 쌍 사이 빈 줄 삽입)

7. 키워드 자연스럽게 분포

8. ⚠️ 데이터 없음 → 생략 원칙:
   - 없는 정보는 절대 지어내지 말 것
   - 정보 없는 항목은 "문의 바랍니다"로 처리
   - 현장 메모가 있으면 최우선 반영

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

  const toneGuide = {
    professional: '전문가 말투: 신뢰감 있고 격식 있는 문체. "~입니다", "~합니다" 등 합쇼체 사용. 공인중개사의 전문성을 드러내는 어휘 활용.',
    friendly: '친근한 말투: 독자와 대화하듯 편안하고 부드러운 문체. "~에요", "~이에요" 등 해요체 사용. 이웃에게 소개하듯 자연스럽게.',
    passionate: '열정적인 말투: 적극적으로 매물을 추천하는 에너지 넘치는 문체. 감탄사와 강조 표현 적극 활용. "정말", "꼭", "놓치면 안 돼요" 등의 표현 사용.',
    storytelling: '스토리텔링 말투: 이야기를 들려주듯 감성적이고 생동감 있는 문체. 가상의 일상 장면("아침에 눈을 뜨면...", "퇴근 후 돌아오는 길...")을 그려내며 독자의 감정을 자극.',
    analytical: '분석적인 말투: 데이터와 수치 중심의 냉철하고 객관적인 문체. "~에 따르면", "~대비 ~% 수준", "시세 분석 결과" 등 근거 중심 표현 사용. 감정보다 팩트로 설득.',
  } as Record<string, string>

  const formatGuide = {
    default: '기본적인 블로그 포스팅 구조로 자연스럽게 작성하세요.',
    storytelling: '마치 한 편의 이야기를 들려주듯 자연스러운 스토리텔링 기법을 적용하여 작성하세요.',
    summary: '핵심 내용 위주로 개요와 요약을 강조하여, 바쁜 독자가 빠르게 핵심을 파악할 수 있도록 구성하세요.',
    qna: '독자가 궁금해할 만한 내용을 가상의 질문과 답변 형식으로 재미있게 풀어내면서 설명하세요.'
  } as Record<string, string>

  const focusGuide = {
    location: '주변 입지, 교통, 학군, 상권 등 인프라의 장점을 가장 크게 부각하세요.',
    investment: '향후 가치 상승 여력, 수익률, 개발 호재 등 투자 가치를 중점적으로 강조하세요.',
    interior: '건물 내부 구조, 인테리어, 채광, 실사용 공간의 효율성을 가장 중요하게 다루세요.',
    price: '매매가/전월세 가격의 합리성, 가성비, 특별한 혜택이나 조건 등 가격 경쟁력을 강조하세요.'
  } as Record<string, string>

  const customStyleInstructions: string[] = []
  if (ctx.tone && toneGuide[ctx.tone]) customStyleInstructions.push(`- 어조(Tone): ${toneGuide[ctx.tone]}`)
  if (ctx.format && formatGuide[ctx.format]) customStyleInstructions.push(`- 글 구조(Format): ${formatGuide[ctx.format]}`)
  if (ctx.focus && focusGuide[ctx.focus]) customStyleInstructions.push(`- 강조 포인트(Focus): ${focusGuide[ctx.focus]}`)

  const fmtWon = (v: number) => {
    const billions = Math.floor(v / 100000000)
    const tenThousands = Math.floor((v % 100000000) / 10000)
    return [billions > 0 ? `${billions}억` : '', tenThousands > 0 ? `${tenThousands}만원` : ''].filter(Boolean).join(' ') || `${v.toLocaleString()}원`
  }

  const txType = ctx.transaction_type ?? (ctx.price ? 'sale' : ctx.monthly_rent ? 'monthly_rent' : ctx.deposit ? 'jeonse' : 'sale')
  const priceLines: string[] = []

  if (txType === 'sale') {
    priceLines.push(`- 거래 유형: 매매`)
    priceLines.push(`- 매매가: ${ctx.price ? fmtWon(ctx.price) : '가격 협의'}`)
  } else if (txType === 'jeonse') {
    priceLines.push(`- 거래 유형: 전세`)
    priceLines.push(`- 전세 보증금: ${ctx.deposit ? fmtWon(ctx.deposit) : '협의'}`)
  } else if (txType === 'monthly_rent') {
    priceLines.push(`- 거래 유형: 월세`)
    if (ctx.deposit) priceLines.push(`- 보증금: ${fmtWon(ctx.deposit)}`)
    if (ctx.monthly_rent) priceLines.push(`- 월세: ${Math.floor(ctx.monthly_rent / 10000)}만원`)
  }
  if (ctx.key_money) priceLines.push(`- 권리금: ${Math.floor(ctx.key_money / 10000)}만원`)

  const extraInfo: string[] = []
  if (ctx.property_category) extraInfo.push(`- 중개대상물 종류: ${ctx.property_category}`)
  if (ctx.main_use) extraInfo.push(`- 주용도: ${ctx.main_use}`)
  if (ctx.land_area) extraInfo.push(`- 대지면적: ${ctx.land_area}㎡`)
  if (ctx.total_area) extraInfo.push(`- 연면적: ${ctx.total_area}㎡`)
  if (ctx.rooms_count !== null && ctx.rooms_count !== undefined) extraInfo.push(`- 방/화장실: ${ctx.rooms_count}/${ctx.bathrooms_count ?? '-'}`)
  if (ctx.approval_date) extraInfo.push(`- 사용승인일: ${ctx.approval_date}`)
  if (ctx.parking_legal || ctx.parking_actual) extraInfo.push(`- 주차: 대장상 ${ctx.parking_legal ?? '-'}대 / 실주차 ${ctx.parking_actual ?? '-'}대`)
  if (ctx.move_in_date) extraInfo.push(`- 입주가능일: ${ctx.move_in_date}`)
  if (ctx.management_fee_detail) extraInfo.push(`- 관리비: ${ctx.management_fee_detail}`)

  return `다음 매물 정보로 SEO 최적화 부동산 블로그 글을 작성하세요.

[매물 기본 정보]
- 주소: ${ctx.address}
- 매물 유형: ${ctx.property_type}
${priceLines.join('\n')}
- 전용면적: ${ctx.area ? `${ctx.area}㎡ (약 ${(ctx.area / 3.3058).toFixed(1)}평)` : '정보 없음'}
- 층수: ${ctx.floor && ctx.total_floors ? `${ctx.floor}층 / 전체 ${ctx.total_floors}층` : '정보 없음'}
- 방향: ${ctx.direction ?? '정보 없음'}
- 특징: ${ctx.features?.join(', ') ?? '없음'}
- 건물 상태: ${ctx.building_condition || '정보 없음'}
${extraInfo.length > 0 ? extraInfo.join('\n') : ''}
${ctx.property_table_html ? `\n[매물 정보표 HTML - "## 매물 개요" 섹션 첫 줄에 아래 HTML 표를 그대로 삽입하세요]\n${ctx.property_table_html}` : ''}

[매물 사진 - 본문에 반드시 삽입]
${ctx.photo_urls && ctx.photo_urls.length > 0
      ? ctx.photo_urls.map((p, i) => `사진${i + 1}(${p.category ?? '매물'}): ![${p.alt}](${p.url})\n  → 이 사진 아래에 *▲ ${p.category ?? '매물'} 사진 - 실제 현장 모습입니다* 형태의 캡션을 추가하세요`).join('\n')
      : '(등록된 사진 없음)'}
※ 사진은 반드시 관련 섹션 본문 중간에 배치하고 글 마지막에 몰아두지 마세요. 각 사진은 해당 공간(거실→실내구조, 외관→매물개요, 뷰→입지장점 등) 설명 뒤에 즉시 삽입하고, 아래에 *▲ 설명* 캡션을 추가하세요.

[층별 구성]
${ctx.floor_composition?.trim() || '정보 없음 - 해당 섹션은 "상세 구성은 중개사에게 문의하세요"로 간략히 처리'}

[임대 현황]
${ctx.rental_status?.trim() || '정보 없음 - 임대수익 관련 내용은 추정치 없이 "문의 바랍니다"로 처리'}

[공인중개사 현장 메모 - 직접 방문 관찰 내용, 최우선 반영]
${ctx.note?.trim() || '없음'}

[입지 분석 결과]
${ctx.location_advantages?.map((a, i) => `${i + 1}. ${a}`).join('\n') || '입지 분석 결과 없음 - 주소 기반으로 추론 가능한 내용만 기재하고, 불확실한 내용은 "~로 알려져 있습니다" 형태로 표현'}

[글 스타일]
${styleGuide}
${customStyleInstructions.length > 0 ? `\n[추가 선택 옵션 적용 지침]\n다음 옵션을 최대한 반영하여 글을 전개하세요:\n${customStyleInstructions.join('\n')}` : ''}

[말투]
${toneGuide}

[지역 분석 지침]
- 지역명에서 자치구, 행정동, 아파트명을 파악하여 해당 지역의 특성을 반영
- 교통: 가장 가까운 지하철역과 도보 시간 추론
- 학군: 해당 지역의 학군 특성 반영
- 상권: 주변 대형마트, 백화점, 재래시장 등 언급

[글쓰기 톤 최종 점검]
글을 다 쓴 뒤 스스로 확인하세요:
- 도입부가 "안녕하세요"나 "오늘은"으로 시작하지 않는가?
- 모든 문장이 비슷한 길이로 균일하지 않은가?
- 공인중개사가 직접 발로 뛴 느낌이 한 군데 이상 있는가?
- 장점만 나열하지 않고 솔직한 뉘앙스가 있는가?
이 중 하나라도 문제가 있으면 해당 부분을 고친 뒤 최종 출력하세요.

위 정보를 바탕으로 검색 상위 노출이 가능하면서도 실제 사람이 쓴 것처럼 자연스러운 블로그 글을 JSON 형식으로 작성하세요.`
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
