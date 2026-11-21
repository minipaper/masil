/** 네이버 블로그 ID 규칙: 영문 소문자, 숫자, -, _ */
const BLOG_ID = /^[a-z0-9_-]{2,32}$/

const RESERVED = new Set(['postview', 'postlist', 'prologue', 'blogpeople_home', 'main', 'mylog', 'feedlist'])

/**
 * 사용자가 붙여 넣은 값에서 블로그 ID를 뽑는다.
 * 지원: "springrain", "blog.naver.com/springrain", "https://m.blog.naver.com/springrain/2236...",
 *       "https://blog.naver.com/PostView.naver?blogId=springrain&logNo=..."
 * 못 알아보면 null.
 */
export function parseBlogId(input: string): string | null {
  const raw = input.trim()
  if (!raw) return null

  if (!raw.includes('/') && !raw.includes('.')) {
    const id = raw.replace(/^@/, '').toLowerCase()
    return BLOG_ID.test(id) ? id : null
  }

  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    return null
  }

  const host = url.hostname.toLowerCase()
  if (host !== 'blog.naver.com' && host !== 'm.blog.naver.com' && host !== 'rss.blog.naver.com') return null

  const fromQuery = url.searchParams.get('blogId')
  if (fromQuery) {
    const id = fromQuery.toLowerCase()
    return BLOG_ID.test(id) ? id : null
  }

  const first = url.pathname.split('/').filter(Boolean)[0]?.replace(/\.xml$/i, '').toLowerCase()
  if (!first || first.includes('.') || RESERVED.has(first)) return null
  return BLOG_ID.test(first) ? first : null
}

/**
 * 웹뷰 주소에서 글을 알아본다.
 * "blog.naver.com/{id}/{logNo}", "PostView.naver?blogId=..&logNo=..", 모바일 주소 모두.
 */
export function parsePostRef(input: string): { blogId: string; logNo: string } | null {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase()
  if (host !== 'blog.naver.com' && host !== 'm.blog.naver.com') return null

  const qBlog = url.searchParams.get('blogId')
  const qLog = url.searchParams.get('logNo')
  if (qBlog && qLog && /^\d+$/.test(qLog)) {
    const blogId = parseBlogId(qBlog)
    return blogId ? { blogId, logNo: qLog } : null
  }

  const [first, second] = url.pathname.split('/').filter(Boolean)
  if (!first || !second || !/^\d{6,}$/.test(second)) return null
  const blogId = parseBlogId(first)
  return blogId ? { blogId, logNo: second } : null
}

export function postUrl(blogId: string, logNo: string): string {
  return `https://blog.naver.com/${blogId}/${logNo}`
}

/** 모바일 댓글 화면. 댓글 목록이 펼쳐진 채로 뜬다 ("답방 갈 곳 찾아보기"가 읽는다) */
export function mobileCommentsUrl(blogId: string, logNo: string): string {
  return `https://m.blog.naver.com/PostView.naver?blogId=${encodeURIComponent(blogId)}&logNo=${logNo}&modal=comment`
}

export function rssUrl(blogId: string): string {
  return `https://rss.blog.naver.com/${blogId}.xml`
}

/**
 * 웹뷰 주소창에 입력한 값을 열 주소로 바꾼다. 네이버 주소만 연다.
 * "springrain" → 블로그 홈, 글 주소 → 그 글, 그 밖의 네이버 주소(블로그 홈 등) → 그대로. 못 알아보면 null.
 */
export function addressToUrl(input: string): string | null {
  const raw = input.trim()
  if (!raw) return null
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  const post = parsePostRef(withScheme)
  if (post) return postUrl(post.blogId, post.logNo)
  const blogId = parseBlogId(raw)
  if (blogId) return `https://blog.naver.com/${blogId}`
  try {
    const url = new URL(withScheme)
    const host = url.hostname.toLowerCase()
    if (host === 'naver.com' || host.endsWith('.naver.com')) return url.href.replace(/^http:/i, 'https:')
  } catch {
    // 주소가 아니다
  }
  return null
}
