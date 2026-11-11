<script lang="ts">
  import type { GoalPart, ItemCategory, StockRow } from '@warframehub/shared';
  import { tick } from 'svelte';
  import { formatAmount, materialsWithStock, shortList } from '../lib/goals.ts';
  import { t } from '../lib/i18n/index.ts';
  import AmountField from './AmountField.svelte';
  import PartWhere from './PartWhere.svelte';

  interface Props {
    part: GoalPart;
    goalName: string;
    category: ItemCategory;
    /** The shared resource stock, to show what you have of each material. */
    stock: StockRow[];
    onPartStock: (
      key: string,
      amounts: { blueprints?: number; crafted?: number },
    ) => Promise<boolean>;
    onCraft: (key: string) => Promise<boolean>;
    onNote: (key: string, note: string) => Promise<boolean>;
  }

  let { part: p, goalName, category, stock, onPartStock, onCraft, onNote }: Props = $props();

  let crafting = $state(false);
  let row = $state<HTMLLIElement | null>(null);
  let craftButton = $state<HTMLButtonElement | null>(null);

  const fullName = $derived(`${goalName} ${p.name}`);
  const done = $derived(p.owned >= p.count);
  const materials = $derived(p.craft ? materialsWithStock(p.craft, stock) : []);
  const noBlueprint = $derived(p.craftShort.some((s) => s.kind === 'blueprint'));
  const missing = $derived(p.craftShort.filter((s) => s.kind !== 'blueprint'));
  const blocked = $derived(p.craftShort.length > 0);
  const reasonId = $props.id();

  async function craft() {
    // Stays focusable while blocked (aria-disabled), so the reason can be read; guard here.
    if (blocked || crafting) return;
    crafting = true;
    try {
      await onCraft(p.key);
    } finally {
      crafting = false;
    }
    // Once the goal has the part, the Craft button goes away: keep focus in this row,
    // on the Crafted amount that just went up.
    await tick();
    if (!craftButton?.isConnected) {
      row?.querySelectorAll<HTMLInputElement>('.amounts input')[1]?.focus();
    }
  }
</script>

<li class="part" bind:this={row}>
  <div class="head">
    <span class="name" class:done>
      {p.name}{#if p.count > 1}<span class="num times"> × {p.count}</span>{/if}
    </span>
    <span class="amounts">
      {#if p.craft}
        <span class="amount">
          <span class="amount-label">{t('part.blueprints')}</span>
          <AmountField
            compact
            max={1000}
            value={p.blueprints}
            label={t('part.amountLabel', { what: t('part.blueprints'), name: fullName })}
            onSave={(blueprints) => onPartStock(p.key, { blueprints })}
          />
        </span>
        <span class="amount">
          <span class="amount-label">{t('part.crafted')}</span>
          <AmountField
            compact
            max={1000}
            value={p.crafted}
            label={t('part.amountLabel', { what: t('part.crafted'), name: fullName })}
            onSave={(crafted) => onPartStock(p.key, { crafted })}
          />
        </span>
      {:else}
        <span class="amount">
          <span class="amount-label">{t('part.have')}</span>
          <AmountField
            compact
            max={1000}
            value={p.crafted}
            label={t('part.amountLabel', { what: t('part.have'), name: fullName })}
            onSave={(crafted) => onPartStock(p.key, { crafted })}
          />
        </span>
      {/if}
    </span>
  </div>

  {#if p.craft && !done}
    <div class="craft">
      <ul class="materials" aria-label={t('part.materialsAria', { name: fullName })}>
        {#each materials as m (m.key)}
          <li class:short={m.have < m.need}>
            <b class="num"
              >{t('part.materialHave', {
                have: formatAmount(m.have),
                need: formatAmount(m.need),
              })}</b
            >
            {m.name}
          </li>
        {/each}
      </ul>
      <div class="action">
        <button
          type="button"
          class="primary"
          bind:this={craftButton}
          aria-disabled={blocked || crafting}
          aria-describedby={blocked ? reasonId : undefined}
          aria-label={t('part.craftAria', { name: fullName })}
          onclick={craft}
        >
          {t('part.craft')}
        </button>
        {#if blocked}
          <span class="why" id={reasonId}>
            <!-- Without a blueprint, the gold pairs above already show what's short. -->
            {noBlueprint ? t('part.noBlueprint') : t('part.missing', { list: shortList(missing) })}
          </span>
        {/if}
      </div>
    </div>
  {:else if !p.craft && category === 'warframe' && p.name !== 'Blueprint' && !done}
    <p class="craft-none">{t('part.craftMissing')}</p>
  {/if}

  {#if p.drops.length === 0 || p.note !== ''}
    <div class="part-note">
      <PartWhere
        note={p.note}
        sources={p.sources}
        context={p.name}
        onSave={(note) => onNote(p.key, note)}
      />
    </div>
  {/if}
</li>

<style>
  .part {
    display: grid;
    gap: 0.3rem;
    padding: 0.35rem 0;
    border-bottom: 1px solid color-mix(in srgb, var(--line) 60%, transparent);
  }

  .part:last-child {
    border-bottom: 0;
  }

  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.2rem 0.8rem;
  }

  .name {
    font-weight: 600;
  }

  .times {
    font-weight: 400;
    color: var(--muted);
  }

  .done {
    color: var(--muted);
    text-decoration: line-through;
    text-decoration-color: color-mix(in srgb, var(--muted) 60%, transparent);
  }

  .amounts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem 0.9rem;
  }

  .amount {
    display: inline-flex;
    align-items: baseline;
    gap: 0.35rem;
    font-size: 0.85rem;
    color: var(--muted);
  }

  /* Materials as have / need pairs: the numbers are the readout, the name is dim. */
  .craft {
    display: grid;
    gap: 0.35rem;
    font-size: 0.85rem;
    color: var(--muted);
  }

  .materials {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.1rem 0.9rem;
  }

  .materials li {
    white-space: nowrap; /* a quantity never gets separated from its name */
  }

  .materials b {
    font-weight: 600;
    color: var(--ok);
  }

  .materials .short b {
    color: var(--gold);
  }

  .action {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem 0.7rem;
  }

  /* Blocked: looks like the app's disabled buttons but keeps keyboard focus. */
  button[aria-disabled='true'] {
    opacity: 0.45;
    cursor: default;
    background: none;
  }

  .why {
    color: var(--gold);
  }

  .craft-none {
    margin: 0;
    font-size: 0.85rem;
    color: var(--muted);
    font-style: italic;
  }
</style>
