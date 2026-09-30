# supabase/migrations 운영 규칙 (반드시 먼저 읽어주세요)

이 폴더는 **운영 데이터베이스의 구조를 바꾸는 파일들**이 모여 있는 곳입니다.
여기서 실수하면 집포터 회원가입이 멈추거나 저장된 자료가 사라질 수 있습니다.
2026-09-30에 실제로 그 직전까지 갔던 일이 있어서, 아래 내용을 남깁니다.

---

## 1. 제일 중요한 규칙 3개

1. **`supabase db push` 를 그냥 실행하지 마세요.**
   먼저 아래 명령으로 "로컬 파일"과 "운영 DB 기록"이 맞는지 확인합니다.

   ```
   npx --yes supabase@2.118.0 migration list --linked
   ```

   결과에서 `local` 과 `remote` 양쪽에 같은 번호가 있어야 정상입니다.
   한쪽만 있는 줄이 보이면 **push 하지 말고 먼저 원인을 확인**해야 합니다.

2. **`supabase db reset` 은 절대 실행하지 마세요.** 운영 자료가 전부 지워집니다.

3. **이미 운영에 들어간 파일의 내용을 고치지 마세요.**
   고치면 "파일은 바뀌었는데 DB는 옛날 상태"가 되어 또 어긋납니다.
   바꿀 일이 생기면 **새 파일을 추가**하세요.

---

## 2. 왜 이 문서가 생겼나 (2026-09-30 사고 직전 상황)

### 어긋남의 정체

`supabase db push` 는 "운영 DB의 기록표(`supabase_migrations.schema_migrations`)에
없는 파일"을 찾아서 순서대로 실행합니다.

그런데 이 저장소에는 **파일은 있는데 기록표에는 없는 파일이 11개** 있었습니다.
대부분은 **이미 손으로 운영에 적용해 놓고 기록만 빼먹은 것**이었습니다.
그래서 `db push` 를 실행하면 "이미 되어 있는 일"을 다시 하려 들고,
그중 일부는 **지금 잘 돌고 있는 설정을 되돌려 버립니다.**

### 가장 위험했던 것: 029 가 회원가입을 끊는다

`029_security_queue_hardening.sql` 의 원본에는 이 두 줄이 있었습니다.

```sql
DROP TRIGGER IF EXISTS auth_autoconfirm_email_trigger ON auth.users;
DROP FUNCTION IF EXISTS public.auth_autoconfirm_email();
```

이 트리거는 **신규 회원의 이메일을 자동으로 "확인 완료" 처리**해 주는 장치입니다.
없으면 가입한 사람이 곧바로 로그인할 수 없습니다.

기록표를 보면 029 보다 **나중에** 들어간 마이그레이션 두 개가
이 트리거를 **일부러 다시 만들어 놨습니다.**

- `20260823222430_auth_autoconfirm_email_on_signup`
- `20260823223029_fix_signup_trigger_search_path`
  (이름 그대로 "회원가입 실패 근본 수정"이 목적이었습니다)

즉 **029는 그 결정보다 과거의 생각**입니다.
029를 지금 실행하면 최신 결정을 덮어써서 회원가입이 깨집니다.

### 두 번째 위험: 029 는 중간에 실패한다

원본 029의 138번째 줄이 `BEGIN;` 이었습니다.
함수 안쪽의 `BEGIN` 에는 세미콜론을 붙이면 안 되는데 붙어 있었습니다.

그래서 029를 실행하면 → **앞부분(트리거 삭제 포함)은 적용되고 뒷부분은 실패**합니다.
회원가입은 깨졌는데 보안 강화는 안 된, 가장 나쁜 중간 상태가 남습니다.

---

## 3. 이번에 무엇을 고쳤나

### (1) 029 에서 위험 구문을 걷어냈습니다

