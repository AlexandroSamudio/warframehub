<script lang="ts">
  import type { TrackerItem, TrackerResponse, TrackerSection } from '@warframehub/shared';
  import { onMount } from 'svelte';
  import ResetClocks from '../components/ResetClocks.svelte';
  import SectionCard from '../components/SectionCard.svelte';
  import { clearSection, getTracker, putTick } from '../lib/api.ts';
  import { t } from '../lib/i18n/index.ts';
  import { earliestReset } from '../lib/progress.ts';
  import { DISPLAY_TZ } from '../lib/time.ts';

  let data = $state<TrackerResponse | null>(null);
  let loadFailed = $state(false);
  let saveFailed = $state(false);
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
    };
  });
</script>

{#if data}
  <div class="tracker">
    <ResetClocks clocks={data.clocks} {nowMs} {timeZone} />

    {#if saveFailed}
      <div class="alert" role="alert">
        <span>{t('tracker.saveError')}</span>
        <button type="button" onclick={() => (saveFailed = false)}>{t('tracker.dismiss')}</button>
      </div>
    {/if}

    <div class="sections">
      {#each data.sections as section (section.id)}
        <SectionCard {section} {nowMs} {timeZone} onToggle={toggle} onClear={clear} />
      {/each}
    </div>
  </div>
{:else if loadFailed}
  <div class="alert" role="alert">
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

  .sections {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 22rem), 1fr));
    gap: 1rem;
    align-items: start;
  }

  .alert {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.6rem 0.9rem;
    border: 1px solid var(--bad);
    color: var(--bad);
  }

  .muted {
    color: var(--muted);
  }

  button {
    font: inherit;
    font-size: 0.85rem;
    color: var(--fg);
    background: transparent;
    border: 1px solid var(--gold);
    padding: 0.2rem 0.8rem;
    cursor: pointer;
  }

  button:hover {
    background: color-mix(in srgb, var(--gold) 15%, transparent);
  }
</style>
