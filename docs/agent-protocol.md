# RealEstate AI OS - Local Agent Protocol
**Version:** 1.0
**Date:** 2026-03-03
**Author:** System Architect

---

## Overview

The Local Agent is a Windows desktop application (Electron + Playwright) that runs on the real estate agent's PC. It performs browser automation tasks that cannot be done from cloud servers due to government portal authentication requirements (공공기관 CAPTCHA, 공인인증서, IP 제한).

**Key principle:** The agent never stores Supabase JWTs. All agent communication uses a static `agent_key` stored in the agent's local config file. Credentials (공인인증서, 사이트 아이디/비번) are stored on the local machine only and never sent to the server.

---

## 1. Authentication

### agent_key

- Generated once when the organization registers an agent (via the Settings page)
- Stored in Supabase `agent_connections.agent_key` (unique, indexed)
- Stored locally in `%APPDATA%\RealEstateAIOS\config.json`
- Format: `re_agent_<org_id_prefix>_<random_32_chars>`
- Example: `re_agent_a1b2c3_xK9mP2qRvL8nW4tY7uJdE6sA1bC3fH5`

### Config File (local only)

```json
{
  "agent_key": "re_agent_a1b2c3_xK9mP2qRvL8nW4tY7uJdE6sA1bC3fH5",
  "supabase_url": "https://xxx.supabase.co",
  "supabase_anon_key": "<anon key — public, not service role>",
  "webhook_url": "https://xxx.supabase.co/functions/v1/webhook-agent",
  "agent_name": "강남지사-PC01",
  "version": "1.2.0"
}
```

**Security rules:**
- `SUPABASE_SERVICE_ROLE_KEY` is NEVER stored in the local config
- User credentials (government portal passwords, 공인인증서 PIN) are stored in Windows Credential Manager, not in the config file
- `agent_key` must be treated as a secret — if compromised, the key can be rotated from the Settings page

### Server-side Validation

On each webhook call, the server validates the agent_key by querying `agent_connections`:

```sql
SELECT id, org_id, status
FROM agent_connections
WHERE agent_key = $1;
```

If no row found: return 401. The `org_id` from this row is used for all subsequent DB operations — the agent does not need to provide its org_id.

---

## 2. Task Discovery — Supabase Realtime Subscription

The agent uses Supabase Realtime to receive new tasks without polling. This eliminates unnecessary API calls and provides sub-second task delivery.

### Subscription Setup

On agent startup, after validating the agent_key, the agent:

1. Fetches its own `org_id` by calling the webhook with a `heartbeat` event
2. Subscribes to the `tasks` table filtered to its org and `pending`/`retrying` status

```javascript
// Agent-side pseudocode (Electron main process)
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(config.supabase_url, config.supabase_anon_key)

// The agent uses a special anon-key-compatible subscription
// RLS on tasks table: agent can SELECT tasks WHERE org_id = its org (via agent_key check)
// Note: Realtime subscription requires the anon key; org scoping is enforced by RLS

const channel = supabase
  .channel('agent-tasks')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'tasks',
      filter: `org_id=eq.${orgId}`,
    },
    (payload) => handleNewTask(payload.new)
  )
  .on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'tasks',
      filter: `org_id=eq.${orgId}`,
    },
    (payload) => {
      // Re-evaluate if a retrying task is now ready
      if (payload.new.status === 'retrying') {
        scheduleRetry(payload.new)
      }
    }
  )
  .subscribe()
```

### Fallback Polling

If the Realtime connection drops (network interruption), the agent falls back to polling every 30 seconds:

```
GET /rest/v1/tasks
  ?org_id=eq.<org_id>
  &status=in.(pending,retrying)
  &scheduled_at=lte.<now>
  &order=scheduled_at.asc
  &limit=1
```

The agent must re-subscribe to Realtime after detecting connection restoration.

### Task Claim (Optimistic Lock)

When a `pending` task is received, the agent does NOT immediately call `task_started`. Instead, it first attempts to atomically claim the task:

```
PATCH /rest/v1/tasks?id=eq.<task_id>&status=eq.pending
Headers: Authorization: Bearer <anon_key>
Body: { "status": "running", "agent_id": "<agent_connection.id>", "started_at": "<now>" }
Prefer: return=representation
```

If the PATCH returns 0 rows (another agent claimed it first), discard and wait for the next task. If the PATCH succeeds, proceed to execution and notify via `task_started` webhook event.

---

## 3. Task Execution Sequence

### State Machine

```
queued ──► pending ──► running ──► success
                           │
                           ▼
                        failed ──► retrying ──► running (retry)
                                       │
                                       ▼ (retry_count >= max_retries)
                                    failed (final)
```

