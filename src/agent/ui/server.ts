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
    const naverOk = creds.naver?.id && creds.naver?.pw;
    const googleOk = creds.google?.email && creds.google?.pw;
    const instagramOk = creds.instagram?.id && creds.instagram?.pw;

    return `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>부동산 AI OS - 에이전트 설정</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', -apple-system, sans-serif;
            background: #f0f4f8; min-height: 100vh; padding: 24px 16px;
            color: #1e293b;
        }
        .wrap { max-width: 580px; margin: 0 auto; }
        .header {
            background: linear-gradient(135deg, #0ea5e9, #0284c7);
            border-radius: 16px 16px 0 0; padding: 20px 24px;
            color: white;
        }
        .header-top { display: flex; align-items: center; justify-content: space-between; }
        .logo { font-size: 18px; font-weight: 800; }
        .status-pill {
            display: flex; align-items: center; gap: 6px;
            background: rgba(255,255,255,0.2); border-radius: 20px;
            padding: 4px 12px; font-size: 12px;
        }
        .dot { width: 7px; height: 7px; background: #86efac; border-radius: 50%; animation: blink 2s infinite; }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.4} }
        .card {
            background: white; padding: 24px;
            border-radius: 0 0 16px 16px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.08);
        }
        .notice {
            font-size: 12px; color: #64748b; padding: 10px 14px;
            background: #f8fafc; border-radius: 8px; margin-bottom: 24px;
            border-left: 3px solid #0ea5e9;
        }

        /* 계정 요약 카드들 */
        .accounts-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 24px; }
        .account-card {
            border: 1.5px solid #e2e8f0; border-radius: 10px;
            padding: 12px; text-align: center; cursor: pointer;
            transition: all 0.2s;
        }
        .account-card:hover { border-color: #0ea5e9; background: #f0f9ff; }
        .account-card.connected { border-color: #86efac; background: #f0fdf4; }
        .account-card-icon { font-size: 22px; margin-bottom: 4px; }
        .account-card-name { font-size: 12px; font-weight: 600; color: #374151; }
        .account-card-status { font-size: 10px; margin-top: 3px; }
        .account-card.connected .account-card-status { color: #16a34a; }
        .account-card:not(.connected) .account-card-status { color: #94a3b8; }

        /* 폼 섹션 */
        .section { margin-bottom: 24px; }
        .section-header {
            display: flex; align-items: center; gap: 8px;
            font-size: 14px; font-weight: 700; color: #1e293b;
            padding-bottom: 10px; border-bottom: 1.5px solid #f1f5f9;
            margin-bottom: 14px;
        }
        .connected-badge {
            font-size: 10px; padding: 2px 8px; border-radius: 10px;
            background: #dcfce7; color: #16a34a; font-weight: 600; margin-left: auto;
        }
        .empty-badge {
            font-size: 10px; padding: 2px 8px; border-radius: 10px;
            background: #f1f5f9; color: #94a3b8; font-weight: 600; margin-left: auto;
        }
        .input-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        label { display: block; font-size: 12px; font-weight: 600; color: #64748b; margin-bottom: 5px; }
        input {
            width: 100%; padding: 9px 12px;
            border: 1.5px solid #e2e8f0; border-radius: 8px;
            font-size: 13px; outline: none; transition: border-color 0.2s;
            background: #fafafa;
        }
        input:focus { border-color: #0ea5e9; background: white; }

        /* 버튼 */
        .btn-save {
            width: 100%; padding: 13px; background: #0ea5e9;
            color: white; border: none; border-radius: 10px;
            font-size: 15px; font-weight: 700; cursor: pointer;
            transition: background 0.2s; margin-bottom: 10px;
        }
        .btn-save:hover { background: #0284c7; }
        .btn-save:disabled { background: #94a3b8; cursor: not-allowed; }
        .btn-quit {
            width: 100%; padding: 10px; background: #f1f5f9;
            color: #64748b; border: none; border-radius: 10px;
            font-size: 13px; font-weight: 600; cursor: pointer;
            transition: all 0.2s;
        }
        .btn-quit:hover { background: #fee2e2; color: #ef4444; }

        .toast {
            display: none; position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
            background: #1e293b; color: white; padding: 10px 20px; border-radius: 20px;
            font-size: 13px; z-index: 100;
        }
        .toast.show { display: block; }
        .divider { border: none; border-top: 1.5px solid #f1f5f9; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="wrap">
        <div class="header">
            <div class="header-top">
                <div class="logo">🏠 부동산 AI OS</div>
                <div class="status-pill">
                    <span class="dot"></span>에이전트 실행 중
                </div>
            </div>
        </div>
        <div class="card">
            <p class="notice">아이디/비밀번호는 이 PC에만 저장됩니다. 외부 서버로 전송되지 않습니다.</p>

            <!-- 연결 현황 요약 -->
            <div class="accounts-grid">
                <div class="account-card ${naverOk ? 'connected' : ''}">
                    <div class="account-card-icon">🟢</div>
                    <div class="account-card-name">네이버</div>
                    <div class="account-card-status">${naverOk ? '연결됨' : '미설정'}</div>
                </div>
                <div class="account-card ${googleOk ? 'connected' : ''}">
                    <div class="account-card-icon">▶️</div>
                    <div class="account-card-name">유튜브</div>
                    <div class="account-card-status">${googleOk ? '연결됨' : '미설정'}</div>
                </div>
                <div class="account-card ${instagramOk ? 'connected' : ''}">
                    <div class="account-card-icon">📸</div>
                    <div class="account-card-name">인스타</div>
                    <div class="account-card-status">${instagramOk ? '연결됨' : '미설정'}</div>
                </div>
            </div>

            <form id="credsForm">
                <!-- 네이버 -->
                <div class="section">
                    <div class="section-header">
                        🟢 네이버 블로그
                        ${naverOk ? '<span class="connected-badge">연결됨</span>' : '<span class="empty-badge">미설정</span>'}
                    </div>
                    <div class="input-row">
                        <div>
                            <label>아이디</label>
                            <input type="text" id="naver_id" value="${creds.naver?.id || ''}" placeholder="네이버 아이디" autocomplete="off" />
                        </div>
                        <div>
                            <label>비밀번호</label>
                            <input type="password" id="naver_pw" value="${creds.naver?.pw || ''}" placeholder="비밀번호" />
                        </div>
                    </div>
                </div>

                <!-- 유튜브 -->
                <div class="section">
                    <div class="section-header">
                        ▶️ 유튜브 (구글 계정)
                        ${googleOk ? '<span class="connected-badge">연결됨</span>' : '<span class="empty-badge">선택사항</span>'}
                    </div>
                    <div class="input-row">
                        <div>
                            <label>구글 이메일</label>
                            <input type="email" id="google_email" value="${creds.google?.email || ''}" placeholder="example@gmail.com" autocomplete="off" />
                        </div>
                        <div>
                            <label>비밀번호</label>
                            <input type="password" id="google_pw" value="${creds.google?.pw || ''}" placeholder="비밀번호" />
                        </div>
                    </div>
                </div>

                <!-- 인스타 -->
                <div class="section">
                    <div class="section-header">
                        📸 인스타그램
                        ${instagramOk ? '<span class="connected-badge">연결됨</span>' : '<span class="empty-badge">선택사항</span>'}
                    </div>
                    <div class="input-row">
                        <div>
                            <label>아이디</label>
                            <input type="text" id="instagram_id" value="${creds.instagram?.id || ''}" placeholder="인스타 아이디" autocomplete="off" />
                        </div>
                        <div>
                            <label>비밀번호</label>
                            <input type="password" id="instagram_pw" value="${creds.instagram?.pw || ''}" placeholder="비밀번호" />
                        </div>
                    </div>
                </div>

                <hr class="divider" />

                <!-- Agent Key -->
                <div class="section">
                    <div class="section-header">🔑 에이전트 연결키</div>
                    <input type="text" id="agent_key" value="${agentKey}" placeholder="agent-..." autocomplete="off" />
                </div>

                <button type="submit" class="btn-save">저장하기</button>
                <button type="button" class="btn-quit" onclick="quitAgent()">에이전트 종료</button>
            </form>
        </div>
    </div>

    <div class="toast" id="toast"></div>

    <script>
        function showToast(msg, isError) {
            const t = document.getElementById('toast');
            t.textContent = msg;
            t.style.background = isError ? '#ef4444' : '#1e293b';
            t.classList.add('show');
            setTimeout(() => t.classList.remove('show'), 2500);
        }

        async function quitAgent() {
            if (!confirm('에이전트를 종료하시겠습니까?\\n종료하면 자동화 작업이 중단됩니다.')) return;
            try { await fetch('/api/quit', { method: 'POST' }); } catch { }
            window.close();
        }

        document.getElementById('credsForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.querySelector('.btn-save');
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
            };

            try {
                const res = await fetch('/api/credentials', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                const result = await res.json();
                if (result.success) {
                    showToast('저장되었습니다.');
                    setTimeout(() => location.reload(), 1000);
                } else {
                    showToast('저장 실패: ' + result.error, true);
                }
            } catch (err) {
                showToast('오류: ' + err.message, true);
            } finally {
                btn.textContent = '저장하기';
                btn.disabled = false;
            }
        });
    </script>
</body>
</html>`;
}
