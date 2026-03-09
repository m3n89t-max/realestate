-- 건축물대장 API 조회에 필요한 지번 코드 컬럼 추가
ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS sigungu_code text,
    ADD COLUMN IF NOT EXISTS bjdong_code  text,
    ADD COLUMN IF NOT EXISTS bun          text,
    ADD COLUMN IF NOT EXISTS ji           text,
    ADD COLUMN IF NOT EXISTS legal_dong   text;
