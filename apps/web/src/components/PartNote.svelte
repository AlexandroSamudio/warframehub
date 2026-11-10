<script lang="ts">
  import { t } from '../lib/i18n/index.ts';

  interface Props {
    /** The saved note. */
    value: string;
    /** Accessible name, e.g. "Where do you get this? Nidus Blueprint". */
    label: string;
    /** Saves the note; resolves true once the server answered. */
    onSave: (note: string) => Promise<boolean>;
  }

  let { value, label, onSave }: Props = $props();

  const MAX = 200;
  const id = $props.id();
  let message = $state<'tooLong' | 'saved' | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function save(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const note = input.value.trim();
    clearTimeout(timer);
    if (note.length > MAX) {
      message = 'tooLong';
      return;
    }
    input.value = note;
    if (note === value) {
      message = null;
      return;
    }
    if (await onSave(note)) {
      message = 'saved';
      timer = setTimeout(() => (message = null), 2000);
    }
  }
</script>

<span class="note-field">
  <input
    type="text"
    class="note"
    {value}
    placeholder={t('part.notePlaceholder')}
    maxlength={MAX}
    aria-label={label}
    aria-invalid={message === 'tooLong'}
    aria-describedby={`${id}-msg`}
    autocomplete="off"
    spellcheck="false"
    onchange={save}
  />
  <span id={`${id}-msg`} class="msg" class:bad={message === 'tooLong'} aria-live="polite"
    >{message === 'tooLong'
      ? t('part.noteTooLong')
      : message === 'saved'
        ? t('part.noteSaved')
        : ''}</span
  >
</span>

<style>
  .note-field {
    display: grid;
    gap: 0;
    width: min(100%, 24rem);
  }

  .note {
    width: 100%;
  }

  .note[aria-invalid='true'] {
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
