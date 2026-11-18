import { describe, expect, it } from 'vitest'
import { currentDraft, formatElapsed, progressText } from './progress'

describe('초안 진행 상태', () => {
  it('스트리밍 앞부분에서 쓰고 있는 초안 번호를 센다', () => {
    expect(currentDraft('', 2)).toBe(1)
    expect(currentDraft('{"drafts":[{"tone":"다정한 공감","te', 2)).toBe(1)
    expect(currentDraft('{"drafts":[{"tone":"다정한 공감","text":"하늘님', 2)).toBe(1)
    expect(currentDraft('{"drafts":[{"tone":"a","text":"x"},{"tone":"b", "text" : "y', 2)).toBe(2)
  })
  it('초안 수를 넘지 않는다 (모델이 더 써도)', () => {
    expect(currentDraft('"text":1 "text":2 "text":3', 2)).toBe(2)
  })
  it('걸린 시간을 초와 분으로 쓴다', () => {
    expect(formatElapsed(0)).toBe('0초')
    expect(formatElapsed(12_900)).toBe('12초')
    expect(formatElapsed(65_000)).toBe('1분 5초')
    expect(formatElapsed(-5)).toBe('0초')
  })
  it('단계마다 문구와 경과 시간을 보여 준다', () => {
    const base = { startedAt: 1_000, current: 1, total: 2 }
    expect(progressText({ ...base, phase: 'reading' }, 4_000)).toBe('본문을 읽는 중 · 3초')
    expect(progressText({ ...base, phase: 'writing', current: 2 }, 9_500)).toBe('초안 2/2 쓰는 중 · 8초')
    expect(progressText({ ...base, phase: 'writing', total: 1 }, 2_000)).toBe('초안 쓰는 중 · 1초')
    expect(progressText({ ...base, phase: 'retrying' }, 12_000)).toBe('상투적 표현이 있어 다시 쓰는 중 · 11초')
  })
})
