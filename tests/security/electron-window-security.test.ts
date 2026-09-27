import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const mainSource = fs.readFileSync(path.join(process.cwd(), 'src/agent/main.ts'), 'utf8');

test('every Electron window disables Node, enables context isolation, and uses the sandbox', () => {
    const browserWindowCount = (mainSource.match(/new BrowserWindow\s*\(/g) ?? []).length;
    assert.ok(browserWindowCount > 0);
    assert.equal((mainSource.match(/nodeIntegration:\s*false/g) ?? []).length, browserWindowCount);
    assert.equal((mainSource.match(/contextIsolation:\s*true/g) ?? []).length, browserWindowCount);
    assert.equal((mainSource.match(/sandbox:\s*true/g) ?? []).length, browserWindowCount);
});

test('main UI startup has no timer race and installs exact-origin navigation and popup guards', () => {
    assert.doesNotMatch(mainSource, /setTimeout\(\(\)\s*=>\s*showMainUI\(\),\s*2000\)/);
    assert.match(mainSource, /will-navigate/);
    assert.match(mainSource, /will-redirect/);
    assert.match(mainSource, /setWindowOpenHandler/);
    assert.match(mainSource, /new URL\([^)]*\)\.origin\s*===\s*activeUIServer\.origin/);
});

test('sandboxed setup keeps its IPC functionality through a preload bridge', () => {
    const setupSource = fs.readFileSync(path.join(process.cwd(), 'src/agent/setup.html'), 'utf8');
    assert.doesNotMatch(setupSource, /require\(['"]electron['"]\)/);
    assert.match(setupSource, /window\.agentSetup/);
    assert.match(mainSource, /preload:\s*path\.join\(__dirname,\s*['"]preload\.js['"]\)/);
});

test('a UI server bind failure is fatal and cannot create the settings window', () => {
    assert.match(mainSource, /showErrorBox/);
    assert.match(mainSource, /app\.quit\(\)/);
    assert.match(mainSource, /uiServer\s*=\s*await\s+agent\.start\(\)/);
});