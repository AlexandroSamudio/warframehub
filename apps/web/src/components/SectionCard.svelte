<script lang="ts">
  import type { TrackerItem, TrackerSection } from '@warframehub/shared';
  import { t } from '../lib/i18n/index.ts';
  import { sectionProgress } from '../lib/progress.ts';
  import { formatCountdown, formatLocal, formatUtc } from '../lib/time.ts';
  import ItemRow from './ItemRow.svelte';

  interface Props {
    section: TrackerSection;
    nowMs: number;
    timeZone: string;
    onToggle: (item: TrackerItem, slot: number, checked: boolean) => void;
    onClear: (section: TrackerSection) => void;
  }

  let { section, nowMs, timeZone, onToggle, onClear }: Props = $props();

  const progress = $derived(sectionProgress(section));
  const headingId = $derived(`section-${section.id}`);

  const resetLabel = $derived.by(() => {
    if (section.period === 'manual') return t('section.manual');
    if (!section.nextReset) return t('section.baroUnknown');
    const left = Math.max(0, Date.parse(section.nextReset) - nowMs);
    return t('section.resetsIn', {
      countdown: `${section.estimated ? '≈ ' : ''}${formatCountdown(left)}`,
      local: formatLocal(section.nextReset, timeZone),
      utc: formatUtc(section.nextReset),
    });
  });
</script>

<section class="card" aria-labelledby={headingId}>
  <header>
    <div class="heading">
      <h2 id={headingId}>{section.title}</h2>
      <p class="reset">{resetLabel}</p>
    </div>
    {#if section.period === 'manual'}
      <button
        type="button"
        onclick={() => onClear(section)}
        title={t('section.clearHint', { title: section.title })}
      >
        {t('section.clear')}
      </button>
    {/if}
  </header>

  {#if progress.total > 0}
    <div class="progress">
      <meter min="0" max={progress.total} value={progress.done} aria-labelledby={headingId}></meter>
      <span>{t('section.progress', { done: progress.done, total: progress.total })}</span>
    </div>
  {/if}

  <ul>
    {#each section.items as item (item.id)}
      <ItemRow {item} {onToggle} />
    {/each}
  </ul>
</section>

<style>
  .card {
    background: var(--surface);
    border: 1px solid var(--line);
    padding: 0.9rem 1.1rem;
    clip-path: polygon(
      0 0,
      calc(100% - 12px) 0,
      100% 12px,
      100% 100%,
      12px 100%,
      0 calc(100% - 12px)
    );
  }

  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }

  h2 {
    margin: 0;
    font-size: 1.05rem;
    color: var(--gold);
    letter-spacing: 0.03em;
  }

  .reset {
    margin: 0.1rem 0 0;
    font-family: var(--font-mono);
    font-size: 0.8rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  .progress {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin-top: 0.6rem;
    font-size: 0.8rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  meter {
    flex: 1;
    height: 0.4rem;
  }

  ul {
    list-style: none;
    margin: 0.4rem 0 0;
    padding: 0;
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
