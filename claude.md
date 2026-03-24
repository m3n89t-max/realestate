# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RealEstate AI OS - 공인중개사용 부동산 업무 자동화 SaaS 플랫폼. 주소/사진/특장점 입력만으로 입지 분석, 건축물대장 수집, SEO 블로그/카드뉴스/쇼츠 콘텐츠를 자동 생성한다.

## Development Commands

```bash
npm run dev          # Next.js 개발 서버 (포트 3001; 3000이 사용 중이므로)
npm run build        # 프로덕션 빌드
npm run lint         # ESLint
npm run type-check   # TypeScript 타입 검사 (빌드 없이)

# Local Automation Agent
npm run agent:start  # tsx로 에이전트 워커 실행
npm run agent:dev    # Electron 에이전트 개발 모드
npm run agent:build  # Windows 배포용 빌드

# E2E 테스트
npm run test:e2e
npm run test:e2e:ui

# Supabase Edge Functions 배포
npx supabase functions deploy <function-name>
```

## Architecture

### Frontend (Next.js App Router)

- `src/app/(auth)/` - 인증 불필요 라우트 (login, onboarding). layout.tsx에 `force-dynamic` 적용.
- `src/app/(dashboard)/` - 인증 필요 라우트. layout.tsx가 Supabase 세션 + 조직 정보 + 에이전트 상태 로드.
- `src/app/(dashboard)/projects/[id]/page.tsx` - 탭 기반 매물 상세 (overview/analysis/blog/card_news/shorts/docs/tasks/package). URL searchParam `tab`으로 탭 제어.

**중요 패턴:**
- Supabase를 직접 사용하는 Server Component 페이지는 반드시 `export const dynamic = 'force-dynamic'` 선언 필요.
- 클라이언트 컴포넌트: `src/lib/supabase/client.ts`의 `createClient()` 사용.
- 서버 컴포넌트: `src/lib/supabase/server.ts`의 `createClient()` (SSR 쿠키 기반) 또는 `createAdminClient()` (service role) 사용.

### Backend (Supabase Edge Functions)

`supabase/functions/` 폴더는 **Deno 런타임**이며 `tsconfig.json` exclude 목록에 포함. Node.js import 불가, `https://esm.sh/` URL import 사용.

**공통 헬퍼** (`supabase/functions/_shared/`):
- `auth.ts` - `getAuthenticatedUser()`, `getOrgId()`, `checkQuota()` 필수 패턴
- `cors.ts` - CORS 헤더 + preflight 처리
- `openai.ts` - GPT-4o 호출 래퍼
- `masking.ts` - 개인정보(상세 번지) 마스킹
- `seo-prompt.ts` - 블로그 프롬프트 빌더
- `shorts-prompt.ts` - 쇼츠 스크립트 프롬프트 빌더

**Edge Function 표준 패턴:**
```typescript
Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  try {
    const { user, supabaseClient } = await getAuthenticatedUser(req)
    const orgId = await getOrgId(supabaseClient, user.id)
    await checkQuota(supabaseClient, orgId, 'generation')
    // ... 비즈니스 로직
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: corsHeaders })
  }
})
```

### Database

멀티테넌트 구조 - 모든 데이터는 `org_id` 기반으로 RLS 정책으로 격리.

핵심 테이블: `organizations`, `memberships`, `projects`, `assets`, `generated_contents`, `documents`, `tasks`, `agent_connections`, `location_analyses`, `usage_logs`

마이그레이션 파일: `supabase/migrations/` (001~019 순서)

### Task Queue

자동화 작업은 `tasks` 테이블로 관리. Local Agent가 Supabase Realtime을 구독하여 `pending` 작업을 처리.

`TaskType`: `naver_upload` | `youtube_upload` | `building_register` | `seumteo_api` | `video_render` | `pdf_merge`

### Local Agent

`src/agent/worker.ts` - `agent_key` 인증 (JWT 아님), Playwright 기반 RPA. 서버에 크레덴셜 저장 금지.

## Key Types (`src/lib/types.ts`)

- `Project` - 매물 (address, property_type, transaction_type, price/deposit/monthly_rent, area, etc.)
- `GeneratedContent` - AI 생성 콘텐츠 (blog, card_news, video_script, location_analysis)
- `Task` - 자동화 작업 큐 항목
- `BlogTone` - `professional` | `friendly` | `emotional` | `intuitive`
- `TransactionType` - `sale` | `lease` | `rent`

**주의:** `src/lib/types.ts`와 `supabase/functions/generate-blog/index.ts`에 미해결 git merge conflict marker가 있음. 작업 전 확인 필요.

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_KAKAO_MAP_API_KEY   # 지도 + 지오코딩
OPENAI_API_KEY                  # gpt-4o
```

## Content Generation

- **블로그**: `generate-blog` Edge Function → GPT-4o → `generated_contents` 저장. 1500자+, H2 7개+, FAQ, 해시태그 30개, 개인정보 마스킹 필수.
- **카드뉴스**: `generate-card-news` → 6~8장 슬라이드 JSON. `generate-card-image`로 이미지 렌더링.
- **입지분석**: `analyze-location` → `location_analyses` 테이블 저장. 카카오 밀도 데이터(`kakao_density`), 실거래가(`real_price_data`), 상권(`commercial_data`) 포함.
- **쇼츠 스크립트**: `generate-shorts-script` → 15/30/60초 씬 구성.

## SEO Blog Structure

H1: 지역명+매물유형+핵심강점 / H2 순서: 매물 개요(매물 정보표 HTML 포함) > 입지 장점 7가지 > 주변 인프라 > 시장 전망 > 실거주/투자 포인트 > FAQ > 문의 안내

## 개발 검증 & 배포 규칙 (MANDATORY)

코드 변경 후 커밋 전, 반드시 아래 순서로 검증하고 push까지 실행한다:

```bash
# 1. 타입 검사
npm run type-check

# 2. 린트 검사
npm run lint

# 3. 프로덕션 빌드 검증
npm run build

# 4. 커밋 후 즉시 push
git push
```

**규칙:**
- 위 3단계 검증이 모두 통과한 경우에만 커밋한다.
- 커밋 후에는 반드시 `git push`를 실행하여 원격 저장소에 반영한다.
- 빌드 오류가 발생하면 수정 후 재검증한다. push 없이 작업을 마치지 않는다.
