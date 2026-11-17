<script lang="ts">
  // 출석부 연필 표시: 손으로 그린 ○, △, 빈칸(·)
  type Kind = 'read' | 'comment' | 'skip' | 'none'
  let { kind, label }: { kind: Kind; label: string } = $props()

  const CIRCLE =
    'M10 2.6 C15 2.4 17.6 6 17.3 10.4 C17 14.8 13.4 17.6 9.4 17.3 C5.2 17 2.5 13.6 2.8 9.6 C3 6 5.6 3.2 10.8 3.1'
</script>

<svg viewBox="0 0 20 20" role="img" aria-label={label}>
  {#if kind === 'read'}
    <path d={CIRCLE} fill="none" stroke="var(--pen-blue)" stroke-width="1.6" stroke-linecap="round" />
  {:else if kind === 'comment'}
    <path d={CIRCLE} fill="none" stroke="var(--margin)" stroke-width="1.8" stroke-linecap="round" />
  {:else if kind === 'skip'}
    <path d="M10 3.5 L17 16 L3.2 16.3 Z" fill="none" stroke="var(--graphite-soft)" stroke-width="1.5" stroke-linejoin="round" />
  {:else}
    <circle cx="10" cy="10" r="1.4" fill="#a9a79e" />
  {/if}
</svg>

<style>
  svg {
    width: 20px;
    height: 20px;
    vertical-align: middle;
  }
</style>
