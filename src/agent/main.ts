import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';

let mainWindow: BrowserWindow | null;
let tray: Tray | null;

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
ipcMain.handle('save-config', (_event, data: { url: string; anon_key: string; agent_name: string }) => {
    try {
        if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
        const config = {
            supabase_url: data.url,
            supabase_anon_key: data.anon_key,
            webhook_url: `${data.url}/functions/v1/webhook-agent`,
            agent_name: data.agent_name || `Agent-${os.hostname()}`,
            version: '1.0.0',
        };
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
        return { ok: true };
    } catch (e: any) {
        return { ok: false, error: e.message };
    }
});

// ─── IPC: 설정 완료 → 에이전트 시작 ─────────────────────────
ipcMain.handle('config-saved', async () => {
    mainWindow?.close();
    await startAgent();
    createTray();
    // UI 서버 기동 대기 후 메인 창 오픈
    setTimeout(() => showMainUI(), 2000);
});

async function startAgent() {
    try {
        const { agent } = await import('./worker');
        await agent.start();
    } catch (err) {
        console.error('[Agent] 치명적 오류:', err);
    }
}

const createTray = () => {
    try {
        const iconPath = path.join(__dirname, '../../public/favicon.ico');
        const icon = fs.existsSync(iconPath)
            ? nativeImage.createFromPath(iconPath)
            : nativeImage.createFromDataURL(
                'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABmJLR0QA/wD/AP+gvaeTAAAASklEQVQ4jWNgYGD4z8BQDwAHhAH/GRiAGBiIoRkYGBgYGBiAGBiAGBiAGBiAGBiAGBiAGBiAGBiAGBiAGBiAGBgYGBjqAQAzJAMBvM74XAAAAABJRU5ErkJggg=='
              );
        tray = new Tray(icon);
    } catch (e) {
        console.error('[Tray] 트레이 아이콘 생성 실패:', e);
        tray = new Tray(nativeImage.createEmpty());
    }
    const contextMenu = Menu.buildFromTemplate([
        {
            label: '설정 열기',
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                } else {
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
            nodeIntegration: true,
            contextIsolation: false,
        },
        title: '부동산 AI 에이전트 초기 설정',
    });
    mainWindow.loadFile(path.join(__dirname, 'setup.html'));
    mainWindow.on('closed', () => { mainWindow = null; });
};

const showMainUI = () => {
    mainWindow = new BrowserWindow({
        width: 650,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    });
    mainWindow.loadURL('http://localhost:3005');
    mainWindow.on('closed', () => { mainWindow = null; });
    ;(mainWindow as any).on('minimize', (event: any) => {
        event.preventDefault();
        mainWindow?.hide();
    });
};

app.on('ready', async () => {
    if (!hasConfig()) {
        // 최초 실행: 설정 화면 표시
        showSetupWindow();
    } else {
        // 설정 있음: 바로 시작
        await startAgent();
        createTray();
        setTimeout(() => showMainUI(), 2000);
    }
});

app.on('window-all-closed', () => {
    // 트레이에 남아있음 (종료하지 않음)
});
