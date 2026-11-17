import { app, dialog, type BrowserWindow } from 'electron'
import Database from 'better-sqlite3'
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { closeDb, dbPath, type DB } from './db'
import { API_KEY } from './settings'

/** 자동 백업은 최근 몇 개만 남긴다 */
const KEEP_AUTO_BACKUPS = 5

const stamp = (): string => {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

export const backupDir = (): string => join(app.getPath('userData'), 'backups')

/** 데이터 내보내기: 지금 DB를 SQLite 파일 하나로 복사한다 (사용 중에도 안전한 backup API) */
export async function exportData(db: DB, win: BrowserWindow | null): Promise<{ ok: boolean; message: string }> {
  const opts = {
    title: '마실 데이터 내보내기',
    defaultPath: join(app.getPath('documents'), `masil-backup-${stamp()}.sqlite`),
    filters: [{ name: '마실 백업', extensions: ['sqlite'] }]
  }
  const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
  if (res.canceled || !res.filePath) return { ok: false, message: '' }
  await db.backup(res.filePath)
  // 암호화된 API 키는 내보내지 않는다. 지운 흔적이 파일에 남지 않게 VACUUM까지 한다.
  const out = new Database(res.filePath)
  try {
    out.prepare(`DELETE FROM settings WHERE key = ?`).run(API_KEY)
    out.pragma('journal_mode = DELETE')
    out.exec('VACUUM')
  } finally {
    out.close()
  }
  return { ok: true, message: '내보냈어요.' }
}

/** 마실 백업 파일인지 확인한다 */
function validate(path: string): string | null {
  let probe: Database.Database | null = null
  try {
    probe = new Database(path, { readonly: true, fileMustExist: true })
    const version = probe.pragma('user_version', { simple: true }) as number
    const tables = (probe.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as { name: string }[]).map(
      (t) => t.name
    )
    if (version < 1 || !['neighbors', 'posts', 'comments', 'settings'].every((t) => tables.includes(t))) {
      return '마실 백업 파일이 아니에요.'
    }
    return null
  } catch {
    return '파일을 열 수 없어요. 마실 백업 파일인지 확인해 주세요.'
  } finally {
    probe?.close()
  }
}

function pruneAutoBackups(): void {
  const dir = backupDir()
  const files = readdirSync(dir)
    .filter((f) => f.startsWith('before-import-') && f.endsWith('.sqlite'))
    .sort()
  for (const f of files.slice(0, Math.max(0, files.length - KEEP_AUTO_BACKUPS))) rmSync(join(dir, f), { force: true })
}

/**
 * 데이터 가져오기: 지금 데이터를 자동 백업한 뒤 고른 파일로 바꾸고 앱을 다시 시작한다.
 * 다시 시작하지 않으면 열린 DB 연결이 옛 파일을 계속 쓰기 때문.
 */
export async function importData(db: DB, win: BrowserWindow | null): Promise<{ ok: boolean; message: string }> {
  const openOpts = {
    title: '마실 데이터 가져오기',
    properties: ['openFile' as const],
    filters: [{ name: '마실 백업', extensions: ['sqlite', 'db'] }]
  }
  const picked = win ? await dialog.showOpenDialog(win, openOpts) : await dialog.showOpenDialog(openOpts)
  const src = picked.filePaths[0]
  if (picked.canceled || !src) return { ok: false, message: '' }
  const invalid = validate(src)
  if (invalid) return { ok: false, message: invalid }

  const confirmOpts = {
    type: 'warning' as const,
    buttons: ['가져오고 다시 시작', '취소'],
    defaultId: 1,
    cancelId: 1,
    title: '데이터 가져오기',
    message: '지금 데이터를 이 파일로 바꿀까요?',
    detail: `지금 데이터는 자동으로 백업해 둬요.\n${backupDir()}\n\n가져온 뒤 마실을 다시 시작해요.`
  }
  const answer = win ? await dialog.showMessageBox(win, confirmOpts) : await dialog.showMessageBox(confirmOpts)
  if (answer.response !== 0) return { ok: false, message: '' }

  mkdirSync(backupDir(), { recursive: true })
  await db.backup(join(backupDir(), `before-import-${stamp()}.sqlite`))
  pruneAutoBackups()

  // 가져온 파일에는 키가 없으므로 지금 쓰던 키를 옮겨 둔다 (같은 PC에서만 복호화된다)
  const keyRow = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(API_KEY) as { value: string } | undefined

  const target = dbPath()
  closeDb()
  for (const suffix of ['-wal', '-shm']) {
    if (existsSync(target + suffix)) rmSync(target + suffix, { force: true })
  }
  copyFileSync(src, target)
  const next = new Database(target)
  try {
    next.prepare(`DELETE FROM settings WHERE key = ?`).run(API_KEY)
    if (keyRow) next.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)`).run(API_KEY, keyRow.value)
  } finally {
    next.close()
  }
  app.relaunch()
  app.exit(0)
  return { ok: true, message: '' }
}
