import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, type IpcMainInvokeEvent } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import zlib from 'zlib';
import { pathToFileURL } from 'url';
import { AGENT_BRAND } from './brand';
import {
    deletePlatformCredential,
    getCredentialStatus,
    migrateLegacyCredentials,
    saveAgentKey,
    savePlatformCredentials,
    type PlatformCredential,
    type PlatformKey,
} from './credential-store';

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

interface BootstrapConfig {
    supabase_url: string;
    supabase_anon_key: string;
}

function loadBootstrapConfig(): BootstrapConfig {
    const bootstrapPath = path.join(__dirname, 'bootstrap.json');
    const raw = fs.existsSync(bootstrapPath)
        ? JSON.parse(fs.readFileSync(bootstrapPath, 'utf8'))
        : {
            supabase_url: process.env.AGENT_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
            supabase_anon_key: process.env.AGENT_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        };
    const url = typeof raw.supabase_url === 'string' ? raw.supabase_url : '';
    const anonKey = typeof raw.supabase_anon_key === 'string' ? raw.supabase_anon_key : '';
    if (!url || !anonKey || anonKey.length < 20 || anonKey.includes('...')) {
        throw new Error('설치파일의 서버 연결 설정이 유효하지 않습니다.');
    }
    if (new URL(url).protocol !== 'https:') throw new Error('서버 주소는 HTTPS만 사용할 수 있습니다.');
    return { supabase_url: url, supabase_anon_key: anonKey };
}

function assertTrustedSender(event: IpcMainInvokeEvent): void {
    const expectedUrl = pathToFileURL(path.join(__dirname, 'setup.html')).toString();
    if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== event.sender.mainFrame || event.senderFrame?.url !== expectedUrl) {
        throw new Error('허용되지 않은 설정 화면 요청입니다.');
    }
}

function hasConfig(): boolean {
    if (!fs.existsSync(CONFIG_PATH)) return false;
    try {
        const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
        return !!cfg.supabase_url;
    } catch {
        return false;
    }
}

// ─── IPC: 설정 저장 ───────────────────────────────────────────
ipcMain.handle('save-config', (event, data: { agent_name: string; agent_key: string }) => {
    try {
        assertTrustedSender(event);
        if (!data.agent_key?.trim()) throw new Error('연결 정보가 필요합니다.');
        const bootstrap = loadBootstrapConfig();
        if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
        const config = {
            supabase_url: bootstrap.supabase_url,
            supabase_anon_key: bootstrap.supabase_anon_key,
            webhook_url: `${bootstrap.supabase_url}/functions/v1/webhook-agent`,
            agent_name: data.agent_name || `Agent-${os.hostname()}`,
            version: '1.0.0',
        };
        saveAgentKey(data.agent_key);
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { encoding: 'utf8', mode: 0o600 });
        return { ok: true };
    } catch (e: any) {
        return { ok: false, error: e.message };
    }
});

// ─── IPC: OS 암호화 자격증명 저장 ─────────────────────────────
ipcMain.handle('save-credentials', (event, data: Partial<Record<PlatformKey, PlatformCredential>>) => {
    try {
        assertTrustedSender(event);
        savePlatformCredentials(data);
        return { ok: true };
    } catch (e: any) {
        return { ok: false, error: e.message };
    }
});

ipcMain.handle('credential-status', (event) => {
    assertTrustedSender(event);
    return getCredentialStatus();
});
ipcMain.handle('delete-credential', (event, platform: PlatformKey) => {
    try {
        assertTrustedSender(event);
        deletePlatformCredential(platform);
        return { ok: true };
    } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : '삭제에 실패했습니다.' };
    }
});

// ─── IPC: 설정 완료 → 에이전트 시작 ─────────────────────────
ipcMain.handle('config-saved', async (event) => {
    assertTrustedSender(event);
    mainWindow?.close();
    if (!agentStarted) await startAgent();
    if (!tray) createTray();
});

async function startAgent() {
    if (agentStarted) return;
    try {
        const { agent } = await import('./worker');
        await agent.start();
        agentStarted = true;
    } catch (err) {
        console.error('[Agent] 치명적 오류:', err);
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
        const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        if (typeof config.agent_key === 'string' && config.agent_key) {
            saveAgentKey(config.agent_key);
            delete config.agent_key;
            fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { encoding: 'utf8', mode: 0o600 });
        }
    }
    migrateLegacyCredentials();
}

app.on('ready', async () => {
    try {
        migrateLegacySecrets();
    } catch {
        console.error('[Security] 기존 로그인정보를 안전하게 이전하지 못했습니다. 설정 화면에서 다시 저장해 주세요.');
        showSetupWindow();
        return;
    }
    if (!hasConfig()) {
        // 최초 실행: 설정 화면 표시
        showSetupWindow();
    } else {
        // 설정 있음: 바로 시작
        await startAgent();
        createTray();
    }
});

app.on('window-all-closed', () => {
    // 트레이에 남아있음 (종료하지 않음)
});
