<script lang="ts" generics="T extends string">
  /**
   * A segmented radio group in the console's button style (the Warframe page's version
   * switch): the chosen one gold on a gold tint, the others brighten with a gold line on
   * hover. Real radio buttons, so arrows move between them.
   */
  interface Props {
    /** What the group chooses; visible as a label, or read out only when `hideLegend`. */
    legend: string;
    hideLegend?: boolean;
    name: string;
    options: { value: T; label: string }[];
    value: T;
    onchange: (value: T) => void;
  }

  let { legend, hideLegend = false, name, options, value, onchange }: Props = $props();
</script>

<fieldset class="seg">
  <legend class:sr-only={hideLegend}>{legend}</legend>
  <div class="opts">
    {#each options as o (o.value)}
      <label class:on={o.value === value}>
        <input
          type="radio"
          {name}
          value={o.value}
          checked={o.value === value}
          onchange={() => onchange(o.value)}
        />
        {o.label}
      </label>
    {/each}
  </div>
</fieldset>

<style>
  .seg {
    margin: 0;
    padding: 0;
    border: 0;
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem 0.6rem;
  }

  legend {
    float: left;
    padding: 0;
    margin-right: 0.6rem;
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 0.8rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .opts {
    display: flex;
    flex-wrap: wrap;
    /* Wrapped rows overlap their 1px borders, like the first row. */
    row-gap: 0;
  }

  label {
    position: relative;
    padding: 0.3rem 0.8rem;
    border: 1px solid var(--line-strong);
    margin: 0 0 -1px -1px;
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--muted);
    cursor: pointer;
  }

  label:not(.on):hover {
    z-index: 1;
    color: var(--fg);
    border-color: var(--gold);
  }

  label.on {
    z-index: 2;
    border-color: var(--gold);
    color: var(--gold);
    background: color-mix(in srgb, var(--gold) 12%, transparent);
  }

  input {
    position: absolute;
    opacity: 0;
    width: 1px;
    height: 1px;
  }

  label:has(input:focus-visible) {
    z-index: 3;
    outline: 2px solid var(--teal);
    outline-offset: 2px;
  }

  @media (pointer: coarse) {
    label {
      display: inline-flex;
      align-items: center;
      min-height: 2.75rem;
    }
  }
</style>
