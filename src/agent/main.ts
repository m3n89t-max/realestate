import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, dialog, type IpcMainInvokeEvent } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import zlib from 'zlib';
import { pathToFileURL } from 'url';
import { AGENT_BRAND } from './brand';
import {
    getAgentKey,
    getLegacyCredentialPath,
    migrateLegacyCredentials,
    saveAgentKey,
} from './credential-store';
import { loadBootstrapConfig } from './config';

// Node.js 내장 zlib로 16x16 파란색 PNG 버퍼 생성 (외부 파일 불필요)
function createIconBuffer(): Buffer {
    const w = 16, h = 16;
    const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

    function crc32(buf: Buffer): number {
        let c = 0xFFFFFFFF;
        for (const b of buf) { c ^= b; for (let i = 0; i < 8; i++) c = (c & 1) ? (c >>> 1) ^ 0xEDB88320 : c >>> 1; }
        return (c ^ 0xFFFFFFFF) >>> 0;
    }
    function chunk(type: string, data: Buffer): Buffer {
        const t = Buffer.from(type, 'ascii');
        const l = Buffer.alloc(4); l.writeUInt32BE(data.length);
        const cr = Buffer.alloc(4); cr.writeUInt32BE(crc32(Buffer.concat([t, data])));
        return Buffer.concat([l, t, data, cr]);
    }

    const ihdrData = Buffer.alloc(13);
    ihdrData.writeUInt32BE(w, 0); ihdrData.writeUInt32BE(h, 4);
    ihdrData[8] = 8; ihdrData[9] = 2; // bit depth=8, RGB

    // 각 행: filter=0 + 16픽셀 RGB (파란색 #0D5EAF)
    const raw = Buffer.alloc(h * (1 + w * 3));
    for (let y = 0; y < h; y++) {
        raw[y * (1 + w * 3)] = 0;
        for (let x = 0; x < w; x++) {
            const o = y * (1 + w * 3) + 1 + x * 3;
            raw[o] = 0x0D; raw[o + 1] = 0x5E; raw[o + 2] = 0xAF;
        }
    }
    const idat = chunk('IDAT', zlib.deflateSync(raw));
    return Buffer.concat([sig, chunk('IHDR', ihdrData), idat, chunk('IEND', Buffer.alloc(0))]);
}

let mainWindow: BrowserWindow | null;
let tray: Tray | null;
let agentStarted = false;

const CONFIG_DIR = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'RealEstateAIOS');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

let securityBlockMessage = ''

function assertTrustedSender(event: IpcMainInvokeEvent): void {
    const expectedUrl = pathToFileURL(path.join(__dirname, 'setup.html')).toString();
    if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== event.sender.mainFrame || event.senderFrame?.url !== expectedUrl) {
        throw new Error('허용되지 않은 설정 화면 요청입니다.');
    }
}

function hasConfig(): boolean {
    return Boolean(getAgentKey());
}

// ─── IPC: 설정 저장 ───────────────────────────────────────────
ipcMain.handle('save-config', (event, data: { agent_name: string; agent_key: string }) => {
    try {
        assertTrustedSender(event);
        if (securityBlockMessage) throw new Error(securityBlockMessage);
        if (!data.agent_key?.trim()) throw new Error('연결 정보가 필요합니다.');
        loadBootstrapConfig();
        if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
        saveAgentKey(data.agent_key);
        if (getAgentKey() !== data.agent_key.trim()) throw new Error('연결키 암호화 저장 검증에 실패했습니다.');
        const config = { agent_name: data.agent_name?.trim() || `Agent-${os.hostname()}` };
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { encoding: 'utf8', mode: 0o600 });
        return { ok: true };
    } catch (e: unknown) {
        return { ok: false, error: e instanceof Error ? e.message : '설정을 저장하지 못했습니다.' };
    }
});

// ─── IPC: 설정 완료 → 에이전트 시작 ─────────────────────────
ipcMain.handle('config-saved', async (event) => {
    try {
        assertTrustedSender(event);
        if (!agentStarted) {
            const started = await startAgent();
            if (!started.ok) return started;
        }
        if (!tray) createTray();
        mainWindow?.close();
        return { ok: true };
    } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : '에이전트를 시작하지 못했습니다.' };
    }
});

