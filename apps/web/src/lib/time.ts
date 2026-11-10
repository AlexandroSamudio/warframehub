import { t } from './i18n/index.ts';

/** Display time zone until the tracker response tells us the user's setting (SPEC §8.1). */
export const DISPLAY_TZ = 'America/Argentina/Buenos_Aires';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

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

/** "2d 4h", "3h 12m", "45m" or "< 1m". Rounds down, so it never says a reset is later than it is. */
export function formatCountdown(ms: number): string {
  if (ms < MINUTE) return t('countdown.underMinute');
  const days = Math.floor(ms / DAY);
  const hours = Math.floor((ms % DAY) / HOUR);
  const minutes = Math.floor((ms % HOUR) / MINUTE);
  if (days > 0) return t('countdown.days', { d: days, h: hours });
  if (hours > 0) return t('countdown.hours', { h: hours, m: minutes });
  return t('countdown.minutes', { m: minutes });
}

/**
 * A clock is highlighted when its reset is close: under 24 hours for the long cycles
 * (weekly, every 4 days), 3 hours otherwise.
 */
export function isResetSoon(clockId: string, ms: number): boolean {
  const limit = clockId === 'weekly' || clockId === 'four_day' ? DAY : 3 * HOUR;
  return ms >= 0 && ms < limit;
}
