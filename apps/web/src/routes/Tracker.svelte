<script lang="ts">
  import type { TrackerItem, TrackerResponse, TrackerSection } from '@warframehub/shared';
  import { onMount } from 'svelte';
  import ChecklistEditor from '../components/ChecklistEditor.svelte';
  import ResetClocks from '../components/ResetClocks.svelte';
  import GoalsCard from '../components/GoalsCard.svelte';
  import Rotations from '../components/Rotations.svelte';
  import SectionCard from '../components/SectionCard.svelte';
  import Segmented from '../components/Segmented.svelte';
  import { savedTrackerView, saveTrackerView, type TrackerView } from '../lib/folds.ts';
  import { clearSection, dismissNotice, getTracker, putTick } from '../lib/api.ts';
  import { t } from '../lib/i18n/index.ts';
  import { earliestReset } from '../lib/progress.ts';
  import { DISPLAY_TZ } from '../lib/time.ts';

  let data = $state<TrackerResponse | null>(null);
  let loadFailed = $state(false);
  let saveFailed = $state(false);
  let editing = $state(false);

  // Under 60rem the two columns stack; a switch then shows one at a time (both stay mounted,
  // so the countdowns keep running).
  let narrow = $state(false);
  let view = $state<TrackerView>(savedTrackerView());
  const showChecklist = $derived(!narrow || view === 'checklist');
  const showLive = $derived(!narrow || view === 'live');

  function chooseView(next: TrackerView) {
    view = next;
    saveTrackerView(next);
  }

  async function toggleEditing() {
    editing = !editing;
    // Back from edit mode: show the checklist as it is now saved.
    if (!editing) await load();
  }

  async function dismiss() {
    if (data) data.notice = null;
    await dismissNotice().catch(() => {
      saveFailed = true;
    });
  }
  let loading = false;

  // Countdowns use the server's clock: offset = server time − browser time at the last load.
  // Only for display; the server alone decides which period a tick belongs to.
  let offsetMs = 0;
  let nowMs = $state(Date.now());

  const timeZone = $derived(data?.displayTz ?? DISPLAY_TZ);
  const nextResetMs = $derived(
    data
      ? earliestReset([
          ...data.clocks.map((c) => c.nextReset),
          ...data.sections.map((s) => s.nextReset),
        ])
      : null,
  );

  async function load() {
    if (loading) return;
    loading = true;
    try {
      const fresh = await getTracker();
      offsetMs = Date.parse(fresh.serverTime) - Date.now();
      nowMs = Date.now() + offsetMs;
      data = fresh;
      loadFailed = false;
    } catch {
      // Keep showing the last good data if we have it.
      if (!data) loadFailed = true;
    } finally {
      loading = false;
    }
  }

  async function toggle(item: TrackerItem, slot: number, checked: boolean) {
    const before = item.checked;
    item.checked = checked
      ? [...new Set([...before, slot])].sort((a, b) => a - b)
      : before.filter((s) => s !== slot);
    try {
      await putTick({ itemId: item.id, slot, checked });
    } catch {
      item.checked = before;
      saveFailed = true;
    }
  }

  async function clear(section: TrackerSection) {
    try {
      await clearSection(section.id);
      await load();
    } catch {
      saveFailed = true;
    }
  }

  onMount(() => {
    const narrowQuery = window.matchMedia('(max-width: 60rem)');
    narrow = narrowQuery.matches;
    const onNarrow = (e: MediaQueryListEvent) => (narrow = e.matches);
    narrowQuery.addEventListener('change', onNarrow);
    void load();
    const timer = setInterval(() => {
      nowMs = Date.now() + offsetMs;
      // A reset just passed: fetch the new period keys (old ticks then show as unticked).
      if (nextResetMs !== null && nowMs >= nextResetMs) void load();
    }, 5_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      narrowQuery.removeEventListener('change', onNarrow);
    };
  });
</script>

{#if data}
  <div class="tracker">
    <ResetClocks clocks={data.clocks} {nowMs} {timeZone} />

    {#if saveFailed}
      <div class="alert frame" role="alert">
        <span>{t('tracker.saveError')}</span>
        <button type="button" onclick={() => (saveFailed = false)}>{t('tracker.dismiss')}</button>
      </div>
    {/if}

    {#if data.notice}
      <div class="notice frame" role="status">
        <span>{t('notice.removed', { titles: data.notice.removedTitles.join(', ') })}</span>
        <button type="button" onclick={dismiss}>{t('notice.dismiss')}</button>
      </div>
    {/if}

    {#if narrow && !editing}
      <Segmented
        legend={t('tracker.view.legend')}
        hideLegend
        name="tracker-view"
        options={[
          { value: 'checklist', label: t('tracker.view.checklist') },
          { value: 'live', label: t('tracker.view.live') },
        ]}
        value={view}
        onchange={chooseView}
      />
    {/if}

    <div class="columns">
      <section class="main" aria-labelledby="checklist-title" hidden={!showChecklist && !editing}>
        <!-- The same header row as Live rotations, so both columns start level. -->
        <div class="bar" class:narrow>
          <!-- On phones the switch above already names it. -->
          <h2 id="checklist-title" class:sr-only={narrow}>{t('tracker.checklist')}</h2>
          <button type="button" class="primary" aria-pressed={editing} onclick={toggleEditing}>
            {editing ? t('edit.done') : t('edit.open')}
          </button>
        </div>
        {#if editing}
          <ChecklistEditor />
        {:else}
          <!-- Columns, not grid rows: each panel stacks under the one above it, with no holes. -->
          <div class="sections">
            {#each data.sections as section (section.id)}
              <div class="cell">
                <SectionCard {section} {nowMs} {timeZone} onToggle={toggle} onClear={clear} />
              </div>
            {/each}
          </div>
        {/if}
      </section>
      <div class="side" hidden={!showLive || (narrow && editing)}>
        <GoalsCard />
        <Rotations {nowMs} {timeZone} onUpdate={load} quietHeading={narrow} />
      </div>
    </div>
  </div>
{:else if loadFailed}
  <div class="alert frame" role="alert">
    <span>{t('tracker.error')}</span>
    <button type="button" onclick={load}>{t('tracker.retry')}</button>
  </div>
{:else}
  <p class="muted" aria-live="polite">{t('tracker.loading')}</p>
{/if}

<style>
  .tracker {
    display: grid;
    gap: 1rem;
  }

  .columns {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(17rem, 22rem);
    gap: 1rem;
    align-items: start;
  }

  @media (max-width: 60rem) {
    .columns {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .side {
    display: grid;
    gap: 0.6rem;
    align-content: start;
  }

  .main {
    display: grid;
    gap: 0.6rem;
    align-content: start;
    min-width: 0;
  }

  /* Matches the Live rotations header (Rotations.svelte .bar / h2). */
  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  /* With the heading read out only, the action keeps its place on the right. */
  .bar.narrow {
    justify-content: flex-end;
  }

  h2 {
    margin: 0;
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: var(--muted);
  }

  .sections {
    columns: 2 22rem;
    column-gap: 1rem;
  }

  .cell {
    break-inside: avoid;
    margin-bottom: 1rem;
  }

  .cell:last-child {
    margin-bottom: 0;
  }

  [hidden] {
    display: none;
  }

  .notice {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    --frame-line: var(--gold);
    padding: 0.6rem 0.9rem;
    color: var(--gold);
  }

  .alert {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    --frame-line: var(--bad);
    padding: 0.6rem 0.9rem;
    color: var(--bad);
  }

  .muted {
    color: var(--muted);
  }
</style>
