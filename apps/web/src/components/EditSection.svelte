<script lang="ts">
  import type {
    CreateItemRequest,
    EditableSection,
    ItemKind,
    PeriodType,
    UpdateItemRequest,
    UpdateSectionRequest,
  } from '@warframehub/shared';
  import { t } from '../lib/i18n/index.ts';
  import EditItem from './EditItem.svelte';

  interface Props {
    section: EditableSection;
    sections: { id: number; title: string }[];
    isFirst: boolean;
    isLast: boolean;
    dragItemId: number | null;
    onUpdateSection: (id: number, patch: UpdateSectionRequest) => void;
    onDeleteSection: (id: number) => void;
    onShiftSection: (id: number, by: -1 | 1) => void;
    onCreateItem: (body: CreateItemRequest) => void;
    onUpdateItem: (id: number, patch: UpdateItemRequest) => void;
    onDeleteItem: (id: number) => void;
    onShiftItem: (sectionId: number, id: number, by: -1 | 1) => void;
    onMoveItem: (id: number, sectionId: number, index: number) => void;
    onDragStart: (id: number) => void;
    onDragEnd: () => void;
  }

  let {
    section,
    sections,
    isFirst,
    isLast,
    dragItemId,
    onUpdateSection,
    onDeleteSection,
    onShiftSection,
    onCreateItem,
    onUpdateItem,
    onDeleteItem,
    onShiftItem,
    onMoveItem,
    onDragStart,
    onDragEnd,
  }: Props = $props();

  const PERIODS: PeriodType[] = ['daily', 'weekly', 'eight_hour', 'sortie', 'baro', 'manual'];
  const KINDS: ItemKind[] = ['check', 'counter', 'subticks', 'info'];

  let confirmDelete = $state(false);
  let newTitle = $state('');
  let newKind = $state<ItemKind>('check');
  let dropIndex = $state<number | null>(null);
  let list: HTMLUListElement | undefined = $state();

  function saveTitle(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const next = input.value.trim();
    if (next === '') input.value = section.title;
    else if (next !== section.title) onUpdateSection(section.id, { title: next });
  }

  function addItem(e: SubmitEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    onCreateItem({
      sectionId: section.id,
      title,
      kind: newKind,
      slots:
        newKind === 'counter'
          ? { count: 3 }
          : newKind === 'subticks'
            ? {
                labels: t('edit.defaultLabels')
                  .split(',')
                  .map((s) => s.trim()),
              }
            : null,
    });
    newTitle = '';
  }

  /** Where a drop at this pointer position lands, counting items without the dragged one. */
  function indexAt(clientY: number): number {
    const rows = [...(list?.querySelectorAll<HTMLElement>('li[data-id]') ?? [])].filter(
      (li) => Number(li.dataset.id) !== dragItemId,
    );
    const at = rows.findIndex((li) => {
      const r = li.getBoundingClientRect();
      return clientY < r.top + r.height / 2;
    });
    return at === -1 ? rows.length : at;
  }
</script>

