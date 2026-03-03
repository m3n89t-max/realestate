# RealEstate AI OS - API Contracts
**Version:** 1.0
**Date:** 2026-03-03
**Author:** System Architect

---

## Overview

### Standard Response Envelope

All Edge Functions MUST return responses in the following envelope format. Current implementations are partially non-compliant (see per-endpoint notes). Standardization is a Backend Team task.

**Success:**
```json
{
  "data": <T>,
  "error": null,
  "meta": {
    "task_id": "<uuid | null>",
    "org_id": "<uuid>",
    "timestamp": "<ISO 8601>"
  }
}
```

**Error:**
```json
{
  "data": null,
  "error": "<human-readable error string>",
  "meta": {
    "task_id": null,
    "org_id": "<uuid | null>",
    "timestamp": "<ISO 8601>"
  }
}
```

**HTTP Status Codes:**
- `200` — Success
- `400` — Bad request (validation error, quota exceeded)
- `401` — Unauthenticated (missing or invalid JWT / agent_key)
- `403` — Forbidden (plan does not include this feature)
- `404` — Resource not found
- `429` — Rate limit exceeded
- `500` — Internal server error

### Authentication

Two authentication modes exist in the system:

| Mode | Header | Used By |
|------|--------|---------|
| JWT (Supabase Auth) | `Authorization: Bearer <supabase_jwt>` | All user-facing endpoints |
| Agent Key | `agent_key` field in request body | `webhook-agent` only |

---

## Endpoints

### V3 Flow Core API
The following endpoints orchestrate the v3.0 standard user workflow (Phase 1-3).

#### POST /projects
**Purpose:** Create a new real estate project and trigger initial tasks.
**Auth:** JWT required
**Request Body:**
```json
{
  "address": "string",            // 지번 또는 주소 (필수)
  "property_type": "string",      // 빌라, 아파트, 상가 등 (옵션)
  "transaction_type": "string",   // 매매, 전세, 월세 (옵션)
  "price": "number",              // 가격 (옵션)
  "area": "number",               // 면적 (옵션)
  "summary": "string",            // 간단 소개
  "features": "string",           // 특장점
  "images": ["string"]            // 업로드된 이미지 스토리지 URL 배열
}
```
**Response Data (`data` field):**
```json
{
  "id": "uuid",
  "organization_id": "uuid",
  "status": "string",
  "created_at": "timestamp"
}
```

#### GET /projects/{id}
**Purpose:** Get project details.
**Auth:** JWT required
**Response Data (`data` field):**
```json
{
  "id": "uuid",
  "address": "string",
  "property_type": "string",
  "created_at": "timestamp"
}
```

#### POST /projects/{id}/documents/summarize
**Purpose:** Trigger document summarization task (summarize_documents).
**Auth:** JWT required
**Response Data (`data` field):**
```json
{
  "message": "Document summarize task has been queued."
}
```

#### POST /projects/{id}/generate
**Purpose:** Trigger AI content generation tasks sequentially.
**Auth:** JWT required
**Request Body:**
```json
{
  "content_types": ["blog", "instagram", "kakao", "shorts"]
}
```
**Response Data (`data` field):**
```json
{
  "message": "Content generation tasks have been queued."
}
```

#### GET /tasks?project_id={id}
**Purpose:** Get tasks queue status for a specific project.
**Auth:** JWT required
**Response Data (`data` field):**
```json
{
  "tasks": [
    {
      "id": "uuid",
      "project_id": "uuid",
      "type": "string",
      "status": "string",
      "result_payload": "json",
      "error_message": "string"
    }
  ]
}
```

---

### Legacy & Internal Functions (v1)
The following endpoints define the raw edge functions that perform specific background execution tasks. They are preserved for backward compatibility and internal queue worker usages.

---

### POST /functions/v1/generate-blog

**Purpose:** Generate an SEO-optimized real estate blog post for a project.
**Auth:** JWT required
**Plan:** free, pro, premium
**Task type created:** None (synchronous, result saved to `generated_contents`)
**Quota check:** `generation` count incremented

#### Request Body

