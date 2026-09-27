import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const packageJson = JSON.parse(
  await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
)

test('runtime and lint packages stay on the same patched Next release', () => {
  assert.equal(packageJson.dependencies.next, '16.3.6')
  assert.equal(packageJson.devDependencies['eslint-config-next'], '16.3.6')
})

test('declared Node engine satisfies the installed Next minimum', () => {
  assert.equal(packageJson.engines.node, '>=20.9.0')
})