**Note:** The supported task types (V3 Workflow) include: 
`normalize_parcel`, `location_analyze`, `download_building_register`, `download_cadastral_map`, `summarize_documents`, `generate_blog`, `generate_cards_instagram`, `generate_cards_kakao`, `generate_shorts_script`, `render_shorts_video`, `upload_naver_blog`, `upload_youtube`.
(Legacy DB types: `naver_upload`, `youtube_upload`, `building_register`, `seumteo_api`, `video_render`, `pdf_merge`).

**Agent Responsibility**: The Local Agent ONLY claims tasks that require a local windows environment or playwright browser automation: 
- `download_building_register`
- `download_cadastral_map`
- `upload_naver_blog`
- `upload_youtube`

Other tasks are handled by the Supabase Edge Functions / Content Engine.

### Execution Flow Per Task Type

#### `building_register` (건축물대장 수집)

```
1. Read payload: { project_id, jibun_address }
2. webhook: task_started
3. Open Playwright browser (headless: false for CAPTCHA)
4. Navigate to 정부24 (www.gov.kr)
5. Login with stored credentials (Windows Credential Manager)
   - webhook: task_progress { message: "정부24 로그인 완료", progress_pct: 20 }
6. Search by jibun_address
7. Download PDF (건축물대장 표제부 + 전유부)
   - webhook: task_progress { message: "PDF 다운로드 완료", progress_pct: 60 }
8. Extract text via PDF.js or Playwright page.evaluate()
9. Upload PDF to Supabase Storage: bucket=documents, path=<org_id>/<project_id>/building_register_<timestamp>.pdf
   - webhook: document_uploaded { project_id, document_type: "building_register", file_url, file_name, raw_text }
10. webhook: task_completed { result: { document_id, file_url, page_count } }
    (Server auto-triggers analyze-document)
```

#### `naver_upload` (네이버 블로그 자동 업로드)

```
1. Read payload: { project_id, content_id }
2. Fetch content from Supabase: generated_contents WHERE id = content_id
3. webhook: task_started
4. Open Playwright → blog.naver.com
5. Login (Windows Credential Manager)
   - webhook: task_progress { message: "네이버 로그인 완료", progress_pct: 30 }
6. Create new post: Smart Editor
7. Paste title (content.title) and markdown body (content.content)
8. Upload images from project.assets (type='image')
   - webhook: task_progress { message: "이미지 3장 업로드 완료", progress_pct: 70 }
9. Set tags from content.tags
10. Publish post
11. Get published URL from page
12. Update generated_contents SET is_published=true, published_url=<url>
    webhook: task_completed { result: { published_url } }
```

#### `video_render` (영상 렌더링)

```
1. Read payload: { project_id, script_id, template_id }
2. Fetch script from generated_contents WHERE id = script_id (type='video_script')
3. Fetch project images from assets WHERE type='image'
4. webhook: task_started
5. Run local Remotion/FFmpeg render process
   - webhook: task_progress every 10% increment
6. Upload rendered MP4 to Supabase Storage: bucket=videos
7. webhook: task_completed { result: { video_url, duration_sec, file_size_bytes } }
```

#### `pdf_merge` (패키지 PDF 생성)

```
1. Read payload: { project_id, document_ids: [...] }
2. Download PDFs from Supabase Storage for each document_id
3. webhook: task_started
4. Merge PDFs using pdf-lib (Node.js)
5. Upload merged PDF to Storage: bucket=documents, path=<org_id>/<project_id>/package_<timestamp>.pdf
6. Insert documents row: { type: 'package_pdf', file_url, file_name }
7. webhook: task_completed { result: { document_id, file_url, page_count } }
```

---

## 4. Status Update Protocol

### Webhook Endpoint

All events POST to:
```
POST https://<project>.supabase.co/functions/v1/webhook-agent
Content-Type: application/json
```

No Authorization header is required. Authentication is via `agent_key` in the request body.

### Event Timing Requirements

| Event | When to Send | Required Fields |
|-------|-------------|----------------|
| `heartbeat` | Every 30 seconds, always | `agent_key`, `status`, `version` |
| `task_started` | Immediately after claiming the task | `agent_key`, `task_id` |
| `task_progress` | At meaningful milestones (not more than every 5 seconds) | `agent_key`, `task_id`, `message`, `level`, `progress_pct` |
| `task_completed` | When all work and uploads are done | `agent_key`, `task_id`, `result` |
| `task_failed` | On unrecoverable error or exception | `agent_key`, `task_id`, `error_code`, `error_message`, `retry` |
| `document_uploaded` | After Supabase Storage upload succeeds | `agent_key`, `project_id`, `document_type`, `file_url`, `file_name`, `raw_text` |

