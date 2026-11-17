<script lang="ts">
  import { formatRollDate } from '@shared/format'
  import NeighborBook from './components/NeighborBook.svelte'
  import RightPanel from './components/RightPanel.svelte'
  import Roll from './components/Roll.svelte'
  import TitleBar from './components/TitleBar.svelte'
  import WebPane from './components/WebPane.svelte'
  import Mark from './components/Mark.svelte'
  import { appState, type LeftTab } from './lib/app-state.svelte'

  const api = window.masil

  void appState.init()

  // ── 패널 폭 (끌어서 조절, 놓으면 저장) ──
  let left = $state(352)
  let right = $state(380)
  let collapsed = $state(false)
  let synced = false
  $effect(() => {
    const s = appState.settings
    if (!s || synced) return
    synced = true
    left = s.paneWidths.left
    right = s.paneWidths.right
    collapsed = s.rightCollapsed
  })

  const columns = $derived(collapsed ? `${left}px 8px 1fr 30px` : `${left}px 8px 1fr 8px ${right}px`)

  function startDrag(which: 'left' | 'right', e: PointerEvent): void {
    e.preventDefault()
    const startX = e.clientX
    const start = which === 'left' ? left : right
    // 끄는 동안 마우스가 웹뷰 위를 지나가면 이벤트를 놓치므로 잠시 숨긴다
    api.naver.setHidden(true)
    const move = (ev: PointerEvent): void => {
      const dx = ev.clientX - startX
      if (which === 'left') left = Math.min(560, Math.max(280, start + dx))
      else right = Math.min(560, Math.max(300, start - dx))
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      api.naver.setHidden(false)
      void appState.saveSettings({ paneWidths: { left, right } })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function nudge(which: 'left' | 'right', e: KeyboardEvent): void {
    const step = e.shiftKey ? 40 : 10
    const dir = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0
    if (!dir) return
    e.preventDefault()
    if (which === 'left') left = Math.min(560, Math.max(280, left + dir * step))
    else right = Math.min(560, Math.max(300, right - dir * step))
    void appState.saveSettings({ paneWidths: { left, right } })
  }

  function setCollapsed(v: boolean): void {
    collapsed = v
    void appState.saveSettings({ rightCollapsed: v })
  }

  const tabs: { id: LeftTab; label: () => string }[] = [
    { id: 'today', label: () => '오늘 새 글' },
    { id: 'neighbors', label: () => `이웃 명단 ${appState.neighbors.length}` },
    { id: 'quiet', label: () => '오래 못 간 집' }
  ]

  const summary = $derived.by(() => {
    const total = appState.posts.length
    if (total === 0) return '새 글을 기다리는 중'
    const visited = appState.posts.filter((p) => p.status === 'commented' || p.status === 'skipped').length
    return `새 글 ${total}편, 그중 ${visited}곳 다녀옴`
  })
</script>

<div class="app" style:grid-template-columns={columns}>
  <TitleBar />

  <aside class="page roll">
    <div class="roll-head">
      <h2>{formatRollDate()} 출석부</h2>
      <p>{summary}</p>
    </div>
    <div class="switch" role="tablist">
      {#each tabs as t (t.id)}
        <button type="button" role="tab" aria-selected={appState.leftTab === t.id} onclick={() => (appState.leftTab = t.id)}>{t.label()}</button>
      {/each}
    </div>
    <div class="scroll">
      {#if appState.leftTab === 'today'}
        <Roll />
      {:else if appState.leftTab === 'neighbors'}
        <NeighborBook />
      {:else}
        <NeighborBook quiet />
      {/if}
    </div>
    {#if appState.leftTab === 'today'}
      <div class="legend">
        <span><Mark kind="comment" label="" />댓글</span>
        <span><Mark kind="read" label="" />읽음, 공감</span>
        <span><Mark kind="skip" label="" />건너뜀</span>
      </div>
    {/if}
    <div class="start">
      <button class="pencil" type="button" disabled={appState.pendingCount === 0} onclick={() => appState.openNextPending()}>
        <span class="tip"></span>
        <span class="body">마실 시작 <small>{appState.pendingCount > 0 ? `남은 ${appState.pendingCount}편` : '들를 글 없음'}</small></span>
        <span class="ferrule"></span><span class="eraser"></span>
      </button>
      <p>오래된 글부터 차례로 열어요.</p>
    </div>
  </aside>

  <!-- 포커스 가능한 separator는 키보드로 폭을 조절하는 ARIA 위젯이다 -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div
    class="splitter"
    role="separator"
    aria-orientation="vertical"
    aria-label="왼쪽 패널 폭"
    aria-valuenow={left}
    tabindex="0"
    onpointerdown={(e) => startDrag('left', e)}
    onkeydown={(e) => nudge('left', e)}
  ></div>

  <WebPane />

  {#if collapsed}
    <button type="button" class="reopen" onclick={() => setCollapsed(false)}>초안 펼치기</button>
  {:else}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <div
      class="splitter"
      role="separator"
      aria-orientation="vertical"
      aria-label="오른쪽 패널 폭"
      aria-valuenow={right}
      tabindex="0"
      onpointerdown={(e) => startDrag('right', e)}
      onkeydown={(e) => nudge('right', e)}
    ></div>
    <RightPanel oncollapse={() => setCollapsed(true)} />
  {/if}
</div>

<style>
  .app {
    height: 100vh;
    display: grid;
    grid-template-rows: var(--titlebar-h) 1fr;
    padding: 0 30px 10px 10px;
  }
  :global(.page) {
    background: var(--paper);
    border-radius: 3px;
    min-height: 0;
    overflow: hidden;
    box-shadow: 0 1px 0 var(--cover-deep);
  }
  .roll {
    display: flex;
    flex-direction: column;
  }
  .roll-head {
    padding: 16px 18px 10px;
    border-bottom: 2px solid var(--graphite);
  }
  .roll-head h2 {
    margin: 0;
    font-family: var(--font-head);
    font-weight: 800;
    font-size: 21px;
    line-height: 1.2;
  }
  .roll-head p {
    margin: 4px 0 0;
    color: var(--graphite-soft);
    font-size: 12.5px;
  }
  .switch {
    display: flex;
    gap: 14px;
    padding: 8px 18px 0;
    font-size: 13px;
    border-bottom: 1px solid var(--line);
  }
  .switch button {
    background: none;
    border: 0;
    padding: 0 0 6px;
    color: var(--graphite-soft);
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
  }
  .switch button[aria-selected='true'] {
    color: var(--graphite);
    font-weight: 600;
    border-bottom-color: var(--margin);
  }
  .scroll {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }
  .legend {
    display: flex;
    gap: 14px;
    padding: 6px 18px;
    font-size: 12px;
    color: var(--graphite-soft);
    border-top: 1px solid var(--line);
  }
  .legend span {
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }
  .legend :global(svg) {
    width: 15px;
    height: 15px;
  }
  .start {
    padding: 12px 18px 14px;
    display: flex;
    align-items: center;
    gap: 14px;
    border-top: 1px solid var(--line);
  }
  .start p {
    margin: 0;
    font-size: 12px;
    color: var(--graphite-soft);
    line-height: 1.5;
  }
  /* 연필 버튼 */
  .pencil {
    flex: none;
    border: 0;
    padding: 0;
    background: none;
    display: flex;
    align-items: stretch;
    height: 40px;
    filter: drop-shadow(0 2px 0 rgba(0, 0, 0, 0.18));
  }
  .pencil:disabled {
    opacity: 0.55;
    cursor: default;
  }
  .pencil .tip {
    width: 30px;
    background: #e8c99b;
    clip-path: polygon(0 50%, 100% 0, 100% 100%);
    position: relative;
  }
  .pencil .tip::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 10px;
    background: var(--graphite);
    clip-path: polygon(0 50%, 100% 33%, 100% 67%);
  }
  .pencil .body {
    background: var(--pencil-y);
    color: var(--graphite);
    font-weight: 600;
    font-size: 14px;
    padding: 0 16px;
    display: flex;
    align-items: center;
    gap: 8px;
    background-image: linear-gradient(
      transparent 32%,
      rgba(0, 0, 0, 0.06) 32%,
      rgba(0, 0, 0, 0.06) 34%,
      transparent 34%,
      transparent 66%,
      rgba(0, 0, 0, 0.06) 66%,
      rgba(0, 0, 0, 0.06) 68%,
      transparent 68%
    );
  }
  .pencil .body small {
    font-weight: 400;
    font-size: 12px;
    color: #5b4a12;
  }
  .pencil .ferrule {
    width: 10px;
    background: repeating-linear-gradient(90deg, #b9b7ae 0 2px, #d9d7ce 2px 4px);
  }
  .pencil .eraser {
    width: 18px;
    background: var(--eraser);
    border-radius: 0 6px 6px 0;
  }
  .pencil:hover:not(:disabled) .body {
    background-color: #f7cf55;
  }

  .splitter {
    cursor: col-resize;
    position: relative;
  }
  .splitter::after {
    content: '';
    position: absolute;
    top: 40%;
    bottom: 40%;
    left: 3px;
    width: 2px;
    border-radius: 1px;
    background: rgba(231, 239, 233, 0.25);
  }
  .splitter:hover::after,
  .splitter:focus-visible::after {
    background: rgba(231, 239, 233, 0.6);
  }
  .reopen {
    writing-mode: vertical-rl;
    border: 0;
    background: var(--tab-1);
    border-radius: 0 5px 5px 0;
    align-self: start;
    margin-top: 14px;
    padding: 12px 0;
    width: 28px;
    font-size: 12.5px;
    margin-left: 2px;
  }
</style>
