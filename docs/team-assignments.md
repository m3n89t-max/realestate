# RealEstate AI OS - Team Assignments
**Version:** 1.0
**Date:** 2026-03-03
**Author:** System Architect

---

## Gap Analysis Summary

| Area | What Exists | What Is Missing |
|------|------------|----------------|
| Edge Functions | generate-blog, generate-card-news, analyze-location, analyze-document, seumteo-api, validate-license, webhook-agent | generate-shorts-script, normalize-parcel |
| Response Format | Each function returns ad-hoc JSON | Standard `{ data, error, meta }` envelope on all functions |
| DB Schema | 13 tables, basic task types | Task type ENUM incomplete vs spec; missing stale task watchdog; missing agent RLS for Realtime |
| Frontend — Project Detail | Blog tab, CardNews tab, Docs tab | Shorts tab, Tasks tab (real-time status), Package tab (functional) |
| Frontend — Login | Basic email/password form | Redesigned marketing landing + social proof |
| Card News | Instagram template only | Kakao template (16:9, wider text) |
| Shorts Script | Not started | New Edge Function + UI tab |
| Agent Protocol | webhook-agent handler exists | RLS for Realtime subscription, stale task watchdog, agent_key rotation UI |
| SEO Score | 6-field boolean score | Numeric scoring with weighted rubric |

---

## Frontend Team Tasks

### Task F-1: Redesign Login Page

**File:** `src/app/(auth)/login/page.tsx`
**Status:** EXISTS — needs visual redesign
**Priority:** Medium

**Current state:** Single card centered on gradient background. Functional but lacks brand credibility for B2B SaaS.

**Requirements:**
- Split layout: Left panel (60%) = brand marketing, Right panel (40%) = auth form
- Left panel content:
  - Large headline: "공인중개사 업무를 AI로 자동화"
  - 3 feature bullet points with icons: 블로그 자동생성 / 건축물대장 수집 / 카드뉴스 제작
  - Social proof: "전국 N개 중개사무소 사용 중" (hardcode for now)
  - Background: `bg-brand-700` with subtle grid pattern (CSS grid lines via `bg-[image:...]`)
- Right panel: existing form, no functional changes
- Mobile: stack vertically, hide left panel below `md` breakpoint
- No new dependencies — use existing Tailwind + Lucide

---

### Task F-2: Add Shorts Tab to Project Detail

**File:** `src/app/(dashboard)/projects/[id]/page.tsx`
**Component to create:** `src/app/(dashboard)/projects/[id]/components/ShortsTab.tsx`
**Status:** Tab stub exists (`{ id: 'video', label: '영상' }`) but shows placeholder text
**Priority:** High (Phase 2 scope)

**Requirements for `ShortsTab.tsx`:**

```tsx
// Props interface
interface ShortsTabProps {
  projectId: string
  contents: GeneratedContent[] // filtered type='video_script'
}
```

- **Generate button:** POST to `/functions/v1/generate-shorts-script` with `{ project_id, duration, style }`
- **Duration selector:** Radio buttons: 15초 / 30초 / 60초
- **Style selector:** Dropdown: 활기찬(energetic) / 차분한(calm) / 고급스러운(luxury)
- **Result display:** Show `scenes` as timeline cards:
  - Each card: scene number, duration badge, script text, visual note in gray italic
  - Full script in a copyable textarea below
  - Hashtag list as pill badges
- **Version history:** Same pattern as BlogTab — show version dropdown if multiple exist
- **Copy button:** Copies `full_script` to clipboard (use `navigator.clipboard.writeText`)
- **Empty state:** Illustration (use existing Lucide `Video` icon) + generate button

**Changes to `page.tsx`:**
- Change tab label from `영상` to `영상·쇼츠`
- Import and render `ShortsTab` for `tab === 'video'`
- Add `videoContents` filter: `contents?.filter(c => c.type === 'video_script') ?? []`
- Pass `videoContents` to `ShortsTab`

---

### Task F-3: Add Tasks Tab to Project Detail (Real-time)

**File:** `src/app/(dashboard)/projects/[id]/page.tsx`
**Component to create:** `src/app/(dashboard)/projects/[id]/components/TasksTab.tsx`
**Status:** NOT PRESENT — tab does not exist yet
**Priority:** High

**Requirements:**

Add new tab to `TABS` array:
```tsx
{ id: 'tasks', label: '작업 현황' }
```

