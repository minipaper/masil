import { join } from 'node:path'
import { BrowserWindow, WebContentsView, session, shell } from 'electron'
import { NAVER_PARTITION } from '@shared/policy'
import type { NaverNav } from '@shared/ipc'
import type { NaverViewState, Rect } from '@shared/types'

const LOGIN_URL = 'https://nid.naver.com/nidlogin.login?mode=form&url=https%3A%2F%2Fblog.naver.com%2F'
const HOME_URL = 'https://blog.naver.com/'

function isNaverHost(url: string): boolean {
  try {
    const h = new URL(url).hostname
    return h === 'naver.com' || h.endsWith('.naver.com')
  } catch {
    return false
  }
}

/**
 * 가운데 블로그 패널. 앱 창 위에 WebContentsView로 붙이고,
 * 위치와 크기는 renderer가 가운데 영역의 좌표를 보내 맞춘다.
 * 로그인은 사용자가 이 화면에서 직접 하고, 세션은 persist:naver에 남는다.
 */
export class NaverView {
  readonly view: WebContentsView
  private hasContent = false
  private hiddenByApp = false
  private bounds: Rect | null = null
  private loggedIn = false

  constructor(
    private readonly win: BrowserWindow,
    private readonly emit: (s: NaverViewState) => void,
    private readonly onNavigate: (url: string) => void
  ) {
    this.view = new WebContentsView({
      webPreferences: {
        partition: NAVER_PARTITION,
        preload: join(__dirname, '../preload/naver.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        // 본문과 댓글이 mainFrame iframe 안에 있어서 하위 프레임에도 preload를 넣는다
        nodeIntegrationInSubFrames: true
      }
    })
    this.view.setBackgroundColor('#ffffff')
    this.view.setVisible(false)
    win.contentView.addChildView(this.view)

    const wc = this.view.webContents
    wc.setWindowOpenHandler(({ url }) => {
      if (isNaverHost(url)) void wc.loadURL(url)
      else if (/^https?:\/\//.test(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
    const push = (): void => this.pushState()
    wc.on('did-start-loading', push)
    wc.on('did-stop-loading', push)
    wc.on('page-title-updated', push)
    wc.on('did-navigate-in-page', (_e, url, isMainFrame) => {
      if (isMainFrame) this.onNavigate(url)
      push()
    })
    wc.on('did-navigate', (_e, url) => {
      this.onNavigate(url)
      void this.refreshLogin().then(push)
    })

    void this.refreshLogin()
  }

  get webContents(): Electron.WebContents {
    return this.view.webContents
  }

  load(url: string): void {
    this.hasContent = true
    this.applyVisibility()
    void this.view.webContents.loadURL(url)
  }

  nav(action: NaverNav): void {
    const wc = this.view.webContents
    switch (action) {
      case 'back':
        if (wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack()
        break
      case 'forward':
        if (wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward()
        break
      case 'reload':
        wc.reload()
        break
      case 'login':
        this.load(LOGIN_URL)
        break
      case 'home':
        this.load(HOME_URL)
        break
    }
  }

  setBounds(rect: Rect): void {
    this.bounds = {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.max(0, Math.round(rect.width)),
      height: Math.max(0, Math.round(rect.height))
    }
    this.view.setBounds(this.bounds)
    this.applyVisibility()
  }

  /** 앱 화면의 모달(설정 등)이 열려 있으면 웹뷰를 잠시 숨긴다. WebContentsView는 항상 DOM 위에 그려지기 때문. */
  setHidden(hidden: boolean): void {
    this.hiddenByApp = hidden
    this.applyVisibility()
  }

  state(): NaverViewState {
    const wc = this.view.webContents
    return {
      visible: this.isVisible(),
      url: wc.getURL(),
      title: wc.getTitle(),
      loading: wc.isLoading(),
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
      loggedIn: this.loggedIn
    }
  }

  /** 로그인 여부는 세션 쿠키 존재로만 판단한다. 쿠키 값이나 비밀번호는 읽지 않는다. */
  private async refreshLogin(): Promise<void> {
    const cookies = await session.fromPartition(NAVER_PARTITION).cookies.get({ name: 'NID_AUT' })
    this.loggedIn = cookies.length > 0
  }

  private isVisible(): boolean {
    return this.hasContent && !this.hiddenByApp && this.bounds !== null && this.bounds.width > 0
  }

  private applyVisibility(): void {
    this.view.setVisible(this.isVisible())
    this.pushState()
  }

  private pushState(): void {
    if (!this.win.isDestroyed()) this.emit(this.state())
  }
}
