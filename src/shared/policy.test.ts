import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CHECK_INTERVAL_MINUTES,
  MIN_CHECK_INTERVAL_MINUTES,
  REQUEST_DELAY_MS,
  clampCheckInterval,
  pickRequestDelay
} from './policy'
import { toChromeUserAgent } from './user-agent'

describe('확인 주기 정책', () => {
  it('10분 미만은 10분으로 올린다', () => {
    expect(clampCheckInterval(1)).toBe(MIN_CHECK_INTERVAL_MINUTES)
    expect(clampCheckInterval(0)).toBe(MIN_CHECK_INTERVAL_MINUTES)
    expect(clampCheckInterval(-5)).toBe(MIN_CHECK_INTERVAL_MINUTES)
  })
  it('숫자가 아니면 기본값', () => {
    expect(clampCheckInterval(Number.NaN)).toBe(DEFAULT_CHECK_INTERVAL_MINUTES)
  })
  it('정상 값은 그대로', () => {
    expect(clampCheckInterval(45)).toBe(45)
  })
})

describe('요청 지연', () => {
  it('항상 3~6초 사이', () => {
    expect(pickRequestDelay(() => 0)).toBe(REQUEST_DELAY_MS.min)
    expect(pickRequestDelay(() => 0.999999)).toBeLessThanOrEqual(REQUEST_DELAY_MS.max)
    expect(pickRequestDelay(() => 0.5)).toBe(4500)
  })
})

describe('User-Agent', () => {
  it('Electron과 앱 토큰을 지운다', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) masil/0.1.0 Chrome/142.0.7444.59 Electron/45.3.3 Safari/537.36'
    expect(toChromeUserAgent(ua)).toBe(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.7444.59 Safari/537.36'
    )
  })
})
