import { describe, expect, it } from 'vitest'
import { daysSince, formatClock, formatLastComment, formatPostTime, formatRollDate } from './format'

const now = new Date(2026, 10, 17, 14, 20) // 2026-11-17(화) 14:20 로컬

describe('날짜 표시', () => {
  it('출석부 날짜', () => expect(formatRollDate(now)).toBe('11월 17일 화요일'))

  it('오늘, 어제, 그 전', () => {
    expect(formatPostTime(new Date(2026, 10, 17, 9, 12).toISOString(), now)).toBe('오늘 9:12')
    expect(formatPostTime(new Date(2026, 10, 16, 23, 5).toISOString(), now)).toBe('어제 23:05')
    expect(formatPostTime(new Date(2026, 10, 15, 8, 0).toISOString(), now)).toBe('11월 15일')
    expect(formatPostTime(new Date(2025, 11, 3).toISOString(), now)).toBe('2025년 12월 3일')
  })

  it('시계', () => {
    expect(formatClock(new Date(2026, 10, 17, 14, 20).toISOString())).toBe('오후 2:20')
    expect(formatClock(new Date(2026, 10, 17, 0, 5).toISOString())).toBe('오전 12:05')
  })

  it('경과 일수와 마지막 댓글', () => {
    expect(daysSince(new Date(2026, 9, 14).toISOString(), now)).toBe(34)
    expect(formatLastComment(null, now)).toBe('아직 댓글 없음')
    expect(formatLastComment(new Date(2026, 10, 17, 1).toISOString(), now)).toBe('오늘 댓글 남김')
    expect(formatLastComment(new Date(2026, 10, 5).toISOString(), now)).toBe('마지막 댓글 12일 전')
  })
})
