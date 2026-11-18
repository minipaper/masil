import { describe, expect, it } from 'vitest'
import { extractBuddies } from './buddy'
import { baseName, matchesNeighbor, shownName } from './neighbor-name'
import { isOptionRejected, modelChoices, requestVariants } from './ai-options'
import { addressToUrl } from './blog-id'
import { parseCommentInfo, pickReturnVisits, toIso } from './visitors'
import { pickNextInRound, roundKey, summarizeRound } from './round'
import { STYLE_GUIDE_EVERY, buildStylePrompt, diffLines, nextStyleAt, parseStyleGuide, styleGuideDue } from './style'
import type { Post } from './types'

describe('문체 가이드 갱신 시점', () => {
  it('최종본이 10개 모이기 전에는 만들지 않는다', () => {
    expect(styleGuideDue(9, 0)).toBe(false)
    expect(styleGuideDue(10, 0)).toBe(true)
  })
  it('지난 개정안(거절 포함) 이후 10개가 새로 쌓여야 한다', () => {
    expect(styleGuideDue(19, 10)).toBe(false)
    expect(styleGuideDue(20, 10)).toBe(true)
    expect(nextStyleAt(10)).toBe(20)
    expect(nextStyleAt(0)).toBe(STYLE_GUIDE_EVERY)
  })
})

describe('문체 가이드 응답 읽기', () => {
  it('JSON의 guide 문자열을 꺼낸다', () => {
    expect(parseStyleGuide('{"guide": "- 존댓말\\n- 짧게"}')).toBe('- 존댓말\n- 짧게')
  })
  it('배열이나 코드 블록도 받아 준다', () => {
    expect(parseStyleGuide('```json\n{"guide": ["존댓말", "- 짧게"]}\n```')).toBe('- 존댓말\n- 짧게')
    expect(parseStyleGuide('- 그냥 글\n\n\n- 둘째')).toBe('- 그냥 글\n\n- 둘째')
  })
  it('비어 있으면 오류', () => {
    expect(() => parseStyleGuide('{"guide": ""}')).toThrow()
  })
  it('프롬프트에 기존 가이드와 최종본이 들어간다', () => {
    const p = buildStylePrompt({ current: null, finals: ['첫 댓글', '둘째 댓글'], pairs: [{ draft: '초안', final: '최종' }] })
    expect(p).toContain('(없음)')
    expect(p).toContain('2. 둘째 댓글')
    expect(p).toContain('초안: 초안')
  })
})

describe('줄 단위 차이', () => {
  it('유지, 추가, 삭제를 구분한다', () => {
    expect(diffLines('- a\n- b\n- c', '- a\n- c\n- d')).toEqual([
      { kind: 'same', text: '- a' },
      { kind: 'del', text: '- b' },
      { kind: 'same', text: '- c' },
      { kind: 'add', text: '- d' }
    ])
  })
  it('기존 가이드가 없으면 모두 추가', () => {
    expect(diffLines('', '- a').map((d) => d.kind)).toEqual(['add'])
  })
})

const post = (over: Partial<Post>): Post => ({
  id: 1,
  neighborId: 1,
  blogId: 'a',
  neighborName: 'A',
  logNo: '1',
  title: 't',
  url: 'u',
  category: null,
  tags: [],
  excerpt: '',
  publishedAt: '2026-11-17T00:00:00.000Z',
  discoveredAt: '2026-11-17T00:00:00.000Z',
  status: 'new',
  liked: false,
  openedAt: null,
  actedAt: null,
  ...over
})

describe('마실 한 바퀴 요약', () => {
  const start = '2026-11-17T10:00:00.000Z'
  it('시작 이후에 처리한 글만 센다', () => {
    const stats = summarizeRound(
      [
        post({ id: 1, status: 'commented', openedAt: '2026-11-17T10:01:00.000Z', actedAt: '2026-11-17T10:03:00.000Z', liked: true }),
        post({ id: 2, status: 'skipped', openedAt: '2026-11-17T10:04:00.000Z', actedAt: '2026-11-17T10:04:30.000Z' }),
        post({ id: 3, status: 'read', openedAt: '2026-11-17T10:05:00.000Z' }),
        post({ id: 4, status: 'commented', openedAt: '2026-11-17T09:00:00.000Z', actedAt: '2026-11-17T09:10:00.000Z' })
      ],
      start
    )
    expect(stats).toEqual({ visited: 3, commented: 1, skipped: 1, liked: 1 })
  })
})

describe('마실 단축키', () => {
  const k = (key: string) => ({ key, ctrlKey: false, metaKey: false, altKey: false })
  it('→, S, 1~3', () => {
    expect(roundKey(k('ArrowRight'), false)).toBe('next')
    expect(roundKey(k('s'), false)).toBe('skip')
    expect(roundKey(k('ㄴ'), false)).toBe('skip')
    expect(roundKey(k('2'), false)).toBe('fill2')
  })
  it('입력 중이거나 조합키면 무시', () => {
    expect(roundKey(k('s'), true)).toBeNull()
    expect(roundKey({ ...k('s'), metaKey: true }, false)).toBeNull()
  })
})

