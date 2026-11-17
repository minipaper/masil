import { ipcMain } from 'electron'
import { parseBlogId } from '@shared/blog-id'
import { IPC, type NaverNav } from '@shared/ipc'
import type { BrowserWindow } from 'electron'
import type { AddNeighborResult, NeighborPatch, Rect, Settings } from '@shared/types'
import { exportData, importData } from './backup'
import { buddyPageUrl, type NeighborImport } from './neighbor-import'
import type { StyleService } from './style'
import type { DB } from './db'
import { describeAiError, testConnection } from './ai'
import type { NaverView } from './naver-view'
import type { PostSession } from './post-session'
import * as repo from './repo'
import { registerNeighbor, type RssChecker } from './rss-checker'
import { getApiKey, getSettings, setApiKey, updateSettings } from './settings'

interface Ctx {
  db: DB
  checker: RssChecker
  naver: () => NaverView | null
  postSession: () => PostSession | null
  /** 이웃·글 목록이 바뀌었음을 renderer에 알린다 */
  dataChanged: () => void
  openPost: (postId: number) => void
  onSettingsChanged: (s: Settings) => void
  style: StyleService
  importer: NeighborImport
  window: () => BrowserWindow | null
  /** 웹뷰에서 "내 블로그"를 열어 ID를 알아낸다 */
  findMyBlog: () => void
}

const REASON_TEXT: Record<'duplicate' | 'not-found' | 'network' | 'self', string> = {
  self: '내 블로그는 이웃으로 등록하지 않아도 돼요.',
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

  // ── 초안과 댓글 ──
  ipcMain.handle(IPC.currentPost, () => ctx.postSession()?.currentPost() ?? null)
  ipcMain.handle(IPC.draftsState, () => ctx.postSession()?.draftsState() ?? null)
  ipcMain.handle(IPC.draftsGenerate, () => ctx.postSession()?.generate())
  ipcMain.handle(IPC.draftsFill, (_e, text: string, tone: string) =>
    ctx.postSession()?.fill(String(text ?? ''), String(tone ?? '')) ?? { ok: false, message: '열린 글이 없어요.' }
  )
  ipcMain.handle(IPC.commentsForBlog, (_e, blogId: string) => repo.listCommentsForBlog(db, String(blogId)))

  // ── AI 설정: 키는 저장만 하고 renderer로 돌려주지 않는다 ──
  ipcMain.handle(IPC.aiSetKey, (_e, key: string | null) => {
    try {
      setApiKey(db, key)
      const s = getSettings(db)
      ctx.onSettingsChanged(s)
      return { ok: true, settings: s }
    } catch (e) {
      return { ok: false, message: describeAiError(e), settings: getSettings(db) }
    }
  })
  ipcMain.handle(IPC.aiTest, () => testConnection(getSettings(db).ai, getApiKey(db)))

  // ── 문체 가이드 ──
  ipcMain.handle(IPC.styleState, () => ctx.style.state())
  ipcMain.handle(IPC.styleRefresh, () => ctx.style.propose())
  ipcMain.handle(IPC.styleApprove, (_e, id: number) => ctx.style.approve(Number(id)))
  ipcMain.handle(IPC.styleReject, (_e, id: number) => ctx.style.reject(Number(id)))
  ipcMain.handle(IPC.styleSave, (_e, content: string) => ctx.style.saveManual(String(content ?? '')))

  // ── 이웃 가져오기 ──
  ipcMain.handle(IPC.importOpenPage, () => {
    const myBlogId = getSettings(db).myBlogId
    if (!myBlogId) return { ok: false, message: '먼저 내 블로그를 찾아 주세요.' }
    ctx.naver()?.load(buddyPageUrl(myBlogId))
    return { ok: true, message: '' }
  })
  ipcMain.handle(IPC.importScan, () => ctx.importer.scan())
  ipcMain.handle(IPC.importRun, (_e, ids: string[]) => {
    const valid = (Array.isArray(ids) ? ids : []).map((id) => parseBlogId(String(id))).filter((id): id is string => !!id)
    void ctx.importer.run(valid)
  })
  ipcMain.handle(IPC.importCancel, () => ctx.importer.cancel())
  ipcMain.handle(IPC.importStatus, () => ctx.importer.status())
  ipcMain.handle(IPC.findMyBlog, () => ctx.findMyBlog())

  // ── 백업 ──
  ipcMain.handle(IPC.dataExport, () => exportData(db, ctx.window()))
  ipcMain.handle(IPC.dataImport, () => importData(db, ctx.window()))
}