```json
{
  "project_id": "<uuid>",
  "style": "informative" | "investment" | "lifestyle"
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `project_id` | uuid | YES | — | Must belong to caller's org |
| `style` | enum | NO | `"informative"` | Blog tone: informative (실거주), investment (투자), lifestyle (감성) |

#### Response Data (`data` field)

```json
{
  "content_id": "<uuid>",
  "version": 2,
  "titles": [
    "강남구 역삼동 아파트 매매 - 역세권·학군우수·남향 84㎡",
    "..."
  ],
  "content": "## 매물 개요...",
  "meta_description": "150자 이내 메타 설명",
  "tags": ["역삼동아파트", "강남역세권", "..."],
  "faq": [
    { "q": "질문", "a": "답변" }
  ],
  "alt_tags": { "image1": "ALT 설명", "image2": "..." },
  "seo_score": {
    "keyword_in_title": true,
    "min_length": true,
    "has_h2": true,
    "has_faq": true,
    "has_alt": true,
    "longtail_keywords": true,
    "total_score": 95
  }
}
```

**SEO Rules (enforced by prompt):**
- Minimum 1,800 characters in `content`
- Minimum 7 H2 sections
- 5 FAQ items required
- Longtail keywords in `{지역} {매물유형} {조건} 매매` pattern

**Current Implementation Status:** EXISTS at `supabase/functions/generate-blog/index.ts`
**Non-compliance:** Response does not use standard envelope. Currently returns `{ success, content_id, titles, seo_score, version }`. Backend team must wrap in envelope.

---

### POST /functions/v1/generate-card-news

**Purpose:** Generate Instagram/KakaoTalk card news slides for a project.
**Auth:** JWT required
**Plan:** free, pro, premium
**Task type created:** None (synchronous, result saved to `generated_contents`)
**Quota check:** `generation` count incremented

#### Request Body

```json
{
  "project_id": "<uuid>",
  "platform": "instagram" | "kakao",
  "card_count": 6 | 8,
  "color_theme": "<string>"
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `project_id` | uuid | YES | — | Must belong to caller's org |
| `platform` | enum | NO | `"instagram"` | Output platform — controls aspect ratio and text limits |
| `card_count` | number | NO | `6` | Number of cards to generate |
| `color_theme` | string | NO | `"blue"` | Base color theme for cards |

**Platform Constraints:**

| Platform | Aspect Ratio | Title Max | Body Max | Card Structure |
|----------|-------------|-----------|---------|---------------|
| `instagram` | 1:1 (1080x1080) | 10 chars | 30 chars | 6 cards: Hook / Info / Location / Advantages / Target / CTA |
| `kakao` | 16:9 (1280x720) | 15 chars | 50 chars | 6 cards: Hook / Price / Features / Infra / Target / CTA |

#### Response Data (`data` field)

```json
{
  "content_id": "<uuid>",
  "version": 1,
  "platform": "instagram",
  "cards": [
    {
      "order": 1,
      "title": "역삼동 남향 아파트",
      "body": "도보 3분 지하철역",
      "highlight": "역세권",
      "emoji": "🏠",
      "background": "blue"
    }
  ]
}
```

**Current Implementation Status:** EXISTS at `supabase/functions/generate-card-news/index.ts`
**Non-compliance:** (1) No `platform` field — only instagram template. (2) Response not in standard envelope. Automation team must add `platform` discriminator and Kakao template.

---

### POST /functions/v1/analyze-location

**Purpose:** Run AI-powered location analysis for a project using Kakao geocoding and GPT-4o.
**Auth:** JWT required
**Plan:** free, pro, premium
**Task type created:** None (synchronous, upserted to `location_analyses`)
**Quota check:** `generation` count incremented

#### Request Body

```json
{
  "project_id": "<uuid>"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `project_id` | uuid | YES | Must belong to caller's org |

#### Response Data (`data` field)

```json
{
  "advantages": [
    "도보 3분 거리 강남역 2호선",
    "반경 500m 이내 초등학교 2곳",
    "..."
  ],
  "recommended_targets": [
    { "type": "신혼부부", "reason": "학군 우수", "priority": 1 },
    { "type": "직장인", "reason": "강남역 도보 접근", "priority": 2 },
    { "type": "투자자", "reason": "임대수요 높음", "priority": 3 }
  ],
  "nearby_facilities": {
    "transport": [{ "name": "강남역", "distance_m": 250, "walk_min": 3 }],
    "school": [{ "name": "역삼초등학교", "distance_m": 480, "walk_min": 6 }],
    "shopping": [{ "name": "이마트 역삼점", "distance_m": 800, "drive_min": 5 }],
    "hospital": [{ "name": "강남성모병원", "distance_m": 1200, "drive_min": 8 }],
    "park": [{ "name": "역삼공원", "distance_m": 350, "walk_min": 5 }]
  },
  "analysis_text": "강남구 역삼동에 위치한 역세권 아파트로 교통과 학군이 우수합니다."
}
```

**Current Implementation Status:** EXISTS at `supabase/functions/analyze-location/index.ts`
**Non-compliance:** Response not in standard envelope. Currently returns `{ success, analysis }`.

---

### POST /functions/v1/analyze-document

**Purpose:** AI analysis of a building register or floor plan document stored in the `documents` table.
**Auth:** JWT required (also called internally via service role key from `webhook-agent`)
**Plan:** pro, premium
**Task type created:** None (synchronous, updates `documents.summary` and `documents.risk_items`)

#### Request Body

```json
{
  "document_id": "<uuid>",
  "raw_text": "<string | null>"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `document_id` | uuid | YES | Must exist in `documents` table, belonging to caller's org |
| `raw_text` | string | NO | If provided, overrides `documents.raw_text`. Used for direct Playwright-extracted text. |

#### Response Data (`data` field)

```json
{
  "document_id": "<uuid>",
  "document_type": "building_register",
  "summary": {
    "usage": "공동주택(아파트)",
    "floors": "지하1층/지상15층",
    "approved_date": "2005-03-15",
    "structure": "철근콘크리트",
    "total_area": 12500.5,
    "violation": false,
    "summary_text": "2005년 준공된 15층 철근콘크리트 아파트. 위반건축물 해당 없음."
  },
  "risk_items": [
    { "item": "위반건축물 여부", "status": "safe", "detail": "위반 없음" },
    { "item": "사용승인 경과 연수", "status": "caution", "detail": "준공 후 21년 경과" },
    { "item": "불법 용도변경", "status": "safe", "detail": "" },
    { "item": "구조 안전성", "status": "safe", "detail": "철근콘크리트 정상" },
    { "item": "증개축 이력", "status": "safe", "detail": "이력 없음" }
  ],
  "customer_report": "고객에게 전달할 200자 이내 설명",
  "agent_memo": "중개사 내부 메모 100자 이내"
}
```

**Current Implementation Status:** EXISTS at `supabase/functions/analyze-document/index.ts`
**Non-compliance:** Response not in standard envelope. `document_id` and `document_type` not returned in response.

---

### POST /functions/v1/seumteo-api

**Purpose:** Query the Korean government Seumteo (세움터) open API for building permit history and floor plan lists.
**Auth:** JWT required
**Plan:** pro, premium
**Task type created:** None (synchronous, saves result to `documents`)

#### Request Body

```json
{
  "project_id": "<uuid>",
  "action": "permit_history" | "floor_plan_list"
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `project_id` | uuid | YES | — | Address resolved via Kakao geocoding |
| `action` | enum | NO | `"permit_history"` | Which Seumteo endpoint to call |

**Action Mapping:**

| action | Seumteo Endpoint | Saved to documents.type |
|--------|-----------------|------------------------|
| `permit_history` | `/ArchPmsService/getApBasisOulnInfo` | `permit_history` |
| `floor_plan_list` | `/ArchPmsService/getApFloorPlanList` | (not saved currently) |

#### Response Data (`data` field)

```json
{
  "action": "permit_history",
  "project_id": "<uuid>",
  "document_id": "<uuid>",
  "items": [
    {
      "pmsNo": "2005-강남-0123",
      "pmsDay": "20050315",
      "archGbCd": "01",
      "archGbCdNm": "신축"
    }
  ],
  "count": 1
}
```

**Current Implementation Status:** EXISTS at `supabase/functions/seumteo-api/index.ts`
**Non-compliance:** (1) `floor_plan_list` result not saved to documents. (2) Response not in standard envelope. (3) `document_id` of saved record not returned to caller.

---

### POST /functions/v1/validate-license

**Purpose:** Returns the organization's current plan, feature flags, and usage statistics.
**Auth:** JWT required
**Plan:** all (no plan restriction — used to check what IS allowed)
**Task type created:** None

#### Request Body

```json
{}
```

No body required. Org is resolved from the authenticated JWT.

#### Response Data (`data` field)

```json
{
  "org_id": "<uuid>",
  "plan_type": "pro",
  "plan_expires_at": "2026-12-31T23:59:59Z",
  "is_expired": false,
  "features_enabled": [
    "blog_generation",
    "card_news_generation",
    "location_analysis",
    "naver_auto_upload",
    "building_register",
    "seumteo_api"
  ],
  "usage": {
    "project_count": 12,
    "generation_count": 45,
    "token_usage": 125000,
    "video_render_count": 0,
    "doc_download_count": 8
  },
  "quota": {
    "type": "project",
    "current": 12,
    "limit": 100,
    "exceeded": false,
    "remaining": 88
  }
}
```

**Feature Flag Reference:**

| Feature Flag | free | pro | premium |
|-------------|------|-----|---------|
| `blog_generation` | YES | YES | YES |
| `card_news_generation` | YES | YES | YES |
| `location_analysis` | YES | YES | YES |
| `naver_auto_upload` | NO | YES | YES |
| `building_register` | NO | YES | YES |
| `seumteo_api` | NO | YES | YES |
| `floor_plan_analysis` | NO | NO | YES |
| `risk_analysis` | NO | NO | YES |
| `package_pdf` | NO | NO | YES |
| `video_render` | NO | NO | YES |

**Current Implementation Status:** EXISTS at `supabase/functions/validate-license/index.ts`
**Non-compliance:** Response not in standard envelope.

---

### POST /functions/v1/webhook-agent

**Purpose:** Receives status events from the local Windows agent. Uses agent_key authentication, NOT JWT.
**Auth:** `agent_key` in request body (validated against `agent_connections` table)
**Plan:** pro, premium (agent feature)
**Task type created:** N/A (updates existing tasks)

#### Request Body — Base Structure

```json
{
  "event": "<event_name>",
  "agent_key": "<string>",
  ...event_specific_fields
}
```

#### Events

**`heartbeat`** — Agent keeps alive signal (send every 30 seconds)
```json
{
  "event": "heartbeat",
  "agent_key": "<string>",
  "status": "online" | "busy",
  "version": "1.2.0"
}
```

**`task_started`** — Agent claims and begins a task
```json
{
  "event": "task_started",
  "agent_key": "<string>",
  "task_id": "<uuid>"
}
```

**`task_progress`** — Intermediate log during execution
```json
{
  "event": "task_progress",
  "agent_key": "<string>",
  "task_id": "<uuid>",
  "message": "Playwright: 정부24 로그인 완료",
  "level": "info" | "warn" | "error",
  "progress_pct": 45
}
```

**`task_completed`** — Task finished successfully
```json
{
  "event": "task_completed",
  "agent_key": "<string>",
  "task_id": "<uuid>",
  "result": {
    "document_id": "<uuid>",
    "file_url": "https://...",
    "page_count": 3
  }
}
```
Side effect: if `task.type === 'building_register'` and `result.document_id` is present, the webhook automatically triggers `analyze-document` asynchronously.

**`task_failed`** — Task encountered an unrecoverable error
```json
{
  "event": "task_failed",
  "agent_key": "<string>",
  "task_id": "<uuid>",
  "error_code": "LOGIN_FAILED",
  "error_message": "공공기관 사이트 점검 중",
  "retry": true
}
```
If `retry: true` and `task.retry_count < task.max_retries`, status becomes `retrying` and `scheduled_at` is set 60 seconds in the future.

**`document_uploaded`** — Agent uploaded a file to Supabase Storage
```json
{
  "event": "document_uploaded",
  "agent_key": "<string>",
  "project_id": "<uuid>",
  "document_type": "building_register" | "floor_plan" | "permit_history",
  "file_url": "https://...",
  "file_name": "건축물대장_2026.pdf",
  "raw_text": "<extracted OCR/Playwright text>"
}
```

#### Response Data (`data` field)

```json
{
  "event": "<event_name>",
  "acknowledged": true
}
```

**Current Implementation Status:** EXISTS at `supabase/functions/webhook-agent/index.ts`
**Non-compliance:** Response not in standard envelope.

---

### POST /functions/v1/generate-shorts-script

**Purpose:** Generate a YouTube Shorts script (15/30/60 seconds) for a project.
**Auth:** JWT required
**Plan:** premium only
**Task type created:** None (synchronous, saved to `generated_contents` as type `video_script`)
**Quota check:** `generation` count incremented

**STATUS: NOT IMPLEMENTED — Backend/Automation team must create.**
File to create: `supabase/functions/generate-shorts-script/index.ts`

#### Request Body

```json
{
  "project_id": "<uuid>",
  "duration": 15 | 30 | 60,
  "style": "energetic" | "calm" | "luxury"
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `project_id` | uuid | YES | — | Must belong to caller's org |
| `duration` | number | YES | — | Target video duration in seconds |
| `style` | enum | NO | `"energetic"` | Narration energy and pacing |

**Scene Count by Duration:**

| Duration | Scene Count | Seconds per Scene |
|----------|------------|-------------------|
| 15s | 4 | ~3-4s each |
| 30s | 6 | ~5s each |
| 60s | 8 | ~7-8s each |

#### Response Data (`data` field)

```json
{
  "content_id": "<uuid>",
  "version": 1,
  "duration": 30,
  "scenes": [
    {
      "order": 1,
      "duration": 5,
      "script": "강남 역세권! 도보 3분에 지하철역이?",
      "caption": "강남역 도보 3분",
      "visual_note": "지하철역 외관 → 아파트 외관 컷"
    }
  ],
  "full_script": "강남 역세권! 도보 3분에 지하철역이? ...",
  "hashtags": ["강남아파트", "역세권", "부동산쇼츠"],
  "thumbnail_text": "강남 역세권 아파트 공개"
}
```

---

### POST /functions/v1/normalize-parcel

**Purpose:** Normalize a raw address string (도로명 or 지번) into a canonical jibun address, coordinates, and Seumteo codes.
**Auth:** JWT required
**Plan:** free, pro, premium
**Task type created:** None (synchronous). Updates `projects.lat`, `projects.lng`, `projects.jibun_address` if `project_id` provided.

**STATUS: NOT IMPLEMENTED — Backend team must create.**
File to create: `supabase/functions/normalize-parcel/index.ts`

#### Request Body

```json
{
  "address": "<raw address string>",
  "project_id": "<uuid | null>"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `address` | string | YES | Raw input: 도로명, 지번, 아파트명 모두 허용 |
| `project_id` | uuid | NO | If provided, updates project record with resolved data |

#### Response Data (`data` field)

```json
{
  "input_address": "역삼동 736-1",
  "road_address": "서울특별시 강남구 테헤란로 152",
  "jibun_address": "서울특별시 강남구 역삼동 736-1",
  "lat": 37.5001,
  "lng": 127.0365,
  "seumteo_codes": {
    "sigunguCd": "11680",
    "bjdongCd": "10300",
    "bun": "0736",
    "ji": "0001"
  },
  "project_updated": true
}
```

**Implementation Notes:**
- Use Kakao Local API `search/address.json` as primary resolver
- Fall back to Kakao `search/keyword.json` for building name inputs (e.g., "역삼 래미안")
- Seumteo codes derived from `b_code` field of Kakao response
- Personal information masking is NOT applied here (this is internal geocoding, not content generation)

---

## Task Queue Integration

The v3.0 standard queue supports the following full task lifecycle managed via the `projects` API and consumed by the respective engines (Edge Functions vs. Local Webhook Agent).

**Core Tasks ENUM (V3):**
`normalize_parcel`, `location_analyze`, `download_building_register`, `download_cadastral_map`, `summarize_documents`, `generate_blog`, `generate_cards_instagram`, `generate_cards_kakao`, `generate_shorts_script`, `render_shorts_video`, `upload_naver_blog`, `upload_youtube`.

*(Legacy Agent tasks: `naver_upload`, `youtube_upload`, `building_register`, `video_render`, `pdf_merge`, `seumteo_api` remain supported for backward compatibility)*

| Task Type | Handled By | Payload Fields | Execution Action |
|-----------|-------------|----------------|-------------|
| `normalize_parcel` | Edge Functions | `project_id`, `address` | Calls Kakao Geocoding API |
| `location_analyze` | Edge Functions | `project_id` | Summarizes location data with AI |
| `download_building_register` | **Local Agent** | `project_id`, `jibun_address` | Playwright → 정부24, upload PDF |
| `download_cadastral_map` | **Local Agent** | `project_id`, `jibun_address` | Playwright → 토지이음/정부24 |
| `summarize_documents` | Edge Functions | `project_id` | Analyze document IDs |
| `generate_blog` | Edge Functions | `project_id` | Render SEO articles to `generated_contents` |
| `generate_cards_*` | Edge Functions | `project_id`, `platform` | Template generator for Instagram/Kakao |
| `render_shorts_video` | Edge Functions (FFmpeg) | `project_id`, `script_id` | Cloud/local background rendering |
| `upload_naver_blog` | **Local Agent** | `project_id`, `content_id` | Playwright → 네이버 블로그 스마트에디터 |
| `upload_youtube` | **Local Agent** | `project_id`, `video_url` | YouTube Data API upload |
