function noGo(message) {
  console.error(`[agent-build] NO-GO: ${message}`)
  process.exit(1)
}

if (process.platform !== 'win32') noGo('Windows x64 릴리스 호스트가 필요합니다.')
if (!process.env.CSC_LINK && !process.env.WIN_CSC_LINK) noGo('Windows 코드서명 인증서가 없습니다.')
if (!process.env.CSC_KEY_PASSWORD && !process.env.WIN_CSC_KEY_PASSWORD) noGo('Windows 코드서명 인증서 암호가 없습니다.')
console.log('[agent-build] Windows 코드서명 전제조건 확인 완료')
