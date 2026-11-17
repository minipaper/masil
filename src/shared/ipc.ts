/** IPC 채널 이름. preload와 main이 같은 상수를 쓴다. */
export const IPC = {
  // renderer → main (invoke)
  neighborsList: 'neighbors:list',
  neighborsAdd: 'neighbors:add',
  neighborsUpdate: 'neighbors:update',
  neighborsRemove: 'neighbors:remove',
  postsList: 'posts:list',
  postsOpen: 'posts:open',
  postsSkip: 'posts:skip',
  postsNextPending: 'posts:next-pending',
  checkNow: 'check:now',
  checkStatus: 'check:status',
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  naverSetBounds: 'naver:set-bounds',
  naverSetHidden: 'naver:set-hidden',
  naverNav: 'naver:nav',
  naverState: 'naver:state',

  // main → renderer (send)
  evCheckStatus: 'ev:check-status',
  evDataChanged: 'ev:data-changed',
  evNaverState: 'ev:naver-state',
  evSelectPost: 'ev:select-post'
} as const

export type NaverNav = 'back' | 'forward' | 'reload' | 'login' | 'home'
