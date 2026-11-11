import { describe, expect, it } from 'vitest';
import {
  bool,
  isTable,
  LuaParseError,
  num,
  parseLuaData,
  str,
  strings,
  type LuaTable,
  type LuaValue,
} from './wiki-lua.js';

function table(v: LuaValue | undefined): LuaTable {
  if (!isTable(v)) throw new Error('not a table');
  return v;
}

describe('parseLuaData', () => {
  it('reads the shapes the wiki data modules use', () => {
    const src = `-- a comment
return {
  Ability = {
    ["Razor Gyre"] = {
      Name = "Razor Gyre",
      Augments = { "Razor Mortar" },
      Cost = 25,
      Description = "Dash \\"forward\\" in a spinning vortex",
      IsChanneled = true,
      Key = 1,
    },
  },
}`;
    const gyre = table(table(table(parseLuaData(src)).map.Ability).map['Razor Gyre']);
    expect(str(gyre, 'Name')).toBe('Razor Gyre');
    expect(num(gyre, 'Cost')).toBe(25);
    expect(bool(gyre, 'IsChanneled')).toBe(true);
    expect(strings(gyre, 'Augments')).toEqual(['Razor Mortar']);
    expect(str(gyre, 'Description')).toBe('Dash "forward" in a spinning vortex');
  });

  it('reads numbers, nil and block comments', () => {
    const root = parseLuaData('{ 1.15, -3, nil, --[[ skip ]] false }');
    expect(isTable(root) && root.list).toEqual([1.15, -3, null, false]);
  });

  it('reads `local Data = { … }` and ignores the index-building code after it', () => {
    const root = parseLuaData(
      '-- x\nlocal AbilityData = { A = 1 }\nfor k,v in pairs(AbilityData) do end\nreturn AbilityData',
    );
    expect(isTable(root) && root.map).toEqual({ A: 1 });
  });

  it('fails loudly on anything else', () => {
    expect(() => parseLuaData('return { a = function() end }')).toThrow(LuaParseError);
    expect(() => parseLuaData('{ "open }')).toThrow(LuaParseError);
  });
});
