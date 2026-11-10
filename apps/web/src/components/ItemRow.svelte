<script lang="ts">
  import type { TrackerItem } from '@warframehub/shared';
  import { t } from '../lib/i18n/index.ts';

  interface Props {
    item: TrackerItem;
    onToggle: (item: TrackerItem, slot: number, checked: boolean) => void;
  }

  let { item, onToggle }: Props = $props();

  const slots = $derived(Array.from({ length: item.slotCount }, (_, i) => i));
  const labels = $derived(item.slots && 'labels' in item.slots ? item.slots.labels : null);
  const done = $derived(item.slotCount > 0 && item.checked.length >= item.slotCount);

  function slotLabel(slot: number): string {
    if (labels) return t('item.subtick', { title: item.title, label: labels[slot] ?? '' });
    return t('item.slot', { title: item.title, n: slot + 1, total: item.slotCount });
  }

  function change(slot: number, event: Event) {
    onToggle(item, slot, (event.currentTarget as HTMLInputElement).checked);
  }
</script>

<li class="item" class:done class:info={item.kind === 'info'}>
  {#if item.kind === 'check'}
    <label class="main">
      <input type="checkbox" checked={item.checked.includes(0)} onchange={(e) => change(0, e)} />
      <span class="title">{item.title}</span>
      {#if item.verify}
        <span class="badge gold" title={t('item.verifyHint')}>{t('item.verify')}</span>
      {/if}
    </label>
  {:else}
    <div class="main">
      <span class="title">{item.title}</span>
      {#if item.verify}
        <span class="badge gold" title={t('item.verifyHint')}>{t('item.verify')}</span>
      {/if}
    </div>
  {/if}

  {#if item.description}
    <p class="description">{item.description}</p>
  {/if}

  {#if item.kind === 'counter' || item.kind === 'subticks'}
    <div class="slots" class:named={labels !== null}>
      {#each slots as slot (slot)}
        <label class="slot" title={slotLabel(slot)}>
          <input
            type="checkbox"
            aria-label={slotLabel(slot)}
            checked={item.checked.includes(slot)}
            onchange={(e) => change(slot, e)}
          />
          <span aria-hidden="true">{labels ? labels[slot] : slot + 1}</span>
        </label>
      {/each}
    </div>
  {/if}
</li>

<style>
  .item {
    display: grid;
    gap: 0.2rem;
    padding: 0.45rem 0;
    border-bottom: 1px solid color-mix(in srgb, var(--line) 60%, transparent);
  }

  .item:last-child {
    border-bottom: none;
  }

  .main {
    display: flex;
    align-items: center;
    gap: 0.55rem;
  }

  label.main {
    cursor: pointer;
  }

  .info .main {
    padding-left: 1.55rem;
  }

  .done .title {
    color: var(--muted);
    text-decoration: line-through;
    text-decoration-color: color-mix(in srgb, var(--muted) 60%, transparent);
  }

  .description {
    margin: 0;
    padding-left: 1.55rem;
    font-size: 0.85rem;
    color: var(--muted);
  }

  .slots {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    padding-left: 1.55rem;
  }

  .slot {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.1rem 0.45rem 0.1rem 0.25rem;
    border: 1px solid var(--line-strong);
    background: var(--surface-2);
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 0.85rem;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
  }

  .slot:has(input:checked) {
    border-color: var(--teal);
    color: var(--teal);
    background: color-mix(in srgb, var(--teal) 10%, var(--surface-2));
  }

  .slot:has(input:focus-visible) {
    outline: 2px solid var(--teal);
    outline-offset: 2px;
  }

  .info .title {
    color: var(--muted);
    font-style: italic;
  }
</style>
