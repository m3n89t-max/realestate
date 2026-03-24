-- ============================================================
-- Migration 020: TEAM5 상권 분석 - location_analyses 필드 확장
-- ============================================================

ALTER TABLE location_analyses
  ADD COLUMN IF NOT EXISTS land_use_summary      text,           -- 토지이용 요약
  ADD COLUMN IF NOT EXISTS price_trend           text,           -- 실거래가 동향
  ADD COLUMN IF NOT EXISTS commercial_grade      text,           -- 상권 등급 (S/A/B/C)
  ADD COLUMN IF NOT EXISTS commercial_type       text,           -- 상권 유형 (주거형/직장인/학원/복합 등)
  ADD COLUMN IF NOT EXISTS foot_traffic          jsonb,          -- 유동인구 추정 (score, label, breakdown)
  ADD COLUMN IF NOT EXISTS recommended_industries jsonb,         -- 추천/비추천 업종
  ADD COLUMN IF NOT EXISTS updated_at            timestamptz DEFAULT now();

COMMENT ON COLUMN location_analyses.commercial_grade      IS '상권 등급: S=최우수, A=우수, B=보통, C=낮음';
COMMENT ON COLUMN location_analyses.commercial_type       IS '상권 유형: 주거형/직장인/학원/대학/관광/복합';
COMMENT ON COLUMN location_analyses.foot_traffic          IS '유동인구 추정: {score: 0-100, label: string, breakdown: {...}}';
COMMENT ON COLUMN location_analyses.recommended_industries IS '추천/비추천 업종: {recommended: [{name, reason}], not_recommended: [{name, reason}]}';