<section class="card" class:hidden={section.hidden}>
  <header>
    <input
      class="title"
      aria-label={t('edit.sectionTitle')}
      value={section.title}
      maxlength="120"
      onchange={saveTitle}
    />
    <label class="period">
      <span>{t('edit.period')}</span>
      <select
        value={section.period}
        onchange={(e) =>
          onUpdateSection(section.id, {
            period: (e.currentTarget as HTMLSelectElement).value as PeriodType,
          })}
      >
        {#each PERIODS as p (p)}<option value={p}>{t(`period.${p}`)}</option>{/each}
      </select>
    </label>
    <div class="actions">
      {#if section.hidden}<span class="tag">{t('edit.hidden')}</span>{/if}
      {#if section.origin === 'custom'}<span class="tag">{t('edit.custom')}</span>{/if}
      <button
        type="button"
        disabled={isFirst}
        onclick={() => onShiftSection(section.id, -1)}
        aria-label={t('edit.moveSectionUp', { title: section.title })}>↑</button
      >
      <button
        type="button"
        disabled={isLast}
        onclick={() => onShiftSection(section.id, 1)}
        aria-label={t('edit.moveSectionDown', { title: section.title })}>↓</button
      >
      <button
        type="button"
        onclick={() => onUpdateSection(section.id, { hidden: !section.hidden })}
      >
        {section.hidden ? t('edit.unhide') : t('edit.hide')}
      </button>
      {#if section.origin === 'custom'}
        {#if confirmDelete}
          <span class="confirm">{t('edit.deleteConfirm')}</span>
          <button type="button" class="danger" onclick={() => onDeleteSection(section.id)}
            >{t('edit.yes')}</button
          >
          <button type="button" onclick={() => (confirmDelete = false)}>{t('edit.no')}</button>
        {:else}
          <button type="button" onclick={() => (confirmDelete = true)}>{t('edit.delete')}</button>
        {/if}
      {/if}
    </div>
  </header>

  <ul
    bind:this={list}
    class:dropping={dropIndex !== null}
    ondragover={(e) => {
      if (dragItemId === null) return;
      e.preventDefault();
      dropIndex = indexAt(e.clientY);
    }}
    ondragleave={(e) => {
      if (!list?.contains(e.relatedTarget as Node | null)) dropIndex = null;
    }}
    ondrop={(e) => {
      e.preventDefault();
      if (dragItemId !== null) onMoveItem(dragItemId, section.id, indexAt(e.clientY));
      dropIndex = null;
    }}
  >
    {#each section.items as item, i (item.id)}
      <EditItem
        {item}
        {sections}
        isFirst={i === 0}
        isLast={i === section.items.length - 1}
        onUpdate={onUpdateItem}
        onDelete={onDeleteItem}
        onShift={(id, by) => onShiftItem(section.id, id, by)}
        onMoveTo={(id, sectionId) => onMoveItem(id, sectionId, Number.MAX_SAFE_INTEGER)}
        {onDragStart}
        {onDragEnd}
      />
    {:else}
      <li class="empty">{t('edit.emptySection')}</li>
    {/each}
  </ul>

  <form class="add" onsubmit={addItem}>
    <input
      aria-label={t('edit.newItemTitle')}
      placeholder={t('edit.newItemTitle')}
      bind:value={newTitle}
      maxlength="120"
    />
    <select aria-label={t('edit.kind')} bind:value={newKind}>
      {#each KINDS as kind (kind)}<option value={kind}>{t(`kind.${kind}`)}</option>{/each}
    </select>
    <button type="submit" disabled={newTitle.trim() === ''}>{t('edit.addItem')}</button>
  </form>
</section>

<style>
  .card {
    background: var(--surface);
    border: 1px solid var(--line);
    padding: 0.8rem 1rem;
    display: grid;
    gap: 0.5rem;
  }

  .card.hidden {
    opacity: 0.7;
  }

  header {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 0.5rem 0.8rem;
  }

  .title {
    flex: 1 1 14rem;
    font-weight: 600;
    color: var(--gold);
  }

  .period {
    display: grid;
    gap: 0.15rem;
    font-size: 0.75rem;
    color: var(--muted);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0 0.3rem;
    border: 1px dashed transparent;
  }

  ul.dropping {
    border-color: var(--teal);
  }

  .empty {
    padding: 0.6rem 0;
    font-size: 0.85rem;
    color: var(--muted);
  }

  .add {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .add input {
    flex: 1 1 12rem;
  }

  .tag {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    border: 1px solid var(--line);
    padding: 0 0.3rem;
  }

  .confirm {
    font-size: 0.8rem;
    color: var(--bad);
  }

  input,
  select {
    font: inherit;
    font-size: 0.85rem;
    color: var(--fg);
    background: var(--bg);
    border: 1px solid var(--line);
    padding: 0.25rem 0.45rem;
  }

  button {
    font: inherit;
    font-size: 0.8rem;
    color: var(--fg);
    background: transparent;
    border: 1px solid var(--line);
    padding: 0.15rem 0.6rem;
    cursor: pointer;
  }

  button:hover:not(:disabled) {
    border-color: var(--gold);
  }

  button:disabled {
    opacity: 0.4;
    cursor: default;
  }

  button.danger {
    border-color: var(--bad);
    color: var(--bad);
  }
</style>
