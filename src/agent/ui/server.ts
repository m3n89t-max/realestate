import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';

const PORT = 3005;

// Helper to ensure directory exists
function ensureDirSync(dirPath: string) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

export function startUIServer() {
    const server = http.createServer((req, res) => {
        // CORS config
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
            const appDataPath = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
            const credPath = path.join(appDataPath, 'RealEstateAIOS', 'credentials.json');
            const configPath = path.join(appDataPath, 'RealEstateAIOS', 'config.json');

            let currentCreds: Record<string, any> = {};
            if (fs.existsSync(credPath)) {
                try {
                    currentCreds = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
                } catch { }
            }

            let agentKey = '';
            if (fs.existsSync(configPath)) {
                try {
                    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                    agentKey = cfg.agent_key || '';
                } catch { }
            }

            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(getHtmlContent(currentCreds, agentKey));
            return;
        }

        if (req.method === 'POST' && req.url === '/api/credentials') {
            let body = '';
            req.on('data', chunk => body += chunk.toString());
            req.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    const appDataPath = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
                    const targetDir = path.join(appDataPath, 'RealEstateAIOS');

                    ensureDirSync(targetDir);

                    // 1. Save credentials
                    const credsData = {
                        naver: data.naver,
                        google: data.google,
                        instagram: data.instagram,
                        kakao: data.kakao,
                    };
                    fs.writeFileSync(path.join(targetDir, 'credentials.json'), JSON.stringify(credsData, null, 2));

                    // 2. Update agent_key in config.json
                    if (data.agent_key !== undefined) {
                        const configPath = path.join(targetDir, 'config.json');
                        if (fs.existsSync(configPath)) {
                            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                            config.agent_key = data.agent_key;
                            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
                        }
                    }

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true }));
                } catch (err: any) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: err.message }));
                }
            });
            return;
        }

        if (req.method === 'POST' && req.url === '/api/quit') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
            setTimeout(() => process.exit(0), 300);
            return;
        }

        res.writeHead(404);
        res.end('Not Found');
    });

    server.listen(PORT, () => {
        console.log(`[Agent UI] 로컬 환경설정 서버가 시작되었습니다: http://localhost:${PORT}`);
    });
}

