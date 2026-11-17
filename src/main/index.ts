import { join } from 'node:path'
import { app, BrowserWindow, Notification, session, shell, type Tray } from 'electron'
import { parsePostRef } from '@shared/blog-id'
import { IPC } from '@shared/ipc'
import { NAVER_PARTITION } from '@shared/policy'
import { isQuietTime, summarizeNewPosts } from '@shared/schedule'
import type { Post, Settings } from '@shared/types'
import { toChromeUserAgent } from '@shared/user-agent'
import { closeDb, getDb } from './db'
import { registerIpc } from './ipc'
import { NaverView } from './naver-view'
import { resourcePath } from './paths'
import * as repo from './repo'
import { RssChecker } from './rss-checker'
import { getSettings } from './settings'
import { createTray, setTrayPending } from './tray'

const isMac = process.platform === 'darwin'
const COVER = '#2E5944' // 공책 표지 초록 (renderer tokens.css와 맞춘다)
const START_HIDDEN_FLAG = '--hidden'

let mainWindow: BrowserWindow | null = null
let naverView: NaverView | null = null
let tray: Tray | null = null
let checker: RssChecker | null = null
let quitting = false

function send(channel: string, ...args: unknown[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, ...args)
}

function showWindow(): void {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function createMainWindow(startHidden: boolean): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1200,
    minHeight: 760,
    show: false,
    title: '마실',
    icon: resourcePath('icon.png'),
    backgroundColor: COVER,
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    ...(isMac ? {} : { titleBarOverlay: { color: COVER, symbolColor: '#E7EFE9', height: 52 } }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (!startHidden) win.once('ready-to-show', () => win.show())

  // X 버튼은 트레이로 숨긴다. 완전 종료는 트레이 메뉴 "종료".
  win.on('close', (e) => {
    if (quitting) return
    e.preventDefault()
    win.hide()
  })

  // 앱 화면에서 외부 링크는 기본 브라우저로. 앱 창 자체는 다른 곳으로 이동하지 않는다.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e) => e.preventDefault())

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) {
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

/** 네이버용 persist 세션: 일반 크롬 UA로 바꾼다(Electron 문자열 제거). */
function prepareNaverSession(): void {
  const naver = session.fromPartition(NAVER_PARTITION)
  naver.setUserAgent(toChromeUserAgent(naver.getUserAgent(), app.getName()))
}

function refreshPending(): void {
  if (!tray) return
  setTrayPending(tray, repo.listPendingOldestFirst(getDb()).length)
}

function dataChanged(): void {
  send(IPC.evDataChanged)
  refreshPending()
}

function openPost(postId: number): void {
  const db = getDb()
  const post = repo.getPost(db, postId)
  if (!post || !naverView) return
  naverView.load(post.url)
  repo.applyPostEvent(db, postId, 'open')
  send(IPC.evSelectPost, postId)
  dataChanged()
}

/** 웹뷰에서 사용자가 직접 이웃 글로 이동해도 읽음으로 처리한다 */
function onNaverNavigate(url: string): void {
  const ref = parsePostRef(url)
  if (!ref) return
  const db = getDb()
  const post = repo.findPostByLogNo(db, ref.blogId, ref.logNo)
  if (!post || post.status !== 'new') return
  repo.applyPostEvent(db, post.id, 'open')
  send(IPC.evSelectPost, post.id)
  dataChanged()
}

function notifyNewPosts(posts: Post[]): void {
  dataChanged()
  const settings = getSettings(getDb())
  if (isQuietTime(new Date(), settings.quietHours) || !Notification.isSupported()) return
  const summary = summarizeNewPosts(posts.map((p) => p.neighborName))
  if (!summary) return
  const first = [...posts].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt))[0]
  const n = new Notification({ title: summary.title, body: summary.body, icon: resourcePath('icon-256.png'), silent: false })
  n.on('click', () => {
    showWindow()
    if (first) openPost(first.id)
  })
  n.show()
}

function applyLoginItem(s: Settings): void {
  if (!app.isPackaged) return // 개발 중에는 시작 프로그램에 등록하지 않는다
  app.setLoginItemSettings({ openAtLogin: s.launchAtLogin, args: [START_HIDDEN_FLAG] })
}

// 개발·테스트용: 실제 데이터와 분리된 폴더로 실행 (배포본에서는 무시)
if (!app.isPackaged && process.env['MASIL_USER_DATA']) app.setPath('userData', process.env['MASIL_USER_DATA'])

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', showWindow)

  app.whenReady().then(() => {
    if (process.platform === 'win32') app.setAppUserModelId('com.minipaper.masil')
    const db = getDb()
    prepareNaverSession()

    const startHidden = process.argv.includes(START_HIDDEN_FLAG)
    mainWindow = createMainWindow(startHidden)
    naverView = new NaverView(mainWindow, (s) => send(IPC.evNaverState, s), onNaverNavigate)

    checker = new RssChecker(db, {
      onStatus: (s) => send(IPC.evCheckStatus, s),
      onNewPosts: notifyNewPosts
    })

    registerIpc({
      db,
      checker,
      naver: () => naverView,
      dataChanged,
      openPost,
      onSettingsChanged: (s) => {
        checker?.reschedule()
        applyLoginItem(s)
      }
    })

    tray = createTray({
      show: showWindow,
      checkNow: () => void checker?.checkAll(),
      quit: () => {
        quitting = true
        app.quit()
      }
    })
    refreshPending()
    applyLoginItem(getSettings(db))

    checker.start()

    app.on('activate', showWindow)
  })

  app.on('before-quit', () => {
    quitting = true
    checker?.stop()
  })

  app.on('will-quit', () => closeDb())

  // 창을 닫아도 트레이에 남는다. 종료는 트레이 메뉴로만.
  app.on('window-all-closed', () => undefined)
}
