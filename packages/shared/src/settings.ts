import { z } from 'zod';

/** An IANA time zone the runtime knows, e.g. `America/Argentina/Buenos_Aires`. */
export const TimeZone = z.string().refine((tz) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}, 'unknownTimeZone');

/** The app's language (SPEC §8.3): Spanish (neutral, tú) or English. Spanish by default. */
export const Language = z.enum(['es', 'en']);
export type Language = z.infer<typeof Language>;
export const DEFAULT_LANGUAGE: Language = 'es';

/** Response of `GET`/`PATCH /api/settings` (SPEC §8.1 Settings screen). */
export const SettingsResponse = z.object({
  displayTz: z.string(),
  language: Language,
  /** Read-only: where the database lives. */
  dataDir: z.string(),
  version: z.string(),
  /** Minutes without an open page before the server stops; 0 = never. */
  idleMinutes: z.int().min(0),
});
export type SettingsResponse = z.infer<typeof SettingsResponse>;

/** Change one setting or more; the others stay. */
export const UpdateSettingsRequest = z
  .object({ displayTz: TimeZone, language: Language })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'badRequest');
export type UpdateSettingsRequest = z.infer<typeof UpdateSettingsRequest>;
