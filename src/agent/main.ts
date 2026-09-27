import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import zlib from 'zlib';
import { ensurePrivateDirectory, writePrivateJson } from './secure-files';
import type { UIServerHandle } from './ui/server';

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
let uiServer: UIServerHandle | null = null;

const CONFIG_DIR = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'RealEstateAIOS');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

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
ipcMain.handle('save-config', (_event, data: { url: string; anon_key: string; agent_name: string; agent_key: string }) => {
    try {
        ensurePrivateDirectory(CONFIG_DIR);
        const config = {
            supabase_url: data.url,
            supabase_anon_key: data.anon_key,
            agent_key: data.agent_key,
            webhook_url: `${data.url}/functions/v1/webhook-agent`,
            agent_name: data.agent_name || `Agent-${os.hostname()}`,
            version: '1.0.0',
        };
        writePrivateJson(CONFIG_PATH, config);
        return { ok: true };
    } catch (e: any) {
        return { ok: false, error: e.message };
    }
});

// ─── IPC: SNS 자격증명 저장 ──────────────────────────────────
ipcMain.handle('save-credentials', (_event, data: {
    naver?: { id?: string; pw?: string };
    google?: { email?: string; pw?: string };
    instagram?: { id?: string; pw?: string };
}) => {
    try {
        ensurePrivateDirectory(CONFIG_DIR);
        const credPath = path.join(CONFIG_DIR, 'credentials.json');
        // 기존 데이터 유지하며 병합
        let existing: Record<string, any> = {};
        if (fs.existsSync(credPath)) {
            try { existing = JSON.parse(fs.readFileSync(credPath, 'utf-8')); } catch { }
        }
        const merged = { ...existing };
        if (data.naver?.id || data.naver?.pw) merged.naver = data.naver;
        if (data.google?.email || data.google?.pw) merged.google = data.google;
        if (data.instagram?.id || data.instagram?.pw) merged.instagram = data.instagram;
        writePrivateJson(credPath, merged);
        return { ok: true };
    } catch (e: any) {
        return { ok: false, error: e.message };
    }
});

// ─── IPC: 설정 완료 → 에이전트 시작 ─────────────────────────
ipcMain.handle('config-saved', async () => {
    mainWindow?.close();
    try {
        await startAgent();
        createTray();
        showMainUI();
    } catch (error) {
        handleFatalUIError(error);
    }
});

async function startAgent(): Promise<UIServerHandle> {
    const { agent } = await import('./worker');
    uiServer = await agent.start();
    return uiServer;
}

function handleFatalUIError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Agent UI] 치명적 오류:', message);
    dialog.showErrorBox('설정 UI 시작 실패', `로컬 설정 UI를 시작할 수 없습니다.\n${message}`);
    app.quit();
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
                } else if (uiServer) {
                    showMainUI();
                }
            }
        },
        { type: 'separator' },
        {
            label: '종료',
            click: () => app.quit()
        }
    ]);
    tray.setToolTip('부동산 AI 에이전트 실행 중');
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
        title: '부동산 AI 에이전트 초기 설정',
    });
    mainWindow.webContents.on('will-navigate', event => event.preventDefault());
    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    mainWindow.loadFile(path.join(__dirname, 'setup.html'));
    mainWindow.on('closed', () => { mainWindow = null; });
};

const showMainUI = () => {
    if (!uiServer) throw new Error('UI server is not ready');
    const activeUIServer = uiServer;
    mainWindow = new BrowserWindow({
        width: 650,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
        },
    });
    const isAllowedUIUrl = (targetUrl: string): boolean => {
        try {
            return new URL(targetUrl).origin === activeUIServer.origin;
        } catch {
            return false;
        }
    };
    const preventExternalNavigation = (event: Electron.Event, targetUrl: string): void => {
        if (!isAllowedUIUrl(targetUrl)) event.preventDefault();
    };
    mainWindow.webContents.on('will-navigate', preventExternalNavigation);
    mainWindow.webContents.on('will-redirect', preventExternalNavigation);
    mainWindow.webContents.setWindowOpenHandler(({ url }) => ({
        action: isAllowedUIUrl(url) ? 'allow' : 'deny',
    }));
    mainWindow.loadURL(activeUIServer.url);
    mainWindow.on('closed', () => { mainWindow = null; });
    ; (mainWindow as any).on('minimize', (event: any) => {
        event.preventDefault();
        mainWindow?.hide();
    });
};

// exe 중복 실행 시 기존 창 포커스
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
        else if (uiServer) showMainUI();
    });
}

app.on('ready', async () => {
    if (!hasConfig()) {
        // 최초 실행: 설정 화면 표시
        showSetupWindow();
    } else {
        // 설정 있음: 바로 시작
        try {
            await startAgent();
            createTray();
            showMainUI();
        } catch (error) {
            handleFatalUIError(error);
        }
    }
});

app.on('window-all-closed', () => {
    // 트레이에 남아있음 (종료하지 않음)
});
