import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { DELETE, GET, POST } from '../../src/app/api/agent/credentials/route';

const disabledMessage = 'Credentials are configured only in the local agent.';

test('SaaS credential route fails closed without touching the filesystem', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'credentials-route-'));
    const originalAppData = process.env.APPDATA;
    process.env.APPDATA = tempRoot;

    try {
        const responses = await Promise.all([
            GET(),
            POST(new Request('http://localhost/api/agent/credentials', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ platform: 'naver', id: 'user', pw: 'secret' }),
            }) as never),
            DELETE(new Request('http://localhost/api/agent/credentials', {
                method: 'DELETE',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ platform: 'naver' }),
            }) as never),
        ]);

        for (const response of responses) {
            assert.equal(response.status, 410);
            assert.deepEqual(await response.json(), {
                error: disabledMessage,
                code: 'LOCAL_AGENT_CONFIGURATION_REQUIRED',
            });
        }
        assert.equal(fs.existsSync(path.join(tempRoot, 'RealEstateAIOS')), false);
    } finally {
        if (originalAppData === undefined) delete process.env.APPDATA;
        else process.env.APPDATA = originalAppData;
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});
