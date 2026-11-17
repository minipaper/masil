import type { RssItem } from '@shared/rss'
import type { StyleGuide } from '@shared/style'
import { nextStatus, type PostEvent } from '@shared/post-state'
import type { Closeness, CommentRecord, DraftItem, Neighbor, NeighborPatch, Post, PostStatus, Speech } from '@shared/types'
import type { DB } from './db'

const now = (): string => new Date().toISOString()

// ───────── 이웃 ─────────

interface NeighborRow {
  id: number
  blog_id: string
  nickname: string
  blog_title: string | null
  honorific: string
  speech: Speech
  closeness: Closeness
  memo: string
  created_at: string
  last_checked_at: string | null
  last_attempt_at: string | null
  fail_count: number
  etag: string | null
  last_modified: string | null
  last_comment_at: string | null
  pending_count: number
}

const NEIGHBOR_SELECT = `
  SELECT n.*,
    (SELECT MAX(c.clicked_at) FROM comments c WHERE c.blog_id = n.blog_id AND c.status != 'failed') AS last_comment_at,
    (SELECT COUNT(*) FROM posts p WHERE p.neighbor_id = n.id AND p.status IN ('new','read')) AS pending_count
  FROM neighbors n`

function toNeighbor(r: NeighborRow): Neighbor {
  return {
    id: r.id,
    blogId: r.blog_id,
    nickname: r.nickname,
    blogTitle: r.blog_title,
    honorific: r.honorific,
    speech: r.speech,
    closeness: r.closeness,
    memo: r.memo,
    createdAt: r.created_at,
    lastCheckedAt: r.last_checked_at,
    failCount: r.fail_count,
    lastCommentAt: r.last_comment_at,
    pendingCount: r.pending_count
  }
}

export function listNeighbors(db: DB): Neighbor[] {
  return (db.prepare(`${NEIGHBOR_SELECT} ORDER BY n.nickname COLLATE NOCASE`).all() as NeighborRow[]).map(toNeighbor)
}

export function getNeighbor(db: DB, id: number): Neighbor | null {
  const row = db.prepare(`${NEIGHBOR_SELECT} WHERE n.id = ?`).get(id) as NeighborRow | undefined
  return row ? toNeighbor(row) : null
}

export function findNeighborByBlogId(db: DB, blogId: string): Neighbor | null {
  const row = db.prepare(`${NEIGHBOR_SELECT} WHERE n.blog_id = ?`).get(blogId) as NeighborRow | undefined
  return row ? toNeighbor(row) : null
}

/** RSS 확인에 필요한 내부 필드까지 */
export interface NeighborFetchInfo {
  id: number
  blogId: string
  name: string
  lastAttemptAt: string | null
  failCount: number
  etag: string | null
  lastModified: string | null
}

export function listNeighborsForCheck(db: DB): NeighborFetchInfo[] {
  const rows = db
    .prepare(
      `SELECT id, blog_id, nickname, honorific, last_attempt_at, fail_count, etag, last_modified FROM neighbors ORDER BY COALESCE(last_checked_at, '') ASC`
    )
    .all() as (Pick<NeighborRow, 'id' | 'blog_id' | 'nickname' | 'honorific' | 'last_attempt_at' | 'fail_count' | 'etag' | 'last_modified'>)[]
  return rows.map((r) => ({
    id: r.id,
    blogId: r.blog_id,
    name: r.honorific || r.nickname,
    lastAttemptAt: r.last_attempt_at,
    failCount: r.fail_count,
    etag: r.etag,
    lastModified: r.last_modified
  }))
}

export function insertNeighbor(db: DB, blogId: string, blogTitle: string): number {
  const nickname = blogTitle.trim() || blogId
  const info = db
    .prepare(`INSERT INTO neighbors (blog_id, nickname, blog_title, created_at) VALUES (?, ?, ?, ?)`)
    .run(blogId, nickname, blogTitle || null, now())
  return Number(info.lastInsertRowid)
}