**`TasksTab.tsx` must be a `'use client'` component** using Supabase Realtime.

```tsx
// Props interface
interface TasksTabProps {
  projectId: string
  orgId: string
}
```

**Features:**
1. **Initial load:** Fetch all tasks for `project_id` via Supabase client (anon key, RLS-scoped)
2. **Realtime subscription:** Subscribe to `tasks` table changes filtered by `project_id`

```tsx
const channel = supabase
  .channel(`tasks-${projectId}`)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'tasks',
    filter: `project_id=eq.${projectId}`,
  }, (payload) => {
    // Update task in local state
  })
  .subscribe()
```

3. **Task card layout:** For each task show:
   - Task type label (use `TASK_TYPE_LABELS` from `src/lib/types.ts`)
   - Status badge with color: pending=gray, running=blue+spinner, success=green, failed=red, retrying=yellow
   - Progress: if status=running, show animated progress bar (indeterminate)
   - Created at timestamp
   - If failed: show `error_code` and `error_message` in red box
   - Expandable logs section: fetch `task_logs` for that task on expand

4. **Create task buttons:**
   - "건축물대장 수집" button → POST to Next.js API route `/api/tasks/create` with `{ project_id, type: 'building_register' }`
   - "세움터 조회" button → POST with `{ type: 'seumteo_api' }`
   - Buttons disabled if agent is offline (check `DashboardStats.agent_status`)

**Next.js API Route to create:**
`src/app/api/tasks/create/route.ts`
```typescript
// POST handler: insert into tasks table with status='pending', return task_id
// Auth: use server-side Supabase client (JWT from cookie)
// Body: { project_id: string, type: TaskType, payload?: Record<string, unknown> }
```

---

### Task F-4: Make Package Tab Functional

**File:** `src/app/(dashboard)/projects/[id]/page.tsx` — `tab === 'package'` section
**Status:** EXISTS — shows static UI with non-functional button
**Priority:** Medium (premium feature)

**Requirements:**
- Button "패키지 PDF 생성" → POST to `/api/tasks/create` with `{ type: 'pdf_merge', payload: { project_id, document_ids: [...] } }`
- Before calling: fetch available documents for the project, let user select which to include via checkboxes
- After task is created: show task status inline (reuse task status badge component from TasksTab)
- When task completes: show download link to the merged PDF

---

### Task F-5: Real-time Dashboard Stats

**File:** `src/app/(dashboard)/dashboard/page.tsx`
**Status:** EXISTS — current implementation is static server component
**Priority:** Low

**Requirements:**
- Extract the stats cards into a `'use client'` component `DashboardStatsCards.tsx`
- Subscribe to `tasks` table changes (org-level) to update `pending_tasks` count in real time
- Subscribe to `agent_connections` table changes to update `agent_status` indicator in real time
- Poll `validate-license` on mount to get fresh usage numbers

---

### Task F-6: Settings Page — Agent Key Management

**File:** `src/app/(dashboard)/settings/page.tsx`
**Status:** EXISTS — current state unknown (not read, assumed partial)
**Priority:** High

**Requirements:**
- Show current agent connections (fetch from `agent_connections` WHERE `org_id = current_org`)
- For each connection: name, platform, version, status badge (online/offline/busy), last_seen_at
- "새 에이전트 등록" button: calls Supabase RPC `generate_agent_key(p_org_id, p_name)` → displays the key once with copy button and "이 키는 다시 표시되지 않습니다" warning
- "키 재발급" button: calls RPC `rotate_agent_key(p_agent_id)` → confirms with modal first
- "삭제" button: deletes the agent_connection row

---

## Backend Team Tasks

### Task B-1: Standardize Response Envelope Across All Edge Functions

**Files to modify:**
- `supabase/functions/generate-blog/index.ts`
- `supabase/functions/generate-card-news/index.ts`
- `supabase/functions/analyze-location/index.ts`
- `supabase/functions/analyze-document/index.ts`
- `supabase/functions/seumteo-api/index.ts`
- `supabase/functions/validate-license/index.ts`
- `supabase/functions/webhook-agent/index.ts`

**Helper to create:** `supabase/functions/_shared/response.ts`

