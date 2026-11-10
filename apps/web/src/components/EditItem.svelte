<script lang="ts">
  import type { EditableItem, ItemKind, UpdateItemRequest } from '@warframehub/shared';
  import { t } from '../lib/i18n/index.ts';

  interface Props {
    item: EditableItem;
    sections: { id: number; title: string }[];
    isFirst: boolean;
    isLast: boolean;
    onUpdate: (id: number, patch: UpdateItemRequest) => void;
    onDelete: (id: number) => void;
    onShift: (id: number, by: -1 | 1) => void;
    onMoveTo: (id: number, sectionId: number) => void;
    onDragStart: (id: number) => void;
    onDragEnd: () => void;
  }

  let {
    item,
    sections,
    isFirst,
    isLast,
    onUpdate,
    onDelete,
    onShift,
    onMoveTo,
    onDragStart,
    onDragEnd,
  }: Props = $props();

  const KINDS: ItemKind[] = ['check', 'counter', 'subticks', 'info'];
  let confirmDelete = $state(false);
  // Only the handle starts a drag, so selecting text in the inputs still works.
  let dragArmed = $state(false);

  const count = $derived(item.slots && 'count' in item.slots ? item.slots.count : 1);
  const labels = $derived(item.slots && 'labels' in item.slots ? item.slots.labels.join(', ') : '');

  function value(e: Event): string {
    return (e.currentTarget as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
  }

  function saveText(field: 'title' | 'description', e: Event) {
    const next = value(e).trim();
    if (field === 'title' && next === '') {
      (e.currentTarget as HTMLInputElement).value = item.title; // a title can't be empty
      return;
    }
    if (next !== item[field]) onUpdate(item.id, { [field]: next });
  }

  function saveLink(e: Event) {
    const next = value(e).trim() || null;
    if (next !== item.linkUrl) onUpdate(item.id, { linkUrl: next });
  }

  function saveKind(e: Event) {
    const kind = value(e) as ItemKind;
    if (kind === 'counter') onUpdate(item.id, { kind, slots: { count: 3 } });
    else if (kind === 'subticks')
      onUpdate(item.id, { kind, slots: { labels: splitLabels(t('edit.defaultLabels')) } });
    else onUpdate(item.id, { kind, slots: null });
  }

  function saveCount(e: Event) {
    const n = Number(value(e));
    if (Number.isInteger(n) && n >= 1 && n <= 99 && n !== count)
      onUpdate(item.id, { slots: { count: n } });
  }

  function splitLabels(text: string): string[] {
    return text
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function saveLabels(e: Event) {
    const next = splitLabels(value(e));
    if (next.length > 0 && next.join(', ') !== labels)
      onUpdate(item.id, { slots: { labels: next } });
  }
</script>

<li
  class="item"
  class:hidden={item.hidden}
  data-id={item.id}
  draggable={dragArmed}
  ondragstart={(e) => {
    e.dataTransfer?.setData('text/plain', String(item.id));
    onDragStart(item.id);
  }}
  ondragend={() => {
    dragArmed = false;
    onDragEnd();
  }}
>
  <div class="row">
    <span
      class="handle"
      role="button"
      tabindex="-1"
      aria-hidden="true"
      title={t('edit.dragHandle', { title: item.title })}
      onpointerdown={() => (dragArmed = true)}
      onpointerup={() => (dragArmed = false)}>⠿</span
    >
    <input
      class="title"
      aria-label={t('edit.itemTitle')}
      value={item.title}
      maxlength="120"
      onchange={(e) => saveText('title', e)}
    />
    {#if item.hidden}<span class="badge">{t('edit.hidden')}</span>{/if}
    {#if item.origin === 'custom'}<span class="badge teal">{t('edit.custom')}</span>{/if}
    {#if item.edited}<span class="badge gold">{t('edit.edited')}</span>{/if}
  </div>

  <div class="fields">
    <label>
      <span>{t('edit.description')}</span>
      <textarea
        rows="1"
        maxlength="2000"
        value={item.description}
        onchange={(e) => saveText('description', e)}></textarea>
    </label>
    <label>
      <span>{t('edit.kind')}</span>
      <select value={item.kind} onchange={saveKind}>
        {#each KINDS as kind (kind)}<option value={kind}>{t(`kind.${kind}`)}</option>{/each}
      </select>
    </label>
    {#if item.kind === 'counter'}
      <label>
        <span>{t('edit.count')}</span>
        <input type="number" min="1" max="99" value={count} onchange={saveCount} />
      </label>
    {:else if item.kind === 'subticks'}
      <label>
        <span>{t('edit.labels')}</span>
        <input value={labels} onchange={saveLabels} />
      </label>
    {/if}
    <label>
      <span>{t('edit.link')}</span>
      <input type="url" value={item.linkUrl ?? ''} placeholder="https://" onchange={saveLink} />
    </label>
    <label class="check">
      <input
        type="checkbox"
        checked={item.verify}
        onchange={(e) =>
          onUpdate(item.id, { verify: (e.currentTarget as HTMLInputElement).checked })}
      />
      <span>{t('edit.verify')}</span>
    </label>
  </div>

  <div class="actions">
    <button
      type="button"
      class="icon"
      disabled={isFirst}
      onclick={() => onShift(item.id, -1)}
      aria-label={t('edit.moveItemUp', { title: item.title })}>↑</button
    >
    <button
      type="button"
      class="icon"
      disabled={isLast}
      onclick={() => onShift(item.id, 1)}
      aria-label={t('edit.moveItemDown', { title: item.title })}>↓</button
    >
    <label class="move">
      <span class="sr-only">{t('edit.moveTo')}</span>
      <select
        value={item.sectionId}
        onchange={(e) => onMoveTo(item.id, Number(value(e)))}
        title={t('edit.moveTo')}
      >
        {#each sections as s (s.id)}<option value={s.id}>{s.title}</option>{/each}
      </select>
    </label>
    <button type="button" onclick={() => onUpdate(item.id, { hidden: !item.hidden })}>
      {item.hidden ? t('edit.unhide') : t('edit.hide')}
    </button>
    {#if item.origin === 'custom'}
      {#if confirmDelete}
        <span class="confirm">{t('edit.deleteConfirm')}</span>
        <button type="button" class="danger" onclick={() => onDelete(item.id)}
          >{t('edit.yes')}</button
        >
        <button type="button" onclick={() => (confirmDelete = false)}>{t('edit.no')}</button>
      {:else}
        <button type="button" onclick={() => (confirmDelete = true)}>{t('edit.delete')}</button>
      {/if}
    {/if}
  </div>
</li>

<style>
  .item {
    display: grid;
    gap: 0.4rem;
    padding: 0.6rem 0;
    border-bottom: 1px solid color-mix(in srgb, var(--line) 60%, transparent);
  }

  .item.hidden {
    opacity: 0.55;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .handle {
    cursor: grab;
    color: var(--muted);
    user-select: none;
    padding: 0 0.2rem;
  }

  .title {
    flex: 1;
    min-width: 0;
    font-weight: 600;
  }

  .fields {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
    gap: 0.4rem 0.8rem;
    padding-left: 1.6rem;
  }

  label {
    display: grid;
    gap: 0.15rem;
    font-size: 0.75rem;
    color: var(--muted);
  }

  label.check {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem;
    padding-left: 1.6rem;
  }

  .move select {
    max-width: 12rem;
  }

  .confirm {
    font-size: 0.8rem;
    color: var(--bad);
  }
</style>