### Retry on Webhook Failure

If a webhook call itself fails (network error, 5xx), the agent must retry the webhook up to 3 times with exponential backoff (1s, 2s, 4s) before giving up. If `task_completed` webhook fails permanently, the task remains in `running` state — the server will eventually detect a stale running task (see Watchdog below).

---

## 5. Error Logging Format

### Error Codes

Use structured error codes to enable automated alerting and retry decisions.

| Error Code | Meaning | `retry` Suggested |
|------------|---------|-------------------|
| `LOGIN_FAILED` | Government portal or Naver login failure | true (manual credential check needed) |
| `CAPTCHA_TIMEOUT` | CAPTCHA not solved within 60 seconds | true |
| `SEARCH_NOT_FOUND` | Address returned no results on portal | false |
| `DOWNLOAD_FAILED` | PDF download button not found or timed out | true |
| `UPLOAD_FAILED` | Supabase Storage upload failed | true |
| `OCR_FAILED` | Text extraction from PDF returned empty | false |
| `RENDER_FAILED` | FFmpeg/Remotion render process crashed | true |
| `NETWORK_ERROR` | General network connectivity issue | true |
| `BROWSER_CRASH` | Playwright browser process crashed | true |
| `SITE_MAINTENANCE` | Government site returned maintenance page | false |
| `UNKNOWN_ERROR` | Uncaught exception | false |

### task_logs Format

```json
{
  "task_id": "<uuid>",
  "level": "info" | "warn" | "error",
  "message": "<structured message>",
  "created_at": "<ISO 8601>"
}
```

**Structured message format for errors:**

```
[ERROR_CODE] Human-readable description. (Context: additional detail)
```

Examples:
```
[LOGIN_FAILED] 정부24 로그인 실패. (Context: 비밀번호 오류 또는 계정 잠금)
[CAPTCHA_TIMEOUT] CAPTCHA 60초 내 미해결. (Context: 자동화 감지 가능성)
[SITE_MAINTENANCE] 정부24 점검중 페이지 감지. (Context: 11:00-11:30 정기점검)
```

### Stale Task Watchdog

A database function or cron job should monitor for tasks stuck in `running` status for more than 10 minutes:

```sql
-- Recommended: supabase/functions/ cron or pg_cron job
UPDATE tasks
SET
  status = 'failed',
  error_code = 'STALE_RUNNING',
  error_message = '에이전트 응답 없음 (10분 초과)',
  completed_at = now()
WHERE
  status = 'running'
  AND started_at < now() - interval '10 minutes';
```

This is currently not implemented. See Backend team tasks.

---

## 6. Agent Lifecycle

### Startup Sequence

```
1. Read config.json
2. Validate agent_key: send heartbeat → check response
3. If invalid key → show error dialog, halt
4. Subscribe to Realtime tasks channel
5. Fetch any pending/retrying tasks (catch-up on missed tasks during offline period)
6. Start heartbeat timer (30s interval)
7. Show system tray icon: green = online
```

### Graceful Shutdown

```
1. Set status = 'offline': send heartbeat with status='offline'
2. If task is currently running: send task_failed with error_code='AGENT_SHUTDOWN', retry=true
3. Unsubscribe from Realtime
4. Close Playwright browser instances
5. Exit process
```

### Agent Version Update Protocol

1. The server stores the minimum required agent version in a config table (future: `system_config` table)
2. On heartbeat response, if server returns `{ update_required: true, min_version: "1.3.0" }`, the agent shows an update dialog
3. The agent downloads the new installer from a signed URL in Supabase Storage
4. Auto-update uses Electron's `autoUpdater` or Squirrel.Windows

---

## 7. Realtime RLS Requirement

For the Realtime subscription to work without service role key, the `tasks` table needs an RLS policy that allows agents to read their org's tasks using the anon key with an `agent_key`-based session context.

**Recommended approach:** Before subscribing to Realtime, the agent calls a Supabase RPC function that sets a session variable:

```sql
-- DB function called by agent before Realtime subscription
CREATE OR REPLACE FUNCTION set_agent_context(p_agent_key text)
RETURNS void AS $$
BEGIN
  PERFORM set_config('app.agent_org_id',
    (SELECT org_id::text FROM agent_connections WHERE agent_key = p_agent_key),
    true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

```sql
-- RLS policy on tasks for agent Realtime
CREATE POLICY "agent_can_read_own_org_tasks" ON tasks
FOR SELECT
USING (
  org_id = (current_setting('app.agent_org_id', true))::uuid
);
```

**This RLS policy is not yet implemented.** See Backend team tasks for migration 005.
