import type { PostStatus } from './types'

export type PostEvent = 'open' | 'skip' | 'comment'

/**
 * 글 상태 전이. 새 글 → 읽음 → 댓글 남김 | 건너뜀.
 * - 댓글은 어느 상태에서든 "댓글 남김"으로 확정한다.
 * - 이미 댓글을 남긴 글은 건너뛰거나 다시 열어도 그대로다.
 * - 건너뛴 글을 다시 열면 "읽음"으로 돌아간다.
 */
export function nextStatus(current: PostStatus, event: PostEvent): PostStatus {
  if (current === 'commented') return 'commented'
  switch (event) {
    case 'comment':
      return 'commented'
    case 'skip':
      return 'skipped'
    case 'open':
      return 'read'
  }
}

/** 마실 모드에서 아직 들러야 하는 글인가 */
export function isPending(status: PostStatus): boolean {
  return status === 'new' || status === 'read'
}
