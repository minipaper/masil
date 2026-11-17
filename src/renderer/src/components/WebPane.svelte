<script lang="ts">
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
</script>

<main class="page view">
  <div class="addr">
    <button type="button" aria-label="뒤로" disabled={!naver?.canGoBack} onclick={() => api.naver.nav('back')}>‹</button>
    <button type="button" aria-label="앞으로" disabled={!naver?.canGoForward} onclick={() => api.naver.nav('forward')}>›</button>
    <button type="button" aria-label="새로고침" disabled={!naver?.visible} onclick={() => api.naver.nav('reload')}>↻</button>
    <div class="url" title={naver?.url}>{naver?.visible ? naver.url : '열린 글 없음'}</div>
    {#if post && pending}
      <button type="button" class="act" onclick={() => appState.skipSelected()}>건너뛰기</button>
    {/if}
    {#if appState.pendingOthers > 0}
      <button type="button" class="act" onclick={() => appState.openNextPending()}>다음 글</button>
    {/if}
    {#if naver?.loggedIn}
      <span class="login">로그인됨</span>
    {:else}
      <button type="button" class="act strong" onclick={() => api.naver.nav('login')}>네이버 로그인</button>
    {/if}
  </div>
  <div class="host" bind:this={host}>
    {#if !naver?.visible}
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
    background: #f4f3ec;
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
    min-width: 0;
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
