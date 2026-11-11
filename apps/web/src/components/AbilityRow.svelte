<script lang="ts">
  import type { WarframeAbility } from '@warframehub/shared';
  import { imageUrl } from '../lib/api.ts';
  import { t } from '../lib/i18n/index.ts';

  interface Props {
    ability: WarframeAbility;
    /** Augment mods for this ability (by name). */
    augments: string[];
  }

  let { ability: a, augments }: Props = $props();

  const n = $derived(a.numbers);
  const groups = $derived(
    n
      ? (
          [
            ['wf.strength', n.strength],
            ['wf.duration', n.duration],
            ['wf.range', n.range],
            ['wf.misc', n.misc],
          ] as const
        ).filter(([, lines]) => lines.length > 0)
      : [],
  );
  let imageFailed = $state(false);
</script>

<li class="ability">
  <!-- The name is right next to it, so the icon is decorative for screen readers. -->
  <span class="icon">
    {#if a.image && !imageFailed}
      <img
        src={imageUrl(a.image)}
        alt=""
        width="40"
        height="40"
        loading="lazy"
        onerror={() => (imageFailed = true)}
      />
    {/if}
  </span>
  <div class="body">
    <h4>
      <span class="key num">{a.key}</span>
      {a.name}
    </h4>
    <p class="desc">{a.description}</p>

    {#if n}
      <dl class="numbers">
        {#if n.cost !== null}
          <dt>{t('wf.cost')}</dt>
          <dd class="num">
            {t('wf.costValue', { cost: n.cost, type: n.costType })}{#if n.channeled}
              · {t('wf.channeled')}{/if}
          </dd>
        {/if}
        {#each groups as [label, lines] (label)}
          <dt>{t(label)}</dt>
          <dd>
            {#each lines as line, i (i)}<span class="line num">{line}</span>{/each}
          </dd>
        {/each}
      </dl>
    {/if}

    <p class="extras">
      {#if n?.subsumable}<span class="badge teal">{t('wf.helminth')}</span>{/if}
      {#if augments.length > 0}
        <span class="aug">{t('wf.augmentsOf', { names: augments.join(', ') })}</span>
      {/if}
      {#if n}
        <a href={n.page} target="_blank" rel="noopener noreferrer"
          >{t('wf.wikiLink')}<span class="sr-only">
            {t('wf.wikiLinkAria', { name: a.name })}
            {t('part.opensNewTab')}</span
          ></a
        >
      {/if}
    </p>
  </div>
</li>

<style>
  .ability {
    display: grid;
    grid-template-columns: 3.25rem minmax(0, 1fr);
    gap: 0.9rem;
    padding: 0.9rem 0;
    border-bottom: 1px solid color-mix(in srgb, var(--line) 60%, transparent);
  }

  .ability:last-child {
    border-bottom: 0;
  }

  /* The icon sits in a thin cut-corner frame, like the console's own marks. */
  .icon {
    width: 3.25rem;
    height: 3.25rem;
    display: grid;
    place-items: center;
    background: var(--surface-2);
    border: 1px solid var(--line-strong);
    clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%);
  }

  .icon img {
    display: block;
    width: 2.5rem;
    height: 2.5rem;
    object-fit: contain;
  }

  .body {
    display: grid;
    gap: 0.4rem;
    min-width: 0;
  }

  h4 {
    margin: 0;
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    font-size: 1rem;
    color: var(--fg);
  }

  .key {
    font-size: 0.8rem;
    color: var(--gold);
  }

  .desc {
    margin: 0;
    color: var(--muted);
    max-width: 60ch;
  }

  .numbers {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: 0.2rem 1rem;
    margin: 0.1rem 0 0;
    font-size: 0.875rem;
  }

  dt {
    font-family: var(--font-display);
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--muted);
  }

  dd {
    margin: 0;
    display: grid;
    gap: 0.1rem;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .extras {
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem 0.8rem;
    font-size: 0.85rem;
    color: var(--muted);
  }

  .extras:empty {
    display: none;
  }

  a {
    color: var(--teal);
    text-underline-offset: 0.2em;
    padding: 0.2rem 0;
  }

  @media (max-width: 36rem) {
    .ability {
      grid-template-columns: 2.75rem minmax(0, 1fr);
      gap: 0.7rem;
    }

    .icon {
      width: 2.75rem;
      height: 2.75rem;
    }

    .icon img {
      width: 2.1rem;
      height: 2.1rem;
    }

    .numbers {
      grid-template-columns: minmax(0, 1fr);
      gap: 0.05rem;
    }

    dd {
      margin-bottom: 0.3rem;
    }
  }
</style>
