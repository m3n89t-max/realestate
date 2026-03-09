const { execSync } = require('child_process');
const fs = require('fs');

console.log('🔄 에이전트 빌드 준비 중 (우회 모드)...');

process.env.ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/';
process.env.ELECTRON_CUSTOM_DIR = '33.3.1';
process.env.ELECTRON_SKIP_BINARY_DOWNLOAD = '1';

try {
    // src/agent/setup.html 복사
    fs.copyFileSync('src/agent/setup.html', 'dist-agent/setup.html');
    console.log('✅ setup.html 복사 완료');

    // 빌드 실행
    console.log('🚀 electron-builder 실행 중...');
    execSync('npx electron-builder --win', { stdio: 'inherit' });
    console.log('🎉 빌드 성공!');
} catch (error) {
    console.error('❌ 빌드 실패:', error.message);
    process.exit(1);
}
