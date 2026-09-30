-- projects 테이블에 거래 유형 컬럼 추가
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS transaction_type TEXT DEFAULT 'sale'
    CHECK (transaction_type IN ('sale', 'jeonse', 'monthly_rent'));

COMMENT ON COLUMN projects.transaction_type IS '거래 유형: sale=매매, jeonse=전세, monthly_rent=월세';
