-- ============================================================
-- 신규 유저 가입 시 자동으로 개인 조직 + 멤버십 생성
-- Migration: 008_auto_org.sql
-- ============================================================

-- 기존 트리거 함수 교체 (org + membership 자동 생성 추가)
CREATE OR REPLACE FUNCTION trigger_create_user_profile()
RETURNS trigger AS $$
DECLARE
    v_org_id uuid;
    v_display_name text;
BEGIN
    -- 사용자 프로필 생성
    INSERT INTO users (id, email, full_name, avatar_url)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'avatar_url', '')
    )
    ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        avatar_url = EXCLUDED.avatar_url;

    -- 이미 조직이 있으면 건너뜀
    IF EXISTS (SELECT 1 FROM memberships WHERE user_id = NEW.id LIMIT 1) THEN
        RETURN NEW;
    END IF;

    -- 표시 이름 결정
    v_display_name := COALESCE(
        NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
        split_part(NEW.email, '@', 1)
    );

    -- 개인 조직 자동 생성
    INSERT INTO organizations (name, plan_type)
    VALUES (v_display_name || '의 중개사무소', 'free')
    RETURNING id INTO v_org_id;

    -- 소유자 멤버십 생성
    INSERT INTO memberships (org_id, user_id, role, joined_at)
    VALUES (v_org_id, NEW.id, 'owner', now());

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 기존 유저 중 org 없는 사용자에게도 소급 적용
-- ============================================================
DO $$
DECLARE
    rec RECORD;
    v_org_id uuid;
    v_display_name text;
BEGIN
    FOR rec IN
        SELECT u.id, u.email, u.full_name
        FROM users u
        WHERE NOT EXISTS (
            SELECT 1 FROM memberships m WHERE m.user_id = u.id
        )
    LOOP
        v_display_name := COALESCE(NULLIF(rec.full_name, ''), split_part(rec.email, '@', 1));

        INSERT INTO organizations (name, plan_type)
        VALUES (v_display_name || '의 중개사무소', 'free')
        RETURNING id INTO v_org_id;

        INSERT INTO memberships (org_id, user_id, role, joined_at)
        VALUES (v_org_id, rec.id, 'owner', now());

        RAISE NOTICE '조직 자동 생성: % → org_id=%', rec.email, v_org_id;
    END LOOP;
END;
$$;
