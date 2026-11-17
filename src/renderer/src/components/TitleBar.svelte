<script lang="ts">
  import { formatClock } from '@shared/format'
  import { appState } from '../lib/app-state.svelte'

  const platform = window.masil.platform

  const statusText = $derived.by(() => {
    const c = appState.check
    if (c.running) {
      return c.progress && c.progress.total > 0
        ? `새 글 확인 중 ${c.progress.done}/${c.progress.total}`
        : '새 글 확인 중'
    }
    const parts: string[] = []
    if (c.lastCheckedAt) parts.push(`${formatClock(c.lastCheckedAt)}에 확인했어요.`)
    if (c.nextCheckAt) parts.push(`다음 확인은 ${formatClock(c.nextCheckAt)}`)
    return parts.join(' ')
  })
</script>

<header class="titlebar" class:mac={platform === 'darwin'} class:win={platform === 'win32'}>
  <div class="label"><b>마실 공책</b></div>
  <span class="status" aria-live="polite">
    {statusText}
    {#if appState.check.lastError && !appState.check.running}<em>{appState.check.lastError}</em>{/if}
  </span>
  <button class="tb" type="button" disabled={appState.check.running} onclick={() => window.masil.check.now()}>
    지금 확인
  </button>
</header>

<style>
  .titlebar {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 14px;
    color: var(--cover-ink);
    -webkit-app-region: drag;
    user-select: none;
    padding-right: 8px;
  }
  .titlebar.mac {
    padding-left: 76px;
  }
  .titlebar.win {
    padding-right: 146px; /* 창 조절 버튼(titleBarOverlay) 자리 */
  }
  .label {
    background: var(--paper);
    color: var(--graphite);
    padding: 4px 14px;
    border-radius: 4px;
    box-shadow:
      inset 0 0 0 1px #d6d3c6,
      inset 0 0 0 4px var(--paper),
      inset 0 0 0 5px var(--margin);
  }
  .label b {
    font-family: var(--font-head);
    font-weight: 800;
    font-size: 19px;
  }
  .status {
    margin-left: auto;
    font-size: 12.5px;
    opacity: 0.9;
  }
  .status em {
    font-style: normal;
    color: #ffd3c9;
    margin-left: 8px;
  }
  .tb {
    -webkit-app-region: no-drag;
    background: none;
    border: 0;
    color: var(--cover-ink);
    font-size: 12.5px;
    padding: 4px 8px;
    border-radius: 3px;
  }
  .tb:hover:not(:disabled) {
    background: var(--cover-deep);
  }
  .tb:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
