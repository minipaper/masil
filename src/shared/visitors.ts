/**
 * 답방 (docs/DECISIONS.md "답방").
 * 내 글에 댓글을 단 사람 중, 그 뒤로 내가 아직 그 사람 블로그에 댓글을 남기지 않은 사람을 "답방할 집"으로 본다.
 */

/** 답방 표시를 유지하는 기간(일) */
export const RETURN_VISIT_DAYS = 30
/** "답방 갈 곳 찾아보기"에서 여는 내 최신 글 수 (설정 기본값, 범위) */
export const REPLY_CHECK_POSTS = { min: 1, max: 10, default: 3 } as const

/** 내 글에 달린 댓글 하나 (웹뷰에서 읽음) */
export interface VisitorComment {
  commentNo: string
  logNo: string
  blogId: string
  nick: string
  /** ISO 시각 */
  at: string
  text: string
}

export interface CommentInfo {
  commentNo: string
  mine: boolean
  deleted: boolean
  secret: boolean
  /** 1이면 원댓글, 2 이상이면 답글 */
  replyLevel: number
  regTime: string
}

/**
 * 네이버 댓글 li의 data-info 속성을 읽는다 (확인: 2026-11-17).
 * 예: "commentNo:'9107…',deleted:false,…,mine:false,…,replyLevel:1,…,regTime:'2026-11-17T16:03:37+0900'"
 */
export function parseCommentInfo(raw: string | null | undefined): CommentInfo | null {
  if (!raw) return null
  const get = (key: string): string | null => {
    const m = raw.match(new RegExp(`(?:^|,)\\s*${key}\\s*:\\s*('([^']*)'|[^,]*)`))
    if (!m) return null
    return m[2] ?? m[1]?.trim() ?? null
  }
  const commentNo = get('commentNo')
  if (!commentNo || !/^\d+$/.test(commentNo)) return null
  return {
    commentNo,
    mine: get('mine') === 'true',
    deleted: get('deleted') === 'true',
    secret: get('secret') === 'true',
    replyLevel: Number(get('replyLevel') ?? '1') || 1,
    regTime: get('regTime') ?? ''
  }
}

/** "2026-11-17T16:03:37+0900" 같은 시각을 표준 ISO(UTC)로. 못 읽으면 null */
export function toIso(t: string): string | null {
  const fixed = t.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')
  const d = new Date(fixed)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export interface ReturnVisit {
  blogId: string
  nick: string
  /** 가장 최근에 내 글에 댓글 단 시각 */
  lastAt: string
  /** 그 댓글이 달린 내 글 */
  logNo: string
  postTitle: string
  /** 최근 RETURN_VISIT_DAYS일 안에 내 글에 단 댓글 수 */
  count: number
  /** 그 사람의 가장 최근 댓글 뒤로 내가 그 블로그에 댓글을 남긴 시각 (답방 완료). 아직이면 null */
  visitedAt: string | null
}

/**
 * 답방 목록을 만든다.
 * - 최근 RETURN_VISIT_DAYS일 안에 내 글에 댓글을 단 사람은 모두 넣는다.
 * - 그 사람의 가장 최근 댓글 뒤로 내가 그 블로그에 댓글을 남겼으면 "답방 완료"(visitedAt). 목록에서 빼지 않는다 (2026-11-21).
 * 답방할 집(아직)을 먼저, 그 안에서는 최근에 댓글 단 순서로.
 */
export function pickReturnVisits(
  visitors: (VisitorComment & { postTitle: string })[],
  myComments: { blogId: string; at: string }[],
  myBlogId: string | null,
  now: Date = new Date(),
  days: number = RETURN_VISIT_DAYS
): ReturnVisit[] {
  const since = new Date(now.getTime() - days * 86_400_000).toISOString()
  const lastMine = new Map<string, string>()
  for (const c of myComments) {
    const prev = lastMine.get(c.blogId)
    if (!prev || c.at > prev) lastMine.set(c.blogId, c.at)
  }
  const byBlog = new Map<string, ReturnVisit>()
  for (const v of visitors) {
    if (!v.blogId || v.blogId === myBlogId || v.at < since) continue
    const cur = byBlog.get(v.blogId)
    if (!cur) {
      byBlog.set(v.blogId, { blogId: v.blogId, nick: v.nick, lastAt: v.at, logNo: v.logNo, postTitle: v.postTitle, count: 1, visitedAt: null })
    } else {
      cur.count++
      if (v.at > cur.lastAt) Object.assign(cur, { lastAt: v.at, nick: v.nick || cur.nick, logNo: v.logNo, postTitle: v.postTitle })
    }
  }
  for (const r of byBlog.values()) {
    const mine = lastMine.get(r.blogId)
    r.visitedAt = mine && mine >= r.lastAt ? mine : null
  }
  return [...byBlog.values()].sort((a, b) => Number(a.visitedAt !== null) - Number(b.visitedAt !== null) || b.lastAt.localeCompare(a.lastAt))
}
