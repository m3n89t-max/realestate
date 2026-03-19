# 부동산 마케팅 자동화 AI OS — 프로젝트 문서

## 1. 프로젝트 개요

### 프로젝트명
**RealEstate AI OS** — 공인중개사를 위한 부동산 마케팅 자동화 플랫폼

### 핵심 목표
공인중개사가 다음 정보만 입력하면 마케팅 콘텐츠가 자동 생성된다:
- 지번 또는 주소
- 매물 사진
- 간단 소개 및 특장점

### 자동화 범위
1. 입지 및 상권 분석 (카카오 Local API, AI 분석)
2. 네이버 블로그 SEO 글 생성
3. 인스타그램 카드뉴스 제작 (6장)
4. 카카오톡 카드뉴스 제작 (6장)
5. 유튜브 쇼츠 스크립트 생성
6. 네이버 블로그 자동 업로드 (Playwright 자동화)
7. 건축물대장 · 지적도 자동 다운로드 (Phase 2)

---

## 2. 기술 스택

### 프론트엔드
- **Next.js** (App Router) + TypeScript
- **TailwindCSS**
- 배포: **Vercel**

### 백엔드
- **Supabase** (PostgreSQL, Auth, Storage, Realtime, Edge Functions)
- **OpenAI API** (GPT-4o, DALL-E 3)
- **카카오 Local API** (상권 분석)

### 로컬 자동화 에이전트
- **Electron/Tauri** 기반 Windows 앱
- **Playwright** (브라우저 자동화)
- **FFmpeg** (영상 처리)

---

## 3. 핵심 기능 상세

### 3-1. 블로그 SEO 글 자동 생성

**입력 데이터:**
- 매물 주소, 유형, 가격, 면적, 층수, 방향
- 공인중개사 현장 메모 (층별 구성, 임대현황, 건물상태)
- 매물 사진 (최대 10장)
- 입지 분석 결과

**AI 생성 내용 (GPT-4o):**
- 블로그 제목 5개 (정보형 / 후킹형 / 질문형 / 감성형 / 숫자형)
- 본문 1,500자 이상 (H1~H2 구조, 섹션 7개)
- FAQ 5개 (Q./A. 형식)
- 해시태그 30개
- SEO 점수 자동 계산
- 메타 디스크립션 150자

**블로그 구조 (H2 섹션):**
1. 매물 개요
2. 입지 장점 7가지
3. 주변 인프라 분석
4. 상권 또는 생활환경 분석
5. 추천 수요층
6. 투자 또는 운영 관점
7. FAQ
8. 문의 안내

**사진 삽입 방식:**
- 인라인 모드: 각 섹션 본문 중간에 사진 삽입 + 구체적 캡션
- 일괄 모드: 본문 마지막에 일괄 삽입

---

### 3-2. 인스타그램 카드뉴스 자동 생성

**카드 6장 구성:**
1. Cover: 후킹 제목 + 가격뱃지 + 핵심강점 3개
2. Location: 입지 분석 + 주소 + 교통/생활 인프라
3. Composition: 층별 구성 스펙그리드
4. Investment: 임대현황 + 투자포인트
5. Interior: 내부 특징 (사진 AI 분석 반영)
6. CTA: 행동유도 + 가격 + 해시태그 8개

**AI 기능:**
- 매물 사진 Vision 분석 (GPT-4o Vision)으로 내부/외관 특징 자동 추출
- DALL-E 3로 카드별 배경 이미지 자동 생성 (매물 유형 + 지역 반영)
- 필터 효과 (밝기/대비/채도/블러/그라디언트 오버레이)

**image_prompt 특징:**
- 지역명(영문) + 건물유형 + 층수/외관 + 주변환경 + 조명/분위기
- 예: "Small 2-story commercial building in Jeju Aewol Korea, ground floor storefront, residential alley, warm afternoon light, photorealistic"

---

### 3-3. 네이버 블로그 자동 업로드

**작동 방식:**
1. 웹에서 "네이버 블로그 업로드" 클릭 → tasks 테이블에 작업 등록
2. 로컬 에이전트가 tasks 구독 → Playwright로 네이버 SmartEditor 자동 조작
3. 제목 입력 → 본문 타이핑 → 사진 삽입 → 태그 입력 → 발행

**사진 첨부 방식 선택:**
- 개별사진 / 콜라주 / 슬라이드 (다이얼로그 자동 처리)
- 사진 배치: 글 중간 인라인 / 글 마지막 일괄

**제목 선택 기능:**
- AI 추천 5개 중 클릭으로 선택 → 업로드 시 선택된 제목 사용

---

### 3-4. 입지 분석

**분석 항목:**
- 교통: 인근 지하철역, 버스, 도로 접근성
- 학군: 학교 분포 및 학원가
- 상권: 카카오 Local API로 반경 500m 업종 밀집도 분석
- 편의시설: 마트, 병원, 공원 등
- 투자 관점: 개발 호재, 시세 동향

---

## 4. 데이터베이스 구조

### 주요 테이블

**projects** (매물 정보)
```
id, org_id, address, property_type, price, area, floor, total_floors
direction, features[], building_condition, floor_composition
rental_status, note, deposit, key_money, monthly_rent
kakao_density (JSONB)
```

**generated_contents** (생성된 콘텐츠)
```
id, project_id, org_id, type (blog/card_news)
title, titles[] (추천 제목 5개), content, meta_description
tags[], faq[], seo_score (JSONB), version
is_published, published_url
```

**tasks** (자동화 작업 큐)
```
id, org_id, project_id, type, status (pending/running/success/failed)
payload (JSONB), scheduled_at, result
```

