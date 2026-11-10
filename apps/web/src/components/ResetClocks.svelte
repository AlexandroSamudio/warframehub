<script lang="ts">
  import type { ResetClock } from '@warframehub/shared';
  import { t } from '../lib/i18n/index.ts';
  import { formatCountdown, formatLocal, formatUtc, isResetSoon } from '../lib/time.ts';

  interface Props {
    clocks: ResetClock[];
    /** Current time in epoch ms, already corrected to the server clock. */
    nowMs: number;
    timeZone: string;
  }

  let { clocks, nowMs, timeZone }: Props = $props();
</script>

<section class="clocks" aria-label={t('clocks.label')}>
  {#each clocks as clock (clock.id)}
    {@const left = clock.nextReset ? Date.parse(clock.nextReset) - nowMs : null}
    <div class="clock" class:soon={left !== null && isResetSoon(clock.id, left)}>
      <span class="name">{t(`clock.${clock.id}`)}</span>
      {#if clock.nextReset && left !== null}
        <span class="countdown">
          {#if clock.estimated}
            <abbr title={t('clock.estimatedHint')}>≈</abbr>
          {/if}
          {formatCountdown(Math.max(0, left))}
        </span>
        <span class="at">
          {t('clock.at', {
            local: formatLocal(clock.nextReset, timeZone),
            utc: formatUtc(clock.nextReset),
          })}
        </span>
        {#if clock.estimated}
          <span class="tag" title={t('clock.estimatedHint')}>{t('clock.estimated')}</span>
        {/if}
      {:else}
        <span class="at">{t('clock.unknown')}</span>
      {/if}
    </div>
  {/each}
</section>

<style>
  .clocks {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
    gap: 0.5rem;
  }

  .clock {
    display: grid;
    gap: 0.1rem;
    padding: 0.6rem 0.8rem;
    background: var(--surface);
    border: 1px solid var(--line);
    border-top: 2px solid var(--line);
  }

  .clock.soon {
    border-top-color: var(--gold);
  }

  .name {
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
  }

  .countdown {
    font-family: var(--font-mono);
    font-size: 1.25rem;
    font-variant-numeric: tabular-nums;
  }

  .soon .countdown {
    color: var(--gold);
  }

  .countdown abbr {
    text-decoration: none;
    color: var(--muted);
  }

  .at {
    font-family: var(--font-mono);
    font-size: 0.8rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  .tag {
    justify-self: start;
    font-size: 0.7rem;
    color: var(--teal);
    border: 1px solid currentColor;
    padding: 0 0.3rem;
  }
</style>
