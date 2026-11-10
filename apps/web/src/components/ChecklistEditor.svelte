<script lang="ts">
  import type { ChecklistResponse, PeriodType } from '@warframehub/shared';
  import { onMount } from 'svelte';
  import * as api from '../lib/api.ts';
  import { t } from '../lib/i18n/index.ts';
  import { moveItem, shift } from '../lib/reorder.ts';
  import EditSection from './EditSection.svelte';

  let checklist = $state<ChecklistResponse | null>(null);
  let error = $state<string | null>(null);
  let dragItemId = $state<number | null>(null);
  let confirmRestore = $state(false);
  let newSectionTitle = $state('');
  let newSectionPeriod = $state<PeriodType>('weekly');

  const sectionChoices = $derived(
    checklist?.sections.map((s) => ({ id: s.id, title: s.title })) ?? [],
  );

  /** Runs one edit; the server answers with the whole checklist, which replaces ours. */
  async function run(call: () => Promise<ChecklistResponse>) {
    error = null;
    try {
      checklist = await call();
    } catch (e) {
      error = t('edit.error', { message: e instanceof Error ? e.message : String(e) });
      // Redraw from the server so the inputs show what's really saved.
      checklist = await api.getChecklist().catch(() => checklist);
    }
  }

  function shiftSection(id: number, by: -1 | 1) {
    if (!checklist) return;
    const next = shift(
      checklist.sections.map((s) => s.id),
      id,
      by,
    );
    if (next) void run(() => api.reorderSections(next));
  }

  function shiftItem(sectionId: number, id: number, by: -1 | 1) {
    const section = checklist?.sections.find((s) => s.id === sectionId);
    if (!section) return;
    const next = shift(
      section.items.map((i) => i.id),
      id,
      by,
    );
    if (next) void run(() => api.reorderItems(sectionId, next));
  }

  function move(id: number, sectionId: number, index: number) {
    if (!checklist) return;
    const next = moveItem(checklist.sections, id, sectionId, index);
    if (next) void run(() => api.reorderItems(sectionId, next));
  }

  function addSection(e: SubmitEvent) {
    e.preventDefault();
    const title = newSectionTitle.trim();
    if (!title) return;
    void run(() => api.createSection({ title, period: newSectionPeriod }));
    newSectionTitle = '';
  }

  onMount(() => {
    void run(() => api.getChecklist());
  });
</script>

<div class="editor">
  {#if error}<p class="error frame" role="alert">{error}</p>{/if}

  {#if checklist}
    {#each checklist.sections as section, i (section.id)}
      <EditSection
        {section}
        sections={sectionChoices}
        isFirst={i === 0}
        isLast={i === checklist.sections.length - 1}
        {dragItemId}
        onUpdateSection={(id, patch) => run(() => api.updateSection(id, patch))}
        onDeleteSection={(id) => run(() => api.deleteSection(id))}
        onShiftSection={shiftSection}
        onCreateItem={(body) => run(() => api.createItem(body))}
        onUpdateItem={(id, patch) => run(() => api.updateItem(id, patch))}
        onDeleteItem={(id) => run(() => api.deleteItem(id))}
        onShiftItem={shiftItem}
        onMoveItem={move}
        onDragStart={(id) => (dragItemId = id)}
        onDragEnd={() => (dragItemId = null)}
      />
    {/each}

    <form class="add" onsubmit={addSection}>
      <input
        aria-label={t('edit.newSectionTitle')}
        placeholder={t('edit.newSectionTitle')}
        bind:value={newSectionTitle}
        maxlength="120"
      />
      <select aria-label={t('edit.period')} bind:value={newSectionPeriod}>
        {#each ['daily', 'weekly', 'eight_hour', 'four_day', 'sortie', 'baro', 'manual'] as const as p (p)}
          <option value={p}>{t(`period.${p}`)}</option>
        {/each}
      </select>
      <button type="submit" class="teal" disabled={newSectionTitle.trim() === ''}
        >{t('edit.addSection')}</button
      >
    </form>

    <div class="restore">
      {#if confirmRestore}
        <span>{t('edit.restoreConfirm')}</span>
        <button
          type="button"
          class="danger"
          onclick={() => {
            confirmRestore = false;
            void run(() => api.restoreDefaults());
          }}>{t('edit.restoreYes')}</button
        >
        <button type="button" onclick={() => (confirmRestore = false)}>{t('edit.no')}</button>
      {:else}
        <button type="button" onclick={() => (confirmRestore = true)}>{t('edit.restore')}</button>
      {/if}
    </div>
  {:else if !error}
    <p class="muted">{t('edit.loading')}</p>
  {/if}
</div>

<style>
  .editor {
    display: grid;
    gap: 0.8rem;
    align-content: start;
  }

  .error {
    margin: 0;
    --frame-line: var(--bad);
    padding: 0.5rem 0.8rem;
    color: var(--bad);
  }

  .muted {
    color: var(--muted);
  }

  .add,
  .restore {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }

  .add input {
    flex: 1 1 14rem;
  }

  .restore {
    padding-top: 0.6rem;
    border-top: 1px solid var(--line);
    font-size: 0.85rem;
  }
</style>