export function updateNeighbor(db: DB, id: number, patch: NeighborPatch): void {
  const cols: string[] = []
  const vals: unknown[] = []
  if (patch.nickname !== undefined) (cols.push('nickname = ?'), vals.push(patch.nickname.trim() || '이름 없음'))
  if (patch.honorific !== undefined) (cols.push('honorific = ?'), vals.push(patch.honorific.trim()))
  if (patch.speech !== undefined) (cols.push('speech = ?'), vals.push(patch.speech === 'casual' ? 'casual' : 'polite'))
  if (patch.closeness !== undefined) (cols.push('closeness = ?'), vals.push(Math.min(3, Math.max(1, Math.round(patch.closeness)))))
  if (patch.memo !== undefined) (cols.push('memo = ?'), vals.push(patch.memo))
  if (cols.length === 0) return
  db.prepare(`UPDATE neighbors SET ${cols.join(', ')} WHERE id = ?`).run(...vals, id)
}

export function deleteNeighbor(db: DB, id: number): void {
  db.prepare(`DELETE FROM neighbors WHERE id = ?`).run(id)
}

export function recordFetchSuccess(
  db: DB,
  id: number,
  meta: { blogTitle?: string; etag: string | null; lastModified: string | null }
): void {
  const t = now()
  db.prepare(
    `UPDATE neighbors SET last_checked_at = ?, last_attempt_at = ?, fail_count = 0, etag = ?, last_modified = ?,
       blog_title = COALESCE(?, blog_title) WHERE id = ?`
  ).run(t, t, meta.etag, meta.lastModified, meta.blogTitle || null, id)
}

export function recordFetchFailure(db: DB, id: number): void {
  db.prepare(`UPDATE neighbors SET last_attempt_at = ?, fail_count = fail_count + 1 WHERE id = ?`).run(now(), id)
}

// ───────── 글 ─────────

interface PostRow {
  id: number
  neighbor_id: number
  blog_id: string
  neighbor_name: string
  log_no: string
  title: string
  url: string
  category: string | null
  tags: string
  excerpt: string
  published_at: string
  discovered_at: string
  status: PostStatus
  liked: number
  opened_at: string | null
  acted_at: string | null
}

const POST_SELECT = `
  SELECT p.*, n.blog_id AS blog_id,
    CASE WHEN n.honorific != '' THEN n.honorific ELSE n.nickname END AS neighbor_name
  FROM posts p JOIN neighbors n ON n.id = p.neighbor_id`

function toPost(r: PostRow): Post {
  let tags: string[] = []
  try {
    tags = JSON.parse(r.tags) as string[]
  } catch {
    tags = []
  }
  return {
    id: r.id,
    neighborId: r.neighbor_id,
    blogId: r.blog_id,
    neighborName: r.neighbor_name,
    logNo: r.log_no,
    title: r.title,
    url: r.url,
    category: r.category,
    tags,
    excerpt: r.excerpt,
    publishedAt: r.published_at,
    discoveredAt: r.discovered_at,
    status: r.status,
    liked: r.liked === 1,
    openedAt: r.opened_at,
    actedAt: r.acted_at
  }
}

/**
 * 출석부에 보여줄 글: 아직 들러야 하는 글 전부 + 최근 3일 안에 처리한 글.
 * 최신 글이 위로.
 */
export function listRollPosts(db: DB): Post[] {
  const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
  return (
    db
      .prepare(
        `${POST_SELECT}
         WHERE p.status IN ('new','read') OR (p.status IN ('commented','skipped') AND COALESCE(p.acted_at, p.discovered_at) >= ?)
         ORDER BY p.published_at DESC LIMIT 300`
      )
      .all(since) as PostRow[]
  ).map(toPost)
}

/** 마실 모드 순서: 들러야 하는 글을 오래된 순으로 */
export function listPendingOldestFirst(db: DB): Post[] {
  return (db.prepare(`${POST_SELECT} WHERE p.status IN ('new','read') ORDER BY p.published_at ASC`).all() as PostRow[]).map(toPost)
}

