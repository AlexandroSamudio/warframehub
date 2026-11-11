/**
 * A small reader for the Lua data tables the Warframe wiki keeps its facts in
 * (`Module:Ability/data`, `Module:Warframes/data`). It reads only what those use:
 * `return { ... }` or `local Data = { ... }` (the code after it is ignored), tables with `key =` or `["key"] =` entries and plain list items,
 * strings, numbers, `true`/`false`/`nil`, and `--` comments. Anything else is an error,
 * so a format change shows up when the script runs instead of producing wrong data.
 */

export type LuaValue = string | number | boolean | null | LuaTable;
export interface LuaTable {
  /** Plain list items, in order. */
  list: LuaValue[];
  /** `key = value` entries. */
  map: Record<string, LuaValue>;
}

export class LuaParseError extends Error {
  override name = 'LuaParseError';
}

export function parseLuaData(source: string): LuaValue {
  let i = 0;
  const fail = (what: string): never => {
    const line = source.slice(0, i).split('\n').length;
    throw new LuaParseError(`${what} at line ${line}`);
  };

  function skip() {
    for (;;) {
      while (i < source.length && /\s/.test(source[i]!)) i++;
      if (source.startsWith('--[[', i)) {
        const end = source.indexOf(']]', i);
        i = end < 0 ? source.length : end + 2;
      } else if (source.startsWith('--', i)) {
        const end = source.indexOf('\n', i);
        i = end < 0 ? source.length : end + 1;
      } else return;
    }
  }

  function string(): string {
    const quote = source[i]!;
    i++;
    let out = '';
    while (i < source.length && source[i] !== quote) {
      if (source[i] === '\\') {
        const next = source[i + 1];
        out += next === 'n' ? '\n' : next === 't' ? '\t' : (next ?? '');
        i += 2;
      } else out += source[i++];
    }
    if (source[i] !== quote) fail('unterminated string');
    i++;
    return out;
  }

  function value(): LuaValue {
    skip();
    const c = source[i];
    if (c === '"' || c === "'") return string();
    if (c === '{') return table();
    const word = /^(true|false|nil)\b/.exec(source.slice(i, i + 6));
    if (word) {
      i += word[1]!.length;
      return word[1] === 'true' ? true : word[1] === 'false' ? false : null;
    }
    const num = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(source.slice(i, i + 40));
    if (num) {
      i += num[0].length;
      return Number(num[0]);
    }
    return fail(`unexpected "${source.slice(i, i + 12)}"`);
  }

  function table(): LuaTable {
    i++; // {
    const out: LuaTable = { list: [], map: {} };
    for (;;) {
      skip();
      if (source[i] === '}') {
        i++;
        return out;
      }
      let key: string | null = null;
      if (source[i] === '[') {
        i++;
        skip();
        const k = value();
        skip();
        if (source[i] !== ']') fail('expected ]');
        i++;
        key = String(k);
        skip();
        if (source[i] !== '=') fail('expected =');
        i++;
      } else {
        const name = /^[A-Za-z_]\w*\s*=(?!=)/.exec(source.slice(i, i + 80));
        if (name) {
          key = name[0].replace(/\s*=$/, '');
          i += name[0].length;
        }
      }
      const v = value();
      if (key === null) out.list.push(v);
      else out.map[key] = v;
      skip();
      if (source[i] === ',' || source[i] === ';') i++;
      else if (source[i] !== '}') fail('expected , or }');
    }
  }

  skip();
  // `return { … }`, or `local Data = { … }` followed by code that only builds an index
  // from it (Module:Ability/data): the data is the first table either way.
  const local = /^local\s+[A-Za-z_]\w*\s*=\s*/.exec(source.slice(i, i + 80));
  if (local) i += local[0].length;
  else if (source.startsWith('return', i)) i += 'return'.length;
  const result = value();
  skip();
  if (!local && i < source.length) fail('unexpected text after the table');
  return result;
}

// ---- small helpers for reading the result ---------------------------------------

export function isTable(v: LuaValue | undefined): v is LuaTable {
  return typeof v === 'object' && v !== null;
}

export function str(t: LuaTable, key: string): string | null {
  const v = t.map[key];
  return typeof v === 'string' ? v : null;
}

export function num(t: LuaTable, key: string): number | null {
  const v = t.map[key];
  return typeof v === 'number' ? v : null;
}

export function bool(t: LuaTable, key: string): boolean {
  return t.map[key] === true;
}

export function strings(t: LuaTable, key: string): string[] {
  const v = t.map[key];
  return isTable(v) ? v.list.filter((x): x is string => typeof x === 'string') : [];
}
