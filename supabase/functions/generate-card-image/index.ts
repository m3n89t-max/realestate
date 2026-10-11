// 폐기된 경로.
//
// 이 함수는 DALL·E 3 로 '텍스트 없는 배경 건물 사진'을 생성했다.
// 실제 매물 사진이 아닌 이미지가 매물 광고에 쓰일 수 있어 제품에서 제외한다.
// 중개사가 그 카드를 올리면 존재하지 않는 건물로 광고하는 셈이 된다.
//
// 카드 이미지는 실제 업로드된 매물 사진을 입력으로 받는
// src/app/api/generate-card-image/route.ts 만 사용한다.
// 그 경로는 사진이 없거나 내려받지 못하면 생성을 거절한다
// (photo_required / photo_fetch_failed).
//
// UI 호출처는 없었지만 함수가 배포된 상태여서 외부에서 직접 호출할 수 있었다.
// 그래서 파일을 지우는 대신 410 으로 명확히 거절한다.

import { corsHeaders, handleCors } from '../_shared/cors.ts'

Deno.serve((req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  return new Response(
    JSON.stringify({
      data: null,
      error:
        '이 경로는 폐기되었습니다. 실제 매물 사진 없이 건물 이미지를 만들어내지 않습니다. 사진을 업로드한 뒤 카드 이미지를 생성해 주세요.',
      meta: { timestamp: new Date().toISOString() },
    }),
    {
      status: 410,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  )
})
