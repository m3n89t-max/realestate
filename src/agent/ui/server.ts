import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { ensurePrivateDirectory, writePrivateJson } from '../secure-files';

const DEFAULT_PORT = 3005;
const LOOPBACK_HOST = '127.0.0.1';
const DEFAULT_MAX_BODY_BYTES = 32 * 1024;
const PROCESS_TOKEN = crypto.randomBytes(32).toString('hex');

interface UIServerOptions {
    port?: number;
    appDataPath?: string;
    token?: string;
    maxBodyBytes?: number;
    onQuit?: () => void;
}

function safeEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function htmlEscape(value: unknown): string {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
    });
    res.end(JSON.stringify(body));
}

function readJsonBody(req: http.IncomingMessage, maxBytes: number): Promise<unknown> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        let size = 0;
        let tooLarge = false;

        req.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > maxBytes) {
                tooLarge = true;
                chunks.length = 0;
                return;
            }
            if (!tooLarge) chunks.push(chunk);
        });
        req.on('end', () => {
            if (tooLarge) {
                const error = new Error('Request body too large') as NodeJS.ErrnoException;
                error.code = 'BODY_TOO_LARGE';
                reject(error);
                return;
            }
            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            } catch {
                reject(new SyntaxError('Invalid JSON body'));
            }
        });
        req.on('error', reject);
    });
}

function readJsonFile(filePath: string): Record<string, any> {
    if (!fs.existsSync(filePath)) return {};
    try {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function mergeCredentialUpdates(existing: Record<string, any>, updates: Record<string, any>): Record<string, any> {
    const merged = { ...existing };
    for (const platform of ['naver', 'google', 'instagram', 'kakao']) {
        const update = updates[platform];
        if (!update || typeof update !== 'object' || Array.isArray(update)) continue;

        const nonEmptyFields = Object.fromEntries(
            Object.entries(update).filter(([, value]) => typeof value === 'string' && value.length > 0),
        );
        if (Object.keys(nonEmptyFields).length > 0) {
            merged[platform] = { ...(existing[platform] ?? {}), ...nonEmptyFields };
        }
    }
    return merged;
}

function isAuthorizedHeader(req: http.IncomingMessage, token: string): boolean {
    const supplied = req.headers['x-agent-ui-token'];
    return typeof supplied === 'string' && safeEqual(supplied, token);
}

export function getUIAccessUrl(port = DEFAULT_PORT): string {
    return `http://${LOOPBACK_HOST}:${port}/?token=${PROCESS_TOKEN}`;
}

export function startUIServer(options: UIServerOptions = {}): http.Server {
    const port = options.port ?? DEFAULT_PORT;
    const appDataPath = options.appDataPath ?? process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
    const token = options.token ?? PROCESS_TOKEN;
    const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
    const onQuit = options.onQuit ?? (() => setTimeout(() => process.exit(0), 300));
    const targetDir = path.join(appDataPath, 'RealEstateAIOS');
    const credPath = path.join(targetDir, 'credentials.json');
    const configPath = path.join(targetDir, 'config.json');

    const server = http.createServer(async (req, res) => {
        const requestUrl = new URL(req.url ?? '/', `http://${LOOPBACK_HOST}`);
        const isPage = req.method === 'GET' && (requestUrl.pathname === '/' || requestUrl.pathname === '/index.html');

        if (isPage) {
            const suppliedToken = requestUrl.searchParams.get('token') ?? '';
            if (!safeEqual(suppliedToken, token)) {
                sendJson(res, 403, { success: false, error: 'Forbidden' });
                return;
            }

            const currentCreds = readJsonFile(credPath);
            const config = readJsonFile(configPath);
            res.writeHead(200, {
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'no-store',
                'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'",
                'Referrer-Policy': 'no-referrer',
                'X-Content-Type-Options': 'nosniff',
                'X-Frame-Options': 'DENY',
            });
            res.end(getHtmlContent(currentCreds, config.agent_key, token));
            return;
        }

        const isCredentialSave = req.method === 'POST' && requestUrl.pathname === '/api/credentials';
        const isQuit = req.method === 'POST' && requestUrl.pathname === '/api/quit';
        if (isCredentialSave || isQuit) {
            if (!isAuthorizedHeader(req, token)) {
                sendJson(res, 403, { success: false, error: 'Forbidden' });
                return;
            }

            if (isQuit) {
                sendJson(res, 200, { success: true });
                onQuit();
                return;
            }

            try {
                const data = await readJsonBody(req, maxBodyBytes) as Record<string, any>;
                ensurePrivateDirectory(targetDir);
                const existingCredentials = readJsonFile(credPath);
                writePrivateJson(credPath, mergeCredentialUpdates(existingCredentials, data));

                if (data.agent_key !== undefined) {
                    const config = readJsonFile(configPath);
                    config.agent_key = data.agent_key;
                    writePrivateJson(configPath, config);
                }
                sendJson(res, 200, { success: true });
            } catch (error) {
                const status = (error as NodeJS.ErrnoException).code === 'BODY_TOO_LARGE' ? 413
                    : error instanceof SyntaxError ? 400
                        : 500;
                sendJson(res, status, {
                    success: false,
                    error: status === 413 ? 'Request body too large'
                        : status === 400 ? 'Invalid JSON body'
                            : 'Unable to save local configuration',
                });
            }
            return;
        }

        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
    });

    server.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') {
            console.log(`[Agent UI] 포트 ${port}이 이미 사용 중입니다. UI 서버를 건너뜁니다.`);
        } else {
            console.error('[Agent UI] 서버 에러:', error.message);
        }
    });

    server.listen(port, LOOPBACK_HOST, () => {
        const address = server.address();
        const actualPort = address && typeof address === 'object' ? address.port : port;
        console.log(`[Agent UI] 로컬 환경설정 서버가 시작되었습니다: http://${LOOPBACK_HOST}:${actualPort}`);
    });
    return server;
}

