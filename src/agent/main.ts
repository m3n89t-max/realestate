import { app, BrowserWindow, Tray, Menu } from 'electron';
import path from 'path';
import { agent } from './worker';

let mainWindow: BrowserWindow | null;
let tray: Tray | null;

const createTray = () => {
    // Use a simple 16x16 icon format or generic if missing.
    // In production, we'd add an actual .ico file.
    tray = new Tray(path.join(__dirname, '../../public/favicon.ico'));
    const contextMenu = Menu.buildFromTemplate([
        {
            label: '설정 열기',
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                } else {
                    createWindow();
                }
            }
        },
        {
            label: '종료',
            click: () => {
                app.quit();
            }
        }
    ]);
    tray.setToolTip('부동산 AI 로컬 에이전트');
    tray.setContextMenu(contextMenu);
};

const createWindow = () => {
    mainWindow = new BrowserWindow({
        width: 650,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
        },
        icon: path.join(__dirname, '../../public/favicon.ico')
    });

    // Load the web server UI running on localhost:3005
    mainWindow.loadURL('http://localhost:3005');

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // When minimizing to try, don't quit
    // @ts-ignore
    mainWindow.on('minimize', (event: any) => {
        event.preventDefault();
        mainWindow?.hide();
    });
};

app.on('ready', () => {
    // 1. App start Worker
    agent.start().catch((err) => {
        console.error('[Agent] 치명적 오류:', err);
    });

    // 2. Setup Tray
    createTray();

    // 3. Open UI window
    createWindow();
});

// Windows specific: prevent app from closing when all windows are closed, stay in tray
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        // DO NOTHING, stay in tray
    }
});