| 항목 | 처리 | 이유 |
|---|---|---|
| 인증 트리거 DROP 2줄 | **제거** (주석으로 이유 기록) | 후속 2건이 의도적으로 되살린 것이라 되돌리면 회원가입 중단 |
| `BEGIN;` 문법 오류 | `BEGIN` 으로 **수정** | 중간 실패 방지 |
| tasks 상태 변경 4줄 | **제거 → 별도 파일로 분리** | 보안 변경과 데이터 수정을 한 파일에 섞으면 원인 추적 불가 |

029는 이제 **같은 DB에 몇 번 실행해도 결과가 같습니다(멱등).**
정책은 `DROP POLICY IF EXISTS` 후 재생성, 확장은 `IF NOT EXISTS`,
함수는 `CREATE OR REPLACE`, 트리거는 `DROP IF EXISTS` 후 재생성 패턴입니다.

### (2) 기록표에만 있고 파일이 없던 3개를 복원했습니다

아래 3개는 **운영에는 들어갔는데 저장소에 파일이 없었습니다.**
이 상태로는 `db push` 가 "원격에 있는 버전을 로컬에서 못 찾겠다"며 아예 멈춥니다.
기록표에 저장된 SQL 원문을 그대로 파일로 되살렸습니다.

- `20260724235614_expand_projects_property_type_check.sql`
- `20260823222430_auth_autoconfirm_email_on_signup.sql`
- `20260823223029_fix_signup_trigger_search_path.sql`

### (3) 019 번호가 두 개 겹쳐 있던 문제

`019_add_transaction_type.sql` 과 `019_property_detail_fields.sql` 이
**같은 019 번호**를 쓰고 있었습니다. 기록표에 올라간 019는
`property_detail_fields` 쪽입니다(`name` 컬럼으로 확인).

Supabase는 번호(버전 문자열) 하나당 한 줄만 기록하므로, 겹친 상태로는
나머지 하나를 영원히 기록할 수 없습니다. 그래서
`019_add_transaction_type.sql` → **`0195_add_transaction_type.sql`** 로
이름만 바꿨습니다(`0085`, `0105` 가 이미 같은 방식으로 쓰이고 있습니다).

- 파일 내용은 건드리지 않았습니다.
- 실행 순서도 019 → 0195 → 020 으로 그대로입니다.
- 운영 DB 상태와도 어긋나지 않습니다. 이 파일이 넣으려던
  `transaction_type` 컬럼은 이미 존재하고, 제약도 나중의 023이
  `('sale','lease','rent')` 로 최종 확정해 놓았습니다.

### (4) 027 / 028 은 후속 3건으로 이미 대체되었습니다

- `027_expand_property_type_check.sql` → `20260724235614` 와 사실상 같은 내용
- `028_auth_autoconfirm_email.sql` → `20260823222430` / `20260823223029` 로 대체

운영 DB 실측 결과 027·028이 하려던 일은 **이미 최종 상태로 반영**돼 있습니다.
그래서 파일은 기록용으로 남겨두고, 기록표에는 "적용됨"으로만 표시합니다.

### (5) tasks 상태값이 코드와 어긋나 있는 현존 버그 (별도 파일)

`20260930130000_fix_tasks_status_queued.sql` 를 새로 추가했습니다.

- 운영 DB는 아직 `'pending'` 만 허용합니다.
- 그런데 앱 코드는 **전부 `'queued'`** 를 씁니다
  (`src/agent/worker.ts`, `src/lib/hooks/useTasks.ts`,
  `supabase/functions/normalize-parcel/index.ts` 등).
- 즉 지금 작업을 새로 만드는 경로가 운영에서 실패하고 있습니다.
  실제로 운영 tasks 164건 중 `'queued'` 는 0건입니다.

원래 `007_schema_fixes.sql` 이 담당했어야 하는 변경인데 반영되지 않았습니다.
이 파일은 **아직 운영에 적용하지 않았습니다.** 적용 여부는 담당자가 판단합니다.

---

## 4. 현재 상태 (2026-09-30 정리 완료 시점)

