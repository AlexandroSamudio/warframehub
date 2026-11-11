import { describe, expect, it } from 'vitest';
import { buildAbilityStats, infoboxFields, wikiPlain } from './wiki-abilities.js';
import { parseLuaData } from './wiki-lua.js';

// A shortened copy of the real Virulence page (wiki.warframe.com, 11 Nov 2026).
const VIRULENCE = `{{Navigation|Virulence|Larva|Parasitic Link|Ravenous}}
<onlyinclude>{{AbilityU10.3
| name           = Virulence
| energy         = 40
| strength       = 150 / 160 / 175 / 200 {{D|Puncture}} Damage (Initial Hit Damage)<br>75 / 80 / 87.5 / 100 {{D|Viral}} Damage (Lingering Field Damage)
| duration       = 5 s (Lingering Field Duration)
| range          = 10 / 11 / 13 / 16 m
| misc           = 4 m (fungal growth width)<br/>[[Energy|energy]] &infin; refund
| info           = *Nidus expends {{Stat|Ability Efficiency|icon=only}}'''40''' [[energy]]
}}</onlyinclude>`;

describe('wikiPlain', () => {
  it('turns wiki markup into plain lines', () => {
    expect(
      wikiPlain("150 {{D|Puncture}} Damage<br>{{D|Stagger|Staggered}} '''5''' [[Energy|energy]]"),
    ).toEqual(['150 Puncture Damage', 'Staggered 5 energy']);
    expect(wikiPlain('{{Stat|Ability Range|icon=only}}10 m')).toEqual(['10 m']);
    expect(wikiPlain('&infin; (cap)')).toEqual(['∞ (cap)']);
  });

  it('drops anything it cannot read instead of showing it half-parsed', () => {
    expect(wikiPlain('{{SomeTable|a|b}} 10 m')).toBeNull();
    expect(wikiPlain('{| class="wikitable"')).toBeNull();
    expect(wikiPlain('&weird; 5')).toBeNull();
  });
});

describe('infoboxFields', () => {
  it('reads the top-level fields, keeping nested templates and links together', () => {
    const f = infoboxFields(VIRULENCE);
    expect(f.energy).toBe('40');
    expect(f.range).toBe('10 / 11 / 13 / 16 m');
    expect(f.strength).toContain('{{D|Puncture}}');
    expect(f.misc).toContain('[[Energy|energy]]');
  });

  it('is empty without an infobox', () => {
    expect(infoboxFields('Just text')).toEqual({});
  });
});

describe('buildAbilityStats', () => {
  const abilityModule = parseLuaData(`local AbilityData = {
    Ability = {
      Virulence = {
        Name = "Virulence", Cost = 40, Augments = { "Teeming Virulence" },
        InternalName = "/Lotus/Powersuits/Infestation/Abilities/InfestRuptureAbility",
        Powersuit = "Nidus", Key = 1,
      },
      Larva = { Name = "Larva", Cost = 50, Subsumable = true,
        InternalName = "/Lotus/Powersuits/Infestation/Abilities/LarvaAbility" },
      Nameless = { Cost = 5 },
    },
  }
  return AbilityData`);
  const warframeModule = parseLuaData(`return { Warframes = {
    Nidus = { InternalName = "/Lotus/Powersuits/Infestation/Infestation",
      Passive = "Gains {{D|Mutation}} stacks.", AugmentShop = { "Red Veil" },
      ArmorRank30 = 450, ShieldRank30 = 0 },
  } }`);
  const file = buildAbilityStats(
    abilityModule,
    warframeModule,
    { Virulence: VIRULENCE },
    new Date(0),
  );

  it('joins the module data with the page numbers, by internal name', () => {
    expect(file.abilities['/Lotus/Powersuits/Infestation/Abilities/InfestRuptureAbility']).toEqual({
      page: 'https://wiki.warframe.com/wiki/Virulence',
      cost: 40,
      costType: 'energy',
      channeled: false,
      subsumable: false,
      augments: ['Teeming Virulence'],
      strength: [
        '150 / 160 / 175 / 200 Puncture Damage (Initial Hit Damage)',
        '75 / 80 / 87.5 / 100 Viral Damage (Lingering Field Damage)',
      ],
      duration: ['5 s (Lingering Field Duration)'],
      range: ['10 / 11 / 13 / 16 m'],
      misc: ['4 m (fungal growth width)', 'energy ∞ refund'],
    });
  });

  it('keeps an ability without a page, with no numbers, and skips one without an id', () => {
    expect(file.abilities['/Lotus/Powersuits/Infestation/Abilities/LarvaAbility']).toMatchObject({
      cost: 50,
      subsumable: true,
      strength: [],
    });
    expect(Object.keys(file.abilities)).toHaveLength(2);
  });

  it('reads the passive, augment shops and rank-30 stats per Warframe', () => {
    expect(file.warframes['/Lotus/Powersuits/Infestation/Infestation']).toEqual({
      page: 'https://wiki.warframe.com/wiki/Nidus',
      passive: 'Gains Mutation stacks.',
      augmentShops: ['Red Veil'],
      rank30: { armor: 450, shield: 0 },
    });
  });
});
