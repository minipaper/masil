import { join } from 'node:path'
import { app } from 'electron'

/** resources/ 폴더 (개발: 프로젝트 루트, 배포: extraResources) */
export function resourcePath(...parts: string[]): string {
  const base = app.isPackaged ? join(process.resourcesPath, 'resources') : join(app.getAppPath(), 'resources')
  return join(base, ...parts)
}
