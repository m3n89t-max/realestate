// 부동산 유튜브 쇼츠 스크립트 프롬프트 템플릿

export interface ShortsScene {
  scene_number: number
  duration_sec: number
  visual_description: string
  narration: string
  cta: string | null
}

export interface ShortsScript {
  hook: string
  total_duration_sec: number
  scenes: ShortsScene[]
  hashtags: string[]
}

export function buildShortsSystemPrompt(): string {
  return `당신은 부동산 유튜브/인스타그램 영상 스크립트 전문가입니다.

매물 정보와 입지 분석 결과를 바탕으로 유튜브 쇼츠(Shorts) 및 릴스용 60초 숏폼 스크립트를 작성합니다.

[비디오 스크립트 구조 - 6장면 60초]
- 장면1 (10초): Hook - 시청자가 멈춰보게 만드는 강렬한 오프닝
- 장면2 (10초): 매물 핵심 소개 (위치, 유형, 가격)
- 장면3 (10초): 입지/교통 장점
- 장면4 (10초): 매물 주요 특징 (넓이, 구조, 상태)
- 장면5 (10초): 투자 가치 및 추천 타겟
- 장면6 (10초): CTA (전화/문의 유도)

[필수 요구사항]
- 짧고 간결한 구어체 문장 사용
- 후킹이 강한 마케팅 메시지 구성
- 매물 사진/동영상이 있는 경우 해당 장면 연출에 활용
- 해시태그 15개 이상 (지역명, 매물유형, 투자 키워드 포함)

응답 형식 (반드시 유효한 JSON):
{
  "hook": "첫 3초 후킹 멘트 (매력적이고 강렬하게)",
  "total_duration_sec": 60,
  "scenes": [
    {
      "scene_number": 1,
      "duration_sec": 10,
      "visual_description": "화면 연출 설명 (예: 건물 외관 드론샷 → 거실 인테리어 패닝)",
      "narration": "나레이션 텍스트",
      "cta": null
    },
    {
      "scene_number": 6,
      "duration_sec": 10,
      "visual_description": "화면 연출",
      "narration": "나레이션",
      "cta": "지금 바로 문의하세요! 010-XXXX-XXXX"
    }
  ],
  "hashtags": ["#부동산", "#투자", "#아파트"]
}`
}

export function buildShortsUserPrompt(project: {
  address: string
  property_type: string
  price?: string
  description?: string
  features?: string[]
  location_summary?: string
}): string {
  return `다음 매물의 유튜브 쇼츠 스크립트를 작성하세요:

주소: ${project.address}
매물유형: ${project.property_type}
${project.price ? `가격: ${project.price}` : ''}
${project.description ? `소개: ${project.description}` : ''}
${project.features?.length ? `특장점: ${project.features.join(', ')}` : ''}
${project.location_summary ? `입지분석 요약: ${project.location_summary}` : ''}`
}
