import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const formPath = path.resolve('src/app/(dashboard)/settings/credentials/CredentialForm.tsx');

test('web credential settings never collect or submit SaaS passwords and direct users to the local agent', () => {
    const source = fs.readFileSync(formPath, 'utf8');

    assert.doesNotMatch(source, /type=["']password["']/);
    assert.doesNotMatch(source, /fetch\(['"]\/api\/agent\/credentials/);
    assert.doesNotMatch(source, /pwValue|handleSave|handleDelete/);
    assert.match(source, /로컬 에이전트/);
    assert.match(source, /http:\/\/127\.0\.0\.1:3005/);
});
