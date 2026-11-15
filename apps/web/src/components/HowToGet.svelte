<script lang="ts">
  import type { GoalStatus, ItemRecipe } from '@warframehub/shared';
  import { tick } from 'svelte';
  import * as api from '../lib/api.ts';
  import { formatAmount, formatChance, groupDrops, materialList } from '../lib/goals.ts';
  import { t } from '../lib/i18n/index.ts';
  import { hrefFor } from '../lib/route.svelte.ts';

  /**
   * "How to get it" on a Warframe's or a weapon's page: each part's best drop or relic (or
   * the quest that gives it), what crafting it takes, what building it takes, and Add as
   * goal. The page reloads its data after adding (`reload`), so the goal shows.
   */
  interface Props {
    /** Heading id, for the section's `aria-labelledby`. */
    id: string;
    uniqueName: string;
    name: string;
    recipe: ItemRecipe | null;
    vaulted: boolean | null;
    goal: { id: number; status: GoalStatus } | null;
    /** Fetches the page again; false when that failed (the goal exists anyway). */
    reload: () => Promise<boolean>;
  }

  let { id, uniqueName, name, recipe, vaulted, goal, reload }: Props = $props();

  let goalMessage = $state<{ text: string; bad: boolean } | null>(null);
  let adding = $state(false);
  let goalsLink = $state<HTMLAnchorElement | null>(null);

  // Another version or item: its message doesn't belong to it.
  $effect(() => {
    void uniqueName;
    goalMessage = null;
  });

  function bestDrop(drops: Parameters<typeof groupDrops>[0]): string {
    const top = groupDrops(drops)[0];
    if (!top) return t('farm.noDrops');
    if (top.kind === 'relic') {
      return t('farm.bestRelic', { relic: top.relic, chance: formatChance(top.best) });
    }
    return top.chance === null
      ? t('farm.bestNoChance', { location: top.location })
      : t('farm.best', { location: top.location, chance: formatChance(top.chance) });
  }

  async function addGoal() {
    if (adding) return;
    adding = true;
    goalMessage = null;
    try {
      await api.addGoal(uniqueName);
    } catch (e) {
      goalMessage = {
        text: t('wf.goalError', {
          message: e instanceof api.ApiCallError ? e.message : t('goals.unreachable'),
        }),
        bad: true,
      };
      adding = false;
      return;
    }
    // Added. Showing it here needs the page again; if that fails, the goal still exists.
    const shown = await reload();
    adding = false;
    goalMessage = { text: t(shown ? 'wf.goalAdded' : 'wf.goalAddedStale'), bad: false };
    if (shown) {
      await tick();
      goalsLink?.focus(); // the button went away: the next step is "Open Goals"
    }
  }
</script>

<section class="panel frame" aria-labelledby={id}>
  <h3 {id}>{t('wf.get')}</h3>
  {#if vaulted}<p class="hint">{t('wf.vaultedNote')}</p>{/if}
  {#if recipe && recipe.parts.length > 0}
    <ul class="rows">
      {#each recipe.parts as p (p.key)}
        <li>
          <span class="lead"
            >{p.name}{#if p.count > 1}<span class="for num"> × {p.count}</span>{/if}</span
          >
          {#if p.sources.length > 0}
            <span class="for"
              >{t('part.sourceQuest')}
              {#each p.sources as s, i (s.url)}{#if i > 0},
                {/if}<a href={s.url} target="_blank" rel="noopener noreferrer"
                  >{s.title}<span class="sr-only"> {t('part.opensNewTab')}</span></a
                >{/each}</span
            >
          {:else}
            <span class="for">{bestDrop(p.drops)}</span>
          {/if}
          {#if p.craft}
            <p class="effect">
              <span class="craft-label">{t('part.craftLabel')}</span>
              {materialList(p.craft)
                .map((m) => `${formatAmount(m.count)} ${m.name}`)
                .join(' · ')}
            </p>
          {/if}
        </li>
      {/each}
    </ul>
    <p class="build">
      <span class="craft-label">{t('wf.toBuild', { name })}</span>
      {recipe.resources.map((r) => `${formatAmount(r.count)} ${r.name}`).join(' · ')}
    </p>
  {:else}
    <p class="hint">{t('wf.getNone')}</p>
  {/if}

  <div class="goal">
    {#if goal?.status === 'active'}
      <span class="badge teal">{t('wf.inGoals')}</span>
      <a href={hrefFor('goals')} bind:this={goalsLink}>{t('wf.goToGoals')}</a>
    {:else if goal?.status === 'built'}
      <span class="badge ok">{t('wf.built')}</span>
    {:else if recipe}
      <button type="button" class="primary" aria-disabled={adding} onclick={addGoal}>
        {adding ? t('wf.adding') : t('wf.addGoal')}
      </button>
    {/if}
    <span class="goal-msg" class:bad={goalMessage?.bad} role="status"
      >{goalMessage?.text ?? ''}</span
    >
  </div>
</section>

<style>
  .panel {
    padding: 0.95rem 1.15rem 1rem;
    display: grid;
    gap: 0.4rem;
  }

  h3 {
    margin: 0;
    font-size: 1.05rem;
    color: var(--gold);
  }

  a {
    color: var(--teal);
    text-underline-offset: 0.2em;
  }

  .hint {
    margin: 0;
    font-size: 0.85rem;
    color: var(--muted);
  }

  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .rows li {
    padding: 0.5rem 0;
    border-bottom: 1px solid color-mix(in srgb, var(--line) 60%, transparent);
  }

  .rows li:last-child {
    border-bottom: 0;
  }

  .lead {
    font-weight: 600;
    margin-right: 0.5rem;
  }

  .for {
    font-size: 0.85rem;
    color: var(--muted);
  }

  .effect {
    margin: 0.2rem 0 0;
    font-size: 0.85rem;
    color: var(--muted);
    max-width: 64ch;
  }

  .craft-label {
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin-right: 0.3rem;
  }

  .build {
    margin: 0.2rem 0 0;
    font-size: 0.85rem;
  }

  .goal {
    margin-top: 0.4rem;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem 0.8rem;
  }

  @media (pointer: coarse) {
    .goal button {
      min-height: 2.75rem;
    }
  }

  .goal button[aria-disabled='true'] {
    opacity: 0.45;
    cursor: default;
  }

  .goal-msg {
    font-size: 0.85rem;
    color: var(--ok);
  }

  .goal-msg.bad {
    color: var(--bad);
  }
</style>
