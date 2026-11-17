<script lang="ts">
  import { roundKey } from '@shared/round'
  import { appState } from '../lib/app-state.svelte'

  const api = window.masil
  let host = $state<HTMLDivElement | null>(null)

  // 가운데 영역의 화면 좌표를 main에 알려 WebContentsView를 그 자리에 맞춘다
  $effect(() => {
    const el = host
    if (!el) return
    const send = (): void => {
      const r = el.getBoundingClientRect()
      api.naver.setBounds({ x: r.left, y: r.top, width: r.width, height: r.height })
    }
    const ro = new ResizeObserver(send)
    ro.observe(el)
    window.addEventListener('resize', send)
    send()
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', send)
    }
  })

  const naver = $derived(appState.naver)
  const post = $derived(appState.selectedPost)
  const pending = $derived(post ? post.status === 'new' || post.status === 'read' : false)
  const round = $derived(appState.round)
  /** 웹뷰에 열린 글의 이웃. 명단에 없는 블로그이거나 글 화면이 아니면 null */
  const neighbor = $derived(naver?.visible ? appState.viewingNeighbor : null)
  const stats = $derived(appState.roundStats)

  function next(): void {
    if (round) void appState.advance()
    else void appState.openNextPending()
  }

  // 마실 모드 단축키 → / S (1·2·3 채우기는 초안 패널이 맡는다). 앱 화면에 포커스가 있을 때만.
  function onKey(e: KeyboardEvent): void {
    if (!round || appState.roundFinished || appState.settingsOpen) return
    const t = e.target as HTMLElement | null
    const typing = !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
    const k = roundKey(e, typing)
    if (k === 'next') {
      e.preventDefault()
      next()
    } else if (k === 'skip' && pending) {
      e.preventDefault()
      void appState.skipSelected()
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<main class="page view">
  <div class="addr">
    <button type="button" aria-label="뒤로" disabled={!naver?.canGoBack} onclick={() => api.naver.nav('back')}>‹</button>
    <button type="button" aria-label="앞으로" disabled={!naver?.canGoForward} onclick={() => api.naver.nav('forward')}>›</button>
    <button type="button" aria-label="새로고침" disabled={!naver?.visible} onclick={() => api.naver.nav('reload')}>↻</button>
    <div class="url" title={naver?.url}>{naver?.visible ? naver.url.replace(/^https?:\/\//, '') : '열린 글 없음'}</div>
    {#if round && !appState.roundFinished}
      <span class="round" title="이번 마실에서 들른 글 / 시작할 때 남은 글">
        마실 중 <b>{stats?.visited ?? 0}</b>/{round.total}
      </span>
    {/if}
    {#if neighbor}
      <button type="button" class="act danger" title="{neighbor.blogId} 이웃을 명단에서 빼요" onclick={() => appState.removeCurrentNeighbor()}>
        이웃 명단에서 제외
      </button>
    {/if}
    {#if post && pending}
      <button type="button" class="act" onclick={() => appState.skipSelected()}>건너뛰기{#if round}<kbd>S</kbd>{/if}</button>
    {/if}
    {#if appState.pendingOthers > 0 || (round && !appState.roundFinished)}
      <button type="button" class="act" onclick={next}>다음 글{#if round}<kbd>→</kbd>{/if}</button>
    {/if}
    {#if round && !appState.roundFinished}
      <button type="button" class="act quiet" onclick={() => appState.endRound()}>마실 그만</button>
    {/if}
    {#if naver?.loggedIn}
      <span class="login">로그인됨</span>
    {:else}
      <button type="button" class="act strong" onclick={() => api.naver.nav('login')}>네이버 로그인</button>
    {/if}
  </div>
  <div class="host" bind:this={host}>
    {#if appState.roundFinished && round}
      <div class="done" role="status">
        <div class="card">
          <h2>오늘 마실 끝</h2>
          <p class="lead">들를 글을 다 돌았어요.</p>
          <dl>
            <dt>들른 글</dt><dd>{stats?.visited ?? 0}편</dd>
            <dt>남긴 댓글</dt><dd>{stats?.commented ?? 0}개</dd>
            <dt>공감</dt><dd>{stats?.liked ?? 0}번</dd>
            <dt>건너뛴 글</dt><dd>{stats?.skipped ?? 0}편</dd>
          </dl>
          <button type="button" class="primary" onclick={() => appState.endRound()}>공책 덮기</button>
        </div>
      </div>
    {:else if !naver?.visible}
      <div class="placeholder">
        <p>왼쪽 출석부에서 글을 고르면 여기에 블로그가 열려요.</p>
        {#if !naver?.loggedIn}
          <p class="sub">댓글을 남기려면 처음 한 번 네이버에 로그인해 주세요. 비밀번호는 네이버 화면에 직접 입력하고, 마실은 저장하지 않아요.</p>
          <button type="button" class="primary" onclick={() => api.naver.nav('login')}>네이버 로그인</button>
        {:else}
          <button type="button" class="ghost" onclick={() => api.naver.nav('home')}>블로그 홈 열기</button>
        {/if}
      </div>
    {/if}
  </div>
</main>

<style>
  .view {
    display: flex;
    flex-direction: column;
    background: #fff;
    min-width: 0;
  }
  .addr {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    background: var(--desk);
    border-bottom: 1px solid #dcdacf;
    font-size: 12px;
  }
  .addr > button[aria-label] {
    border: 0;
    background: none;
    width: 26px;
    height: 24px;
    color: var(--graphite-soft);
    border-radius: 3px;
    font-size: 15px;
    line-height: 1;
  }
  .addr > button[aria-label]:hover:not(:disabled) {
    background: #e6e4da;
  }
  .addr > button:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .url {
    flex: 1;
    min-width: 120px;
    padding: 3px 10px;
    background: #fff;
    border: 1px solid #dcdacf;
    border-radius: 3px;
    color: #555;
    font-family: system-ui, sans-serif;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .act {
    border: 1px solid #c9c6ba;
    background: var(--paper);
    border-radius: 3px;
    padding: 2px 10px;
    font-size: 12px;
    white-space: nowrap;
  }
  .act:hover {
    border-color: var(--graphite);
  }
  .act.strong {
    border-color: var(--cover);
    color: var(--cover);
    font-weight: 600;
  }
  .act kbd {
    font-family: var(--font-body);
    font-size: 10.5px;
    margin-left: 6px;
    padding: 0 4px;
    border: 1px solid #d6d3c6;
    border-radius: 2px;
    color: var(--graphite-soft);
  }
  .act.danger {
    color: var(--margin);
  }
  .act.danger:hover {
    border-color: var(--margin);
  }
  .act.quiet {
    border-color: transparent;
    background: none;
    color: var(--graphite-soft);
  }
  .round {
    white-space: nowrap;
    color: var(--pen-blue);
    font-size: 12px;
  }
  .round b {
    font-family: var(--font-head);
    font-size: 14px;
  }
  .done {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 24px;
    background: var(--desk);
  }
  .card {
    position: relative;
    width: min(380px, 100%);
    padding: 28px 32px 24px 56px;
    background-color: var(--paper);
    background-image:
      linear-gradient(90deg, transparent 40px, var(--margin) 40px, var(--margin) 41px, transparent 41px),
      repeating-linear-gradient(var(--paper) 0 27px, var(--line) 27px 28px);
    border-radius: 3px;
    box-shadow: 0 1px 0 #d6d3c6, 0 8px 22px rgba(0, 0, 0, 0.12);
  }
  .card h2 {
    margin: 0;
    font-family: var(--font-head);
    font-weight: 800;
    font-size: 24px;
    line-height: 56px;
  }
  .card .lead {
    margin: 0;
    line-height: 28px;
    color: var(--graphite-soft);
    font-size: 13px;
  }
  .card dl {
    display: grid;
    grid-template-columns: auto 1fr;
    column-gap: 20px;
    margin: 0 0 28px;
    line-height: 28px;
  }
  .card dt {
    font-size: 13px;
    color: var(--graphite-soft);
  }
  .card dd {
    margin: 0;
    font-family: var(--font-head);
    font-weight: 600;
    font-size: 15px;
    color: var(--pen-blue);
  }
  .login {
    color: var(--cover);
    font-weight: 500;
    white-space: nowrap;
  }
  .host {
    flex: 1;
    position: relative;
    min-height: 0;
  }
  .placeholder {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 6px;
    padding: 24px;
    text-align: center;
    color: var(--graphite-soft);
  }
  .placeholder p {
    margin: 0;
    max-width: 420px;
  }
  .placeholder .sub {
    font-size: 12.5px;
    margin-bottom: 8px;
  }
  .primary {
    border: 0;
    background: var(--cover);
    color: #fff;
    padding: 6px 16px;
    border-radius: 3px;
    font-weight: 500;
  }
  .ghost {
    background: var(--paper);
    border: 1px solid #bdbaae;
    padding: 4px 14px;
    border-radius: 3px;
    margin-top: 6px;
  }
</style>
