-- ============================================================
-- Migration: 009_backfill_orphan_users.sql
-- 기존 가입자 중 조직이 없는 유저에게 기본 조직 + 멤버십 생성
-- 이 마이그레이션은 008 적용 이전에 가입한 유저를 위한 일회성 보정
-- ============================================================

DO $$
DECLARE
    v_user   RECORD;
    v_org_id uuid;
BEGIN
    -- memberships 테이블에 아무 행도 없는 유저 조회
    FOR v_user IN
        SELECT u.id, u.email, u.full_name
        FROM users u
        LEFT JOIN memberships m ON m.user_id = u.id
        WHERE m.id IS NULL
    LOOP
        -- 기본 조직 생성
        INSERT INTO organizations (name, plan_type, monthly_project_limit)
        VALUES (
            COALESCE(v_user.full_name, split_part(v_user.email, '@', 1)) || '의 사무소',
            'free',
            20
        )
        RETURNING id INTO v_org_id;

        -- owner 멤버십 생성
        INSERT INTO memberships (org_id, user_id, role, joined_at)
        VALUES (v_org_id, v_user.id, 'owner', now());

        RAISE NOTICE 'Created org for user % (%)', v_user.email, v_user.id;
    END LOOP;
END;
$$;