`migration list --linked` 결과, 아래 3건을 뺀 **모든 번호가 local/remote 양쪽에
맞춰졌습니다.** 남은 3건은 **일부러 남긴 것**입니다.

| 번호 | 상태 | 왜 남겨두었나 |
|---|---|---|
| `026` | 미적용 | 적용 여부를 담당자가 결정해야 함 (아래 5절) |
| `029` | 미적용 | 위험 구문을 걷어냈지만, 운영 적용은 담당자 승인 후 |
| `20260930130000` | 미적용 | tasks 상태 정정. 운영 데이터를 바꾸므로 승인 후 |

기록표에는 "적용됨"으로만 표시(`migration repair --status applied`)했고,
**운영 DB의 구조와 자료는 하나도 바꾸지 않았습니다.** 정리 후 실측 확인:

- `tasks_status_check` 제약: 그대로 (`'pending'` 포함)
- `tasks.status` 기본값: 그대로 `'pending'`
- `pending` 작업 2건: 그대로
- 회원가입 트리거 `auth_autoconfirm_email_trigger`: **살아 있음**
- 기록표 행 수: 31 → 40 (추가한 9건만 증가)

### 수정된 029 의 멱등성 판정 (구문별)

지금 운영 상태에서 실행해도 안전한지 한 줄씩 확인한 결과입니다.

| 구문 | 판정 | 근거 |
|---|---|---|
| `CREATE SCHEMA IF NOT EXISTS extensions` | 안전 | `IF NOT EXISTS`, 이미 존재 |
| `CREATE EXTENSION IF NOT EXISTS pgcrypto` | 안전 | 이미 `extensions` 스키마에 설치됨 |
| `memberships_update` 정책 DROP→CREATE | 안전 | 반복 가능. **단 동작이 바뀜** (아래 주의) |
| `memberships_delete` 정책 DROP→CREATE | 안전 | 현재 운영 정의와 동일 |
| 조직 불일치 작업 격리 UPDATE | 안전(무동작) | 해당 행 0건으로 실측 확인 |
| `enforce_task_project_org()` 함수 + 트리거 | 안전 | `CREATE OR REPLACE` / `DROP IF EXISTS` |
| `tasks_insert` / `tasks_update` 정책 | 안전 | DROP IF EXISTS 후 재생성. `can_write_to_org` 존재 확인 |
| 개발용 에이전트 키 폐기 UPDATE | 안전(무동작) | `agent_connections` 0건 |
| `trg_on_location_analyze_task()` | 생성은 안전, **실행하면 실패** | 아래 주의 참고 |
| `generate_agent_key()` | 안전 | `BEGIN;` 수정 후 문법 정상 |
| `ALTER FUNCTION ... SET search_path` 4건 | 안전 | 대상 4개 함수 모두 존재 확인 |

**주의 — `memberships_update` 는 동작이 실제로 바뀝니다.**
현재 운영 정책은 `is_org_admin(org_id) OR user_id = auth.uid()` 여서
**일반 멤버가 자기 역할을 스스로 바꿀 수 있습니다.** 029는 이것을 관리자만
가능하게 좁힙니다(권한 상승 차단이 이 마이그레이션의 목적). 역할 변경 화면은
`src/app/(dashboard)/admin/members/page.tsx:90` 한 곳이고 관리자용이므로
정상 사용에는 영향이 없을 것으로 보이지만, **적용 후 역할 변경 기능을 한 번
확인해 보세요.**

**주의 — `trg_on_location_analyze_task()` 는 만들어도 실제로는 못 돕니다.**
이 함수 본문이 `extensions.http_post` 를 부르는데, 운영에는 `http` 확장이
설치되어 있지 않습니다(6절 참고). PostgreSQL은 함수를 만들 때 본문 안의 이름을
검사하지 않으므로 **생성 자체는 성공**하고, 029 적용이 중간에 깨지지는 않습니다.
다만 이 함수를 호출하는 트리거가 운영에 없어서 실행되지도 않습니다.
즉 "적용해도 지금과 달라지는 것이 없는" 구문입니다.

