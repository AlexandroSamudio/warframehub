import {
  WEAPON_ARCANE_SLOTS,
  WEAPON_MOD_SLOTS,
  type WeaponBuildContent,
  type WeaponModOption,
  type WeaponVariantKind,
} from '@warframehub/shared';
import { searchByName } from './builds.ts';

/** Helpers for the weapon build edit page (SPEC §15.1). */

export function emptyWeaponContent(variant: WeaponVariantKind): WeaponBuildContent {
  return {
    variant,
    sourceUrl: '',
    author: '',
    patch: '',
    description: '',
    exilus: null,
    slots: Array(WEAPON_MOD_SLOTS).fill(null),
    arcanes: Array(WEAPON_ARCANE_SLOTS).fill(null),
    stance: null,
    incarnon: [],
    riven: null,
    progenitor: null,
  };
}

/**
 * What the mod picker offers for a slot: mods that fit and aren't used elsewhere (the
 * Exilus slot only takes Exilus mods). With no query, this weapon's own augments come first.
 */
export function weaponModChoices(
  mods: WeaponModOption[],
  exilus: boolean,
  used: Set<string>,
  query: string,
): WeaponModOption[] {
  const fits = mods.filter((m) => !used.has(m.uniqueName) && (!exilus || m.exilus));
  if (query.trim() === '') {
    return [...fits.filter((m) => m.augment), ...fits.filter((m) => !m.augment)];
  }
  return searchByName(fits, query);
}

/** A Riven stat's row key: the stat's name and whether it's a spliced one. */
export const rivenKey = (stat: string, spliced: boolean) => `${stat}|${spliced ? 1 : 0}`;
