const fs = require('node:fs')
const path = require('node:path')

const outputDir = path.join(process.cwd(), 'dist-agent')
fs.rmSync(outputDir, { recursive: true, force: true })
fs.mkdirSync(outputDir, { recursive: true })
console.log('[agent-clean] dist-agent cleaned')