describe('이웃 관리 화면에서 이웃 읽기', () => {
  it('블로그 홈 링크만, 내 블로그와 중복은 빼고', () => {
    const out = extractBuddies(
      [
        { href: 'https://blog.naver.com/springrain', text: '' },
        { href: 'https://blog.naver.com/springrain', text: ' 봄비 ' },
        { href: 'https://blog.naver.com/me', text: '나' },
        { href: 'https://blog.naver.com/squirrel/224000000001', text: '글 링크' },
        { href: 'https://blog.naver.com/PostList.naver?blogId=Moonlight', text: '달빛' },
        { href: 'https://admin.blog.naver.com/BuddyGroupManage.naver', text: '관리' },
        { href: 'javascript:void(0)', text: 'x' }
      ],
      'me'
    )
    expect(out).toEqual([
      { blogId: 'springrain', name: '봄비' },
      { blogId: 'moonlight', name: '달빛' }
    ])
  })
})

describe('마실 중 다음 글', () => {
  it('들른 글은 빼고 가장 오래된 처리 전 글', () => {
    const posts = [
      post({ id: 1, status: 'read', publishedAt: '2026-11-15T00:00:00.000Z' }),
      post({ id: 2, status: 'new', publishedAt: '2026-11-16T00:00:00.000Z' }),
      post({ id: 3, status: 'new', publishedAt: '2026-11-14T00:00:00.000Z' }),
      post({ id: 4, status: 'commented', publishedAt: '2026-11-13T00:00:00.000Z' })
    ]
    expect(pickNextInRound(posts, [])?.id).toBe(3)
    expect(pickNextInRound(posts, [3])?.id).toBe(1)
    expect(pickNextInRound(posts, [3, 1, 2])).toBeNull()
    // 답방할 집의 글이 먼저
    const withVisitor = [...posts, post({ id: 5, blogId: 'visitor', status: 'new', publishedAt: '2026-11-17T00:00:00.000Z' })]
    expect(pickNextInRound(withVisitor, [], new Set(['visitor']))?.id).toBe(5)
    expect(pickNextInRound(withVisitor, [5], new Set(['visitor']))?.id).toBe(3)
  })
})

describe('이웃 이름', () => {
  const base = { nickname: '봄비 내리는 오후', nicknameCustom: false, naverNick: null as string | null }
  it('닉네임을 모르면 블로그 제목', () => {
    expect(baseName(base)).toBe('봄비 내리는 오후')
  })
  it('글을 열어 닉네임을 알면 닉네임', () => {
    expect(baseName({ ...base, naverNick: '봄비' })).toBe('봄비')
  })
  it('내가 고친 이름이 가장 먼저, 호칭은 그 위', () => {
    const n = { ...base, nickname: '비 언니', nicknameCustom: true, naverNick: '봄비' }
    expect(baseName(n)).toBe('비 언니')
    expect(shownName({ ...n, honorific: '' })).toBe('비 언니')
    expect(shownName({ ...n, honorific: '봄비님' })).toBe('봄비님')
  })
  it('검색은 이름, 닉네임, ID, 메모 어디서든, 여러 단어는 모두 포함', () => {
    const n = { ...base, naverNick: '봄비', honorific: '', blogId: 'springrain', blogTitle: '봄비 내리는 오후', memo: '초4 엄마' }
    expect(matchesNeighbor(n, '봄')).toBe(true)
    expect(matchesNeighbor(n, 'SPRING')).toBe(true)
    expect(matchesNeighbor(n, '초4 오후')).toBe(true)
    expect(matchesNeighbor(n, '햇살')).toBe(false)
    expect(matchesNeighbor(n, '  ')).toBe(true)
  })
})

describe('AI 요청 옵션 조합', () => {
  it('생각 끄기 > JSON > temperature 순으로 하나씩 줄인다', () => {
    const v = requestVariants(true, 0.4)
    expect(v).toHaveLength(8)
    expect(v[0]).toEqual({ reasoning_effort: 'none', response_format: { type: 'json_object' }, temperature: 0.4 })
    // Ollama의 MLX 모델처럼 JSON 모드만 모르면 셋째에서 통한다
    expect(v[2]).toEqual({ reasoning_effort: 'none', temperature: 0.4 })
    // 생각 끄기를 모르는 일반 모델은 다섯째(예전 첫 시도와 같음)에서 통한다
    expect(v[4]).toEqual({ response_format: { type: 'json_object' }, temperature: 0.4 })
    expect(v.at(-1)).toEqual({})
  })
  it('JSON이 필요 없으면 JSON 조합은 빠진다', () => {
    const v = requestVariants(false, 0.7)
    expect(v).toEqual([{ reasoning_effort: 'none', temperature: 0.7 }, { reasoning_effort: 'none' }, { temperature: 0.7 }, {}])
  })
  it('400, 422, 501만 옵션 거절로 본다', () => {
    expect([400, 422, 501].every(isOptionRejected)).toBe(true)
    expect([401, 404, 429, 500, undefined].some(isOptionRejected)).toBe(false)
  })
})