**assets** (매물 사진)
```
id, project_id, type, file_url, alt_text, category, is_cover, sort_order
```

---

## 5. 자동화 워크플로우

```
공인중개사 입력
    ↓
매물 등록 (주소, 사진, 특징, 층별구성, 임대현황)
    ↓
입지 분석 (카카오 API + GPT-4o)
    ↓
콘텐츠 생성 선택
    ├─ 블로그 생성 → 편집 → 제목 선택 → 네이버 자동 업로드
    └─ 카드뉴스 생성 → AI 배경 생성 → 다운로드/공유
    ↓
로컬 에이전트 (tasks 구독)
    ↓
Playwright 자동 업로드
    ↓
발행 URL 수집 → DB 저장
```

---

## 6. SEO 최적화 전략

### 블로그 SEO 체크리스트
- ✅ 지역 키워드: 제목에 지역명 + 매물유형 포함
- ✅ 글자수: 1,500자 이상
- ✅ H2 구조: 섹션 헤딩 7개 이상
- ✅ FAQ: 자주 묻는 질문 5개
- ✅ ALT 태그: 이미지 대체 텍스트
- ✅ 롱테일 키워드: 자연스러운 장문 검색어 분포
- ✅ 해시태그: 30개

### 제목 유형 (5가지)
1. **정보형**: "제주시 애월읍 상가 매매 - 공원인접·뷰좋음·조용한 199.98㎡ 완벽 분석"
2. **후킹형**: "지금 안 보면 후회합니다 - 제주 애월읍 상업용 매물 긴급 소개"
3. **질문형**: "왜 제주 애월읍 상가는 투자 가치가 높을까요?"
4. **감성형**: "제주의 여유로운 삶과 함께하는 애월읍 상가 - 공원 인접 실사용 후기"
5. **숫자형**: "도보 3분·공원 인접·뷰 탁월 - 제주 애월읍 상가 실측 입지 분석"

---

## 7. 비즈니스 모델

### 멀티테넌트 SaaS
- 조직(organization) 단위로 데이터 격리
- 사용량 기반 과금 (generation 횟수, token 사용량)
- 공인중개사 사무소 단위 구독

### 핵심 가치 제안
- 블로그 글 작성 시간: 2~3시간 → **1분**
- 카드뉴스 제작 비용: 디자이너 의뢰 → **무료 자동화**
- 네이버 블로그 업로드: 수동 → **1클릭 자동**
- SEO 최적화: 전문가 필요 → **AI 자동 적용**

---

## 8. 현재 개발 단계 (Phase 1 완료)

### 완료된 기능
- ✅ 매물 등록 (주소, 사진, 특징, 층별구성, 임대현황, 보증금, 권리금)
- ✅ 입지 분석 (카카오 API + AI)
- ✅ 블로그 SEO 글 생성 (GPT-4o)
- ✅ 블로그 제목 5가지 스타일 생성 + 선택
- ✅ 블로그 미리보기 (마크다운 렌더링)
- ✅ 인스타그램 카드뉴스 생성 (6장)
- ✅ DALL-E 3 AI 배경 이미지 생성
- ✅ 네이버 블로그 자동 업로드 (Playwright)
- ✅ 사진 인라인/일괄 삽입 모드
- ✅ 공인중개사 연락처 자동 삽입

### 예정 기능 (Phase 2~3)
- 🔲 건축물대장 자동 다운로드
- 🔲 지적도 자동 다운로드
- 🔲 서류 AI 요약
- 🔲 유튜브 쇼츠 스크립트 생성
- 🔲 쇼츠 영상 자동 렌더링
- 🔲 유튜브 자동 업로드

---

## 9. 주요 기술적 도전과 해결

### 도전 1: 네이버 SmartEditor 자동화
- **문제**: iframe 기반 에디터, 봇 탐지
- **해결**: Playwright로 mainFrame 접근, JS inject로 로그인 입력, 세션 저장으로 재로그인 방지

### 도전 2: AI 이미지 프롬프트 품질
- **문제**: 일반적인 프롬프트로 엉뚱한 이미지(고급빌라 등) 생성
- **해결**: 매물 유형 + 실제 지역명 + 외관특징 + 주변환경을 구체적으로 지정

### 도전 3: 블로그 사진 인라인 삽입
- **문제**: URL 매칭 실패로 사진이 글 끝에만 몰림
- **해결**: 마크다운 이미지 URL에서 직접 다운로드 후 해당 위치에 삽입

### 도전 4: SEO 콘텐츠 품질
- **문제**: AI가 추상적 표현, 숫자 중복, FAQ 번호 오류 생성
- **해결**: 시스템 프롬프트에 구체적 규칙 명시, 렌더러에서 다단계 중복 제거

---

## 10. API 구조

### Supabase Edge Functions
| 함수명 | 역할 |
|--------|------|
| generate-blog | 블로그 SEO 글 생성 (titles_only 모드 포함) |
| generate-card-news | 인스타그램/카카오 카드뉴스 생성 |
| generate-card-image | DALL-E 3 배경 이미지 생성 |
| analyze-commercial | 상권/입지 분석 |
| location-analyze | 입지 분석 |

### Next.js API Routes
| 경로 | 역할 |
|------|------|
| /api/generate-card-image | DALL-E 이미지 생성 (Vercel용) |
| /api/kakao-poi | 카카오 POI 검색 |

---

*문서 생성일: 2026-03-18*
*프로젝트 GitHub: https://github.com/m3n89t-max/realestate*
