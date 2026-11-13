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
