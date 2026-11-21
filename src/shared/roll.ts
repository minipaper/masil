import type { Post } from './types'

/** 출석부("오늘 새 글") 목록 (docs/DECISIONS.md "출석부 정리") */
export type RollFilter = 'all' | 'pending' | 'visits' | 'done'
export type RollSort = 'visits-first' | 'newest' | 'oldest'

export const ROLL_FILTERS: { id: RollFilter; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'pending', label: '남은 글' },
  { id: 'visits', label: '답방' },
  { id: 'done', label: '다녀옴' }
]

export const ROLL_SORTS: { id: RollSort; label: string }[] = [
  { id: 'visits-first', label: '답방 먼저' },
  { id: 'newest', label: '최신순' },
  { id: 'oldest', label: '오래된순' }
]

export interface RollRow {
  post: Post
  /** 같은 이웃의 글 중 가려 둔 예전 글 수 */
  more: number
}

export const isPending = (p: Post): boolean => p.status === 'new' || p.status === 'read'

/** 이웃마다 가장 최근 글 하나만 남긴다. 하루에 글을 수십 편 올리는 이웃이 목록을 덮지 않게 한다 */
export function latestPerNeighbor(posts: Post[]): RollRow[] {
  const byBlog = new Map<string, RollRow>()
  for (const p of posts) {
    const cur = byBlog.get(p.blogId)
    if (!cur) byBlog.set(p.blogId, { post: p, more: 0 })
    else if (p.publishedAt > cur.post.publishedAt) byBlog.set(p.blogId, { post: p, more: cur.more + 1 })
    else cur.more++
  }
  return [...byBlog.values()]
}

function matches(p: Post, filter: RollFilter, visits: ReadonlySet<string>): boolean {
  switch (filter) {
    case 'pending':
      return isPending(p)
    case 'visits':
      return visits.has(p.blogId)
    case 'done':
      return !isPending(p)
    default:
      return true
  }
}

/** 출석부에 보여 줄 줄: 이웃마다 최근 글 하나, 거른 뒤 정렬 */
export function rollRows(posts: Post[], filter: RollFilter, sort: RollSort, visits: ReadonlySet<string> = new Set()): RollRow[] {
  const rows = latestPerNeighbor(posts).filter((r) => matches(r.post, filter, visits))
  const newest = (a: RollRow, b: RollRow): number => b.post.publishedAt.localeCompare(a.post.publishedAt)
  const first = (r: RollRow): number => Number(isPending(r.post) && visits.has(r.post.blogId))
  if (sort === 'oldest') return rows.sort((a, b) => -newest(a, b))
  if (sort === 'newest') return rows.sort(newest)
  return rows.sort((a, b) => first(b) - first(a) || newest(a, b))
}

/** 필터마다 줄 수 */
export function rollCounts(posts: Post[], visits: ReadonlySet<string> = new Set()): Record<RollFilter, number> {
  const rows = latestPerNeighbor(posts)
  const count = (f: RollFilter): number => rows.filter((r) => matches(r.post, f, visits)).length
  return { all: rows.length, pending: count('pending'), visits: count('visits'), done: count('done') }
}
