<script lang="ts">
  import type { WeaponEvolutions } from '@warframehub/shared';
  import { language, t } from '../lib/i18n/index.ts';
  import { formatLocal, formatUtc } from '../lib/time.ts';

  /**
   * A weapon version's Incarnon evolutions (SPEC §15): one row per tier with what unlocks
   * it, then its perks side by side (from Evolution 2 the game lets you pick one; Evolution 1
   * is the form itself). The perk text is the wiki's English in both languages: DE publishes
   * none, so Spanish says so. On phones, tiers 2 and up fold under one button.
   */
  interface Props {
    evolutions: WeaponEvolutions;
    /** The weapon's base name, for "the Braton Incarnon Genesis". */
    baseName: string;
    /** The version's name, for the wiki link. */
    name: string;
    /** When this week's Steel Path Circuit stops offering its Genesis, or null. */
    circuitEndsAt: string | null;
  }

  let { evolutions, baseName, name, circuitEndsAt }: Props = $props();

  let open = $state(false);
  const last = $derived(evolutions.tiers.at(-1)?.tier ?? 1);
</script>

<section class="panel frame accent" aria-labelledby="wp-evolutions">
  <h3 id="wp-evolutions" tabindex="-1">{t('wp.evoTitle')}</h3>
  <p>
    {evolutions.kind === 'genesis' ? t('wp.evoGenesis', { name: baseName }) : t('wp.evoNative')}
    {t('wp.evoPickOne')}
  </p>
  {#if circuitEndsAt && evolutions.kind === 'genesis'}
    <p>
      {t('wp.evoInCircuit', { local: formatLocal(circuitEndsAt), utc: formatUtc(circuitEndsAt) })}
    </p>
  {/if}
  {#if language.current !== 'en'}<p class="hint">{t('wp.evoEnglish')}</p>{/if}

  <ol class="tiers" class:folded={!open} id="wp-tiers">
    {#each evolutions.tiers as tier, i (tier.tier)}
      <li class="tier" class:later={i > 0}>
        <div class="tier-head">
          <h4>{t('wp.evoTier', { n: tier.tier })}</h4>
          <p class="unlock">
            {#if tier.challenge}
              {t('wp.evoUnlock')} <span lang="en">{tier.challenge}</span>
            {:else}
              {t('wp.evoInstalled')}
            {/if}
          </p>
        </div>
        {#if tier.perks.length === 1}
          <!-- Nothing to pick: the form (or a lone perk) is plain text, not a choice. -->
          {@const perk = tier.perks[0]!}
          <div class="only" lang="en">
            <span class="perk-name">{perk.name}</span>
            {#each perk.lines as line, j (j)}
              <span class="perk-line" class:sub={line.startsWith('– ')}>{line}</span>
            {/each}
          </div>
        {:else}
          <ul class="perks" lang="en">
            {#each tier.perks as perk, j (j)}
              <li class="perk">
                <span class="perk-name">{perk.name}</span>
                {#each perk.lines as line, k (k)}
                  <span class="perk-line" class:sub={line.startsWith('– ')}>{line}</span>
                {/each}
              </li>
            {/each}
          </ul>
        {/if}
      </li>
    {/each}
  </ol>

  {#if evolutions.tiers.length > 1}
    <!-- Phones only (see the media query): the later tiers fold under this. -->
    <button
      type="button"
      class="more"
      aria-expanded={open}
      aria-controls="wp-tiers"
      onclick={() => (open = !open)}
    >
      {open ? t('wp.evoShowLess') : t('wp.evoShowMore', { n: last })}
    </button>
  {/if}

  <p class="credit">
    <a href={evolutions.page} target="_blank" rel="noopener noreferrer"
      >{t('wp.evoWiki', { name })}<span class="sr-only"> {t('part.opensNewTab')}</span></a
    >
  </p>
</section>

<style>
  .panel {
    padding: 0.95rem 1.15rem 1rem;
    display: grid;
    gap: 0.6rem;
  }

  .panel > p {
    margin: 0;
    max-width: 75ch;
    text-wrap: pretty;
  }

  h3 {
    margin: 0;
    font-size: 1.05rem;
    color: var(--gold);
  }

  h3:focus {
    outline: none;
  }

  .hint,
  .unlock {
    margin: 0;
    font-size: 0.85rem;
    color: var(--muted);
  }

  a {
    color: var(--teal);
    text-underline-offset: 0.2em;
  }

  .tiers {
    list-style: none;
    margin: 0.2rem 0 0;
    padding: 0;
    display: grid;
  }

  /* One tier per row: its name and unlock on the left, the perks beside it. */
  .tier {
    display: grid;
    grid-template-columns: minmax(10rem, 15rem) minmax(0, 1fr);
    gap: 0.6rem 1.5rem;
    padding: 0.75rem 0;
    border-top: 1px solid color-mix(in srgb, var(--line) 60%, transparent);
  }

  .tier-head {
    display: grid;
    align-content: start;
    gap: 0.25rem;
  }

  h4 {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 0.8rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--gold);
  }

  .perks {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
    gap: 0.5rem;
  }

  /* A choice: a quiet inset cell, never a card with its own frame. */
  .perk {
    display: grid;
    align-content: start;
    gap: 0.2rem;
    padding: 0.55rem 0.7rem;
    background: var(--surface-2);
    border: 1px solid var(--line);
  }

  .only {
    display: grid;
    align-content: start;
    gap: 0.2rem;
  }

  .perk-name {
    font-weight: 600;
  }

  /* The numbers decide a pick: they read in the main text colour, not muted. */
  .perk-line {
    font-size: 0.9rem;
    color: var(--fg);
  }

  .perk-line.sub {
    padding-left: 0.8rem;
  }

  .more {
    display: none;
    justify-self: start;
  }

  .credit {
    margin: 0;
    font-size: 0.8rem;
  }

  @media (max-width: 48rem) {
    .tier {
      grid-template-columns: minmax(0, 1fr);
    }

    .more {
      display: inline-flex;
      align-items: center;
      min-height: 2.75rem;
    }

    .folded .later {
      display: none;
    }
  }
</style>
