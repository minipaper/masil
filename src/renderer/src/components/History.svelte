<script lang="ts">
  import { formatPostTime } from '@shared/format'
  import { appState } from '../lib/app-state.svelte'
</script>

{#if !appState.historyBlogId}
  <p class="note">글을 열면 그 이웃에게 남긴 댓글을 보여 드려요.</p>
{:else if appState.history.length === 0}
  <p class="note">아직 마실로 남긴 댓글이 없어요. 등록한 댓글이 여기에 쌓여요.</p>
{:else}
  <ul class="past">
    {#each appState.history as c (c.id)}
      <li>
        <span class="on">
          {formatPostTime(c.clickedAt)}{#if c.postTitle}, 「{c.postTitle}」{/if}
          {#if c.isSecret}<em>비밀 댓글</em>{/if}
          {#if c.status === 'pending'}<em class="warn">등록 확인 중</em>{/if}
        </span>
        <q>{c.text}</q>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .note {
    margin: 0;
    line-height: 28px;
    font-size: 13px;
    color: var(--graphite-soft);
  }
  .past {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .past li {
    padding: 0 0 4px;
  }
  .on {
    display: block;
    height: 28px;
    line-height: 28px;
    font-size: 12px;
    color: var(--graphite-soft);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .on em {
    font-style: normal;
    margin-left: 6px;
    color: var(--pen-blue);
  }
  .on em.warn {
    color: var(--margin);
  }
  q {
    display: block;
    quotes: none;
    font-size: 13px;
    line-height: 28px;
  }
</style>
