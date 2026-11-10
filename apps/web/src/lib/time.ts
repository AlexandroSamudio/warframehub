/** Display time zone. Becomes a user setting in a later phase (SPEC §8.1). */
export const DISPLAY_TZ = 'America/Argentina/Buenos_Aires';

export function formatLocal(iso: string, timeZone = DISPLAY_TZ): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

export function formatUtc(iso: string): string {
  return new Date(iso).toISOString().slice(11, 16);
}
