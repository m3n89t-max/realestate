# CLAUDE.md
RealEstate AI OS

이 파일은 Claude Code가 프로젝트 작업 시 항상 참고하는 **지속 규칙(Persistent Rules)** 이다.

---

# Project Overview

프로젝트 이름:

RealEstate AI OS

목표:

공인중개사가 다음만 입력하면

- 지번 또는 주소
- 매물 사진
- 간단 소개
- 특장점

시스템이 자동으로 다음을 수행한다.

1. 입지 및 상권 분석
2. 건축물대장 다운로드
3. 지적도 다운로드
4. 서류 요약 분석
5. 네이버 블로그 SEO 글 생성
6. 인스타 카드뉴스 제작
7. 카카오 카드뉴스 제작
8. 유튜브 쇼츠 스크립트 생성
9. 쇼츠 영상 렌더링
10. 콘텐츠 업로드 자동화

이 시스템은 **부동산 업무 자동화 OS**이다.

---

# Tech Stack

Frontend

- Next.js (App Router)
- TypeScript
- TailwindCSS

Backend

- Supabase
- PostgreSQL
- Supabase Auth
- Supabase Storage
- Supabase Realtime
- Supabase Edge Functions

Local Automation Agent

- Windows
- Electron 또는 Tauri
- Playwright
- FFmpeg

Deployment

- Vercel

---

# Core Architecture Rules

Claude는 항상 다음 아키텍처 규칙을 유지해야 한다.

1. 모든 API는 **Supabase Edge Functions** 기반
2. 모든 데이터는 **Supabase Postgres**
3. 인증은 **Supabase Auth**
4. 파일은 **Supabase Storage**
5. 실시간 상태는 **Supabase Realtime**
6. 로컬 자동화는 **Local Agent**가 담당
7. 모든 자동화 작업은 **Task Queue** 기반

---

# Task Queue Architecture

자동화 작업은 모두 **tasks 테이블**을 통해 관리된다.

tasks.type ENUM

normalize_parcel
location_analyze
download_building_register
download_cadastral_map
summarize_documents
generate_blog
generate_cards_instagram
generate_cards_kakao
generate_shorts_script
render_shorts_video
upload_naver_blog
upload_youtube

tasks.status

queued
running
success
failed

작업 흐름:

1. Frontend 요청
2. Backend Edge Function 실행
3. tasks 생성
4. Worker 또는 Local Agent 처리
5. 상태 업데이트

---

# Database Schema

주요 테이블

organizations
users
memberships
projects
assets
documents
generated_contents
tasks
usage_logs

시스템은 **멀티테넌트 구조**이다.

모든 데이터는 **organization_id 기반으로 격리**된다.

---

# Security Rules

모든 API는 다음을 반드시 확인해야 한다.

1. auth 인증
2. organization 권한 체크
3. project 접근 권한 확인

Supabase RLS 정책을 반드시 적용한다.

---

# API Rules

API는 REST 스타일을 따른다.

예시:

POST /projects
POST /projects/{id}/generate
POST /projects/{id}/documents/summarize
GET /projects/{id}
GET /tasks?project_id=

모든 응답은 다음 구조를 따른다.

{
  success: true,
  data: {}
}

---

# Frontend Rules

Next.js App Router 사용

필수 화면:

/dashboard
/projects
/projects/new
/projects/[id]

projects/[id] 화면은 다음 탭을 가진다.

Overview
Docs
Blog
Cards
Shorts
Tasks

필수 기능

- 매물 등록 wizard
- 사진 업로드
- 자동화 실행 버튼
- tasks 실시간 상태 표시
- 블로그 편집기
- 카드뉴스 미리보기
- 서류 상태 표시

---

# SEO Blog Generation Rules

블로그 글은 다음 구조를 따른다.

H1
지역명 + 매물유형 + 핵심강점

H2
매물 개요

H2
입지 장점 7가지

H2
주변 인프라 분석

H2
시장 전망

H2
실거주 / 투자 포인트

H2
FAQ

H2
문의 안내

요구사항

- 1500자 이상
- 키워드 자연 분포
- ALT 태그 포함
- 해시태그 30개

---

# Content Engine Rules

콘텐츠 엔진은 다음을 생성한다.

1. SEO 블로그 글
2. 인스타 카드뉴스
3. 카카오 카드뉴스
4. 유튜브 쇼츠 스크립트

카드뉴스

- 기본 6장 템플릿

쇼츠

- 30~60초 스크립트

---

# Local Automation Agent Rules

Local Agent는 다음 작업을 수행한다.

download_building_register
download_cadastral_map

동작 방식

1. Supabase tasks subscribe
2. 작업 실행
3. 결과 업로드
4. 상태 업데이트

Phase 2 이후

- 네이버 블로그 자동 업로드
- 유튜브 자동 업로드

---

# Development Phases

Phase 1

- 매물 등록
- 입지 분석
- 블로그 생성
- 카드뉴스 생성

Phase 2

- 건축물대장 다운로드
- 지적도 다운로드
- 서류 요약

Phase 3

- 쇼츠 렌더링
- 자동 업로드

---

# Compact Instructions

이 프로젝트는

부동산 자동화 SaaS 플랫폼이다.

핵심 기능

- 매물 분석
- 서류 자동 수집
- 콘텐츠 자동 생성
- 마케팅 자동화

Claude는 항상

- Supabase 기반
- Next.js 기반
- Task Queue 기반

구조를 유지해야 한다.