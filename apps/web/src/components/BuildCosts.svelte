<script lang="ts">
  import { endoToMax, type ResolvedSlot } from '@warframehub/shared';
  import { language, t } from '../lib/i18n/index.ts';

  /** What a build costs to get ready (SPEC §14.1, §15.1): the Forma the author says it needs, and the Endo to max its mods. */
  interface Props {
    /** The author's own number; null when not entered. */
    forma: number | null;
    /** Every mod in the build (aura, Exilus, stance and the 8 slots). */
    mods: (ResolvedSlot | null)[];
  }

  let { forma, mods }: Props = $props();

  const cost = $derived(endoToMax(mods));
  const hasMods = $derived(mods.some((m) => m !== null));
  const fmt = (n: number) => n.toLocaleString(language.current);
</script>

{#if forma !== null || hasMods}
  <dl class="costs">
    {#if forma !== null}
      <div>
        <dt>{t('build.formaTotal')}</dt>
        <dd class="num">{fmt(forma)}</dd>
      </div>
    {/if}
    {#if hasMods}
      <div title={t('build.endoHint')}>
        <dt>{t('build.endoToMax')}</dt>
        <dd>
          <span class="num">{fmt(cost.endo)}</span>
          {#if cost.unknown > 0}<small class="unknown"
              >{t('build.endoUnknown', { n: cost.unknown })}</small
            >{/if}
        </dd>
      </div>
    {/if}
  </dl>
{/if}

<style>
  .costs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem 1.2rem;
    margin: 0;
  }

  .costs div {
    display: flex;
    align-items: baseline;
    gap: 0.45rem;
  }

  dt {
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 0.8rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
  }

  dd {
    margin: 0;
    font-size: 1.05rem;
    color: var(--fg);
  }

  .unknown {
    margin-left: 0.3rem;
    font-size: 0.8rem;
    color: var(--muted);
  }
</style>
