import fs from 'fs';

function ignoreUnsupportedPermissionError(error: unknown): void {
    const code = (error as NodeJS.ErrnoException).code;
    if (process.platform === 'win32' && (code === 'EPERM' || code === 'ENOSYS' || code === 'EINVAL')) return;
    throw error;
}

export function ensurePrivateDirectory(dirPath: string): void {
    fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
    try {
        fs.chmodSync(dirPath, 0o700);
    } catch (error) {
        ignoreUnsupportedPermissionError(error);
    }
}

export function writePrivateJson(filePath: string, value: unknown): void {
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2), {
        encoding: 'utf8',
        mode: 0o600,
    });
    try {
        fs.chmodSync(filePath, 0o600);
    } catch (error) {
        ignoreUnsupportedPermissionError(error);
    }
}
