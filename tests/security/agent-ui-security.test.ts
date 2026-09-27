import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { startUIServer } from '../../src/agent/ui/server';

const TOKEN = 'a'.repeat(64);

function request(port: number, options: http.RequestOptions, body?: string): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
    return new Promise((resolve, reject) => {
        const req = http.request({ hostname: '127.0.0.1', port, ...options }, response => {
            let responseBody = '';
            response.setEncoding('utf8');
            response.on('data', chunk => { responseBody += chunk; });
            response.on('end', () => resolve({
                status: response.statusCode ?? 0,
                headers: response.headers,
                body: responseBody,
            }));
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

async function withServer(run: (port: number, root: string, quitCalls: number[]) => Promise<void>) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-ui-'));
    const quitCalls: number[] = [];
    const server = startUIServer({
        port: 0,
        appDataPath: root,
        token: TOKEN,
        maxBodyBytes: 256,
        onQuit: () => { quitCalls.push(Date.now()); },
    });
    await new Promise<void>(resolve => server.once('listening', resolve));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    assert.equal(address.address, '127.0.0.1');

    try {
        await run(address.port, root, quitCalls);
    } finally {
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        fs.rmSync(root, { recursive: true, force: true });
    }
}

test('local UI requires its per-process token for page and state-changing access and sends no permissive CORS', async () => {
    await withServer(async (port, root, quitCalls) => {
        const deniedPage = await request(port, { path: '/', method: 'GET' });
        assert.equal(deniedPage.status, 403);
        assert.equal(deniedPage.headers['access-control-allow-origin'], undefined);

        const deniedSave = await request(port, {
            path: '/api/credentials',
            method: 'POST',
            headers: { 'content-type': 'application/json' },
        }, JSON.stringify({ naver: { id: 'user', pw: 'secret' } }));
        assert.equal(deniedSave.status, 403);
        assert.equal(fs.existsSync(path.join(root, 'RealEstateAIOS', 'credentials.json')), false);

        const deniedQuit = await request(port, { path: '/api/quit', method: 'POST' });
        assert.equal(deniedQuit.status, 403);
        assert.equal(quitCalls.length, 0);
    });
});

test('local UI escapes reflected config, never reflects passwords, and authorizes requests with the token', async () => {
    await withServer(async (port, root, quitCalls) => {
        const targetDir = path.join(root, 'RealEstateAIOS');
        fs.mkdirSync(targetDir, { recursive: true });
        fs.writeFileSync(path.join(targetDir, 'credentials.json'), JSON.stringify({
            naver: { id: '\"><script>alert(1)</script>', pw: 'do-not-reflect' },
        }));
        fs.writeFileSync(path.join(targetDir, 'config.json'), JSON.stringify({
            agent_key: '\"><img src=x onerror=alert(1)>',
        }));

        const page = await request(port, { path: `/?token=${TOKEN}`, method: 'GET' });
        assert.equal(page.status, 200);
        assert.match(page.body, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
        assert.match(page.body, /&lt;img src=x onerror=alert\(1\)&gt;/);
        assert.doesNotMatch(page.body, /<script>alert\(1\)<\/script>/);
        assert.doesNotMatch(page.body, /do-not-reflect/);
        assert.equal(page.headers['access-control-allow-origin'], undefined);

        const quit = await request(port, {
            path: '/api/quit',
            method: 'POST',
            headers: { 'x-agent-ui-token': TOKEN },
        });
        assert.equal(quit.status, 200);
        assert.equal(quitCalls.length, 1);
    });
});

test('local UI preserves stored secrets when password fields are left blank', async () => {
    await withServer(async (port, root) => {
        const targetDir = path.join(root, 'RealEstateAIOS');
        fs.mkdirSync(targetDir, { recursive: true });
        fs.writeFileSync(path.join(targetDir, 'credentials.json'), JSON.stringify({
            naver: { id: 'original-user', pw: 'existing-secret' },
        }));

        const response = await request(port, {
            path: '/api/credentials',
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-agent-ui-token': TOKEN },
        }, JSON.stringify({ naver: { id: 'updated-user', pw: '' } }));
        assert.equal(response.status, 200);

        const stored = JSON.parse(fs.readFileSync(path.join(targetDir, 'credentials.json'), 'utf8'));
        assert.equal(stored.naver.id, 'updated-user');
        assert.equal(stored.naver.pw, 'existing-secret');
    });
});

test('local UI rejects oversized bodies and writes private credential/config files', async () => {
    await withServer(async (port, root) => {
        const oversized = await request(port, {
            path: '/api/credentials',
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-agent-ui-token': TOKEN },
        }, JSON.stringify({ padding: 'x'.repeat(300) }));
        assert.equal(oversized.status, 413);

        const payload = JSON.stringify({
            agent_key: 'agent-key',
            naver: { id: 'user', pw: 'secret' },
        });
        const saved = await request(port, {
            path: '/api/credentials',
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-agent-ui-token': TOKEN },
        }, payload);
        assert.equal(saved.status, 200);

        const targetDir = path.join(root, 'RealEstateAIOS');
        for (const filename of ['credentials.json', 'config.json']) {
            const mode = fs.statSync(path.join(targetDir, filename)).mode & 0o777;
            if (process.platform !== 'win32') assert.equal(mode, 0o600);
        }
        if (process.platform !== 'win32') {
            assert.equal(fs.statSync(targetDir).mode & 0o777, 0o700);
        }
    });
});
