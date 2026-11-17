/**
 * Electron 기본 UA에서 "Electron/x.y.z"와 앱 이름 토큰을 지워 일반 크롬 UA로 만든다.
 * 예) "... Chrome/142.0.0.0 masil/0.1.0 Electron/45.3.3 Safari/537.36"
 *   → "... Chrome/142.0.0.0 Safari/537.36"
 */
export function toChromeUserAgent(electronUA: string, appName = 'masil'): string {
  const appToken = new RegExp(`\\s${escapeRegExp(appName)}/\\S+`, 'gi')
  return electronUA
    .replace(/\sElectron\/\S+/gi, '')
    .replace(appToken, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
