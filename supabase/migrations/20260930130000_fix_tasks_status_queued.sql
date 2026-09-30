-- ============================================================
-- tasks.status 를 'pending' → 'queued' 로 정정한다 (007 미반영분 복구)
--
-- 왜 필요한가 (2026-09-30 운영 DB 실측 근거):
--   * 운영 제약:  tasks_status_check = CHECK (status IN
--       ('pending','running','success','failed','retrying','cancelled'))
--     → 'queued' 가 허용 목록에 없다.
--   * 운영 기본값: tasks.status DEFAULT 'pending'
--   * 그런데 앱 코드는 이미 전부 'queued' 를 쓴다:
--       supabase/functions/normalize-parcel/index.ts:364  status: 'queued'
--       src/app/(dashboard)/projects/[id]/components/BlogTab.tsx:378  status: 'queued'
--       src/lib/hooks/useTasks.ts:98  재시도 시 status: 'queued'
--       src/agent/worker.ts:309,466  'queued'/'retrying' 만 claim
--       packages/shared/types/enums.ts:34  QUEUED: 'queued'
--     → 즉 status:'queued' 로 INSERT 하는 모든 경로가 현재 운영에서
--       CHECK 위반(23514)으로 실패한다. 실제로 운영 tasks 164건 중
--       'queued' 행은 0건, 'pending' 만 2건 남아 있다.
--
-- 원래 이 변경은 007_schema_fixes.sql(23-32행)이 담당했고 히스토리에는
-- '007' 이 applied 로 기록돼 있으나 실제 DB에는 반영되지 않았다.
-- 029_security_queue_hardening.sql 에도 같은 구문이 섞여 있었지만,
-- 보안 마이그레이션과 데이터 UPDATE 를 한 파일에서 처리하면 실패 시 원인
-- 추적이 어려워 이 전용 파일로 분리했다.
--
-- 멱등성: 네 구문 모두 반복 실행해도 안전하다.
--   DROP CONSTRAINT 는 IF EXISTS, UPDATE 는 대상이 없으면 0행,
--   ADD CONSTRAINT 는 직전 DROP 으로 항상 새로 만든다.
--
-- 실행 순서가 중요하다: 구 제약이 'queued' 를 거부하므로 제약을 먼저
-- 제거해야 UPDATE 가 통과한다. (제약을 남긴 채 UPDATE 하면 23514 로 실패)
-- ============================================================

-- 1) 구 제약을 먼저 제거한다. 이것이 없으면 아래 UPDATE 가 'queued' 를
--    쓰는 순간 CHECK 위반(23514)으로 전체가 롤백된다.
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_status_check;

-- 2) 남아 있는 대기 작업을 새 상태값으로 옮긴다 (현재 운영 2건)
UPDATE public.tasks SET status = 'queued' WHERE status = 'pending';

-- 3) 기본값을 코드와 맞춘다
ALTER TABLE public.tasks ALTER COLUMN status SET DEFAULT 'queued';

-- 4) 새 제약을 건다. 'pending' 은 더 이상 허용하지 않는다.
--    (2번을 먼저 실행했으므로 기존 행이 제약을 위반하지 않는다)
ALTER TABLE public.tasks ADD CONSTRAINT tasks_status_check CHECK (
  status IN ('queued', 'running', 'success', 'failed', 'retrying', 'cancelled')
);

-- 5) 007 이 만들려 했던 대기 작업 조회용 부분 인덱스도 함께 복구한다.
--    운영 tasks 에는 현재 tasks_pkey 외 인덱스가 없다.
DROP INDEX IF EXISTS public.idx_tasks_pending_scheduled;
CREATE INDEX IF NOT EXISTS idx_tasks_queued_scheduled
  ON public.tasks (scheduled_at ASC)
  WHERE status IN ('queued', 'retrying');
