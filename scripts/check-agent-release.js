const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

function noGo(message) {
  console.error(`[agent-release] NO-GO: ${message}`)
  process.exit(1)
}

if (!process.env.CSC_LINK && !process.env.WIN_CSC_LINK) {
  noGo('Windows 코드서명 인증서(CSC_LINK 또는 WIN_CSC_LINK)가 없습니다.')
}
if (!process.env.CSC_KEY_PASSWORD && !process.env.WIN_CSC_KEY_PASSWORD) {
  noGo('Windows 코드서명 인증서 암호가 없습니다.')
}

const distDir = path.join(process.cwd(), 'dist')
const executables = fs.existsSync(distDir)
  ? fs.readdirSync(distDir).filter(name => /-\d+\.\d+\.\d+-portable-x64\.exe$/i.test(name))
  : []
if (executables.length !== 1) noGo('version/portable/x64 형식의 EXE가 정확히 1개 있어야 합니다.')

if (process.platform !== 'win32') {
  noGo('Authenticode 서명 검증은 Windows 릴리스 호스트에서 실행해야 합니다.')
}
const artifact = path.join(distDir, executables[0])
const escaped = artifact.replace(/'/g, "''")
const check = spawnSync('powershell.exe', ['-NoProfile', '-Command', `(Get-AuthenticodeSignature -LiteralPath '${escaped}').Status`], { encoding: 'utf8' })
if (check.status !== 0 || check.stdout.trim() !== 'Valid') noGo('Authenticode 서명이 Valid 상태가 아닙니다.')
console.log(`[agent-release] GO: Authenticode Valid (${executables[0]})`)