function getHtmlContent(creds: Record<string, any>, agentKey: unknown, token: string): string {
    const naverOk = Boolean(creds.naver?.id && creds.naver?.pw);
    const googleOk = Boolean(creds.google?.email && creds.google?.pw);
    const instagramOk = Boolean(creds.instagram?.id && creds.instagram?.pw);
    const scriptToken = JSON.stringify(token).replaceAll('<', '\\u003c');

    return `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>부동산 AI OS - 에이전트 설정</title>
    <style>
        *{box-sizing:border-box}body{font-family:sans-serif;background:#f0f4f8;color:#1e293b;margin:0;padding:24px 16px}.wrap{max-width:580px;margin:auto}.header{background:#0284c7;color:white;padding:20px 24px;border-radius:16px 16px 0 0}.card{background:white;padding:24px;border-radius:0 0 16px 16px;box-shadow:0 4px 20px #0001}.notice{font-size:12px;color:#475569;background:#f8fafc;border-left:3px solid #0ea5e9;padding:10px 14px}.accounts{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:20px 0}.account{border:1px solid #e2e8f0;border-radius:10px;padding:12px;text-align:center}.connected{background:#f0fdf4;border-color:#86efac}.section{margin:20px 0}.row{display:grid;grid-template-columns:1fr 1fr;gap:10px}label{display:block;font-size:12px;font-weight:600;margin:5px 0}input{width:100%;padding:9px 12px;border:1px solid #cbd5e1;border-radius:8px}.btn{width:100%;padding:12px;border:0;border-radius:10px;font-weight:700;cursor:pointer}.save{background:#0284c7;color:white}.quit{margin-top:10px;background:#f1f5f9;color:#64748b}.toast{min-height:20px;font-size:13px;margin-top:10px}
    </style>
</head>
<body>
<div class="wrap">
    <div class="header"><strong>🏠 부동산 AI OS</strong> · 에이전트 실행 중</div>
    <div class="card">
        <p class="notice">아이디와 비밀번호는 이 PC에만 저장되며 SaaS 서버로 전송되지 않습니다.</p>
        <div class="accounts">
            <div class="account ${naverOk ? 'connected' : ''}">네이버<br>${naverOk ? '연결됨' : '미설정'}</div>
            <div class="account ${googleOk ? 'connected' : ''}">유튜브<br>${googleOk ? '연결됨' : '미설정'}</div>
            <div class="account ${instagramOk ? 'connected' : ''}">인스타<br>${instagramOk ? '연결됨' : '미설정'}</div>
        </div>
        <form id="credsForm">
            <div class="section"><strong>네이버 블로그</strong><div class="row"><div><label for="naver_id">아이디</label><input id="naver_id" value="${htmlEscape(creds.naver?.id)}" autocomplete="off"></div><div><label for="naver_pw">비밀번호</label><input type="password" id="naver_pw" value="" autocomplete="new-password"></div></div></div>
            <div class="section"><strong>유튜브 (구글 계정)</strong><div class="row"><div><label for="google_email">구글 이메일</label><input type="email" id="google_email" value="${htmlEscape(creds.google?.email)}" autocomplete="off"></div><div><label for="google_pw">비밀번호</label><input type="password" id="google_pw" value="" autocomplete="new-password"></div></div></div>
            <div class="section"><strong>인스타그램</strong><div class="row"><div><label for="instagram_id">아이디</label><input id="instagram_id" value="${htmlEscape(creds.instagram?.id)}" autocomplete="off"></div><div><label for="instagram_pw">비밀번호</label><input type="password" id="instagram_pw" value="" autocomplete="new-password"></div></div></div>
            <div class="section"><label for="agent_key">에이전트 연결키</label><input id="agent_key" value="${htmlEscape(agentKey)}" autocomplete="off"></div>
            <button type="submit" class="btn save">저장하기</button><button type="button" id="quit" class="btn quit">에이전트 종료</button>
            <div id="toast" class="toast" role="status"></div>
        </form>
    </div>
</div>
<script>
const accessToken=${scriptToken};
const toast=document.getElementById('toast');
const request=(url,body)=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Agent-UI-Token':accessToken},body:body===undefined?undefined:JSON.stringify(body)});
document.getElementById('quit').addEventListener('click',async()=>{if(confirm('에이전트를 종료하시겠습니까?')){await request('/api/quit');window.close();}});
document.getElementById('credsForm').addEventListener('submit',async event=>{event.preventDefault();const data={agent_key:document.getElementById('agent_key').value,naver:{id:document.getElementById('naver_id').value,pw:document.getElementById('naver_pw').value},google:{email:document.getElementById('google_email').value,pw:document.getElementById('google_pw').value},instagram:{id:document.getElementById('instagram_id').value,pw:document.getElementById('instagram_pw').value}};try{const response=await request('/api/credentials',data);const result=await response.json();toast.textContent=response.ok&&result.success?'저장되었습니다.':'저장하지 못했습니다.';}catch{toast.textContent='저장하지 못했습니다.';}});
</script>
</body>
</html>`;
}
