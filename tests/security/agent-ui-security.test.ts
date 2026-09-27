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
    const ready = await startUIServer({
        port: 0,
        appDataPath: root,
        token: TOKEN,
        maxBodyBytes: 256,
        onQuit: () => { quitCalls.push(Date.now()); },
    });
    const server = ready.server;
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    assert.equal(address.address, '127.0.0.1');

    try {
        await run(address.port, root, quitCalls);
    } finally {
        await ready.close();
        fs.rmSync(root, { recursive: true, force: true });
    }
}

async function bootstrapSession(port: number): Promise<string> {
    const response = await request(port, { path: `/?token=${TOKEN}`, method: 'GET' });
    assert.equal(response.status, 303);
    const cookie = response.headers['set-cookie']?.[0];
    assert.ok(cookie);
    return cookie.split(';', 1)[0];
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

test('bootstrap token is exchanged for a strict HttpOnly cookie and removed from the URL', async () => {
    await withServer(async port => {
        const bootstrap = await request(port, { path: `/?token=${TOKEN}`, method: 'GET' });
        assert.equal(bootstrap.status, 303);
        assert.equal(bootstrap.headers.location, '/');
        const cookie = bootstrap.headers['set-cookie']?.[0];
        assert.ok(cookie);
        assert.match(cookie, /HttpOnly/i);
        assert.match(cookie, /SameSite=Strict/i);
        assert.doesNotMatch(cookie, new RegExp(TOKEN));

        const cleanPage = await request(port, {
            path: '/',
            method: 'GET',
            headers: { cookie: cookie.split(';', 1)[0] },
        });
        assert.equal(cleanPage.status, 200);
        assert.doesNotMatch(cleanPage.body, new RegExp(TOKEN));

        const session = cookie.split(';', 1)[0];
        const missingOrigin = await request(port, {
            path: '/api/quit',
            method: 'POST',
            headers: { cookie: session },
        });
        assert.equal(missingOrigin.status, 403);

        const forgedHost = await request(port, {
            path: '/api/quit',
            method: 'POST',
            headers: { cookie: session, host: 'attacker.invalid', origin: `http://127.0.0.1:${port}` },
        });
        assert.equal(forgedHost.status, 403);
    });
});

test('local UI escapes reflected config, never reflects passwords, and authorizes requests with the session cookie', async () => {
    await withServer(async (port, root, quitCalls) => {
        const targetDir = path.join(root, 'RealEstateAIOS');
        fs.mkdirSync(targetDir, { recursive: true });
        fs.writeFileSync(path.join(targetDir, 'credentials.json'), JSON.stringify({
            naver: { id: '\"><script>alert(1)</script>', pw: 'do-not-reflect' },
        }));
        fs.writeFileSync(path.join(targetDir, 'config.json'), JSON.stringify({
            agent_key: '\"><img src=x onerror=alert(1)>',
        }));

        const cookie = await bootstrapSession(port);
        const page = await request(port, { path: '/', method: 'GET', headers: { cookie } });
        assert.equal(page.status, 200);
        assert.match(page.body, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
        assert.match(page.body, /&lt;img src=x onerror=alert\(1\)&gt;/);
        assert.doesNotMatch(page.body, /<script>alert\(1\)<\/script>/);
        assert.doesNotMatch(page.body, /do-not-reflect/);
        assert.equal(page.headers['access-control-allow-origin'], undefined);

        const quit = await request(port, {
            path: '/api/quit',
            method: 'POST',
            headers: { cookie, origin: `http://127.0.0.1:${port}` },
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
        const cookie = await bootstrapSession(port);

        const response = await request(port, {
            path: '/api/credentials',
            method: 'POST',
            headers: { 'content-type': 'application/json', cookie, origin: `http://127.0.0.1:${port}` },
        }, JSON.stringify({ naver: { id: 'updated-user', pw: '' } }));
        assert.equal(response.status, 200);

        const stored = JSON.parse(fs.readFileSync(path.join(targetDir, 'credentials.json'), 'utf8'));
        assert.equal(stored.naver.id, 'updated-user');
        assert.equal(stored.naver.pw, 'existing-secret');
    });
});

test('local UI rejects oversized bodies and writes private credential/config files', async () => {
    await withServer(async (port, root) => {
        const cookie = await bootstrapSession(port);
        const oversized = await request(port, {
            path: '/api/credentials',
            method: 'POST',
            headers: { 'content-type': 'application/json', cookie, origin: `http://127.0.0.1:${port}` },
        }, JSON.stringify({ padding: 'x'.repeat(300) }));
        assert.equal(oversized.status, 413);

        const payload = JSON.stringify({
            agent_key: 'agent-key',
            naver: { id: 'user', pw: 'secret' },
        });
        const saved = await request(port, {
            path: '/api/credentials',
            method: 'POST',
            headers: { 'content-type': 'application/json', cookie, origin: `http://127.0.0.1:${port}` },
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

test('UI server startup resolves only after listening and reports the actual loopback URL', async () => {
    const startup = startUIServer({ port: 0, token: TOKEN });
    assert.ok(startup instanceof Promise, 'startup must expose asynchronous readiness');
    const ready = await startup;
    assert.match(ready.url, /^http:\/\/127\.0\.0\.1:\d+\/\?token=/);
    assert.match(ready.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.equal(ready.server.listening, true);
    await ready.close();
});

test('UI server startup rejects when its configured port cannot be bound', async () => {
    const blocker = http.createServer();
    await new Promise<void>((resolve, reject) => {
        blocker.once('error', reject);
        blocker.listen(0, '127.0.0.1', resolve);
    });
    const address = blocker.address();
    assert.ok(address && typeof address === 'object');

    try {
        await assert.rejects(
            Promise.resolve(startUIServer({ port: address.port, token: TOKEN })),
            (error: NodeJS.ErrnoException) => error.code === 'EADDRINUSE',
        );
    } finally {
        await new Promise<void>((resolve, reject) => blocker.close(error => error ? reject(error) : resolve()));
    }
});
