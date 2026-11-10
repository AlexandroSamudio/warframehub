/** English UI strings. Every visible string goes through t() (SPEC §8.3). */
export const en = {
  'app.title': 'WarframeHub',
  'app.tagline': 'Weekly Tracker',

  'tracker.loading': 'Loading your checklist…',
  'tracker.error': "Can't reach the API. Is it running? Start everything with npm run dev.",
  'tracker.retry': 'Try again',
  'tracker.saveError': "Couldn't save that change. Check that the API is running and try again.",
  'tracker.dismiss': 'Dismiss',

  'clocks.label': 'Reset clocks',
  'clock.daily': 'Daily',
  'clock.weekly': 'Weekly',
  'clock.sortie': 'Sortie',
  'clock.eight_hour': '8-hour vendors',
  'clock.baro': 'Baro',
  'clock.at': '{local} · {utc} UTC',
  'clock.unknown': 'Waiting for live data',
  'clock.estimated': 'estimated',
  'clock.estimatedHint': 'No live data yet: this is the usual time, the real reset may differ',

  'countdown.underMinute': '< 1m',
  'countdown.minutes': '{m}m',
  'countdown.hours': '{h}h {m}m',
  'countdown.days': '{d}d {h}h',

  'section.resetsIn': 'Resets in {countdown} · {local} ({utc} UTC)',
  'section.manual': 'Resets when you press Clear',
  'section.baroUnknown': 'Resets when Baro next arrives',
  'section.progress': '{done} of {total} done',
  'section.clear': 'Clear',
  'section.clearHint': 'Untick everything in {title}',

  'item.verify': 'verify',
  'item.verifyHint': 'Not confirmed in game yet',
  'item.slot': '{title}: {n} of {total}',
  'item.subtick': '{title}: {label}',

  'footer.version': 'Version {version}',
  'footer.dataDir': 'Data folder: {path}',
} as const;

export type MessageKey = keyof typeof en;
