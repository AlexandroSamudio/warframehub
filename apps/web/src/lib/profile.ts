import type { Profile, ProfileIntrinsic } from '@warframehub/shared';
import type { MessageKey } from './i18n/en.ts';
import { DISPLAY_TZ, formatUtc } from './time.ts';

/** The intrinsic tags in DE's profile, grouped as the game groups them. Unknown tags are left out. */
const GROUPS: { id: 'railjack' | 'duviri'; tags: [string, MessageKey][] }[] = [
  {
    id: 'railjack',
    tags: [
      ['LPS_TACTICAL', 'intrinsic.tactical'],
      ['LPS_PILOTING', 'intrinsic.piloting'],
      ['LPS_GUNNERY', 'intrinsic.gunnery'],
      ['LPS_ENGINEERING', 'intrinsic.engineering'],
      ['LPS_COMMAND', 'intrinsic.command'],
    ],
  },
  {
    id: 'duviri',
    tags: [
      ['LPS_DRIFT_RIDING', 'intrinsic.riding'],
      ['LPS_DRIFT_OPPORTUNITY', 'intrinsic.opportunity'],
      ['LPS_DRIFT_COMBAT', 'intrinsic.combat'],
      ['LPS_DRIFT_ENDURANCE', 'intrinsic.endurance'],
    ],
  },
];

export interface IntrinsicGroup {
  id: 'railjack' | 'duviri';
  rows: { key: MessageKey; level: number }[];
}

/** Intrinsics in the game's order, in two groups; a group with nothing in the data is dropped. */
export function intrinsicGroups(intrinsics: ProfileIntrinsic[]): IntrinsicGroup[] {
  const levels = new Map(intrinsics.map((i) => [i.tag, i.level]));
  return GROUPS.map(({ id, tags }) => ({
    id,
    rows: tags.flatMap(([tag, key]) => {
      const level = levels.get(tag);
      return level === undefined ? [] : [{ key, level }];
    }),
  })).filter((g) => g.rows.length > 0);
}

/** Whole hours played, rounded (the profile only has seconds). */
export function hoursPlayed(profile: Pick<Profile, 'timePlayedSeconds'>): number {
  return Math.round(profile.timePlayedSeconds / 3600);
}

/** "10 Nov, 21:00" in the display zone; the caller adds the UTC time next to it. */
export function formatWhen(iso: string, timeZone = DISPLAY_TZ): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

export { formatUtc };
