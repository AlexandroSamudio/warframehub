import { z } from 'zod';

/** An IANA time zone the runtime knows, e.g. `America/Argentina/Buenos_Aires`. */
export const TimeZone = z.string().refine((tz) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}, 'unknown time zone');

/** Response of `GET`/`PATCH /api/settings` (SPEC §8.1 Settings screen). */
export const SettingsResponse = z.object({
  displayTz: z.string(),
  /** Read-only: where the database lives. */
  dataDir: z.string(),
  version: z.string(),
  /** Minutes without an open page before the server stops; 0 = never. */
  idleMinutes: z.int().min(0),
});
export type SettingsResponse = z.infer<typeof SettingsResponse>;

export const UpdateSettingsRequest = z.object({ displayTz: TimeZone });
export type UpdateSettingsRequest = z.infer<typeof UpdateSettingsRequest>;
