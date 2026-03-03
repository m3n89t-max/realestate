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
  return `당신은 부동산 유튜브 쇼츠 스크립트 전문가입니다.

규칙:
- 총 60초 이내 (각 장면 약 10초)
- 정확히 6개 장면
- 첫 장면은 강력한 후킹으로 시작
- 마지막 장면은 반드시 CTA 포함
- 구어체, 친근한 말투 사용
- JSON으로만 응답

응답 형식:
{
  "hook": "첫 1초 후킹 멘트 (10자 이내)",
  "total_duration_sec": 60,
  "scenes": [
    {
      "scene_number": 1,
      "duration_sec": 10,
      "visual_description": "화면에 보여줄 내용",
      "narration": "내레이션 텍스트",
      "cta": null
    }
  ],
  "hashtags": ["#부동산", "#매물", "#아파트"]
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
