import { Menu, Tray, nativeImage } from 'electron'
import { resourcePath } from './paths'

interface TrayActions {
  show: () => void
  checkNow: () => void
  quit: () => void
}

export function createTray(actions: TrayActions): Tray {
  const icon = nativeImage.createFromPath(resourcePath(process.platform === 'win32' ? 'tray.png' : 'tray-16.png'))
  const tray = new Tray(icon)
  tray.setToolTip('마실')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '마실 열기', click: actions.show },
      { label: '지금 새 글 확인', click: actions.checkNow },
      { type: 'separator' },
      { label: '종료', click: actions.quit }
    ])
  )
  tray.on('click', actions.show)
  return tray
}

/** 트레이 툴팁에 남은 새 글 수를 보여준다 */
export function setTrayPending(tray: Tray, pending: number): void {
  tray.setToolTip(pending > 0 ? `마실: 들를 글 ${pending}개` : '마실')
}
