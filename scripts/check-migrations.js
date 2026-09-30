#!/usr/bin/env node
/*
 * 마이그레이션 파일 사전 점검 (네트워크 불필요, 로컬 파일만 검사)
 *
 * 사용법:  node scripts/check-migrations.js
 *
 * `supabase db push` 전에 실행하세요. 아래 3가지를 잡아냅니다.
 *   1) 같은 버전 번호를 쓰는 파일이 둘 이상 있는 경우
 *      → Supabase는 번호 하나당 한 줄만 기록하므로 나머지는 영원히 기록되지 않습니다.
 *        (2026-09-30에 019 번호가 겹쳐 있어 실제로 문제가 됐습니다)
 *   2) 파일 이름 형식이 `버전_설명.sql` 이 아닌 경우
 *   3) 운영에서 살아 있는 인증 트리거를 DROP 한 뒤 다시 만들지 않는 구문
 *      → 삭제되면 회원가입 이메일 자동확인이 사라져 신규 가입자가 로그인할 수 없습니다.
 *      (같은 파일에서 곧바로 CREATE 로 다시 만드는 "교체" 패턴은 정상이므로 넘어갑니다)
 *
 * 이 스크립트는 운영 DB에 접속하지 않습니다. 기록표와의 대조는 다음 명령으로 따로 하세요.
 *   npx --yes supabase@2.118.0 migration list --linked
 */

const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');

// 이 이름들을 DROP 하면 운영 회원가입이 깨집니다.
const PROTECTED_DROPS = [
  'auth_autoconfirm_email_trigger',
  'auth_autoconfirm_email',
  'trigger_create_user_profile',
  'on_auth_user_created',
];

const problems = [];
const warnings = [];

const files = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort();

if (files.length === 0) {
  console.error('마이그레이션 파일을 찾지 못했습니다: ' + MIGRATIONS_DIR);
  process.exit(1);
}

// --- 1) 버전 중복 검사 -------------------------------------------------
const byVersion = new Map();
for (const file of files) {
  const m = /^([0-9]+)_(.*)\.sql$/u.exec(file);
  if (!m) {
    problems.push(
      `[이름형식] ${file} — '버전숫자_설명.sql' 형태가 아닙니다. Supabase가 무시하거나 오류를 냅니다.`
    );
    continue;
  }
  const version = m[1];
  if (!byVersion.has(version)) byVersion.set(version, []);
  byVersion.get(version).push(file);
}

for (const [version, group] of byVersion) {
  if (group.length > 1) {
    problems.push(
      `[버전중복] 버전 '${version}' 을 ${group.length}개 파일이 함께 씁니다: ${group.join(', ')}\n` +
        `           → 하나만 기록표에 올라가고 나머지는 영구 미기록 상태가 됩니다.\n` +
        `           → 한쪽 파일명 앞부분을 다른 번호로 바꾸세요 (예: 019 → 0195).`
    );
  }
}

// --- 2) 되살리지 않는 위험한 DROP 검사 --------------------------------
// DROP 뒤에 같은 이름을 CREATE 로 다시 만들면 "교체"이므로 안전합니다.
// 다시 만들지 않으면 그 객체가 영구히 사라지므로 문제로 봅니다.
for (const file of files) {
  const text = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
  const lines = text.split('\n');

  lines.forEach((line, idx) => {
    const code = line.trim();
    // 주석 줄은 건너뜁니다 (029는 이유를 주석으로 남겨두었습니다).
    if (code.startsWith('--') || code === '') return;
    const dropMatch = /\bDROP\s+(TRIGGER|FUNCTION)\b/iu.exec(code);
    if (!dropMatch) return;
    const kind = dropMatch[1].toUpperCase();

    for (const name of PROTECTED_DROPS) {
      // 이름이 정확히 한 토큰으로 등장하는지 확인 (부분 일치로 중복 보고되는 것을 막음)
      const nameRe = new RegExp(`(^|[^A-Za-z0-9_])${name}([^A-Za-z0-9_]|$)`, 'u');
      if (!nameRe.test(code)) continue;

      // 같은 파일 어딘가에서 같은 종류로 다시 만들면 "교체"이므로 안전하다고 본다.
      const recreateRe = new RegExp(
        `CREATE\\s+(OR\\s+REPLACE\\s+)?${kind}[\\s\\S]{0,200}?(^|[^A-Za-z0-9_])${name}([^A-Za-z0-9_]|$)`,
        'iu'
      );
      if (recreateRe.test(text)) continue;

      problems.push(
        `[위험한DROP] ${file}:${idx + 1} — '${name}' 을 삭제하고 다시 만들지 않습니다.\n` +
          `             ${code}\n` +
          `             → 이 트리거/함수는 운영 회원가입에 쓰입니다. 삭제하면 신규 가입자가\n` +
          `               로그인할 수 없습니다. 정말 필요하면 supabase/migrations/README.md 를\n` +
          `               읽고 담당자 확인을 받으세요.`
      );
    }
  });

  // --- 3) plpgsql 블록의 'BEGIN;' 문법 오류 ---------------------------
  lines.forEach((line, idx) => {
    if (/^\s*BEGIN\s*;\s*$/u.test(line) && /\$\$/u.test(text)) {
      warnings.push(
        `[문법의심] ${file}:${idx + 1} — 'BEGIN;' (세미콜론 붙음).\n` +
          `           함수 본문 안의 BEGIN 이라면 문법 오류로 그 구문부터 실패합니다.\n` +
          `           트랜잭션 시작용이 맞다면 무시하세요.`
      );
    }
  });
}

// --- 결과 출력 ---------------------------------------------------------
console.log(`마이그레이션 파일 ${files.length}개를 검사했습니다.\n`);

if (warnings.length > 0) {
  console.log('── 확인 권장 ──');
  warnings.forEach((w) => console.log(w + '\n'));
}

if (problems.length > 0) {
  console.log('── 문제 발견 ──');
  problems.forEach((p) => console.log(p + '\n'));
  console.log(
    `문제 ${problems.length}건. 해결 전에는 'supabase db push' 를 실행하지 마세요.`
  );
  process.exit(1);
}

console.log('로컬 파일 검사 통과.');
console.log(
  "다음으로 운영 기록표와 대조하세요:\n  npx --yes supabase@2.118.0 migration list --linked"
);
process.exit(0);
