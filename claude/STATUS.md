# 🤖 AI 팀 현황판 (업무 지시 가이드)

> **최종 업데이트**: 2026-03-06 | **배포**: https://realestate-eosin-alpha.vercel.app

---

## 💬 업무 지시 방법

새 채팅을 열 때 **첫 줄에 팀 이름**을 쓰면 됩니다:
```
팀1-설계자
(이후 작업 지시)
```

---

## 👥 팀 구성

### 🏛️ 팀1 — 설계자 (System Architect)
- **역할**: 전체 구조 감독, API 계약 관리, DB 스키마 확정
- **담당 파일**: `/docs/`, `/packages/shared/`
- **업무 지시 예시**:
  - `"API 계약서 업데이트해줘"`
  - `"타 팀 간 충돌 검토해줘"`
- **현재 완료**: `api-contracts.md`, `agent-protocol.md`, `team-assignments.md`

---

### 🗄️ 팀2 — 백엔드 (Backend Core)
- **역할**: Supabase 스키마, RLS, Edge Functions 구현
- **담당 파일**: `/supabase/migrations/`, `/supabase/functions/`
- **업무 지시 예시**:
  - `"RLS 정책 추가해줘"`
  - `"normalize-parcel Edge Function 만들어줘"`
  - `"매물 저장 오류 수정해줘"`
- **현재 완료**:
  - Migration 001~009 (스키마, RLS, 함수, 백필)
  - `packages/shared/` TypeScript 타입 일체
  - 매물 등록 저장 실패 수정
  - 지도 마커용 지오코딩 API (`/api/geocode`)
- **다음 할 일**: Edge Functions 표준 응답 봉투 적용, `normalize-parcel` 구현

---

### 🤖 팀3 — 자동화 (Local Agent)
- **역할**: Windows 로컬 에이전트 (Playwright 크롤링, 자동 업로드)
- **담당 파일**: `/src/agent/`
- **업무 지시 예시**:
  - `"건축물대장 다운로드 자동화 만들어줘"`
  - `"Task 워커 오류 고쳐줘"`
  - `"네이버 블로그 자동 업로드 구현해줘"`
- **현재 완료**: 에이전트 워커 기본 뼈대, Playwright 크롤링 모듈

---

### 🎨 팀4 — 프런트엔드 (Frontend)
- **역할**: Next.js UI, 페이지, 컴포넌트
- **담당 파일**: `/src/app/`, `/src/components/`
- **업무 지시 예시**:
  - `"매물 등록 페이지 고쳐줘"`
  - `"지도에 마커 안 나와"`
  - `"대시보드 실시간 태스크 현황 추가해줘"`
- **현재 완료**:
  - 상단 네비게이션 AppShell
  - `/projects` 카드+지도 분할 뷰
  - 카카오맵 JS SDK 연동
  - 매물 등록 3단계 Wizard

---

### ✍️ 팀5 — 콘텐츠 엔진 (Content Engine)
- **역할**: AI 콘텐츠 생성 로직 (블로그, 카드뉴스, 쇼츠)
- **담당 파일**: `/src/lib/content/`, `/supabase/functions/_shared/`
- **업무 지시 예시**:
  - `"블로그 SEO 점수 로직 바꿔줘"`
  - `"카카오 카드뉴스 템플릿 추가해줘"`
  - `"쇼츠 스크립트 프롬프트 수정해줘"`
- **현재 완료**: `seo-scorer.ts`, `shorts-script.ts`, 기본 프롬프트 템플릿

---

## ⚠️ 공통 주의사항

| 팀 | 주의 |
|---|---|
| 설계자 | API 계약 변경 시 반드시 다른 팀에 공유 |
| 백엔드 | Edge Functions 수정 후 Vercel 재배포 확인 |
| 자동화 | 에이전트 테스트는 로컬에서만 |
| 프런트엔드 | `NEXT_PUBLIC_` 변수는 Vercel에도 등록 필요 |
| 콘텐츠 | 프롬프트 변경 시 토큰 비용 영향 확인 |
