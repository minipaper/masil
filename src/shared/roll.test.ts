import { describe, expect, it } from 'vitest'
import { latestPerNeighbor, rollCounts, rollRows } from './roll'
import type { Post } from './types'

const post = (over: Partial<Post>): Post => ({
  id: 1,
  neighborId: 1,
  blogId: 'springrain',
  neighborName: '봄비',
  logNo: '1',
  title: 't',
  url: 'u',
  category: null,
  tags: [],
  excerpt: '',
  publishedAt: '2026-11-21T00:00:00.000Z',
  discoveredAt: '2026-11-21T00:00:00.000Z',
  status: 'new',
  liked: false,
  openedAt: null,
  actedAt: null,
  ...over
})

const posts = [
  post({ id: 1, publishedAt: '2026-11-21T01:00:00.000Z' }),
  post({ id: 2, publishedAt: '2026-11-21T03:00:00.000Z' }),
  post({ id: 3, publishedAt: '2026-11-21T02:00:00.000Z' }),
  post({ id: 4, blogId: 'sunny', neighborName: '햇살', publishedAt: '2026-11-20T09:00:00.000Z', status: 'commented' }),
  post({ id: 5, blogId: 'cloud', neighborName: '구름', publishedAt: '2026-11-19T09:00:00.000Z' })
]

describe('출석부 정리', () => {
  it('이웃마다 가장 최근 글 하나만, 가린 글 수와 함께', () => {
    const rows = latestPerNeighbor(posts)
    expect(rows.map((r) => [r.post.id, r.more])).toEqual([
      [2, 2],
      [4, 0],
      [5, 0]
    ])
  })

  it('최신순과 오래된순', () => {
    expect(rollRows(posts, 'all', 'newest').map((r) => r.post.id)).toEqual([2, 4, 5])
    expect(rollRows(posts, 'all', 'oldest').map((r) => r.post.id)).toEqual([5, 4, 2])
  })

  it('답방 먼저: 답방할 집의 남은 글이 맨 위, 나머지는 최신순', () => {
    expect(rollRows(posts, 'all', 'visits-first', new Set(['cloud'])).map((r) => r.post.id)).toEqual([5, 2, 4])
    // 이미 다녀온 글은 앞으로 올리지 않는다
    expect(rollRows(posts, 'all', 'visits-first', new Set(['sunny'])).map((r) => r.post.id)).toEqual([2, 4, 5])
  })

  it('필터와 줄 수', () => {
    expect(rollRows(posts, 'pending', 'newest').map((r) => r.post.id)).toEqual([2, 5])
    expect(rollRows(posts, 'done', 'newest').map((r) => r.post.id)).toEqual([4])
    expect(rollRows(posts, 'visits', 'newest', new Set(['cloud'])).map((r) => r.post.id)).toEqual([5])
    expect(rollCounts(posts, new Set(['cloud']))).toEqual({ all: 3, pending: 2, visits: 1, done: 1 })
  })
})

describe('답방: 모바일 댓글 화면', () => {
  it('댓글이 펼쳐진 모바일 화면 주소', async () => {
    const { mobileCommentsUrl, parsePostRef } = await import('./blog-id')
    const url = mobileCommentsUrl('springrain', '223000000001')
    expect(url).toBe('https://m.blog.naver.com/PostView.naver?blogId=springrain&logNo=223000000001&modal=comment')
    // 웹뷰가 이 화면에서 보낸 보고를 내 글로 알아본다
    expect(parsePostRef(url)).toEqual({ blogId: 'springrain', logNo: '223000000001' })
  })
  it('모바일 프로필 링크에서 블로그 ID', async () => {
    const { blogHomeId } = await import('./buddy')
    expect(blogHomeId('https://m.blog.naver.com/PostList.naver?blogId=sunny&trackingCode=blog_comment')).toBe('sunny')
    expect(blogHomeId('https://blog.naver.com/sunny')).toBe('sunny')
  })
})