export function getPost(db: DB, id: number): Post | null {
  const row = db.prepare(`${POST_SELECT} WHERE p.id = ?`).get(id) as PostRow | undefined
  return row ? toPost(row) : null
}

/**
 * RSS 항목을 저장한다. 이미 있는 글은 건드리지 않는다.
 * initial=true(이웃 처음 등록)면 모두 'old'로 넣는다.
 * 새로 들어간 글 수를 돌려준다.
 */
export function upsertRssItems(db: DB, neighborId: number, items: RssItem[], initial: boolean): Post[] {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO posts (neighbor_id, log_no, title, url, category, tags, excerpt, published_at, discovered_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const t = now()
  const inserted: number[] = []
  db.transaction(() => {
    for (const it of items) {
      const info = insert.run(
        neighborId,
        it.logNo,
        it.title,
        it.url,
        it.category,
        JSON.stringify(it.tags),
        it.excerpt,
        it.publishedAt,
        t,
        initial ? 'old' : 'new'
      )
      if (info.changes > 0) inserted.push(Number(info.lastInsertRowid))
    }
  })()
  if (initial || inserted.length === 0) return []
  return inserted.map((id) => getPost(db, id)).filter((p): p is Post => p !== null)
}

export function applyPostEvent(db: DB, id: number, event: PostEvent): Post | null {
  const post = getPost(db, id)
  if (!post) return null
  const status = nextStatus(post.status, event)
  const t = now()
  if (event === 'open') {
    db.prepare(`UPDATE posts SET status = ?, opened_at = COALESCE(opened_at, ?) WHERE id = ?`).run(status, t, id)
  } else {
    db.prepare(`UPDATE posts SET status = ?, acted_at = ? WHERE id = ?`).run(status, t, id)
  }
  return getPost(db, id)
}

export function findPostByLogNo(db: DB, blogId: string, logNo: string): Post | null {
  const row = db.prepare(`${POST_SELECT} WHERE n.blog_id = ? AND p.log_no = ?`).get(blogId, logNo) as PostRow | undefined
  return row ? toPost(row) : null
}

// ───────── 설정 (key-value JSON) ─────────

export function readSetting<T>(db: DB, key: string): T | undefined {
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as { value: string } | undefined
  if (!row) return undefined
  try {
    return JSON.parse(row.value) as T
  } catch {
    return undefined
  }
}

export function writeSetting(db: DB, key: string, value: unknown): void {
  db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(
    key,
    JSON.stringify(value)
  )
}

export function setPostLiked(db: DB, blogId: string, logNo: string, liked: boolean): boolean {
  const info = db
    .prepare(`UPDATE posts SET liked = ? WHERE log_no = ? AND neighbor_id = (SELECT id FROM neighbors WHERE blog_id = ?)`)
    .run(liked ? 1 : 0, logNo, blogId)
  return info.changes > 0
}

// ───────── 초안 ─────────

export function saveDraftBatch(
  db: DB,
  blogId: string,
  logNo: string,
  model: string,
  drafts: { tone: string; text: string }[]
): DraftItem[] {
  const batchId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const t = now()
  const insert = db.prepare(
    `INSERT INTO drafts (blog_id, log_no, batch_id, tone, text, model, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
  const items: DraftItem[] = []
  db.transaction(() => {
    for (const d of drafts) {
      const info = insert.run(blogId, logNo, batchId, d.tone, d.text, model, t)
      items.push({ id: Number(info.lastInsertRowid), tone: d.tone, text: d.text })
    }
  })()
  return items
}

/** 그 글의 가장 최근 초안 묶음 */
export function latestDrafts(db: DB, blogId: string, logNo: string): DraftItem[] {
  const last = db
    .prepare(`SELECT batch_id FROM drafts WHERE blog_id = ? AND log_no = ? ORDER BY id DESC LIMIT 1`)
    .get(blogId, logNo) as { batch_id: string } | undefined
  if (!last) return []
  return db
    .prepare(`SELECT id, tone, text FROM drafts WHERE batch_id = ? ORDER BY id ASC`)
    .all(last.batch_id) as DraftItem[]
}

// ───────── 내가 등록한 댓글 ─────────

interface CommentRow {
  id: number
  blog_id: string
  log_no: string
  post_title: string
  text: string
  draft_text: string | null
  draft_tone: string | null
  is_secret: number
  status: CommentRecord['status']
  clicked_at: string
  confirmed_at: string | null
}

function toComment(r: CommentRow): CommentRecord {
  return {
    id: r.id,
    blogId: r.blog_id,
    logNo: r.log_no,
    postTitle: r.post_title,
    text: r.text,
    draftText: r.draft_text,
    draftTone: r.draft_tone,
    isSecret: r.is_secret === 1,
    status: r.status,
    clickedAt: r.clicked_at,
    confirmedAt: r.confirmed_at
  }
}

/** 등록 클릭 순간의 입력칸 내용을 "최종본 후보"로 저장 */
export function insertPendingComment(
  db: DB,
  c: { blogId: string; logNo: string; postTitle: string; text: string; secret: boolean; draft: { text: string; tone: string } | null }
): number {
  const info = db
    .prepare(
      `INSERT INTO comments (blog_id, log_no, post_title, text, draft_text, draft_tone, is_secret, status, clicked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
    )
    .run(c.blogId, c.logNo, c.postTitle, c.text, c.draft?.text ?? null, c.draft?.tone ?? null, c.secret ? 1 : 0, now())
  return Number(info.lastInsertRowid)
}

/** 댓글 목록에 나타났는지에 따라 확정. 같은 글의 같은 내용 중 가장 최근 pending 하나를 고친다. */
export function resolvePendingComment(db: DB, blogId: string, logNo: string, text: string, confirmed: boolean): CommentRecord | null {
  const row = db
    .prepare(
      `SELECT * FROM comments WHERE blog_id = ? AND log_no = ? AND text = ? AND status = 'pending' ORDER BY id DESC LIMIT 1`
    )
    .get(blogId, logNo, text) as CommentRow | undefined
  if (!row) return null
  db.prepare(`UPDATE comments SET status = ?, confirmed_at = ? WHERE id = ?`).run(
    confirmed ? 'confirmed' : 'failed',
    confirmed ? now() : null,
    row.id
  )
  return toComment({ ...row, status: confirmed ? 'confirmed' : 'failed' })
}

export function listCommentsForBlog(db: DB, blogId: string, limit = 30): CommentRecord[] {
  return (
    db
      .prepare(`SELECT * FROM comments WHERE blog_id = ? AND status != 'failed' ORDER BY clicked_at DESC LIMIT ?`)
      .all(blogId, limit) as CommentRow[]
  ).map(toComment)
}

/** 프롬프트 예시: 최근 확정된 최종본 (다른 이웃 포함) */
export function recentFinals(db: DB, limit: number, excludeBlogId?: string): string[] {
  if (limit <= 0) return []
  return (
    db
      .prepare(
        `SELECT text FROM comments WHERE status = 'confirmed' AND blog_id != ? ORDER BY clicked_at DESC LIMIT ?`
      )
      .all(excludeBlogId ?? '', limit) as { text: string }[]
  ).map((r) => r.text)
}

/** 프롬프트 예시: 이 이웃에게 쓴 확정 댓글 */
export function neighborFinals(db: DB, blogId: string, limit: number): { postTitle: string; text: string }[] {
  if (limit <= 0) return []
  return db
    .prepare(
      `SELECT post_title AS postTitle, text FROM comments WHERE status = 'confirmed' AND blog_id = ? ORDER BY clicked_at DESC LIMIT ?`
    )
    .all(blogId, limit) as { postTitle: string; text: string }[]
}

/** 프롬프트 예시: AI 초안 → 내가 고친 최종본 (실제로 고친 것만) */
export function draftFinalPairs(db: DB, limit: number): { draft: string; final: string }[] {
  if (limit <= 0) return []
  return db
    .prepare(
      `SELECT draft_text AS draft, text AS final FROM comments
       WHERE status = 'confirmed' AND draft_text IS NOT NULL AND draft_text != text
       ORDER BY clicked_at DESC LIMIT ?`
    )
    .all(limit) as { draft: string; final: string }[]
}

export function activeStyleGuide(db: DB): string | null {
  const row = db.prepare(`SELECT content FROM style_guides WHERE status = 'active' ORDER BY id DESC LIMIT 1`).get() as
    | { content: string }
    | undefined
  return row?.content ?? null
}

// ───────── 문체 가이드 ─────────

interface StyleRow {
  id: number
  content: string
  source: StyleGuide['source']
  status: StyleGuide['status']
  based_on_count: number
  created_at: string
}

const toGuide = (r: StyleRow): StyleGuide => ({
  id: r.id,
  content: r.content,
  source: r.source,
  status: r.status,
  basedOnCount: r.based_on_count,
  createdAt: r.created_at
})

export function countConfirmedComments(db: DB): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM comments WHERE status = 'confirmed'`).get() as { n: number }).n
}

function guideWithStatus(db: DB, status: StyleGuide['status']): StyleGuide | null {
  const row = db.prepare(`SELECT * FROM style_guides WHERE status = ? ORDER BY id DESC LIMIT 1`).get(status) as
    | StyleRow
    | undefined
  return row ? toGuide(row) : null
}

export const activeGuide = (db: DB): StyleGuide | null => guideWithStatus(db, 'active')
export const proposedGuide = (db: DB): StyleGuide | null => guideWithStatus(db, 'proposed')

/** 마지막 AI 개정안이 몇 개의 최종본을 보고 만들어졌는지 (승인·거절 무관) */
export function lastAiBasedOn(db: DB): number {
  const row = db.prepare(`SELECT MAX(based_on_count) AS n FROM style_guides WHERE source = 'ai'`).get() as {
    n: number | null
  }
  return row.n ?? 0
}

/** 새 개정안. 이전에 보류 중이던 개정안은 거절로 돌린다. */
export function insertProposal(db: DB, content: string, basedOn: number): StyleGuide {
  return db.transaction(() => {
    db.prepare(`UPDATE style_guides SET status = 'rejected' WHERE status = 'proposed'`).run()
    const info = db
      .prepare(
        `INSERT INTO style_guides (content, source, status, based_on_count, created_at) VALUES (?, 'ai', 'proposed', ?, ?)`
      )
      .run(content, basedOn, now())
    return guideWithStatus(db, 'proposed') ?? toGuide({
      id: Number(info.lastInsertRowid),
      content,
      source: 'ai',
      status: 'proposed',
      based_on_count: basedOn,
      created_at: now()
    })
  })()
}

export function approveProposal(db: DB, id: number): boolean {
  return db.transaction(() => {
    const row = db.prepare(`SELECT id FROM style_guides WHERE id = ? AND status = 'proposed'`).get(id)
    if (!row) return false
    db.prepare(`UPDATE style_guides SET status = 'archived' WHERE status = 'active'`).run()
    db.prepare(`UPDATE style_guides SET status = 'active' WHERE id = ?`).run(id)
    return true
  })()
}

export function rejectProposal(db: DB, id: number): void {
  db.prepare(`UPDATE style_guides SET status = 'rejected' WHERE id = ? AND status = 'proposed'`).run(id)
}

/** 직접 고친 가이드를 바로 적용한다. 빈 글이면 가이드를 끈다. */
export function saveManualGuide(db: DB, content: string): void {
  db.transaction(() => {
    db.prepare(`UPDATE style_guides SET status = 'archived' WHERE status = 'active'`).run()
    const text = content.trim()
    if (text) {
      db.prepare(
        `INSERT INTO style_guides (content, source, status, based_on_count, created_at) VALUES (?, 'manual', 'active', ?, ?)`
      ).run(text, countConfirmedComments(db), now())
    }
  })()
}
