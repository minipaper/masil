import type { WebFrameMain } from 'electron'
import { postUrl } from '@shared/blog-id'
import { NAVER_FRAME, type CommentsReport, type ScanCommentsRequest } from '@shared/naver-frame'
import type { ReturnVisitItem, VisitScanStatus } from '@shared/types'
import { RETURN_VISIT_DAYS, pickReturnVisits } from '@shared/visitors'
import type { DB } from './db'
import { enqueueNaverRequest, fetchRss } from './naver-request'
import type { NaverView } from './naver-view'
import * as repo from './repo'
import { getSettings } from './settings'

const LAST_SCAN_KEY = 'visit.lastScanAt'
/** 글 하나를 열고 댓글을 받기까지 기다리는 시간 */
const POST_TIMEOUT_MS = 25_000

/**
 * "답방 갈 곳 찾아보기" (docs/DECISIONS.md "답방").
 * 사용자가 버튼을 눌렀을 때만, 내 최신 글 몇 편을 웹뷰로 차례로 열어 댓글 단 사람을 읽는다.
 * - 글 목록은 내 블로그 RSS 한 번으로 알아낸다.
 * - 글을 여는 것도 네이버 요청 큐를 거쳐 하나씩, 사이에 3~6초를 둔다 (원칙 2).
 * - 접힌 댓글 영역의 토글만 누른다 (원칙 1의 허용 버튼).
 */
export class VisitorScan {
  private status: VisitScanStatus
  private waiters = new Map<string, (r: CommentsReport) => void>()
  private cancelled = false

  constructor(
    private readonly db: DB,
    private readonly naver: () => NaverView | null,
    private readonly events: { status: (s: VisitScanStatus) => void; dataChanged: () => void }
  ) {
    this.status = { running: false, done: 0, total: 0, found: 0, lastAt: repo.readSetting<string>(db, LAST_SCAN_KEY) ?? null, message: null }
  }

  getStatus(): VisitScanStatus {
    return this.status
  }

  private set(patch: Partial<VisitScanStatus>): void {
    this.status = { ...this.status, ...patch }
    this.events.status(this.status)
  }

  cancel(): void {
    this.cancelled = true
  }

  /** PostSession이 받은 댓글 보고 중 이 스캔이 기다리는 것이면 넘겨받는다 */
  handleReport(r: CommentsReport): void {
    if (r.requestId) this.waiters.get(r.requestId)?.(r)
  }

  async run(): Promise<void> {
    if (this.status.running) return
    const settings = getSettings(this.db)
    const myBlogId = settings.myBlogId
    if (!myBlogId) return this.set({ message: '설정의 "내 블로그"에서 블로그 ID를 먼저 찾아 주세요.' })
    const view = this.naver()
    if (!view) return this.set({ message: '웹뷰가 아직 준비되지 않았어요.' })

    this.cancelled = false
    this.set({ running: true, done: 0, total: 0, found: 0, message: '내 블로그 글 목록을 읽는 중' })
    let items
    try {
      const res = await fetchRss(myBlogId, { etag: null, lastModified: null })
      items = res.kind === 'ok' ? res.feed.items : []
    } catch {
      return this.set({ running: false, message: '내 블로그 글 목록을 가져오지 못했어요. 인터넷 연결을 확인해 주세요.' })
    }
    const posts = [...items].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, settings.replyCheckPosts)
    if (posts.length === 0) {
      return this.set({ running: false, message: '내 블로그에 아직 글이 없어요. 글을 올리면 그 글에 댓글 단 분들을 찾을 수 있어요.' })
    }

    this.set({ total: posts.length, message: null })
    let found = 0
    let failed = 0
    for (const p of posts) {
      if (this.cancelled) break
      const report = await enqueueNaverRequest(() => this.scanOne(view, myBlogId, p.logNo))
      if (report?.state === 'comments') {
        found += repo.upsertVisitorComments(this.db, report.comments.map((c) => ({ ...c, postTitle: report.title || p.title })))
        this.events.dataChanged()
      } else if (!report) {
        failed++
      }
      this.set({ done: this.status.done + 1, found })
    }

    const lastAt = new Date().toISOString()
    repo.writeSetting(this.db, LAST_SCAN_KEY, lastAt)
    const tail = failed > 0 ? ` ${failed}편은 읽지 못했어요.` : ''
    const head = this.cancelled ? '중간에 멈췄어요.' : found > 0 ? `새 댓글 ${found}개를 찾았어요.` : '새로 달린 댓글이 없어요.'
    this.set({ running: false, lastAt, message: head + tail })
  }

  /** 내 글 하나를 웹뷰로 열고, 글 화면이 뜨면 댓글을 읽어 달라고 한다 */
  private scanOne(view: NaverView, myBlogId: string, logNo: string): Promise<CommentsReport | null> {
    view.load(postUrl(myBlogId, logNo))
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const req: ScanCommentsRequest = { requestId, logNo, open: true }
    return new Promise((resolve) => {
      const done = (r: CommentsReport | null): void => {
        clearTimeout(timer)
        clearInterval(tick)
        this.waiters.delete(requestId)
        resolve(r)
      }
      const timer = setTimeout(() => done(null), POST_TIMEOUT_MS)
      // 글 프레임이 언제 뜰지 몰라 몇 번 보낸다. preload는 한 번만 답한다.
      const tick = setInterval(() => {
        for (const f of view.webContents.mainFrame.framesInSubtree as WebFrameMain[]) {
          try {
            f.send(NAVER_FRAME.scanComments, req)
          } catch {
            // 사라진 프레임
          }
        }
      }, 1500)
      this.waiters.set(requestId, done)
    })
  }

  /** 답방할 집: 최근 내 글에 댓글을 달았는데 아직 답방하지 않은 사람 */
  returnVisits(): ReturnVisitItem[] {
    const since = new Date(Date.now() - RETURN_VISIT_DAYS * 86_400_000).toISOString()
    const { visitors, myComments } = repo.returnVisitInputs(this.db, since)
    const myBlogId = getSettings(this.db).myBlogId
    return pickReturnVisits(visitors, myComments, myBlogId).map((r) => {
      const n = repo.findNeighborByBlogId(this.db, r.blogId)
      return { ...r, neighborId: n?.id ?? null, name: n ? n.honorific || n.name : r.nick || r.blogId }
    })
  }
}