function getHtmlContent(creds: Record<string, any>, agentKey: string) {
    return `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>부동산 AI OS - 로컬 에이전트 설정</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; background: #f3f4f6; padding: 2rem; color: #111827; }
        .container { max-width: 600px; margin: 0 auto; background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
        h1 { font-size: 1.5rem; margin-bottom: 1.5rem; color: #1f2937; }
        .form-group { margin-bottom: 1.25rem; }
        label { display: block; font-weight: 600; font-size: 0.875rem; color: #374151; margin-bottom: 0.5rem; }
        .input-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
        input { w-full; padding: 0.5rem 0.75rem; border: 1px solid #d1d5db; border-radius: 6px; font-size: 0.875rem; width: 100%; box-sizing: border-box; }
        button { background: #2563eb; color: white; padding: 0.75rem 1.5rem; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; width: 100%; font-size: 1rem; margin-top: 1rem; transition: background 0.2s; }
        button:hover { background: #1d4ed8; }
        .btn-quit { background: #ef4444; margin-top: 0.75rem; }
        .btn-quit:hover { background: #dc2626; }
        .platform-title { font-size: 1rem; font-weight: 600; margin-bottom: 0.5rem; margin-top: 1.5rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.25rem; display:flex; align-items:center; gap: 8px;}
        .hint { font-size: 0.75rem; color: #6b7280; margin-top: 0.25rem; }
        .status-bar { display: flex; align-items: center; gap: 8px; font-size: 0.8rem; color: #6b7280; margin-bottom: 1.5rem; padding: 0.5rem 0.75rem; background: #f0fdf4; border-radius: 6px; border: 1px solid #bbf7d0; }
        .status-dot { width: 8px; height: 8px; background: #22c55e; border-radius: 50%; flex-shrink: 0; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🤖 로컬 자동화 계정 설정</h1>
        <div class="status-bar">
            <span class="status-dot"></span>
            에이전트 실행 중 — 작업 대기 중
        </div>
        <p style="font-size: 0.875rem; color: #4b5563; margin-bottom: 2rem;">
            이 정보는 현재 PC에만 저장되며 외부 서버로 전송되지 않습니다.
        </p>

        <form id="credsForm">
            <div class="platform-title">🔑 시스템 설정</div>
            <div class="form-group mb-4">
                <label>에이전트 연결키 (Agent Key)</label>
                <input type="text" id="agent_key" value="${agentKey}" placeholder="웹 관리자에서 발급받은 연결키">
                <p class="hint">웹사이트의 [설정] &gt; [로컬 에이전트] 메뉴에서 키를 발급받으세요.</p>
            </div>

            <div class="platform-title">🟢 네이버 (블로그 업로드 용)</div>
            <div class="input-row">
                <div>
                    <label>아이디</label>
                    <input type="text" id="naver_id" value="${creds.naver?.id || ''}" placeholder="네이버 아이디">
                </div>
                <div>
                    <label>비밀번호</label>
                    <input type="password" id="naver_pw" value="${creds.naver?.pw || ''}" placeholder="비밀번호">
                </div>
            </div>

            <div class="platform-title">▶️ 유튜브 (비디오 업로드 용)</div>
            <div class="input-row">
                <div>
                    <label>구글 이메일</label>
                    <input type="email" id="google_email" value="${creds.google?.email || ''}" placeholder="구글 이메일">
                </div>
                <div>
                    <label>비밀번호</label>
                    <input type="password" id="google_pw" value="${creds.google?.pw || ''}" placeholder="비밀번호">
                </div>
            </div>

            <div class="platform-title">📸 인스타그램 (카드뉴스 용)</div>
            <div class="input-row">
                <div>
                    <label>아이디/이메일</label>
                    <input type="text" id="instagram_id" value="${creds.instagram?.id || ''}" placeholder="인스타 아이디">
                </div>
                <div>
                    <label>비밀번호</label>
                    <input type="password" id="instagram_pw" value="${creds.instagram?.pw || ''}" placeholder="비밀번호">
                </div>
            </div>

            <div class="platform-title">💬 카카오 (채널/스토리 업로드 용)</div>
            <div class="input-row">
                <div>
                    <label>이메일</label>
                    <input type="email" id="kakao_email" value="${creds.kakao?.email || ''}" placeholder="카카오 이메일">
                </div>
                <div>
                    <label>비밀번호</label>
                    <input type="password" id="kakao_pw" value="${creds.kakao?.pw || ''}" placeholder="비밀번호">
                </div>
            </div>

            <button type="submit">저장하기</button>
            <button type="button" class="btn-quit" onclick="quitAgent()">에이전트 종료</button>
        </form>
    </div>

    <script>
        async function quitAgent() {
            if (!confirm('에이전트를 종료하시겠습니까?')) return;
            try {
                await fetch('/api/quit', { method: 'POST' });
            } catch { /* 종료 중 연결 끊김은 정상 */ }
            window.close();
        }

        document.getElementById('credsForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = e.target.querySelector('button');
            btn.textContent = '저장 중...';
            btn.disabled = true;

            const data = {
                agent_key: document.getElementById('agent_key').value,
                naver: {
                    id: document.getElementById('naver_id').value,
                    pw: document.getElementById('naver_pw').value
                },
                google: {
                    email: document.getElementById('google_email').value,
                    pw: document.getElementById('google_pw').value
                },
                instagram: {
                    id: document.getElementById('instagram_id').value,
                    pw: document.getElementById('instagram_pw').value
                },
                kakao: {
                    email: document.getElementById('kakao_email').value,
                    pw: document.getElementById('kakao_pw').value
                }
            };

            try {
                const res = await fetch('/api/credentials', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                const result = await res.json();
                if (result.success) {
                    alert('저장되었습니다.');
                } else {
                    alert('저장 실패: ' + result.error);
                }
            } catch (err) {
                alert('통신 오류: ' + err.message);
            } finally {
                btn.textContent = '저장하기';
                btn.disabled = false;
            }
        });
    </script>
</body>
</html>`;
}
