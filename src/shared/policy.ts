/**
 * 마실의 절대 원칙 중 코드로 강제하는 값들. (CLAUDE.md "절대 원칙" 참고)
 * 이 값을 완화하는 변경은 하지 않는다.
 */

/** RSS 확인 주기 하한(분). 설정 UI와 스케줄러 모두 이 값 미만을 거부한다. */
export const MIN_CHECK_INTERVAL_MINUTES = 10

/** RSS 확인 주기 기본값(분). */
export const DEFAULT_CHECK_INTERVAL_MINUTES = 30

/** 이웃 RSS 요청 사이 랜덤 지연(ms). 요청은 항상 하나씩 순차로 보낸다. */
export const REQUEST_DELAY_MS = { min: 3000, max: 6000 } as const

/** 네이버 로그인 세션을 유지하는 persist 파티션. 비밀번호는 앱이 절대 다루지 않는다. */
export const NAVER_PARTITION = 'persist:naver'

/** 확인 주기 입력값을 정책 범위로 고정한다. */
export function clampCheckInterval(minutes: number): number {
  if (!Number.isFinite(minutes)) return DEFAULT_CHECK_INTERVAL_MINUTES
  return Math.max(MIN_CHECK_INTERVAL_MINUTES, Math.round(minutes))
}

/** 요청 사이 지연값을 하나 뽑는다. */
export function pickRequestDelay(random: () => number = Math.random): number {
  const { min, max } = REQUEST_DELAY_MS
  return Math.round(min + random() * (max - min))
}
