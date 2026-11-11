<script lang="ts">
  import { formatAmount, parseEntry } from '../lib/goals.ts';
  import { t } from '../lib/i18n/index.ts';

  interface Props {
    /** The shared stock amount shown in the field. */
    value: number;
    /** Accessible name, e.g. "Have Orokin Cell". */
    label: string;
    /** Saves the new amount; resolves once the server answered. */
    onSave: (amount: number) => Promise<boolean>;
    /** Narrow field for small counts (part blueprints and finished parts). */
    compact?: boolean;
    /** The most the server accepts (part counts stop at 1,000). */
    max?: number;
  }

  let { value, label, onSave, compact = false, max }: Props = $props();

  type Problem = 'invalid' | 'belowZero' | 'tooMany';
  const id = $props.id();
  let message = $state<Problem | 'saved' | null>(null);
  /** The bad entry was replaced by the saved amount; the message stays a moment longer. */
  let restored = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  function flash(kind: Problem | 'saved') {
    clearTimeout(timer);
    message = kind;
    restored = false;
    if (kind === 'saved') timer = setTimeout(() => (message = null), 2000);
  }

  async function save(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    // "1,200" sets the amount; "+250" adds to what's saved and "-30" takes away.
    const entry = parseEntry(input.value, value);
    if ('error' in entry) {
      flash(entry.error);
      return;
    }
    const { amount } = entry;
    if (max !== undefined && amount > max) {
      flash('tooMany');
      return;
    }
    input.value = formatAmount(amount);
    if (amount === value) {
      message = null;
      return;
    }
    if (await onSave(amount)) flash('saved');
  }

  function reset(e: Event) {
    // Leaving a bad entry puts the saved amount back, but the message stays readable
    // for a few seconds (blur fires right after change when you Tab away).
    if (message !== null && message !== 'saved' && !restored) {
      (e.currentTarget as HTMLInputElement).value = formatAmount(value);
      restored = true;
      clearTimeout(timer);
      timer = setTimeout(() => {
        message = null;
        restored = false;
      }, 3000);
    }
  }

  const bad = $derived(message !== null && message !== 'saved');
  const text = $derived(
    message === 'invalid'
      ? t('farm.wholeNumbers')
      : message === 'belowZero'
        ? t('farm.belowZero')
        : message === 'tooMany'
          ? t('farm.tooMany', { max: formatAmount(max ?? 0) })
          : message === 'saved'
            ? t('farm.saved')
            : '',
  );
</script>

<!-- No numeric inputmode: phone number pads have no "+" or "-" for relative entry. -->
<span class="amount-field" class:compact>
  <input
    type="text"
    autocomplete="off"
    class="num"
    value={formatAmount(value)}
    onchange={save}
    onblur={reset}
    aria-label={label}
    aria-invalid={bad && !restored}
    aria-describedby={`${id}-msg`}
  />
  <span id={`${id}-msg`} class="msg" class:bad aria-live="polite">{text}</span>
</span>

<style>
  .amount-field {
    position: relative;
    display: inline-flex;
    flex-direction: column;
    align-items: flex-end;
  }

  input {
    width: 7.5rem;
    text-align: right;
  }

  .compact input {
    width: 3.5rem;
  }

  input[aria-invalid='true'] {
    border-color: var(--bad);
  }

  .msg {
    font-size: 0.75rem;
    line-height: 1.4;
    min-height: 1.05rem;
    color: var(--ok);
  }

  /* A compact field's message is wider than the field: it hangs below, right-aligned,
     in the space the field keeps for it, so the row never shifts. */
  .compact {
    padding-bottom: 1.05rem;
  }

  .compact .msg {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: -1.05rem;
    white-space: nowrap;
  }

  .msg.bad {
    color: var(--bad);
  }
</style>
