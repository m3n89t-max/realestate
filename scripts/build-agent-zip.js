#!/usr/bin/env node
/**
 * 부동산 AI OS - 로컬 에이전트 ZIP 패키지 빌더
 * electron-builder 없이 배포용 ZIP을 생성합니다.
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const { promisify } = require('util')

const ROOT = path.join(__dirname, '..')
const OUT_DIR = path.join(ROOT, 'release-agent')
const ZIP_NAME = 'realestate-agent-setup.zip'

function log(msg) { console.log(`  • ${msg}`) }
function err(msg) { console.error(`  ✗ ${msg}`); process.exit(1) }

async function main() {
  console.log('\n================================================')
  console.log('  부동산 AI OS - 에이전트 배포 패키지 빌드')
  console.log('================================================\n')

  // 1. TypeScript 컴파일
  log('TypeScript 컴파일 중...')
  try {
    execSync('npx tsc -p tsconfig.agent.json', { cwd: ROOT, stdio: 'inherit' })
  } catch {
    err('TypeScript 컴파일 실패')
  }

  // 2. 출력 폴더 초기화
  log(`출력 폴더 생성: ${OUT_DIR}`)
  if (fs.existsSync(OUT_DIR)) fs.rmSync(OUT_DIR, { recursive: true })
  fs.mkdirSync(OUT_DIR, { recursive: true })

  // 3. dist-agent 복사
  log('dist-agent 복사 중...')
  copyDir(path.join(ROOT, 'dist-agent'), path.join(OUT_DIR, 'dist-agent'))

  // 4. scripts 복사
  log('scripts 복사 중...')
  copyDir(path.join(ROOT, 'scripts'), path.join(OUT_DIR, 'scripts'))

  // 5. 에이전트 전용 package.json 생성
  log('배포용 package.json 생성 중...')
  const agentPkg = {
    name: 'realestate-agent',
    version: '1.0.0',
    description: '부동산 AI OS 로컬 자동화 에이전트',
    main: 'dist-agent/worker.js',
    scripts: {
      start: 'node dist-agent/worker.js'
    },
    dependencies: {
      '@supabase/supabase-js': '^2.45.0',
      'playwright': '^1.45.0',
      'dotenv': '^17.3.1'
    },
    engines: { node: '>=20.0.0' }
  }
  fs.writeFileSync(
    path.join(OUT_DIR, 'package.json'),
    JSON.stringify(agentPkg, null, 2)
  )

  // 6. .env.template 생성
  log('.env.template 생성 중...')
  const envTemplate = [
    '# 부동산 AI OS 에이전트 환경변수',
    '# 이 파일을 .env 로 복사하고 값을 입력하세요',
    '',
    'NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key',
    'AGENT_KEY=your-agent-key',
  ].join('\n')
  fs.writeFileSync(path.join(OUT_DIR, '.env.template'), envTemplate)

  // 7. ZIP 생성 (PowerShell Compress-Archive 사용)
  log(`ZIP 생성 중: ${ZIP_NAME}`)
  const zipPath = path.join(ROOT, ZIP_NAME)
  if (fs.existsSync(zipPath)) fs.rmSync(zipPath)
  try {
    execSync(
      `powershell -Command "Compress-Archive -Path '${OUT_DIR}\\*' -DestinationPath '${zipPath}' -Force"`,
      { stdio: 'inherit' }
    )
  } catch {
    log('PowerShell ZIP 실패 — release-agent 폴더를 직접 압축하세요')
  }

  console.log('\n================================================')
  console.log(`  완료!`)
  console.log(`  배포 파일: ${ZIP_NAME}`)
  console.log(`  또는 폴더: release-agent\\`)
  console.log('================================================\n')
  console.log('  배포 방법:')
  console.log('  1. realestate-agent-setup.zip 을 고객에게 전달')
  console.log('  2. 고객은 압축 해제 후 scripts\\setup-local-agent.bat 실행\n')
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) })