describe('주소창 입력', () => {
  it('ID, 블로그 주소, 글 주소, 모바일 글 주소를 연다', () => {
    expect(addressToUrl('springrain')).toBe('https://blog.naver.com/springrain')
    expect(addressToUrl('blog.naver.com/springrain')).toBe('https://blog.naver.com/springrain')
    expect(addressToUrl('https://m.blog.naver.com/springrain/223614208871')).toBe('https://blog.naver.com/springrain/223614208871')
    expect(addressToUrl('https://blog.naver.com/PostView.naver?blogId=springrain&logNo=223614208871')).toBe(
      'https://blog.naver.com/springrain/223614208871'
    )
  })
  it('네이버의 다른 화면은 그대로, 네이버가 아니면 열지 않는다', () => {
    expect(addressToUrl('section.blog.naver.com/BlogHome.naver')).toBe('https://section.blog.naver.com/BlogHome.naver')
    expect(addressToUrl('https://example.com/springrain')).toBeNull()
    expect(addressToUrl('evilnaver.com')).toBeNull()
    expect(addressToUrl('  ')).toBeNull()
  })
})

describe('답방', () => {
  it('댓글 data-info를 읽는다', () => {
    const info = parseCommentInfo(
      "commentNo:'900000000000000001',deleted:false,best:false,visible:true,secret:false,manager:false,mine:false,report:undefined,objectId:'100000001_201_223000000001',replyLevel:1,parentCommentNo:'900000000000000001',pick:false,regTime:'2026-11-17T16:03:37+0900'"
    )
    expect(info).toEqual({ commentNo: '900000000000000001', mine: false, deleted: false, secret: false, replyLevel: 1, regTime: '2026-11-17T16:03:37+0900' })
    expect(parseCommentInfo("commentNo:'1',mine:true,replyLevel:2")?.mine).toBe(true)
    expect(parseCommentInfo('')).toBeNull()
    expect(toIso('2026-11-17T16:03:37+0900')).toBe('2026-11-17T07:03:37.000Z')
  })

  const now = new Date('2026-11-20T00:00:00Z')
  const v = (blogId: string, at: string, logNo = '1') => ({ commentNo: at, logNo, blogId, nick: blogId + '닉', at, text: '', postTitle: '내 글 ' + logNo })

  it('내 글에 댓글 단 뒤로 내가 댓글을 안 남긴 사람만, 최근 순으로', () => {
    const list = pickReturnVisits(
      [v('rain', '2026-11-18T00:00:00.000Z'), v('sun', '2026-11-19T00:00:00.000Z', '2'), v('rain', '2026-11-17T00:00:00.000Z'), v('wind', '2026-11-18T00:00:00.000Z')],
      [{ blogId: 'wind', at: '2026-11-18T05:00:00.000Z' }],
      'me',
      now
    )
    expect(list.map((r) => r.blogId)).toEqual(['sun', 'rain'])
    expect(list[1]).toMatchObject({ count: 2, lastAt: '2026-11-18T00:00:00.000Z' })
  })

  it('내가 답방한 뒤 또 댓글을 달면 다시 답방할 집, 30일이 지나면 빠진다, 내 댓글은 뺀다', () => {
    const list = pickReturnVisits(
      [v('rain', '2026-11-19T00:00:00.000Z'), v('old', '2026-10-01T00:00:00.000Z'), v('me', '2026-11-19T00:00:00.000Z')],
      [{ blogId: 'rain', at: '2026-11-18T00:00:00.000Z' }],
      'me',
      now
    )
    expect(list.map((r) => r.blogId)).toEqual(['rain'])
  })
})

describe('modelChoices (설정 화면 모델 선택칸)', () => {
  it('중복과 빈 이름을 빼고 이름순으로 정렬한다', () => {
    expect(modelChoices(['qwen3.5:4b', 'gemma4:12b-mlx', ' ', 'gemma4:12b-mlx', 'exaone3.5:7.8b'], '')).toEqual([
      'exaone3.5:7.8b',
      'gemma4:12b-mlx',
      'qwen3.5:4b'
    ])
  })
  it('저장된 모델이 목록에 없으면 맨 앞에 남긴다', () => {
    expect(modelChoices(['gemma4:e4b-it-q4_K_M'], 'gemma4:12b-mlx')).toEqual(['gemma4:12b-mlx', 'gemma4:e4b-it-q4_K_M'])
  })
  it('저장된 모델이 목록에 있으면 그대로 둔다', () => {
    expect(modelChoices(['b', 'a'], 'b')).toEqual(['a', 'b'])
  })
})
