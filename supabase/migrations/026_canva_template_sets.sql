-- Canva Brand Template 세트 관리 테이블
-- 각 세트는 6장(커버/입지/구성/투자/내부/CTA)의 Canva Brand Template ID를 가짐

CREATE TABLE IF NOT EXISTS canva_template_sets (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name          text NOT NULL,
  description   text DEFAULT '',
  thumbnail_url text,
  category      text DEFAULT 'general',
  -- { cover, location, composition, investment, interior, cta }
  template_ids  jsonb NOT NULL DEFAULT '{}',
  gradient      text,
  accent_color  text DEFAULT '#6366f1',
  is_active     boolean DEFAULT true,
  sort_order    int DEFAULT 0,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE canva_template_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read active template sets"
  ON canva_template_sets FOR SELECT
  TO authenticated
  USING (is_active = true);

COMMENT ON TABLE canva_template_sets IS 'Canva Brand Template 세트 - 관리자가 Canva Brand Hub에서 만든 템플릿 ID를 등록';
COMMENT ON COLUMN canva_template_sets.template_ids IS '{"cover":"TEMPLATE_ID","location":"TEMPLATE_ID","composition":"TEMPLATE_ID","investment":"TEMPLATE_ID","interior":"TEMPLATE_ID","cta":"TEMPLATE_ID"}';
