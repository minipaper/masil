import { join } from 'node:path'
import { app, BrowserWindow, session, shell } from 'electron'
import { NAVER_PARTITION } from '@shared/policy'
import { toChromeUserAgent } from '@shared/user-agent'

const isMac = process.platform === 'darwin'
const COVER = '#2E5944' // 공책 표지 초록 (renderer tokens.css와 맞춘다)

let mainWindow: BrowserWindow | null = null

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1200,
    minHeight: 760,
    show: false,
    title: '마실',
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

  win.once('ready-to-show', () => win.show())

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

/** 네이버용 persist 세션: 일반 크롬 UA로 위장(Electron 문자열 제거). */
function prepareNaverSession(): void {
  const naver = session.fromPartition(NAVER_PARTITION)
  naver.setUserAgent(toChromeUserAgent(naver.getUserAgent(), app.getName()))
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  app.whenReady().then(() => {
    if (process.platform === 'win32') app.setAppUserModelId('com.minipaper.masil')
    prepareNaverSession()
    mainWindow = createMainWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createMainWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (!isMac) app.quit()
  })
}
