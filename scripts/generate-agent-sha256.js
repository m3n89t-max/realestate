const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const distDir = path.join(process.cwd(), 'dist')
if (!fs.existsSync(distDir)) throw new Error('dist 디렉터리가 없습니다.')
const artifacts = fs.readdirSync(distDir).filter(name => name.toLowerCase().endsWith('.exe')).sort()
if (artifacts.length === 0) throw new Error('SHA256 manifest를 만들 EXE가 없습니다.')
const lines = artifacts.map(name => {
  const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(distDir, name))).digest('hex')
  return `${hash}  ${name}`
})
fs.writeFileSync(path.join(distDir, 'SHA256SUMS.txt'), `${lines.join('\n')}\n`, 'utf8')
console.log(`[agent-sha256] ${artifacts.length}개 artifact manifest 생성 완료`)