```typescript
// supabase/functions/_shared/response.ts
export function successResponse<T>(
  data: T,
  meta: { task_id?: string; org_id?: string } = {},
  status = 200
): Response {
  return new Response(
    JSON.stringify({
      data,
      error: null,
      meta: {
        task_id: meta.task_id ?? null,
        org_id: meta.org_id ?? null,
        timestamp: new Date().toISOString(),
      },
    }),
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  )
}

export function errorResponse(
  message: string,
  status = 400,
  meta: { task_id?: string; org_id?: string } = {}
): Response {
  return new Response(
    JSON.stringify({
      data: null,
      error: message,
      meta: {
        task_id: meta.task_id ?? null,
        org_id: meta.org_id ?? null,
        timestamp: new Date().toISOString(),
      },
    }),
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  )
}
```

Apply `successResponse` and `errorResponse` to all 7 existing functions. Update all `return new Response(...)` calls. Ensure the `data` field matches the schema defined in `docs/api-contracts.md`.

---

### Task B-2: Create `normalize-parcel` Edge Function

**File to create:** `supabase/functions/normalize-parcel/index.ts`
**Auth:** JWT required
**Priority:** High (needed before building_register task can be created correctly)

**Implementation requirements:**
1. Accept `{ address: string, project_id?: string }`
2. Call Kakao Local API `search/address.json` with the input address
3. If no result, fallback to `search/keyword.json`
4. Extract: `road_address`, `jibun_address`, `lat` (y), `lng` (x), `b_code`
5. Derive Seumteo codes from `b_code`: `sigunguCd = b_code[0:5]`, `bjdongCd = b_code[5:10]`, `bun = main_address_no.padStart(4,'0')`, `ji = sub_address_no.padStart(4,'0')`
6. If `project_id` provided: UPDATE `projects` SET `jibun_address`, `lat`, `lng` WHERE id = `project_id`
7. Return standard envelope with data as defined in `docs/api-contracts.md`

---

### Task B-3: Create `generate-shorts-script` Edge Function

**File to create:** `supabase/functions/generate-shorts-script/index.ts`
**Auth:** JWT required
**Plan:** premium
**Priority:** High

**Implementation requirements:**
1. Accept `{ project_id, duration: 15|30|60, style: 'energetic'|'calm'|'luxury' }`
2. Fetch project data + location analysis (same pattern as generate-blog)
3. Check plan: if not premium, return 403 with error "이 기능은 프리미엄 플랜에서 이용할 수 있습니다"
4. Build GPT-4o prompt requesting scenes array with `order`, `duration`, `script`, `caption`, `visual_note`
5. Include scene count: 15s→4 scenes, 30s→6 scenes, 60s→8 scenes
6. Save to `generated_contents` as `type='video_script'`, `content=JSON.stringify(scenes)`, `title='쇼츠 스크립트 ${duration}초'`
7. Increment usage: `generation`
8. Return standard envelope

**Prompt template outline:**
```
System: 당신은 유튜브 쇼츠 전문 스크립터입니다.
- 목표: <duration>초 내 매물의 핵심 매력을 강렬하게 전달
- 스타일: <style_guide>
- 각 씬은 <duration/scene_count>초 분량
- 스크립트: 실제 성우가 읽는 나레이션 (구어체, 간결)
- 자막: 화면에 표시할 짧은 키워드 (10자 이내)
- visual_note: 편집자에게 전달할 영상 지침 (한 문장)
출력형식: JSON { scenes: [...], full_script: "...", hashtags: [...], thumbnail_text: "..." }
```

---

### Task B-4: Extend DB Schema — Tasks ENUM and Watchdog

**File to create:** `supabase/migrations/005_task_extensions.sql`
**Priority:** High (required before agent can handle new task types)

**Contents of migration:**

