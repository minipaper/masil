/**
 * 이웃 이름 정하기 (docs/DECISIONS.md "이웃 메모").
 * 이름: 내가 고친 이름 → 네이버 닉네임(글을 열 때 읽음) → 블로그 제목
 * 부를 때: 호칭이 있으면 호칭, 없으면 이름
 */
export interface NameParts {
  /** 처음에는 블로그 제목. 내가 고치면 nicknameCustom이 켜진다 */
  nickname: string
  nicknameCustom: boolean
  naverNick: string | null
}

export function baseName(n: NameParts): string {
  if (n.nicknameCustom && n.nickname.trim()) return n.nickname.trim()
  return n.naverNick?.trim() || n.nickname.trim()
}

export function shownName(n: NameParts & { honorific: string }): string {
  return n.honorific.trim() || baseName(n)
}

/** SQL에서 같은 규칙으로 이름을 고른다 (alias는 neighbors 테이블 별칭) */
export const NAME_SQL = (alias: string): string =>
  `CASE WHEN ${alias}.nickname_custom = 1 THEN ${alias}.nickname ELSE COALESCE(NULLIF(TRIM(${alias}.naver_nick), ''), ${alias}.nickname) END`

/** 명단 검색: 호칭, 이름, 닉네임, 블로그 제목, ID, 메모 어디에든 들어 있으면 */
export function matchesNeighbor(
  n: NameParts & { honorific: string; blogId: string; blogTitle: string | null; memo: string },
  query: string
): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const hay = [n.honorific, n.nickname, n.naverNick ?? '', n.blogTitle ?? '', n.blogId, n.memo].join('\n').toLowerCase()
  return words.every((w) => hay.includes(w))
}
