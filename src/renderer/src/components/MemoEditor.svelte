<script lang="ts">
  import type { Closeness, Neighbor, NeighborPatch, Speech } from '@shared/types'

  let {
    neighbor,
    onsave,
    oncancel
  }: { neighbor: Neighbor; onsave: (patch: NeighborPatch) => void | Promise<void>; oncancel: () => void } = $props()

  // 편집 시작 시점의 값을 복사해서 쓴다 (저장 전까지 원본은 그대로)
  // svelte-ignore state_referenced_locally
  let form = $state({
    nickname: neighbor.name,
    honorific: neighbor.honorific,
    speech: neighbor.speech as Speech,
    closeness: neighbor.closeness as Closeness,
    memo: neighbor.memo
  })
  let saving = $state(false)

  async function submit(e: SubmitEvent): Promise<void> {
    e.preventDefault()
    saving = true
    try {
      await onsave({ ...form })
    } finally {
      saving = false
    }
  }
</script>

<form class="memo" onsubmit={submit}>
  <label>
    <span>이름</span>
    <input bind:value={form.nickname} maxlength="40" placeholder="비우면 네이버 닉네임이나 블로그 제목" />
  </label>
  <label>
    <span>호칭</span>
    <input bind:value={form.honorific} maxlength="20" placeholder="예: 봄비님" />
  </label>
  <fieldset>
    <legend>말투</legend>
    <label class="inline"><input type="radio" bind:group={form.speech} value="polite" /> 존댓말</label>
    <label class="inline"><input type="radio" bind:group={form.speech} value="casual" /> 반말</label>
  </fieldset>
  <fieldset>
    <legend>친밀도</legend>
    {#each [1, 2, 3] as level (level)}
      <label class="inline"><input type="radio" bind:group={form.closeness} value={level} /> {['조금', '보통', '아주 가까움'][level - 1]}</label>
    {/each}
  </fieldset>
  <label class="block">
    <span>메모</span>
    <textarea bind:value={form.memo} rows="3" placeholder="예: 제주 이주 3년 차, 귤밭 일 얘기를 나눴음"></textarea>
  </label>
  <div class="actions">
    <button type="button" class="ghost" onclick={oncancel}>취소</button>
    <button type="submit" class="primary" disabled={saving}>수첩 저장</button>
  </div>
</form>

<style>
  .memo {
    display: grid;
    gap: 8px;
    padding: 10px 0 4px;
    font-size: 13px;
  }
  label {
    display: grid;
    grid-template-columns: 52px 1fr;
    align-items: center;
    gap: 8px;
  }
  label.block {
    align-items: start;
  }
  label span,
  legend {
    color: var(--graphite-soft);
    font-size: 12.5px;
  }
  fieldset {
    border: 0;
    margin: 0;
    padding: 0;
    display: flex;
    gap: 12px;
    align-items: center;
  }
  legend {
    float: left;
    width: 52px;
    padding: 0;
    margin-right: 8px;
  }
  label.inline {
    display: inline-flex;
    gap: 4px;
  }
  input:not([type='radio']),
  textarea {
    font: inherit;
    border: 1px solid #d6d3c6;
    border-radius: 3px;
    padding: 4px 8px;
    background: #fff;
    width: 100%;
  }
  textarea {
    resize: vertical;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
  }
  .ghost {
    background: var(--paper);
    border: 1px solid #bdbaae;
    font-size: 12px;
    padding: 2px 10px;
    border-radius: 3px;
    color: var(--graphite-soft);
  }
  .primary {
    border: 0;
    background: var(--cover);
    color: #fff;
    font-size: 12.5px;
    padding: 3px 12px;
    border-radius: 3px;
  }
  .primary:disabled {
    opacity: 0.6;
  }
</style>
