-- projects.property_type CHECK 제약을 앱의 PropertyType 전체(12종)로 확장
-- 기존 제약은 apartment/officetel/villa/commercial/land/house(6종)만 허용하여
-- 원룸/다가구/공장·창고/지식산업센터/상가주택/임야 저장 시 위반 오류(23514) 발생했음.

ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_property_type_check;

ALTER TABLE public.projects ADD CONSTRAINT projects_property_type_check
  CHECK (property_type = ANY (ARRAY[
    'apartment','officetel','villa','commercial','land','house',
    'multi_unit','factory','knowledge_industry','mixed_use','oneroom','forest'
  ]::text[]));
