// 보안상 로컬 HTTP 설정 서버는 폐기했습니다.
// 설정은 Electron의 격리된 renderer와 preload IPC를 통해서만 처리합니다.
export function startUIServer(): never {
  throw new Error('로컬 HTTP 설정 서버는 더 이상 지원하지 않습니다.')
}
