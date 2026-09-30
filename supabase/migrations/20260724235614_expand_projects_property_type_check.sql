-- ============================================================
-- 이 파일은 운영 DB에 이미 적용된 마이그레이션을 로컬로 복원한 것입니다.
-- 출처: supabase_migrations.schema_migrations 의 version='20260724235614'
--       (name='expand_projects_property_type_check') 에 기록된 statements 원문.
-- 로컬 파일이 없어서 `supabase db push` 가 "Remote migration versions not found
-- in local migrations directory" 로 실패하던 문제를 막기 위해 복원했습니다.
-- 027_expand_property_type_check.sql 의 후속(사실상 동일 내용)이며,
-- 운영 DB의 최종 상태는 이 파일이 결정합니다.
-- ============================================================
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_property_type_check;
ALTER TABLE public.projects ADD CONSTRAINT projects_property_type_check
  CHECK (property_type = ANY (ARRAY[
    'apartment','officetel','villa','commercial','land','house',
    'multi_unit','factory','knowledge_industry','mixed_use','oneroom','forest'
  ]::text[]));
