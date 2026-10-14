const fs = require('node:fs')
const path = require('node:path')

const sourceDir = path.join(process.cwd(), 'src', 'agent')
const outputDir = path.join(process.cwd(), 'dist-agent')
fs.mkdirSync(outputDir, { recursive: true })
for (const name of ['setup.html', 'setup.css', 'setup.js']) {
  fs.copyFileSync(path.join(sourceDir, name), path.join(outputDir, name))
}
console.log('[agent-stage] setup assets copied')