---

## 5. 아직 남은 항목: 026 (canva_template_sets)

- 운영 DB에 `canva_template_sets` 테이블이 **없습니다.**
- 그런데 코드는 이 테이블을 조회합니다:
  `src/app/api/canva/templates/route.ts:11`
- 다만 오류가 나면 `{ templates: [] }` 를 돌려주도록 되어 있어서
  화면이 죽지는 않고, **템플릿 목록이 항상 비어 보입니다.**

즉 카드뉴스 템플릿 갤러리 기능은 **현재 운영에서 동작하지 않는 상태**입니다.
이건 마이그레이션 정리 문제가 아니라 **별도의 기능 결함**입니다.
026을 적용할지는 담당자가 결정해야 하므로 여기서는 손대지 않았습니다.

`026` 은 전체가 `CREATE TABLE IF NOT EXISTS` + `CREATE POLICY` 로 되어 있어
지금 운영에 적용해도 다른 것을 망가뜨리지 않습니다. 다만 테이블만 만들어도
내용(템플릿 ID)이 비어 있으면 화면은 그대로 빈 목록입니다.

---

## 6. 곁들여 발견한 별개 문제: 입지분석 자동호출이 꺼져 있음

정리 중 확인된 사실입니다. 이번 작업 범위는 아니지만 기록해 둡니다.

- `010_location_analyze_webhook.sql` 은 기록표에 "적용됨"으로 있지만,
  실제 운영에는 **반영되지 않았습니다.**
- 실측: `http` 확장 없음, `extensions.http_post` 함수 없음,
  `public.trg_on_location_analyze_task` 함수 없음,
  `tasks` 테이블에 트리거 0건.
- 즉 작업이 들어오면 자동으로 입지분석 함수를 호출하는 경로가 없습니다.

007 과 010 처럼 **"기록표에는 적용됨인데 실제로는 안 된" 항목이 더 있습니다.**
기록표만 믿지 말고, 중요한 기능은 실제 DB를 조회해 확인하세요.

---

## 7. 앞으로 새 마이그레이션을 만들 때

1. 파일 이름은 **`YYYYMMDDHHMMSS_설명.sql`** 형태로 만드세요.
   (예: `20261001093000_add_something.sql`)
   옛날식 `034_...` 번호 방식은 **더 쓰지 마세요.** 번호가 겹칩니다.

2. 되도록 **여러 번 실행해도 안전하게** 쓰세요.
   - 컬럼 추가: `ADD COLUMN IF NOT EXISTS`
   - 제약: `DROP CONSTRAINT IF EXISTS` 다음에 `ADD CONSTRAINT`
   - 정책: `DROP POLICY IF EXISTS` 다음에 `CREATE POLICY`
   - 함수: `CREATE OR REPLACE FUNCTION`

3. **DROP 으로 뭔가를 없애는 구문을 쓸 때는 특히 조심하세요.**
   "지금 운영에서 잘 쓰이고 있는 것"을 없애는 것은 아닌지 꼭 확인하세요.
   029 사고가 정확히 그 경우였습니다.

4. 한 파일에 **스키마 변경과 데이터 UPDATE 를 섞지 마세요.**
   중간에 실패하면 어디까지 됐는지 알 수 없습니다.

5. 적용 후에는 `migration list --linked` 로
   **local 과 remote 양쪽에 번호가 생겼는지** 확인하세요.

6. push 전에 아래 검사를 돌리세요. 위 사고 유형을 자동으로 잡아냅니다.

   ```
   npm run check:migrations
   ```

   버전 번호 중복, 파일명 형식 오류, 되살리지 않는 인증 트리거 DROP,
   `BEGIN;` 문법 오류를 찾아냅니다. 문제가 있으면 실패(exit 1)합니다.
