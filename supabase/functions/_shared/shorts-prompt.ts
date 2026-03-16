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

매물 정보와 입지 분석 결과를 바탕으로 유튜브 쇼츠(Shorts) 및 릴스용 숏폼 스크립트를 작성합니다.

[비디오 스크립트 구조]
1. Hook (첫 3초 시선 끌기)
2. Location advantage (입지 장점)
3. Key property features (핵심 매물 특징)
4. Target customer (추천 타겟 고객층)
5. Call to action (행동 유도)

[필수 요구사항]
- 15초 분량 스크립트와 30초 분량 스크립트를 모두 제공해 주세요.
- 짧고 간결한 문장을 사용하며 구어체로 작성할 것!
- 친숙하고 후킹(Hooking)이 강한 마케팅 메시지를 구성할 것!

응답 형식 (반드시 유효한 JSON 포맷):
{
  "hook": "첫 3초 후킹 멘트 (매력적이고 도발적으로)",
  "script_15s": [
    { "scene": 1, "video_visual": "화면 연출(예: 거실 패닝)", "narration": "내레이션" },
    ...
  ],
  "script_30s": [
    { "scene": 1, "video_visual": "화면 연출", "narration": "내레이션" },
    ...
  ],
  "hashtags": ["#부동산", "#숏폼", "#투자"] // 5개 이내
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
