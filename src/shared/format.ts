const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** "오후 2:20" */
export function formatClock(iso: string): string {
  const d = new Date(iso)
  const h = d.getHours()
  const ampm = h < 12 ? '오전' : '오후'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${ampm} ${h12}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 출석부 행의 시각: "오늘 9:12", "어제 23:05", "11월 15일", 해가 다르면 "2025년 12월 3일" */
export function formatPostTime(iso: string, now = new Date()): string {
  const d = new Date(iso)
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000)
  const hm = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
  if (diffDays === 0) return `오늘 ${hm}`
  if (diffDays === 1) return `어제 ${hm}`
  if (d.getFullYear() !== now.getFullYear()) return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`
  return `${d.getMonth() + 1}월 ${d.getDate()}일`
}

/** "11월 17일 화요일" */
export function formatRollDate(now = new Date()): string {
  return `${now.getMonth() + 1}월 ${now.getDate()}일 ${WEEKDAYS[now.getDay()]}요일`
}

/** 날짜 기준 경과 일수 (오늘=0) */
export function daysSince(iso: string, now = new Date()): number {
  return Math.round((startOfDay(now) - startOfDay(new Date(iso))) / 86_400_000)
}

/** "마지막 댓글 12일 전" 같은 문구 */
export function formatLastComment(iso: string | null, now = new Date()): string {
  if (!iso) return '아직 댓글 없음'
  const days = daysSince(iso, now)
  if (days <= 0) return '오늘 댓글 남김'
  if (days === 1) return '어제 댓글 남김'
  return `마지막 댓글 ${days}일 전`
}
