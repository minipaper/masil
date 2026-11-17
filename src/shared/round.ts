import type { Post } from './types'

/** 마실 모드 한 바퀴 (docs/DECISIONS.md "마실 모드") */
export interface RoundStats {
  /** 이번 바퀴에서 연 글 */
  visited: number
  commented: number
  skipped: number
  liked: number
}

const since = (iso: string | null, start: string): boolean => iso !== null && iso >= start

/** startedAt 이후에 처리한 글을 센다. 시각은 모두 ISO 문자열이라 문자열 비교로 충분하다. */
export function summarizeRound(posts: Post[], startedAt: string): RoundStats {
  const stats: RoundStats = { visited: 0, commented: 0, skipped: 0, liked: 0 }
  for (const p of posts) {
    const touched = since(p.openedAt, startedAt) || since(p.actedAt, startedAt)
    if (!touched) continue
    stats.visited++
    if (p.status === 'commented' && since(p.actedAt, startedAt)) stats.commented++
    if (p.status === 'skipped' && since(p.actedAt, startedAt)) stats.skipped++
    if (p.liked) stats.liked++
  }
  return stats
}

/** 마실 모드 단축키. 입력 중이거나 조합키가 있으면 null */
export type RoundKey = 'next' | 'skip' | 'fill1' | 'fill2' | 'fill3'

export function roundKey(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }, typing: boolean): RoundKey | null {
  if (typing || e.ctrlKey || e.metaKey || e.altKey) return null
  switch (e.key) {
    case 'ArrowRight':
      return 'next'
    case 's':
    case 'S':
    case 'ㄴ': // 한글 자판 상태의 S
      return 'skip'
    case '1':
      return 'fill1'
    case '2':
      return 'fill2'
    case '3':
      return 'fill3'
    default:
      return null
  }
}

/**
 * 마실 중 다음에 열 글: 처리 전(새 글·읽음) 글 중 가장 오래된 것, 이번 바퀴에 이미 들른 글은 뺀다.
 * 댓글 없이 넘긴 글은 "읽음"으로 남아 있으므로 빼지 않으면 같은 글을 계속 다시 연다.
 */
export function pickNextInRound(posts: Post[], visited: readonly number[]): Post | null {
  const seen = new Set(visited)
  const candidates = posts.filter((p) => (p.status === 'new' || p.status === 'read') && !seen.has(p.id))
  candidates.sort((a, b) => a.publishedAt.localeCompare(b.publishedAt))
  return candidates[0] ?? null
}
