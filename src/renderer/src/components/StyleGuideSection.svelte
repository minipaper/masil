<script lang="ts">
  import { STYLE_GUIDE_EVERY, diffLines, type StyleState } from '@shared/style'

  const api = window.masil

  let style = $state<StyleState | null>(null)
  let draft = $state('')
  let dirty = $state(false)
  let saved = $state(false)

  $effect(() => {
    void api.style.state().then(apply)
    return api.style.onState(apply)
  })

  function apply(s: StyleState): void {
    style = s
    if (!dirty) draft = s.active?.content ?? ''
  }

  const diff = $derived(style?.proposal ? diffLines(style.active?.content ?? '', style.proposal.content) : [])
  const remaining = $derived(style ? Math.max(0, style.nextAt - style.confirmedCount) : 0)

  async function save(): Promise<void> {
    await api.style.save(draft)
    dirty = false
    saved = true
    setTimeout(() => (saved = false), 2000)
  }

  async function approve(id: number): Promise<void> {
    dirty = false
    await api.style.approve(id)
  }
</script>

<section>
  <h3>문체 가이드</h3>
  <p class="hint">
    등록한 댓글에서 내 말투를 정리해 초안에 반영해요. 댓글이 {STYLE_GUIDE_EVERY}개 쌓일 때마다 AI가 개정안을 만들고, 여기서 승인해야 적용돼요.
    {#if style}
      지금까지 확인된 댓글 {style.confirmedCount}개{#if remaining > 0}, 다음 정리까지 {remaining}개{/if}.
    {/if}
  </p>

  {#if style?.proposal}
    <div class="proposal">
      <p class="ph">새 개정안 <small>(댓글 {style.proposal.basedOnCount}개 기준)</small></p>
      <ul class="diff" aria-label="지금 가이드와 개정안의 차이">
        {#each diff as d, i (i)}
          <li class={d.kind}>
            <span class="sign" aria-hidden="true">{d.kind === 'add' ? '+' : d.kind === 'del' ? '−' : ''}</span>
            <span class="sr">{d.kind === 'add' ? '추가: ' : d.kind === 'del' ? '삭제: ' : ''}</span>{d.text || ' '}
          </li>
        {/each}
      </ul>
      <div class="row-end">
        <button type="button" class="ghost" onclick={() => style?.proposal && api.style.reject(style.proposal.id)}>그대로 두기</button>
        <button type="button" class="primary" onclick={() => style?.proposal && approve(style.proposal.id)}>개정안 적용</button>
      </div>
    </div>
  {/if}

  <label class="block">
    <span>지금 가이드 {#if style?.active}<small>({style.active.source === 'ai' ? 'AI 정리' : '직접 고침'})</small>{/if}</span>
    <textarea
      rows="7"
      bind:value={draft}
      oninput={() => (dirty = true)}
      placeholder={'아직 가이드가 없어요. 직접 적어도 돼요.\n예) - 존댓말, 두세 문장\n- 느낌표는 한 번만'}
    ></textarea>
  </label>
  <div class="row-end">
    {#if style?.error}<span class="err" role="alert">{style.error}</span>{/if}
    {#if saved}<span class="ok" role="status">적용했어요.</span>{/if}
    <button type="button" class="ghost" disabled={style?.busy} onclick={() => api.style.refresh()}>
      {style?.busy ? '정리하는 중' : '지금 정리하기'}
    </button>
    <button type="button" class="ghost" disabled={!dirty} onclick={save}>고친 가이드 적용</button>
  </div>
  <p class="hint">가이드를 비우고 적용하면 초안에 가이드를 넣지 않아요.</p>
</section>

<style>
  section {
    padding: 14px 0;
    border-bottom: 1px solid var(--line);
  }
  h3 {
    margin: 0 0 6px;
    font-family: var(--font-head);
    font-weight: 700;
    font-size: 15px;
  }
  .hint {
    margin: 4px 0 8px;
    font-size: 12.5px;
    color: var(--graphite-soft);
    line-height: 1.55;
  }
  .proposal {
    border: 1px solid var(--pencil-y);
    border-radius: 3px;
    padding: 8px 12px 10px;
    margin: 8px 0 12px;
  }
  .ph {
    margin: 0 0 6px;
    font-weight: 600;
    font-size: 13px;
  }
  .ph small {
    font-weight: 400;
    color: var(--graphite-soft);
  }
  .diff {
    list-style: none;
    margin: 0 0 8px;
    padding: 0;
    font-size: 13px;
    line-height: 1.7;
  }
  .diff li {
    display: flex;
    gap: 6px;
    padding: 0 4px;
  }
  .diff .sign {
    width: 12px;
    flex: none;
    text-align: center;
  }
  .diff .add {
    background: var(--hl);
    color: var(--pen-blue);
  }
  .diff .del {
    color: var(--margin);
    text-decoration: line-through;
  }
  .diff .same {
    color: var(--graphite-soft);
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
  .block {
    display: grid;
    gap: 4px;
    font-size: 13px;
    color: var(--graphite-soft);
  }
  .block small {
    font-size: 11.5px;
  }
  textarea {
    font: inherit;
    font-size: 13px;
    line-height: 1.6;
    color: var(--graphite);
    border: 1px solid #d6d3c6;
    border-radius: 3px;
    padding: 6px 8px;
    background: #fff;
    resize: vertical;
  }
  .row-end {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 6px;
    margin-top: 6px;
  }
  .ghost {
    background: var(--paper);
    border: 1px solid #bdbaae;
    font-size: 12.5px;
    padding: 3px 12px;
    border-radius: 3px;
    color: var(--graphite-soft);
  }
  .ghost:hover:not(:disabled) {
    border-color: var(--graphite);
    color: var(--graphite);
  }
  .primary {
    border: 0;
    background: var(--cover);
    color: #fff;
    font-size: 12.5px;
    padding: 4px 14px;
    border-radius: 3px;
  }
  button:disabled {
    opacity: 0.5;
  }
  .err {
    margin-right: auto;
    font-size: 12.5px;
    color: var(--margin);
  }
  .ok {
    margin-right: auto;
    font-size: 12.5px;
    color: var(--cover);
  }
</style>
