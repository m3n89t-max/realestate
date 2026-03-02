-- ============================================================
-- RealEstate AI OS - 개발/테스트 시드 데이터
-- 주의: 프로덕션에서는 실행 금지
-- ============================================================

-- 시스템 기본 템플릿 (org_id = NULL)
INSERT INTO templates (id, org_id, type, name, description, variables, is_default, is_public)
VALUES
(
    'a0000000-0000-0000-0000-000000000001',
    NULL, 'blog', '매물 블로그 기본 템플릿',
    'SEO 최적화. H2 7섹션, FAQ, CTA 포함.',
    ARRAY['{{address}}', '{{property_type}}', '{{area}}', '{{price}}', '{{direction}}', '{{features_summary}}'],
    true, true
),
(
    'a0000000-0000-0000-0000-000000000002',
    NULL, 'card_news', '매물 카드뉴스 기본 템플릿 (6장)',
    '인스타/카카오 공유 최적화. 6장 구성.',
    ARRAY['{{address}}', '{{property_type}}', '{{price}}', '{{area}}', '{{features}}'],
    true, true
),
(
    'a0000000-0000-0000-0000-000000000003',
    NULL, 'video', '매물 홍보 영상 스크립트 (60초)',
    '유튜브/쇼츠 매물 홍보. 6장면 60초.',
    ARRAY['{{address}}', '{{property_type}}', '{{price}}', '{{agent_name}}', '{{agent_phone}}'],
    true, true
)
ON CONFLICT (id) DO NOTHING;

-- 테스트 조직 (개발 환경 전용)
INSERT INTO organizations (id, name, phone, plan_type, monthly_project_limit)
VALUES ('b0000000-0000-0000-0000-000000000001', '테스트 부동산', '02-1234-5678', 'pro', 100)
ON CONFLICT (id) DO NOTHING;

-- 테스트 에이전트
INSERT INTO agent_connections (id, org_id, agent_key, name, platform, version, status)
VALUES (
    'c0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'test-agent-key-dev-only',
    '개발 테스트 에이전트', 'windows', '1.0.0', 'offline'
)
ON CONFLICT (id) DO NOTHING;

-- 테스트 프로젝트
INSERT INTO projects (
    id, org_id, address, jibun_address, lat, lng,
    property_type, price, area, floor, total_floors, direction,
    features, status, note
) VALUES (
    'd0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    '서울특별시 강남구 개포동 1234 개포래미안포레스트 101동 1801호',
    '서울 강남구 개포동 1234',
    37.4773000, 127.0561000,
    'apartment', 1850000000, 84.92, 18, 25, '남동향',
    ARRAY['역세권', '학군우수', '신축', '대단지'],
    'active',
    '개포동 신축 대단지. 3호선 도보 5분.'
),
(
    'd0000000-0000-0000-0000-000000000002',
    'b0000000-0000-0000-0000-000000000001',
    '서울특별시 서초구 서초동 5678 서초 THE SHARP 305호',
    '서울 서초구 서초동 5678',
    37.4910000, 127.0100000,
    'officetel', 450000000, 1500000, 33.05, 3, 20, '남향',
    ARRAY['역세권', '풀옵션', '주차가능'],
    'draft',
    '서초역 3분. 풀옵션. 즉시 입주.'
)
ON CONFLICT (id) DO NOTHING;

-- 테스트 입지 분석
INSERT INTO location_analyses (project_id, advantages, recommended_targets, analysis_text)
VALUES (
    'd0000000-0000-0000-0000-000000000001',
    ARRAY[
        '지하철 3호선 개포동역 도보 5분 - 강남 접근성 탁월',
        '개포주공 재건축 완료로 주변 쾌적',
        '개포초·중학교 도보 10분, 대치학원가 인접',
        '양재천 산책로 도보 3분',
        '2023년 신축 단지',
        '이마트·현대백화점 차량 10분',
        '강남세브란스 차량 15분'
    ],
    '[
        {"type":"3-4인 가족","reason":"우수한 학군","priority":1},
        {"type":"강남 직장인","reason":"대중교통 접근성","priority":2},
        {"type":"자산가","reason":"신축 아파트 가치 상승","priority":3}
    ]'::jsonb,
    '개포래미안포레스트는 강남구 핵심 주거지역의 신축 대단지로, 교통/학군/자연환경이 복합적으로 우수한 매물입니다.'
)
ON CONFLICT (project_id) DO NOTHING;

-- 테스트 사용량
INSERT INTO usage_logs (org_id, year, month, project_count, generation_count)
VALUES ('b0000000-0000-0000-0000-000000000001', 2026, 3, 2, 5)
ON CONFLICT (org_id, year, month) DO NOTHING;
