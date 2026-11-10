/** English UI strings. Every visible string goes through t() (SPEC §8.3). */
export const en = {
  'app.title': 'WarframeHub',
  'app.tagline': 'Weekly Tracker — coming in the next phases.',
  'health.checking': 'Connecting to the API…',
  'health.ok': 'API connected',
  'health.version': 'Version {version}',
  'health.serverTime': 'Server time: {local} ({utc} UTC)',
  'health.error': "Can't reach the API. Is it running? Start everything with npm run dev.",
  'health.retry': 'Try again',
} as const;

export type MessageKey = keyof typeof en;
