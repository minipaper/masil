/**
 * 네이버 PC 블로그 DOM 선택자. 네이버가 화면을 바꾸면 여기만 고친다.
 * 확인일: 2026-11-17 (docs/DECISIONS.md "네이버 글 화면 구조")
 * 모두 mainFrame iframe 안의 PostView.naver 문서 기준이다.
 */
export const SEL = {
  postBody: ['.se-main-container', '#postViewArea', '.post-view'],
  postTitle: ['.se-title-text', '.se_title', '.pcol1 .htitle', '.htitle'],
  tags: '.wrap_tag a, .post_tag a',
  captions: '.se-caption',
  places: '.se-map-title, .se-place-name',
  images: '.se-main-container img.se-image-resource, #postViewArea img',
  /** 글쓴이 닉네임 (확인: 2026-11-17, PostView의 meta와 상단 닉네임) */
  authorNickMeta: 'meta[property="naverblog:nickname"]',
  authorNick: ['.blog_author .nick', '.nick'],

  /** 공감 버튼 (누르지 않는다. 사용자가 누르면 감지만) */
  likeButton: '.u_likeit_list_btn, .u_likeit_button',
  likeOn: '.u_likeit_button._face.on, .u_likeit_list_btn.on',

  /**
   * 접힌 댓글 영역을 펼치는 토글 (CLAUDE.md 원칙 1의 허용 버튼).
   * 사용자가 "채우기"나 "답방 갈 곳 찾아보기"를 눌렀을 때만 누른다.
   */
  commentToggle: (logNo: string): string => `#Comi${logNo}`,
  /** 댓글 목록 (확인: 2026-11-17). li의 data-info에 댓글 번호, 시각, 답글 단계, 내 댓글 여부가 있다 */
  commentList: '.u_cbox_list',
  commentItem: '.u_cbox_comment',
  commentNick: '.u_cbox_nick',
  commentText: '.u_cbox_contents',
  commentProfile: 'a.u_cbox_thumb_wrap, a.u_cbox_name',
  /**
   * 댓글의 "답글" 버튼 (CLAUDE.md 원칙 1의 허용 버튼). 답글 입력칸을 열기만 한다.
   * 사용자가 그 댓글의 답글 초안에서 "채우기"를 눌렀을 때만 누른다.
   */
  replyButton: (commentNo: string): string => `.u_cbox_btn_reply[data-param="${commentNo}"]`,
  replyInput: (commentNo: string): string => `[id$="__reply_textarea_${commentNo}"][contenteditable]`,
  /** 댓글 모듈(cbox)이 로드되었는지 */
  cbox: '.u_cbox',
  commentWrite: '.u_cbox_write_wrap, .u_cbox_write',
  commentInput: '.u_cbox_text[contenteditable]',
  /** 등록 버튼 (누르지 않는다. 사용자가 누르면 감지만) */
  commentSubmit: '.u_cbox_btn_upload',
  commentSecret: '.u_cbox_secret input[type=checkbox], .u_cbox_secret_check, .u_cbox_write input[type=checkbox]',
  /** 로그아웃 상태에서도 입력칸은 그려지고, 쓰기 상자에 이 클래스가 붙는다. 이때 입력칸을 건드리면 네이버가 쓰기 영역을 바꿔 버린다. */
  commentLoggedOut: '.u_cbox_type_logged_out',
  commentLoginGuide: '.u_cbox_type_logged_out, .u_cbox_write_login, .u_cbox_login, .u_cbox_needlogin',
  commentContents: '.u_cbox_comment .u_cbox_contents',

  /**
   * 이웃 관리 화면의 이웃 목록 영역 후보 (로그인 상태에서만 보여 아직 실제 구조를 확인하지 못했다).
   * 못 찾으면 문서 전체의 블로그 링크를 읽고, 사용자가 목록에서 고르게 한다.
   */
  buddyList: ['#buddyListManageForm', '.buddy_list', '.list_buddy', '#buddylist', 'table.tbl_buddy', '.buddy_manage table']
} as const

export function first(selectors: readonly string[], root: ParentNode = document): HTMLElement | null {
  for (const s of selectors) {
    const el = root.querySelector<HTMLElement>(s)
    if (el) return el
  }
  return null
}
