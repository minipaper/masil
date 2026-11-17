import { ipcMain } from 'electron'
import { parseBlogId } from '@shared/blog-id'
import { IPC, type NaverNav } from '@shared/ipc'
import type { AddNeighborResult, NeighborPatch, Rect, Settings } from '@shared/types'
import type { DB } from './db'
import type { NaverView } from './naver-view'
import * as repo from './repo'
import { registerNeighbor, type RssChecker } from './rss-checker'
import { getSettings, updateSettings } from './settings'

interface Ctx {
  db: DB
  checker: RssChecker
  naver: () => NaverView | null
  /** 이웃·글 목록이 바뀌었음을 renderer에 알린다 */
  dataChanged: () => void
  openPost: (postId: number) => void
  onSettingsChanged: (s: Settings) => void
}

const REASON_TEXT: Record<'duplicate' | 'not-found' | 'network', string> = {
  duplicate: '이미 등록한 이웃이에요.',
  'not-found': '블로그를 찾지 못했어요. ID나 주소를 확인해 주세요.',
  network: '네이버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.'
}

export function registerIpc(ctx: Ctx): void {
  const { db } = ctx

  ipcMain.handle(IPC.neighborsList, () => repo.listNeighbors(db))

  ipcMain.handle(IPC.neighborsAdd, async (_e, input: string): Promise<AddNeighborResult> => {
    const blogId = parseBlogId(String(input ?? ''))
    if (!blogId) return { ok: false, reason: 'invalid', message: '블로그 ID나 주소를 알아보지 못했어요.' }
    const res = await registerNeighbor(db, blogId)
    if (!res.ok) return { ok: false, reason: res.reason, message: REASON_TEXT[res.reason] }
    ctx.dataChanged()
    const neighbor = repo.getNeighbor(db, res.id)
    return neighbor ? { ok: true, neighbor } : { ok: false, reason: 'network', message: REASON_TEXT.network }
  })

  ipcMain.handle(IPC.neighborsUpdate, (_e, id: number, patch: NeighborPatch) => {
    repo.updateNeighbor(db, id, patch)
    ctx.dataChanged()
    return repo.getNeighbor(db, id)
  })

  ipcMain.handle(IPC.neighborsRemove, (_e, id: number) => {
    repo.deleteNeighbor(db, id)
    ctx.dataChanged()
  })

  ipcMain.handle(IPC.postsList, () => repo.listRollPosts(db))

  ipcMain.handle(IPC.postsOpen, (_e, id: number) => ctx.openPost(id))

  ipcMain.handle(IPC.postsSkip, (_e, id: number) => {
    const post = repo.applyPostEvent(db, id, 'skip')
    ctx.dataChanged()
    return post
  })

  ipcMain.handle(
    IPC.postsNextPending,
    (_e, excludeId?: number) => repo.listPendingOldestFirst(db).find((p) => p.id !== excludeId) ?? null
  )

  ipcMain.handle(IPC.checkNow, () => void ctx.checker.checkAll())
  ipcMain.handle(IPC.checkStatus, () => ctx.checker.getStatus())

  ipcMain.handle(IPC.settingsGet, () => getSettings(db))
  ipcMain.handle(IPC.settingsSet, (_e, patch: Partial<Settings>) => {
    const next = updateSettings(db, patch)
    ctx.onSettingsChanged(next)
    return next
  })

  ipcMain.on(IPC.naverSetBounds, (_e, rect: Rect) => ctx.naver()?.setBounds(rect))
  ipcMain.on(IPC.naverSetHidden, (_e, hidden: boolean) => ctx.naver()?.setHidden(Boolean(hidden)))
  ipcMain.on(IPC.naverNav, (_e, action: NaverNav) => ctx.naver()?.nav(action))
  ipcMain.handle(IPC.naverState, () => ctx.naver()?.state() ?? null)
}
