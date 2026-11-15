import { en, type MessageKey } from './en.ts';
import { es } from './es.ts';
import { language } from './language.svelte.ts';

export type { MessageKey };
export { locale, setLanguage, language } from './language.svelte.ts';

const dictionaries = { en, es } as const;

/**
 * Looks up a UI string in the current language and fills in {placeholders}. It reads the
 * reactive language, so text re-renders when Settings switches it.
 */
export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  return dictionaries[language.current][key].replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/** Whether there is a UI string for this key (for words from game data, e.g. a class). */
export function hasMessage(key: string): key is MessageKey {
  return key in en;
}

/** The UI string for a game-data word ("wp.class.Polearm"), or the word as the data says. */
export function tOr(key: string, fallback: string): string {
  return hasMessage(key) ? t(key) : fallback;
}
