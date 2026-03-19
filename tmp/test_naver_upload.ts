import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import os from 'os';

// Mock AgentConfig
const config = {
    supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock.supabase.co',
    supabase_anon_key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'mock-key',
    agent_key: 'mock-agent-key',
    agent_name: 'Test-Agent',
    version: '1.0.0',
    building_api_key: '',
    webhook_url: ''
};

// Hardcoded credentials for testing
const credentials = {
    id: 'm3n89t',
    pw: 'm3n89t1141'
};

const SESSION_DIR = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'RealEstateAIOS');
const NAVER_SESSION_PATH = path.join(SESSION_DIR, 'naver-session-test.json');

async function testUpload() {
    console.log('Starting Naver Blog upload test...');

    // 3. 브라우저 실행
    const storageState = fs.existsSync(NAVER_SESSION_PATH) ? NAVER_SESSION_PATH : undefined;
    const browser = await chromium.launch({
        headless: false,
        args: ['--start-maximized'],
    });

    try {
        const context = await browser.newContext({
            viewport: { width: 1280, height: 900 },
            locale: 'ko-KR',
            storageState,
        });
        const page = await context.newPage();

        console.log('Checking login status...');
        await page.goto('https://www.naver.com/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await page.waitForTimeout(2000);

        const isLoggedIn = await page.locator('.MyView-module__my_logo___HdBbr, .gnb_my_image, a[href*="logout"]').count() > 0;

        if (!isLoggedIn) {
            console.log('Not logged in. Logging in...');
            await page.goto('https://nid.naver.com/nidlogin.login', {
                waitUntil: 'domcontentloaded',
                timeout: 30_000,
            });
            await page.waitForTimeout(2000);

            await page.evaluate((id) => {
                const el = document.querySelector('#id') as HTMLInputElement;
                if (el) { el.focus(); el.value = id; el.dispatchEvent(new Event('input', { bubbles: true })); }
            }, credentials.id);
            await page.waitForTimeout(800);

            await page.evaluate((pw) => {
                const el = document.querySelector('#pw') as HTMLInputElement;
                if (el) { el.focus(); el.value = pw; el.dispatchEvent(new Event('input', { bubbles: true })); }
            }, credentials.pw);
            await page.waitForTimeout(800);

            await page.locator('#log\\.login').click();
            await page.waitForTimeout(5000);

            const hasCaptcha = await page.locator('#captcha, .captcha_wrap').count() > 0;
            if (hasCaptcha) {
                console.log('⚠️ CAPTCHA detected. Manual intervention required.');
                await page.waitForURL('**/naver.com/**', { timeout: 120_000 }).catch(() => { });
            }

            await context.storageState({ path: NAVER_SESSION_PATH });
            console.log('Login complete.');
        } else {
            console.log('Already logged in.');
        }

        console.log('Navigating to Blog Editor...');
        await page.goto('https://blog.naver.com/GoBlogWrite.naver', {
            waitUntil: 'domcontentloaded',
            timeout: 30_000,
        });
        await page.waitForTimeout(5000);

        const mainFrame = page.frames().find(f => f.name() === 'mainFrame');
        if (!mainFrame) {
            console.error('❌ mainFrame not found!');
            await page.screenshot({ path: 'tmp/no_mainframe.png' });
            return;
        }

        console.log('Saving frame content for inspection...');
        const frameContent = await mainFrame.content();
        fs.writeFileSync('tmp/frame_content.html', frameContent);

        console.log('Waiting for title selector...');
        try {
            await mainFrame.waitForSelector('.se-title-text, [placeholder*="제목"]', { timeout: 15_000 });
            console.log('✅ Title selector found.');
        } catch (e) {
            console.error('❌ Title selector NOT found!');
            await page.screenshot({ path: 'tmp/title_not_found.png' });
        }

        console.log('Waiting for body selector...');
        const bodySelectors = ['.se-content', '.se-main-container', '.se-section .se-component-content', '.se-main-section .ProseMirror'];
        let bodyFound = false;
        for (const selector of bodySelectors) {
            const count = await mainFrame.locator(selector).count();
            if (count > 0) {
                console.log(`✅ Body selector found: ${selector} (count: ${count})`);
                bodyFound = true;
                break;
            }
        }
        if (!bodyFound) {
            console.error('❌ Body selector NOT found!');
        }

        console.log('Test complete. Closing browser...');
    } catch (err: any) {
        console.error('❌ Test failed:', err.message);
    } finally {
        await browser.close();
    }
}

testUpload();
