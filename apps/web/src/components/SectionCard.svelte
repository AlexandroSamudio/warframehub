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
  const complete = $derived(progress.total > 0 && progress.done >= progress.total);
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

<section class="card frame accent" class:complete aria-labelledby={headingId}>
  <header>
    <div class="heading">
      <h2 id={headingId}>{section.title}</h2>
      <p class="reset num">{resetLabel}</p>
    </div>
    {#if complete}
      <span class="badge ok">{t('section.complete')}</span>
    {/if}
    {#if section.period === 'manual'}
      <button
        type="button"
        class="primary"
        onclick={() => onClear(section)}
        title={t('section.clearHint', { title: section.title })}
      >
        {t('section.clear')}
      </button>
    {/if}
  </header>

  {#if progress.total > 0}
    <div class="progress">
      <div class="bar" aria-hidden="true">
        <div class="fill" style:width="{(progress.done / progress.total) * 100}%"></div>
      </div>
      <span class="num"
        >{t('section.progress', { done: progress.done, total: progress.total })}</span
      >
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
    padding: 0.95rem 1.15rem 0.8rem;
  }

  .card.complete {
    --frame-line: color-mix(in srgb, var(--ok) 45%, var(--line));
  }

  header {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
  }

  .heading {
    flex: 1;
    min-width: 0;
  }

  h2 {
    margin: 0;
    font-size: 1.2rem;
    line-height: 1.2;
    color: var(--gold);
  }

  .reset {
    margin: 0.15rem 0 0;
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--muted);
  }

  .progress {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    margin-top: 0.65rem;
    font-size: 0.85rem;
    color: var(--muted);
  }

  .bar {
    flex: 1;
    height: 4px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    box-sizing: content-box;
  }

  .fill {
    height: 100%;
    background: linear-gradient(
      90deg,
      var(--teal),
      color-mix(in srgb, var(--teal) 60%, var(--gold))
    );
  }

  .complete .fill {
    background: var(--ok);
  }

  @media (prefers-reduced-motion: no-preference) {
    .fill {
      transition: width 200ms ease;
    }
  }

  ul {
    list-style: none;
    margin: 0.4rem 0 0;
    padding: 0;
  }
</style>
