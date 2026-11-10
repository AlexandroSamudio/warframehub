<script lang="ts">
  import { formatAmount, parseAmount } from '../lib/goals.ts';
  import { t } from '../lib/i18n/index.ts';

  interface Props {
    /** The shared stock amount shown in the field. */
    value: number;
    /** Accessible name, e.g. "Have Orokin Cell". */
    label: string;
    /** Saves the new amount; resolves once the server answered. */
    onSave: (amount: number) => Promise<boolean>;
  }

  let { value, label, onSave }: Props = $props();

  const id = $props.id();
  let message = $state<'invalid' | 'saved' | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;

  function flash(kind: 'invalid' | 'saved') {
    clearTimeout(timer);
    message = kind;
    if (kind === 'saved') timer = setTimeout(() => (message = null), 2000);
  }

  async function save(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const amount = parseAmount(input.value);
    if (amount === null) {
      flash('invalid');
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
    // Leaving an invalid entry puts the saved amount back.
    if (message === 'invalid') {
      (e.currentTarget as HTMLInputElement).value = formatAmount(value);
      message = null;
    }
  }
</script>

<span class="amount-field">
  <input
    type="text"
    inputmode="numeric"
    class="num"
    value={formatAmount(value)}
    onchange={save}
    onblur={reset}
    aria-label={label}
    aria-invalid={message === 'invalid'}
    aria-describedby={`${id}-msg`}
  />
  <span id={`${id}-msg`} class="msg" class:bad={message === 'invalid'} aria-live="polite"
    >{message === 'invalid'
      ? t('farm.wholeNumbers')
      : message === 'saved'
        ? t('farm.saved')
        : ''}</span
  >
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

  input[aria-invalid='true'] {
    border-color: var(--bad);
  }

  .msg {
    font-size: 0.75rem;
    line-height: 1.4;
    min-height: 1.05rem;
    color: var(--ok);
  }

  .msg.bad {
    color: var(--bad);
  }
</style>
