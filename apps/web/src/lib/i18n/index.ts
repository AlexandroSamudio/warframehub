import { en, type MessageKey } from './en.ts';

export type { MessageKey };

/**
 * Looks up a UI string and fills in {placeholders}.
 * Only English exists for now; Spanish will be added as another dictionary.
 */
export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  return en[key].replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}
