-- ============================================================
-- Migration: 008_auto_org_on_signup.sql
-- 신규 가입 시 자동으로 조직(organizations) + 멤버십(memberships) 생성
-- 문제: 신규 유저가 매물 등록 시 memberships 조회 결과 null → 저장 실패
-- 해결: auth.users INSERT 트리거에서 org + membership 자동 생성
-- ============================================================

-- 기존 trigger_create_user_profile 함수를 확장:
-- users 프로필 생성 + organizations 자동 생성 + memberships 자동 생성
CREATE OR REPLACE FUNCTION trigger_create_user_profile()
RETURNS trigger AS $$
DECLARE
    v_org_id uuid;
    v_user_name text;
BEGIN
    -- 1. 유저 이름 추출
    v_user_name := COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        split_part(NEW.email, '@', 1)
    );

    -- 2. users 프로필 생성 (기존 로직)
    INSERT INTO users (id, email, full_name, avatar_url)
    VALUES (
        NEW.id,
        NEW.email,
        v_user_name,
        COALESCE(NEW.raw_user_meta_data->>'avatar_url', '')
    )
    ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        avatar_url = EXCLUDED.avatar_url;

    -- 3. 이미 소속 조직이 있는지 확인
    IF NOT EXISTS (
        SELECT 1 FROM memberships WHERE user_id = NEW.id
    ) THEN
        -- 4. 기본 조직 생성
        INSERT INTO organizations (name, plan_type, monthly_project_limit)
        VALUES (v_user_name || '의 사무소', 'free', 20)
        RETURNING id INTO v_org_id;

        -- 5. owner 멤버십 생성 (joined_at 설정하여 RLS 통과)
        INSERT INTO memberships (org_id, user_id, role, joined_at)
        VALUES (v_org_id, NEW.id, 'owner', now());
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 트리거는 이미 003_functions.sql에서 생성되어 있으므로 재생성 불필요
-- (CREATE OR REPLACE FUNCTION으로 함수 본문만 교체됨)
