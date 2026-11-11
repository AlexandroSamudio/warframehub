import { describe, expect, it } from 'vitest';
import { loadPartSources, partSources } from './part-sources.js';
import { buildPartSources, questName, questRewards, rewardField, wikiUrl } from './wiki-quests.js';

// Reward fields copied from the Warframe wiki on 10 Nov 2026.
const REWARDS = {
  glast: '{{WF|Nidus}} blueprint',
  inaros: '{{WF|Inaros}} blueprint and parts<br>Sacred Urn [[Orbiter]] decoration',
  silver: '{{WF|Titania}} Blueprint & Parts',
  revenant: '[[Revenant]] blueprint',
  atlas: '{{WF|Atlas}} [[Blueprint]]<br>[[Jordas Golem]] [[Assassination]]',
  list: '<div> *{{WF|Qorvex}} Blueprint *Weapon Slot *{{Weapon|Grimoire}} (Rank 30, Catalyst pre-installed) *[[Orbiter Segments#Melee Upgrade Segment|Melee Upgrade]] </div>',
  weapons:
    '{{Weapon|Orvius}} Blueprint <br> {{Weapon|Broken Scepter}} <br> [[Focus|Transference]] Unlocked',
  noBlueprint: '{{WF|Octavia}}<br>{{M|Molten Impact}}',
};

describe('rewardField', () => {
  it('reads a one-line field and a field that runs over several lines', () => {
    expect(
      rewardField(
        '{{Infobox Quest\n|name = The Glast Gambit\n|reward = {{WF|Nidus}} blueprint\n|prerequisite = X\n}}',
      ),
    ).toBe('{{WF|Nidus}} blueprint');
    expect(
      rewardField('|reward = <div>\n *{{WF|Qorvex}} Blueprint\n *Weapon Slot\n</div>\n|next = Y'),
    ).toBe('<div> *{{WF|Qorvex}} Blueprint *Weapon Slot </div>');
    expect(rewardField('no infobox here')).toBeNull();
  });
});

describe('questRewards', () => {
  it.each([
    ['glast', [{ item: 'Nidus', allParts: false }]],
    ['inaros', [{ item: 'Inaros', allParts: true }]],
    ['silver', [{ item: 'Titania', allParts: true }]],
    ['revenant', [{ item: 'Revenant', allParts: false }]],
    ['atlas', [{ item: 'Atlas', allParts: false }]],
    ['list', [{ item: 'Qorvex', allParts: false }]],
    ['weapons', [{ item: 'Orvius', allParts: false }]],
    ['noBlueprint', []],
  ] as const)('%s', (key, expected) => {
    expect(questRewards(REWARDS[key])).toEqual(expected);
  });

  it('only keeps blueprints, not other rewards listed beside them', () => {
    expect(questRewards(REWARDS.weapons).map((r) => r.item)).not.toContain('Broken Scepter');
  });
});

describe('names and links', () => {
  it('drops "(Quest)" from the name and builds the wiki link', () => {
    expect(questName('Vox Solaris (Quest)')).toBe('Vox Solaris');
    expect(questName('The Glast Gambit')).toBe('The Glast Gambit');
    expect(wikiUrl('The Glast Gambit')).toBe('https://wiki.warframe.com/wiki/The_Glast_Gambit');
    expect(wikiUrl('Vox Solaris (Quest)')).toBe(
      'https://wiki.warframe.com/wiki/Vox_Solaris_(Quest)',
    );
  });
});

describe('buildPartSources', () => {
  it('maps items to the quests that reward them, with "and parts" kept', () => {
    const file = buildPartSources(
      {
        'The Glast Gambit': `{{Infobox Quest\n|reward = ${REWARDS.glast}\n}}`,
        'Sands of Inaros': `|reward = ${REWARDS.inaros}\n`,
        'Not a quest with rewards': 'nothing',
      },
      new Date('2026-11-10T20:00:00Z'),
    );
    expect(Object.keys(file.items).sort()).toEqual(['Inaros', 'Nidus']);
    expect(file.items.Nidus).toEqual({
      allParts: false,
      sources: [
        {
          kind: 'quest',
          title: 'The Glast Gambit',
          url: 'https://wiki.warframe.com/wiki/The_Glast_Gambit',
        },
      ],
    });
    expect(file.items.Inaros!.allParts).toBe(true);
  });
});

describe('the saved part-sources.json (Warframe wiki, 10 Nov 2026)', () => {
  it('has the Nidus Blueprint from The Glast Gambit', () => {
    expect(partSources('Nidus', 'Blueprint')).toEqual([
      {
        kind: 'quest',
        title: 'The Glast Gambit',
        url: 'https://wiki.warframe.com/wiki/The_Glast_Gambit',
      },
    ]);
    expect(partSources('nidus', 'Blueprint')).toHaveLength(1); // matched case-insensitively
  });

  it('a quest only names the Blueprint, unless the wiki says "and parts"', () => {
    expect(partSources('Nidus', 'Chassis')).toEqual([]);
    expect(partSources('Inaros', 'Chassis')).toHaveLength(1);
    expect(partSources('Titania', 'Systems')).toHaveLength(1);
  });

  it('has nothing for items no quest rewards (the app then keeps your note)', () => {
    expect(partSources('Excalibur Prime', 'Blueprint')).toEqual([]);
    expect(Object.keys(loadPartSources().items).length).toBeGreaterThan(15);
  });
});