async function startAgent(): Promise<{ ok: boolean; error?: string }> {
    if (agentStarted) return { ok: true };
    if (securityBlockMessage) return { ok: false, error: securityBlockMessage };
    try {
        const { agent } = await import('./worker');
        await agent.start();
        agentStarted = true;
        return { ok: true };
    } catch (err) {
        console.error('[Agent] 치명적 오류:', err);
        return { ok: false, error: err instanceof Error ? err.message : '에이전트 시작에 실패했습니다.' };
    }
}

const createTray = () => {
    // 패키징된 앱(extraResources) → 개발 실행(public/) 순으로 브랜드 아이콘 탐색
    const iconCandidates = [
        path.join(process.resourcesPath || '', 'favicon.ico'),
        path.join(__dirname, '../../public/favicon.ico'),
    ];
    const iconPath = iconCandidates.find(p => p && fs.existsSync(p));
    const icon = iconPath
        ? nativeImage.createFromPath(iconPath)
        : nativeImage.createFromBuffer(createIconBuffer());
    tray = new Tray(icon);
    const contextMenu = Menu.buildFromTemplate([
        {
            label: '설정 열기',
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                } else {
                    showSetupWindow();
                }
            }
        },
        { type: 'separator' },
        {
            label: '종료',
            click: () => app.quit()
        }
    ]);
    tray.setToolTip(`${AGENT_BRAND.localAgentName} 실행 중`);
    tray.setContextMenu(contextMenu);
};

const showSetupWindow = () => {
    mainWindow = new BrowserWindow({
        width: 520,
        height: 620,
        resizable: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            preload: path.join(__dirname, 'preload.js'),
        },
        title: `${AGENT_BRAND.localAgentName} 초기 설정`,
    });
    mainWindow.loadFile(path.join(__dirname, 'setup.html'));
    mainWindow.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    mainWindow.webContents.on('will-navigate', (event, url) => {
        const expectedUrl = pathToFileURL(path.join(__dirname, 'setup.html')).toString();
        if (url !== expectedUrl) event.preventDefault();
    });
    mainWindow.on('closed', () => { mainWindow = null; });
};

// exe 중복 실행 시 기존 창 포커스
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
        else showSetupWindow();
    });
}

function migrateLegacySecrets() {
    if (fs.existsSync(CONFIG_PATH)) {
        const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as Record<string, unknown>;
        if ('agent_key' in config && (typeof config.agent_key !== 'string' || !config.agent_key.trim())) {
            throw new Error('config.json의 평문 연결키가 불완전합니다.');
        }
        if (typeof config.agent_key === 'string') {
            saveAgentKey(config.agent_key);
            if (getAgentKey() !== config.agent_key.trim()) throw new Error('평문 연결키 암호화 저장 검증에 실패했습니다.');
            delete config.agent_key;
        }
        delete config.supabase_url;
        delete config.supabase_anon_key;
        delete config.webhook_url;
        delete config.version;
        const preferences = typeof config.agent_name === 'string' ? { agent_name: config.agent_name } : {};
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(preferences, null, 2), { encoding: 'utf8', mode: 0o600 });
    }
    migrateLegacyCredentials();
}

app.on('ready', async () => {
    try {
        loadBootstrapConfig();
        migrateLegacySecrets();
    } catch (error) {
        const legacyPath = getLegacyCredentialPath();
        securityBlockMessage = `보안을 위해 에이전트 실행을 차단했습니다. 평문 파일을 확인해 삭제한 뒤 설정 화면에서 비밀값을 다시 입력하세요. 경로: ${legacyPath}`;
        console.error('[Security] 레거시 평문 이전 실패. 비밀값은 로그에 출력하지 않습니다.');
        dialog.showErrorBox('집포터 보안 확인 필요', `${securityBlockMessage}\n\n원인: ${error instanceof Error ? error.message : '알 수 없는 마이그레이션 오류'}`);
        showSetupWindow();
        return;
    }
    if (!hasConfig()) {
        // 최초 실행: 설정 화면 표시
        showSetupWindow();
    } else {
        // 설정 있음: 시작 성공 시에만 트레이로 전환하고, 실패하면 설정 화면으로 복귀
        const started = await startAgent();
        if (started.ok) {
            createTray();
        } else {
            console.error('[Agent] 시작 실패:', started.error);
            showSetupWindow();
        }
    }
});

app.on('window-all-closed', () => {
    // 트레이에 남아있음 (종료하지 않음)
});
