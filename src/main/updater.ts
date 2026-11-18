import { app, dialog, type BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateStatus } from '@shared/types'

/** 앱을 켤 때, 6시간마다, 트레이에서 창을 다시 열 때 확인한다 (docs/DECISIONS.md "배포") */
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000
const FIRST_CHECK_DELAY_MS = 15_000
/** 창을 다시 열 때는 마지막 확인에서 이만큼 지났을 때만 확인한다 */
const RECHECK_ON_SHOW_MS = 30 * 60 * 1000

/**
 * GitHub Releases에서 업데이트를 받는다. 받기는 백그라운드에서 하고,
 * 다시 시작할지는 사용자에게 묻는다. 미루면 앱을 종료할 때 설치된다.
 */
export class Updater {
  private status: UpdateStatus = { kind: 'idle' }
  private asked = false
  private timer: NodeJS.Timeout | null = null
  private lastCheckAt = 0

  constructor(
    private readonly window: () => BrowserWindow | null,
    private readonly beforeRestart: () => void,
    private readonly onStatus: (s: UpdateStatus) => void
  ) {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    // 로그에 업데이트 서버 응답 전체를 남기지 않는다
    autoUpdater.logger = null

    autoUpdater.on('checking-for-update', () => this.set({ kind: 'checking' }))
    autoUpdater.on('update-not-available', () => this.set({ kind: 'none' }))
    autoUpdater.on('update-available', (info) => this.set({ kind: 'downloading', version: info.version }))
    autoUpdater.on('update-downloaded', (info) => {
      this.set({ kind: 'ready', version: info.version })
      void this.askRestart(info.version)
    })
    autoUpdater.on('error', (e) => this.set({ kind: 'error', message: e instanceof Error ? e.message.split('\n')[0] : '업데이트 확인 실패' }))
  }

  start(): void {
    if (!app.isPackaged) {
      this.set({ kind: 'dev' })
      return
    }
    setTimeout(() => void this.check(), FIRST_CHECK_DELAY_MS)
    this.timer = setInterval(() => void this.check(), CHECK_EVERY_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
  }

  /** 트레이에서 창을 다시 열 때: 최근에 확인했으면 넘어간다 */
  checkIfStale(): void {
    if (!app.isPackaged || this.lastCheckAt === 0) return // 켤 때 확인은 start()가 한다
    if (Date.now() - this.lastCheckAt >= RECHECK_ON_SHOW_MS) void this.check()
  }

  /** 받아 둔 새 버전으로 다시 시작 (상단 바 버튼) */
  restartNow(): void {
    if (this.status.kind !== 'ready') return
    this.beforeRestart()
    autoUpdater.quitAndInstall()
  }

  getStatus(): UpdateStatus {
    return this.status
  }

  async check(): Promise<UpdateStatus> {
    if (!app.isPackaged) return this.status
    if (this.status.kind === 'checking' || this.status.kind === 'downloading' || this.status.kind === 'ready') return this.status
    this.lastCheckAt = Date.now()
    try {
      await autoUpdater.checkForUpdates()
    } catch {
      // error 이벤트에서 상태를 남긴다
    }
    return this.status
  }

  private set(s: UpdateStatus): void {
    this.status = s
    this.onStatus(s)
  }

  private async askRestart(version: string): Promise<void> {
    if (this.asked) return
    this.asked = true
    const opts = {
      type: 'info' as const,
      buttons: ['지금 다시 시작', '나중에'],
      defaultId: 0,
      cancelId: 1,
      title: '마실 업데이트',
      message: `새 버전 ${version}을 받아 두었어요.`,
      detail: '다시 시작하면 바로 적용돼요. 나중에 하면 마실을 종료할 때 설치돼요.'
    }
    const win = this.window()
    const res = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts)
    if (res.response === 0) this.restartNow()
  }
}
