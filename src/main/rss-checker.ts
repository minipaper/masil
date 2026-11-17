import { shouldBackOff } from '@shared/schedule'
import type { CheckStatus, Post } from '@shared/types'
import type { DB } from './db'
import { fetchRss } from './naver-request'
import * as repo from './repo'
import { getSettings } from './settings'

interface CheckerEvents {
  onStatus: (s: CheckStatus) => void
  /** 확인 한 번이 끝났을 때 새로 들어온 글 (알림은 이걸로 하나만) */
  onNewPosts: (posts: Post[]) => void
}

/**
 * 앱 시작 시 한 번 전체 확인 + 설정한 주기마다 다시 확인.
 * 실제 요청 간격과 순차 실행은 naver-request의 큐가 보장한다.
 */
export class RssChecker {
  private timer: NodeJS.Timeout | null = null
  private status: CheckStatus = { running: false, lastCheckedAt: null, nextCheckAt: null, progress: null, lastError: null }

  constructor(
    private readonly db: DB,
    private readonly events: CheckerEvents
  ) {}

  getStatus(): CheckStatus {
    return this.status
  }

  start(): void {
    void this.checkAll()
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  /** 주기 설정이 바뀌면 다음 확인 시각을 다시 잡는다 */
  reschedule(): void {
    if (this.status.running) return
    this.scheduleNext()
  }

  async checkAll(): Promise<void> {
    if (this.status.running) return
    this.stop()
    const settings = getSettings(this.db)
    const targets = repo.listNeighborsForCheck(this.db)
    const now = new Date()
    const due = targets.filter((n) => !shouldBackOff(n.failCount, n.lastAttemptAt, now, settings.checkIntervalMinutes))

    this.setStatus({ running: true, progress: { done: 0, total: due.length }, lastError: null, nextCheckAt: null })
    const fresh: Post[] = []
    let failures = 0

    for (const [i, n] of due.entries()) {
      try {
        const res = await fetchRss(n.blogId, { etag: n.etag, lastModified: n.lastModified })
        if (res.kind === 'ok') {
          fresh.push(...repo.upsertRssItems(this.db, n.id, res.feed.items, false))
          repo.recordFetchSuccess(this.db, n.id, { blogTitle: res.feed.blogTitle, etag: res.etag, lastModified: res.lastModified })
        } else if (res.kind === 'not-modified') {
          repo.recordFetchSuccess(this.db, n.id, { etag: n.etag, lastModified: n.lastModified })
        } else {
          failures++
          repo.recordFetchFailure(this.db, n.id)
        }
      } catch {
        failures++
        repo.recordFetchFailure(this.db, n.id)
      }
      this.setStatus({ progress: { done: i + 1, total: due.length } })
    }

    this.setStatus({
      running: false,
      progress: null,
      lastCheckedAt: new Date().toISOString(),
      lastError: failures > 0 ? `${failures}곳을 확인하지 못했어요` : null
    })
    this.scheduleNext()
    if (fresh.length > 0) this.events.onNewPosts(fresh)
  }

  private scheduleNext(): void {
    this.stop()
    const minutes = getSettings(this.db).checkIntervalMinutes
    const ms = minutes * 60 * 1000
    this.timer = setTimeout(() => void this.checkAll(), ms)
    this.setStatus({ nextCheckAt: new Date(Date.now() + ms).toISOString() })
  }

  private setStatus(patch: Partial<CheckStatus>): void {
    this.status = { ...this.status, ...patch }
    this.events.onStatus(this.status)
  }
}

/**
 * 이웃을 새로 등록한다. RSS를 한 번 읽어 블로그가 있는지 확인하고,
 * 그때 RSS에 있던 글은 모두 '이미 본 글(old)'로 넣는다.
 */
export async function registerNeighbor(
  db: DB,
  blogId: string
): Promise<{ ok: true; id: number } | { ok: false; reason: 'duplicate' | 'not-found' | 'network' | 'self' }> {
  if (getSettings(db).myBlogId === blogId) return { ok: false, reason: 'self' }
  if (repo.findNeighborByBlogId(db, blogId)) return { ok: false, reason: 'duplicate' }
  let res
  try {
    res = await fetchRss(blogId, { etag: null, lastModified: null })
  } catch {
    return { ok: false, reason: 'network' }
  }
  if (res.kind !== 'ok') return { ok: false, reason: 'not-found' }
  if (repo.findNeighborByBlogId(db, blogId)) return { ok: false, reason: 'duplicate' }

  const id = repo.insertNeighbor(db, blogId, res.feed.blogTitle)
  repo.upsertRssItems(db, id, res.feed.items, true)
  repo.recordFetchSuccess(db, id, { blogTitle: res.feed.blogTitle, etag: res.etag, lastModified: res.lastModified })
  return { ok: true, id }
}
