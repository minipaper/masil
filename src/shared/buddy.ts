import { parseBlogId } from './blog-id'

/** 이웃 관리 화면에서 읽은 링크 하나 */
export interface BuddyLink {
  href: string
  text: string
}

export interface BuddyCandidate {
  blogId: string
  name: string
}

/** 블로그 홈 주소(/{id} 또는 /PostList.naver?blogId={id})면 그 ID. 글 주소나 관리 메뉴는 null */
export function blogHomeId(href: string): string | null {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return null
  }
  if (url.hostname !== 'blog.naver.com' && url.hostname !== 'm.blog.naver.com') return null
  const segments = url.pathname.split('/').filter(Boolean)
  if (segments.length !== 1) return null
  const raw = /^PostList\.naver$/i.test(segments[0]) ? url.searchParams.get('blogId') : segments[0].includes('.') ? null : segments[0]
  return raw ? parseBlogId(raw) : null
}

/**
 * 이웃 관리 화면의 링크 중 블로그 주소만 골라 이웃 후보로 만든다.
 * 내 블로그, 같은 ID 중복, 블로그 홈이 아닌 링크(글, 관리 메뉴)는 뺀다.
 */
export function extractBuddies(links: BuddyLink[], myBlogId: string | null): BuddyCandidate[] {
  const seen = new Map<string, BuddyCandidate>()
  for (const link of links) {
    const blogId = blogHomeId(link.href)
    if (!blogId || blogId === myBlogId) continue
    const name = link.text.replace(/\s+/g, ' ').trim()
    const prev = seen.get(blogId)
    // 같은 ID의 링크가 여럿이면 글자가 있는 쪽(별명)을 쓴다
    if (!prev || (!prev.name && name)) seen.set(blogId, { blogId, name })
  }
  return [...seen.values()]
}
