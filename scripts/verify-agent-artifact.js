const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const forbidden = [
  'naver_upload',
  'youtube_upload',
  'instagram_upload',
  '봇 탐지 우회',
  '자동 로그인',
]

function filesUnder(root) {
  if (!fs.existsSync(root)) return []
  const result = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) result.push(...filesUnder(full))
    else result.push(full)
  }
  return result
}

function scan(root, label) {
  for (const file of filesUnder(root)) {
    const content = fs.readFileSync(file).toString('utf8')
    for (const term of forbidden) {
      if (content.includes(term)) throw new Error(`[artifact-check] ${label}에 금지 문자열이 포함됨: ${term} (${file})`)
    }
  }
}

const distAgent = path.join(process.cwd(), 'dist-agent')
scan(distAgent, 'dist-agent')

const asarPaths = filesUnder(path.join(process.cwd(), 'dist')).filter(file => file.endsWith('app.asar'))
for (const appAsar of asarPaths) {
  const extractDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jipporter-asar-'))
  try {
    require('@electron/asar').extractAll(appAsar, extractDir)
    scan(extractDir, 'app.asar')
  } finally {
    fs.rmSync(extractDir, { recursive: true, force: true })
  }
}
console.log(`[artifact-check] dist-agent 검사 완료, app.asar ${asarPaths.length}개 검사 완료`)
