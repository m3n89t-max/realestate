-- Add deposit and key_money fields to projects table
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS deposit BIGINT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS key_money BIGINT DEFAULT NULL;

COMMENT ON COLUMN projects.deposit IS '보증금 (원 단위)';
COMMENT ON COLUMN projects.key_money IS '권리금 (원 단위)';
