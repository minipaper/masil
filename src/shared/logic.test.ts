import { describe, expect, it } from 'vitest'
import { parseBlogId, parsePostRef } from './blog-id'
import { isPending, nextStatus } from './post-state'
import { isQuietTime, shouldBackOff, summarizeNewPosts } from './schedule'

describe('parseBlogId', () => {
  it.each([
    ['springrain', 'springrain'],
    ['  SpringRain ', 'springrain'],
    ['blog.naver.com/springrain', 'springrain'],
    ['https://blog.naver.com/springrain', 'springrain'],
    ['https://blog.naver.com/springrain/223614208871', 'springrain'],
    ['https://m.blog.naver.com/springrain/223614208871?referrerCode=0', 'springrain'],
    ['https://blog.naver.com/PostView.naver?blogId=springrain&logNo=223614208871', 'springrain'],
    ['https://rss.blog.naver.com/springrain.xml', 'springrain'],
    ['spring_rain-2', 'spring_rain-2']
  ])('%s → %s', (input, expected) => {
    expect(parseBlogId(input)).toBe(expected)
  })

  it.each(['', '봄비', 'https://example.com/springrain', 'https://blog.naver.com/', 'https://blog.naver.com/PostList.naver', 'a'])(
    '못 알아보는 값: %s',
    (input) => {
      expect(parseBlogId(input)).toBeNull()
    }
  )
})

describe('parsePostRef', () => {
  const ref = { blogId: 'springrain', logNo: '223614208871' }
  it.each([
    'https://blog.naver.com/springrain/223614208871',
    'https://blog.naver.com/springrain/223614208871?fromRss=true',
    'https://m.blog.naver.com/springrain/223614208871',
    'https://blog.naver.com/PostView.naver?blogId=springrain&logNo=223614208871&redirect=Dlog'
  ])('%s', (url) => expect(parsePostRef(url)).toEqual(ref))

  it.each(['https://blog.naver.com/springrain', 'https://section.blog.naver.com/', 'https://nid.naver.com/nidlogin.login', 'not a url'])(
    '글이 아닌 주소: %s',
    (url) => expect(parsePostRef(url)).toBeNull()
  )
})

describe('글 상태 전이', () => {
  it('새 글을 열면 읽음', () => expect(nextStatus('new', 'open')).toBe('read'))
  it('읽은 글을 건너뛰면 건너뜀', () => expect(nextStatus('read', 'skip')).toBe('skipped'))
  it('건너뛴 글을 다시 열면 읽음', () => expect(nextStatus('skipped', 'open')).toBe('read'))
  it('어디서든 댓글이면 댓글 남김', () => {
    expect(nextStatus('new', 'comment')).toBe('commented')
    expect(nextStatus('skipped', 'comment')).toBe('commented')
  })
  it('댓글 남긴 글은 그대로', () => {
    expect(nextStatus('commented', 'open')).toBe('commented')
    expect(nextStatus('commented', 'skip')).toBe('commented')
  })
  it('들러야 하는 글은 새 글과 읽음', () => {
    expect(isPending('new')).toBe(true)
    expect(isPending('read')).toBe(true)
    expect(isPending('skipped')).toBe(false)
    expect(isPending('old')).toBe(false)
  })
})

describe('방해 금지 시간', () => {
  const at = (h: number, m = 0) => new Date(2026, 10, 17, h, m)
  const night = { enabled: true, start: '23:00', end: '08:00' }

  it('자정을 넘는 구간', () => {
    expect(isQuietTime(at(23, 30), night)).toBe(true)
    expect(isQuietTime(at(3), night)).toBe(true)
    expect(isQuietTime(at(8), night)).toBe(false)
    expect(isQuietTime(at(14), night)).toBe(false)
  })
  it('같은 날 구간', () => {
    const lunch = { enabled: true, start: '12:00', end: '13:00' }
    expect(isQuietTime(at(12, 30), lunch)).toBe(true)
    expect(isQuietTime(at(13), lunch)).toBe(false)
  })
  it('꺼져 있으면 항상 false', () => {
    expect(isQuietTime(at(3), { ...night, enabled: false })).toBe(false)
  })
})

describe('실패 백오프', () => {
  const now = new Date('2026-11-17T12:00:00Z')
  it('실패가 없으면 건너뛰지 않는다', () => {
    expect(shouldBackOff(0, '2026-11-17T11:59:00Z', now, 30)).toBe(false)
  })
  it('1회 실패 → 60분 대기', () => {
    expect(shouldBackOff(1, '2026-11-17T11:30:00Z', now, 30)).toBe(true)
    expect(shouldBackOff(1, '2026-11-17T10:59:00Z', now, 30)).toBe(false)
  })
  it('대기는 최대 하루', () => {
    expect(shouldBackOff(10, '2026-11-16T11:59:00Z', now, 30)).toBe(false)
  })
})

describe('새 글 알림 문구', () => {
  it('두 명까지는 이름만', () => {
    expect(summarizeNewPosts(['봄비님', '하늘다람쥐님'])).toEqual({ title: '새 글 2개', body: '봄비님, 하늘다람쥐님' })
  })
  it('세 명부터는 외 N명, 같은 이웃은 한 번만', () => {
    expect(summarizeNewPosts(['봄비님', '봄비님', '하늘다람쥐님', '모과나무집님'])).toEqual({
      title: '새 글 4개',
      body: '봄비님, 하늘다람쥐님 외 1명'
    })
  })
  it('새 글이 없으면 알림 없음', () => {
    expect(summarizeNewPosts([])).toBeNull()
  })
})
