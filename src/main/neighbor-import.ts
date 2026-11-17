import { ipcMain, type WebContents } from 'electron'
import { extractBuddies, type BuddyLink } from '@shared/buddy'
import { NAVER_FRAME, type BuddyScanResult } from '@shared/naver-frame'
import type { BuddyScan, ImportProgress } from '@shared/types'
import type { DB } from './db'
import * as repo from './repo'
import { registerNeighbor } from './rss-checker'
import { getSettings } from './settings'

/** 이웃 관리 화면 (로그인 필요) */
export const buddyPageUrl = (myBlogId: string): string =>
  `https://admin.blog.naver.com/BuddyListManage.naver?blogId=${encodeURIComponent(myBlogId)}`

const SCAN_WAIT_MS = 1500

/**
 * 이웃 가져오기 (docs/DECISIONS.md "범위").
 * - 읽기: 사용자가 버튼을 누를 때만, 웹뷰에 지금 보이는 화면의 블로그 링크를 읽는다. 앱이 쪽을 넘기거나 요청을 보내지 않는다.
 * - 등록: 고른 이웃의 RSS를 공통 요청 큐로 하나씩 확인한다 (3~6초 간격).
 */
export class NeighborImport {
  private pending = new Map<string, BuddyScanResult[]>()
  private progress: ImportProgress = { running: false, done: 0, total: 0, added: 0, skipped: 0, failed: [] }
  private cancelled = false

  constructor(
    private readonly db: DB,
    private readonly naver: () => WebContents | null,
    private readonly onProgress: (p: ImportProgress) => void,
    private readonly onAdded: () => void
  ) {
    ipcMain.on(NAVER_FRAME.buddies, (e, r: BuddyScanResult) => {
      if (e.sender !== this.naver() || !r?.requestId) return
      this.pending.get(r.requestId)?.push(r)
    })
  }

  async scan(): Promise<BuddyScan> {
    const wc = this.naver()
    if (!wc) return { candidates: [], inList: false, url: '' }
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const results: BuddyScanResult[] = []
    this.pending.set(requestId, results)
    for (const frame of wc.mainFrame.framesInSubtree) {
      try {
        frame.send(NAVER_FRAME.scanBuddies, { requestId })
      } catch {
        // 사라진 프레임은 건너뛴다
      }
    }
    await new Promise((r) => setTimeout(r, SCAN_WAIT_MS))
    this.pending.delete(requestId)

    // 이웃 목록 영역을 찾은 프레임이 있으면 그 결과만 쓴다
    const listed = results.filter((r) => r.inList && r.links.length > 0)
    const use = listed.length > 0 ? listed : results
    const links: BuddyLink[] = use.flatMap((r) => r.links)
    const myBlogId = getSettings(this.db).myBlogId
    const candidates = extractBuddies(links, myBlogId).map((c) => ({
      ...c,
      registered: repo.findNeighborByBlogId(this.db, c.blogId) !== null
    }))
    return { candidates, inList: listed.length > 0, url: wc.getURL() }
  }

  status(): ImportProgress {
    return this.progress
  }

  private emit(patch: Partial<ImportProgress>): void {
    this.progress = { ...this.progress, ...patch }
    this.onProgress(this.progress)
  }

  async run(blogIds: string[]): Promise<void> {
    if (this.progress.running) return
    const ids = [...new Set(blogIds)]
    this.cancelled = false
    this.emit({ running: true, done: 0, total: ids.length, added: 0, skipped: 0, failed: [] })
    for (const id of ids) {
      if (this.cancelled) break
      const res = await registerNeighbor(this.db, id)
      if (res.ok) {
        this.emit({ added: this.progress.added + 1 })
        this.onAdded()
      } else if (res.reason === 'duplicate') {
        this.emit({ skipped: this.progress.skipped + 1 })
      } else {
        this.emit({ failed: [...this.progress.failed, id] })
      }
      this.emit({ done: this.progress.done + 1 })
    }
    this.emit({ running: false })
  }

  cancel(): void {
    this.cancelled = true
  }
}
