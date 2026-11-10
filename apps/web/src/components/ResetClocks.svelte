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
    {@const soon = left !== null && isResetSoon(clock.id, left)}
    <div class="clock frame" class:accent={soon} class:soon>
      <span class="eyebrow">{t(`clock.${clock.id}`)}</span>
      {#if clock.nextReset && left !== null}
        <span class="countdown num">
          {#if clock.estimated}
            <abbr title={t('clock.estimatedHint')}>≈</abbr>
          {/if}
          {formatCountdown(Math.max(0, left))}
        </span>
        <span class="at num">
          {t('clock.at', {
            local: formatLocal(clock.nextReset, timeZone),
            utc: formatUtc(clock.nextReset),
          })}
        </span>
        {#if clock.estimated}
          <span class="badge teal" title={t('clock.estimatedHint')}>{t('clock.estimated')}</span>
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
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 8.75rem), 1fr));
    gap: 0.5rem;
  }

  .clock {
    --cut: 10px;
    display: grid;
    align-content: start;
    gap: 0.05rem;
    padding: 0.65rem 0.9rem 0.7rem;
  }

  .clock.soon {
    --frame-line: color-mix(in srgb, var(--gold) 55%, var(--line));
  }

  .countdown {
    font-size: 1.6rem;
    line-height: 1.15;
  }

  /* Phones: two clocks per row, slightly smaller. */
  @media (max-width: 30rem) {
    .clock {
      padding: 0.5rem 0.65rem 0.55rem;
    }

    .countdown {
      font-size: 1.3rem;
    }

    .at {
      font-size: 0.75rem;
    }
  }

  .soon .countdown {
    color: var(--gold);
  }

  .countdown abbr {
    text-decoration: none;
    color: var(--muted);
  }

  .at {
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--muted);
  }

  .badge {
    justify-self: start;
    margin-top: 0.2rem;
  }
</style>