```sql
-- 1. Extend tasks.type ENUM to match development spec
-- Drop constraint, add new check
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_type_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_type_check CHECK (type IN (
  -- existing
  'naver_upload', 'youtube_upload', 'building_register',
  'seumteo_api', 'video_render', 'pdf_merge',
  -- new per dev spec
  'normalize_parcel', 'location_analyze',
  'download_building_register', 'download_cadastral_map',
  'summarize_documents', 'generate_blog',
  'generate_cards_instagram', 'generate_cards_kakao',
  'generate_shorts_script', 'render_shorts_video',
  'upload_naver_blog', 'upload_youtube'
));

-- 2. Add progress_pct column for real-time progress display
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS progress_pct integer DEFAULT 0
  CHECK (progress_pct BETWEEN 0 AND 100);

-- 3. Stale task watchdog function (call via pg_cron or scheduled Edge Function)
CREATE OR REPLACE FUNCTION mark_stale_tasks()
RETURNS integer AS $$
DECLARE
  affected integer;
BEGIN
  UPDATE tasks
  SET
    status = 'failed',
    error_code = 'STALE_RUNNING',
    error_message = '에이전트 응답 없음 (10분 초과)',
    completed_at = now()
  WHERE
    status = 'running'
    AND started_at < now() - interval '10 minutes';
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. generate_agent_key RPC (for Settings page)
CREATE OR REPLACE FUNCTION generate_agent_key(p_org_id uuid, p_name text)
RETURNS text AS $$
DECLARE
  v_key text;
  v_prefix text;
BEGIN
  v_prefix := 're_agent_' || left(p_org_id::text, 8) || '_';
  v_key := v_prefix || encode(gen_random_bytes(24), 'base64');
  -- Remove URL-unsafe chars
  v_key := replace(replace(replace(v_key, '+', 'a'), '/', 'b'), '=', 'c');

  INSERT INTO agent_connections (org_id, agent_key, name)
  VALUES (p_org_id, v_key, p_name);

  RETURN v_key;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. rotate_agent_key RPC
CREATE OR REPLACE FUNCTION rotate_agent_key(p_agent_id uuid)
RETURNS text AS $$
DECLARE
  v_key text;
  v_org_id uuid;
BEGIN
  SELECT org_id INTO v_org_id FROM agent_connections WHERE id = p_agent_id;
  v_key := 're_agent_' || left(v_org_id::text, 8) || '_' ||
           replace(replace(replace(encode(gen_random_bytes(24), 'base64'), '+', 'a'), '/', 'b'), '=', 'c');

  UPDATE agent_connections SET agent_key = v_key WHERE id = p_agent_id;
  RETURN v_key;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

### Task B-5: Add Agent Realtime RLS Policy

**File to create:** `supabase/migrations/006_agent_rls.sql`
**Priority:** Medium (required for agent Realtime subscription without service role)

**Contents:**

```sql
-- Allow agents to set their org context for RLS
CREATE OR REPLACE FUNCTION set_agent_context(p_agent_key text)
RETURNS void AS $$
BEGIN
  PERFORM set_config(
    'app.agent_org_id',
    (SELECT org_id::text FROM agent_connections WHERE agent_key = p_agent_key),
    true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS policy: agents can read tasks in their org
CREATE POLICY "agent_realtime_tasks" ON tasks
FOR SELECT
USING (
  org_id = (current_setting('app.agent_org_id', true))::uuid
);

-- RLS policy: agents can update task status (for claim optimistic lock)
-- Agent updates status=running WHERE status=pending (atomic claim)
CREATE POLICY "agent_claim_task" ON tasks
FOR UPDATE
USING (
  org_id = (current_setting('app.agent_org_id', true))::uuid
  AND status IN ('pending', 'retrying')
)
WITH CHECK (
  status = 'running'
);
```

---

### Task B-6: Return `document_id` from seumteo-api and analyze-document

**Files to modify:**
- `supabase/functions/seumteo-api/index.ts`
- `supabase/functions/analyze-document/index.ts`

**seumteo-api:** After inserting into `documents`, return the new `document.id` in the response `data.document_id`.

**analyze-document:** Include `document_id` and `document_type` in the response `data` object (already stored, just not returned).

---

### Task B-7: Add `progress_pct` to `task_progress` webhook event

**File to modify:** `supabase/functions/webhook-agent/index.ts`

In the `task_progress` case: extract `progress_pct` from `data` and update `tasks.progress_pct`:

```typescript
case 'task_progress': {
  const { task_id, message, level = 'info', progress_pct } = data
  if (!task_id) throw new Error('task_id가 필요합니다')

  // Update progress_pct on the task row
  if (typeof progress_pct === 'number') {
    await adminClient
      .from('tasks')
      .update({ progress_pct })
      .eq('id', task_id)
  }

  await adminClient.from('task_logs').insert({ task_id, level, message })
  break
}
```

---

## Automation Team Tasks

### Task A-1: Add Kakao Platform Template to generate-card-news

**File to modify:** `supabase/functions/generate-card-news/index.ts`
**Priority:** High

**Current state:** Only Instagram (1:1) format exists. The function ignores the platform concept entirely.

**Requirements:**
1. Add `platform: 'instagram' | 'kakao'` to request parsing (default `'instagram'`)
2. Create separate system prompts per platform:

**Instagram prompt constraints (existing behavior, extract to const):**
```
- 가로세로 1:1 비율 (1080x1080)
- 제목: 10자 이내, 임팩트 있는 한 줄
- 본문: 30자 이내
- 한 줬에 핵심 키워드만
```

**Kakao prompt constraints (new):**
```
- 가로16:세로9 비율 (1280x720), 와이드 화면
- 제목: 15자 이내 (더 넓은 공간)
- 본문: 50자 이내 (2줄 허용)
- 카카오채널/오픈채팅 공유 최적화
- 말투: 친근하고 대화체 ("이런 집 어때요?", "지금 바로 확인하세요!")
```

3. Pass `platform` to the prompt as a discriminator
4. Save `platform` in `generated_contents` — add to the `content` JSON: `{ platform, cards: [...] }` so the frontend can render differently
5. Return `platform` in response `data`

---

### Task A-2: Implement 6-Card Instagram Template Structure

**File to modify:** `supabase/functions/generate-card-news/index.ts`
**Priority:** High

**Current state:** The prompt describes card structure but it is embedded inline as a string. Extract and enforce it.

**Card structure for Instagram (6 cards):**

| Card | Name | Title constraint | Body constraint | Required field |
|------|------|-----------------|----------------|---------------|
| 1 | Hook | 질문형 또는 감탄형 | 핵심 매력 1가지 | `emoji` required |
| 2 | Price Info | 가격 표시 | 면적/층수 | `highlight` = 가격 |
| 3 | Location | 교통 장점 | 지하철 도보시간 | `highlight` = 역명 |
| 4 | Advantages | "입지 장점 TOP 3" | 3줄 리스트 | `body` = bullet list |
| 5 | Target | 추천 대상 | 3가지 타겟 | `highlight` = 1순위 타겟 |
| 6 | CTA | 문의 안내 | 연락 유도 멘트 | `background` = brand color |

**Card structure for Kakao (6 cards):**

| Card | Name | Title constraint | Body constraint |
|------|------|-----------------|----------------|
| 1 | Hook | 질문형 (15자) | 가장 강한 매력 |
| 2 | Price | 가격 (10자) | 면적·층수·방향 |
| 3 | Features | "이런 집이에요" | 특징 3가지 |
| 4 | Infra | 주변 인프라 | 교통·학군·상권 |
| 5 | Target | "이런 분께 딱!" | 추천 대상 |
| 6 | CTA | "지금 문의하세요" | 연락처 유도 |

Enforce structure by making the system prompt explicitly list each card's required fields and constraints as a numbered schema, not prose.

---

### Task A-3: Create `generate-shorts-script` Prompt Template

**File to create:** `supabase/functions/_shared/shorts-prompt.ts`
**Priority:** High (consumed by B-3)

**Export functions:**

```typescript
export interface ShortsPromptContext {
  address: string
  property_type: string
  price?: number
  area?: number
  floor?: number
  features?: string[]
  location_advantages?: string[]
  duration: 15 | 30 | 60
  style: 'energetic' | 'calm' | 'luxury'
}

export function buildShortsSystemPrompt(ctx: ShortsPromptContext): string
export function buildShortsUserPrompt(ctx: ShortsPromptContext): string
```

**System prompt requirements:**
- Duration: clearly state scene count = `{ 15: 4, 30: 6, 60: 8 }[duration]`
- Style guides:
  - `energetic`: 빠른 템포, 감탄사 활용, 짧고 강한 문장
  - `calm`: 차분한 정보 전달, 문어체, 신뢰감
  - `luxury`: 고급스러운 표현, 공간감 강조, "프라이빗", "프리미엄" 키워드
- Each scene: `duration = total_duration / scene_count` seconds
- `visual_note` must specify: shot type (클로즈업/전경/드론), transition style
- `hashtags`: 10개, 롱테일 포함 (`#강남아파트매매`, `#역세권아파트` 등)
- `thumbnail_text`: 최대 20자, 클릭 유발 문구

---

### Task A-4: Enhance SEO Score Calculation

**File to modify:** `supabase/functions/_shared/seo-prompt.ts`
**Priority:** Medium

**Current state:** `seo_score` is a 6-boolean object with a `total_score` the AI calculates itself (not deterministic).

**Requirements:**
- Change `total_score` to be calculated server-side from the boolean fields, not by the AI
- New weighted scoring rubric (post-parse, in `generate-blog/index.ts`):

```typescript
function calculateSeoScore(fields: {
  keyword_in_title: boolean
  min_length: boolean
  has_h2: boolean
  has_faq: boolean
  has_alt: boolean
  longtail_keywords: boolean
  content: string
}): SeoScore {
  // Weights
  const weights = {
    keyword_in_title: 20,  // Most important for search ranking
    min_length: 20,         // Content depth
    has_h2: 20,             // Structure for crawlers
    has_faq: 15,            // Featured snippet eligibility
    has_alt: 15,            // Image indexing
    longtail_keywords: 10,  // Long-tail traffic
  }

  // Additional check: verify min_length by actual character count
  const actualMinLength = fields.content.length >= 1800

  let score = 0
  if (fields.keyword_in_title) score += weights.keyword_in_title
  if (actualMinLength) score += weights.min_length
  if (fields.has_h2) score += weights.has_h2
  if (fields.has_faq) score += weights.has_faq
  if (fields.has_alt) score += weights.has_alt
  if (fields.longtail_keywords) score += weights.longtail_keywords

  return {
    keyword_in_title: fields.keyword_in_title,
    min_length: actualMinLength,
    has_h2: fields.has_h2,
    has_faq: fields.has_faq,
    has_alt: fields.has_alt,
    longtail_keywords: fields.longtail_keywords,
    total_score: score,
  }
}
```

- Add `content_length` field to `SeoScore` type in `src/lib/types.ts`: `content_length: number`
- Update `SeoScore` interface and DB comment accordingly
- Call this function in `generate-blog/index.ts` after parsing OpenAI response, before saving to DB

---

### Task A-5: Add `platform` Field to `generated_contents` Content JSON

**File to modify:** `supabase/migrations/005_task_extensions.sql` (or a new 007 migration)
**Priority:** Low

Since `generated_contents.content` is stored as text (JSON string for card_news), document the convention:

For `type = 'card_news'`, `content` stores:
```json
{
  "platform": "instagram" | "kakao",
  "cards": [ ...CardNewsSlide[] ]
}
```

For `type = 'video_script'`, `content` stores:
```json
{
  "duration": 30,
  "style": "energetic",
  "scenes": [ ...VideoScene[] ],
  "full_script": "...",
  "hashtags": [...],
  "thumbnail_text": "..."
}
```

Add a DB comment documenting this convention:

```sql
COMMENT ON COLUMN generated_contents.content IS
'Stored as: plain text for blog/doc_summary; JSON string for card_news ({platform, cards}); JSON string for video_script ({duration, style, scenes, full_script, hashtags, thumbnail_text})';
```

---

## Shared Constraints

The following rules apply to ALL team tasks:

1. **No breaking changes to existing DB columns** — only ADD new columns/constraints, never drop or rename without migration plan
2. **All new Edge Functions** must be added to `supabase/config.toml` (if using Supabase CLI) and excluded from `tsconfig.json` (Deno runtime)
3. **All new `'use client'` components** in `(dashboard)/` subtree: the parent `layout.tsx` already has `force-dynamic`. New server components need their own `export const dynamic = 'force-dynamic'`
4. **Type safety:** All new API response shapes must be added to `src/lib/types.ts` before the frontend component is implemented
5. **Error handling:** All new Edge Functions must wrap the entire handler in `try/catch` and use `errorResponse()` from `_shared/response.ts` (Task B-1)

---

## Delivery Order (Dependencies)

```
B-1 (response helper) ─────────────────────► (all other backend tasks depend on this)
B-4 (DB migration 005) ─────────────────────► F-3 (TasksTab), B-3 (shorts Edge Fn)
B-5 (agent RLS 006) ─────────────────────────► F-3 (Realtime subscription)
B-2 (normalize-parcel) ──────────────────────► F-3 (building_register task creation)
B-3 (generate-shorts-script) ────────────────► F-2 (ShortsTab)
A-1 + A-2 (card-news platform) ──────────────► (independent, can be done anytime)
A-3 (shorts-prompt.ts) ──────────────────────► B-3 (depends on prompt template)
A-4 (SEO score) ─────────────────────────────► (independent enhancement)
F-1 (login redesign) ────────────────────────► (independent)
F-4, F-5, F-6 ───────────────────────────────► (after B-4 for F-4; others independent)
```
