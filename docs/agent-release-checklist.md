# 집포터 Windows 에이전트 릴리스 체크리스트

## 자동 빌드 전제조건

- Windows x64 릴리스 호스트에서 Node.js 20 이상과 깨끗한 `npm ci` 환경을 사용한다.
- 공식 Supabase 프로젝트 origin을 `AGENT_SUPABASE_URL`에 설정한다. 값은 `https://<20자리-project-ref>.supabase.co` 형식이어야 하며 경로·query·fragment를 포함하지 않는다.
- 공식 anon key를 `AGENT_SUPABASE_ANON_KEY`에 설정한다. 로그나 릴리스 문서에 실제 값을 기록하지 않는다.
- 유효한 Windows 코드서명 인증서를 `CSC_LINK`(또는 `WIN_CSC_LINK`)와 대응 암호 변수에 제공한다. 인증서가 없으면 배포는 **NO-GO**다.

## 빌드 및 검증

1. `npm ci`
2. `npm run agent:prebuild`
3. `npm run agent:build`
4. `npm run agent:verify-artifact`
5. `npm run agent:release-check` — Windows에서 Authenticode 상태가 `Valid`여야 한다.
6. `npm run agent:sha256`

## 수동 확인

- 파일명이 `RealEstateAgent-<version>-portable-x64.exe`이며 설치 프로그램이 아니라 **portable 실행 파일**로 표시되는지 확인한다.
- Windows 파일 속성의 디지털 서명 탭에서 서명자, 타임스탬프, 체인 유효성을 확인한다.
- SmartScreen 평판과 새 Windows 사용자 계정에서 최초 실행을 확인한다.
- 최초 설정 화면에 연결키가 password 타입으로 표시되고 표시/숨김 토글 및 저장 후 DOM 삭제가 동작하는지 확인한다.
- 기존 `credentials.json`의 정상 마이그레이션과 불완전·알 수 없는 항목의 실행 차단/경로 안내를 각각 확인한다.
- 생성된 `SHA256SUMS.txt`를 별도 채널에서 대조하고 릴리스 노트에 portable/unsigned 여부를 명시한다. unsigned이면 배포하지 않는다.
- 공식 API 또는 서면 제휴 승인 전에는 SNS 자동 로그인·입력·업로드 모듈을 다시 포함하지 않는다.
