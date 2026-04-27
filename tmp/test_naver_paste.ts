import { chromium } from 'playwright';
import path from 'path';
import os from 'os';

const SESSION_DIR = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'RealEstateAIOS');
const agentProfileDir = path.join(SESSION_DIR, 'EdgeProfile');

async function run() {
    const context = await chromium.launchPersistentContext(agentProfileDir, {
        channel: 'msedge',
        headless: false,
        permissions: ['clipboard-read', 'clipboard-write'],
        args: ['--start-maximized', '--disable-blink-features=AutomationControlled']
    });

    const page = context.pages()[0] || await context.newPage();
    
    console.log('Navigating to Naver Blog Writer...');
    await page.goto('https://blog.naver.com/GoBlogWrite.naver', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);
    
    const mainFrame = page.frames().find(f => f.name() === 'mainFrame');
    if (!mainFrame) {
        console.log('Wait, is it logged in?');
        await context.close();
        return;
    }

    await mainFrame.waitForSelector('.se-section-text', { timeout: 10000 });
    await mainFrame.locator('.se-section-text').first().click();
    await page.waitForTimeout(500);

    const htmlStr = `<table style="width:100%;border-collapse:collapse;font-size:13px;margin:16px 0;"><tbody><tr><td style="border:1px solid #bbb;padding:6px 10px;background:#dbeafe;font-weight:bold;">Test Header</td><td style="border:1px solid #bbb;padding:6px 10px;">Test Data</td></tr></tbody></table>`;

    console.log('Trying OS clipboard logic (navigator.clipboard.write + Ctrl+V)...');
    const useClipboard = await mainFrame.evaluate(async (html) => {
        try {
            const blobHtml = new Blob([html], { type: 'text/html' });
            const blobText = new Blob(['[매물개요 표]'], { type: 'text/plain' });
            const ClipboardItemConstructor = (window as any).ClipboardItem;
            const item = new ClipboardItemConstructor({
                'text/html': blobHtml,
                'text/plain': blobText
            });
            await navigator.clipboard.write([item]);
            return true;
        } catch (err) {
            console.error('Clipboard write error', err);
            return false;
        }
    }, htmlStr);

    console.log('Clipboard Write Success:', useClipboard);

    if (useClipboard) {
        await page.keyboard.press('Control+V');
        await page.waitForTimeout(2000);
    } else {
        console.log('Trying synthetic ClipboardEvent...');
        await mainFrame.evaluate(async (html) => {
            const dt = new DataTransfer();
            dt.setData('text/html', html);
            dt.setData('text/plain', 'html-table');
            const event = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
            document.activeElement.dispatchEvent(event);
        }, htmlStr);
        await page.waitForTimeout(2000);
    }

    console.log('Pasted. Taking screenshot...');
    await page.screenshot({ path: 'tmp/naver_test_result.png' });
    console.log('Saved to tmp/naver_test_result.png');

    await context.close();
}

run().catch(console.error);
