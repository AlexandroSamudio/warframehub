import { DEFAULT_LANGUAGE, Language } from '@warframehub/shared';

/**
 * The app's language (SPEC §8.3), saved on the server in Settings. A local copy lets the
 * first paint use it before the server answers; the server's value then wins.
 */
const STORAGE_KEY = 'wfhub.language';

function remembered(): Language {
  try {
    const parsed = Language.safeParse(globalThis.localStorage?.getItem(STORAGE_KEY));
    return parsed.success ? parsed.data : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

export const language = $state({ current: remembered() });

/** Intl locale for dates and numbers: Spanish, or English with day-month order. */
export function locale(): string {
  return language.current === 'es' ? 'es' : 'en-GB';
}

export function setLanguage(next: Language): void {
  language.current = next;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, next);
  } catch {
    // private window or blocked storage: the server's setting still applies next time
  }
  if (typeof document !== 'undefined') document.documentElement.lang = next;
}
