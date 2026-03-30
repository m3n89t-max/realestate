import { buildBlogSystemPrompt, buildBlogUserPrompt, BlogPromptContext } from '../supabase/functions/_shared/seo-prompt.ts';

const mockContext: BlogPromptContext = {
  address: "경기도 화성시 진안동 00-00 (병점 진안동 먹자상권)",
  property_type: "상가",
  property_category: "제1종 근린생활시설",
  main_use: "음식점",
  transaction_type: "rent",
  deposit: 50000000,
  monthly_rent: 4500000,
  key_money: 30000000,
  area: 241, // 73평
  total_floors: 1,
  floor: 1,
  direction: "남향 (코너)",
  parking_actual: 10,
  features: ["단독건물", "코너자리", "24시상권", "주차편리", "희소매물"],
  note: "진안동 메인 먹자상업지역 내 위치한 단독 1층 건물입니다. 코너 자리라 가시성이 매우 좋고, 15년 이상 성업 중인 입증된 자리입니다. 주변 삼성전자 화성캠퍼스 배후 수요로 24시간 유동인구가 끊이지 않는 곳입니다.",
  location_advantages: ["병점역 도보 10분 거리", "대규모 주거단지 배후", "삼성전자 근거리"],
  commercial_grade: "A",
  commercial_type: "복합 (주거+직장인)",
  foot_traffic: { score: 85, label: "매우 높음", breakdown: { evening: "high", weekend: "medium" } },
  recommended_industries: { recommended: [{ name: "24시 국밥", reason: "삼성전자 야간 근무자 수요" }], not_recommended: [{ name: "고급 파인 다이닝", reason: "상권 특성상 가성비 중시" }] },
  price_trend: "최근 1년 내 실거래가 5% 상승세 유지 중",
  land_use_summary: "일반상업지역 및 제2종 일반주거지역 혼재",
  style: 'informative',
  tone: 'friendly',
  format: 'default',
  focus: 'location',
  photo_urls: [
    { url: "https://example.com/exterior.jpg", alt: "상가 외관 코너 자리", category: "외관", analysis: "코너 자리에 위치하여 가시성이 매우 뛰어나며, 전면 유리창이 넓어 개방감이 좋습니다. 깔끔한 신축급 컨디션의 외관입니다." },
    { url: "https://example.com/interior.jpg", alt: "넓은 내부 공간", category: "내부", analysis: "내부는 화이트톤으로 깔끔하며 천장이 높아 공간이 더 넓어 보입니다. 바닥 상태도 매우 양호한 상태입니다." },
    { url: "https://example.com/parking.jpg", alt: "넉넉한 주차 공간", category: "주차장", analysis: "건물 바로 앞에 넓고 평탄한 전용 주차 공간이 확보되어 있어 차량 접근성이 매우 우수합니다." }
  ]
};

async function test() {
  console.log('--- SYSTEM PROMPT ---');
  console.log(buildBlogSystemPrompt());
  console.log('\n--- USER PROMPT ---');
  console.log(buildBlogUserPrompt(mockContext));
}

test();
