import type { Language } from '@warframehub/shared';

/**
 * The API's own messages (errors and notices shown in the app) in English and Spanish
 * (SPEC §8.3). Errors carry a key and its values; the error handler writes the message in
 * the user's language. Spanish is neutral (tú); game words follow the Spanish client
 * (docs/GLOSSARY-es.md).
 */
const en = {
  noItem: 'No item {id}',
  noSection: 'No section {id}',
  infoNoCheckbox: 'Info rows have no checkbox',
  badSlot: 'Item {id} has {count} slot(s)',
  notManual: 'Only manual sections can be cleared by hand',
  hasDefaultItems: 'Move the default items out of this section (or hide them) before deleting it',
  unknownSectionInOrder: 'Unknown section in the new order',
  badSlots: 'The slots don\'t match a "{kind}" item',
  itemTwice: 'An item is listed twice',
  unknownItemInOrder: 'Unknown item in the new order',
  noWarframe: 'No Warframe called "{slug}"',
  noBuild: 'No build {id}',
  inBuildTwice: '{name} is in the build twice',
  unknownMod: 'Unknown mod: {name}',
  notAura: "{name} isn't an aura mod",
  onlyAura: '{name} only goes in the aura slot',
  notExilus: "{name} can't go in the Exilus slot",
  augmentFor: '{name} is an augment for {warframe}',
  maxRank: '{name} goes up to rank {max}',
  unknownArcane: 'Unknown arcane: {name}',
  ownAbility: "{name} is already one of {warframe}'s abilities",
  helminthCant: "Helminth can't give {name}",
  buildTwice: 'A build is listed twice',
  unknownBuildInOrder: 'Unknown build in the new order',
  listEveryBuild: 'List every build of this Warframe',
  noAccount: 'Save your account ID first',
  profileTooSoon: 'Refreshed recently. Try again in {minutes} min.',
  profileUnavailable: "Couldn't read your profile. Check the account ID, then try again later.",
  rateLimited: 'Try again in {seconds} s',
  noGoal: 'No goal {id}',
  alreadyGoal: '{name} is already one of your goals',
  searchFirst: 'Search for the item first, then add it from the results',
  noPart: '{name} has no part {part}',
  badCount: '{name} needs only {count} × {part}',
  partNotNeeded: 'None of your goals needs that part',
  cantCraft: "Can't craft yet. Missing: {list}.",
  cantBuild: "Can't build yet. Missing: {list}.",
  notCrafted: "{name} isn't crafted; set how many you have",
  nothingToUndo: 'There is nothing to undo',
  resourceNotNeeded: 'None of your goals needs that resource',
  alreadyBuilt: '{name} is already built',
  alreadyActive: '{name} is already active',
  goalTwice: 'A goal is listed twice',
  unknownGoalInOrder: 'Unknown goal in the new order',
  itemGone: 'warframestat.us no longer lists {name}; the saved recipe is kept',
  queryTooShort: 'Type at least {min} letters to search',
  itemsUnavailable: "Can't reach warframestat.us to search items. Try again when you're online.",
  recipeUnavailable:
    "Can't reach warframestat.us to update this recipe. Try again when you're online.",
  warframesUnavailable:
    "Can't reach warframestat.us to load the Warframes. Try again when you're online.",
  warframesTooSoon: 'Refreshed recently. Try again in {minutes} min.',
  warframesRefreshFailed: "Can't reach warframestat.us right now. The saved list is kept.",
  // Request checks (Zod) and anything unexpected
  invalid: 'Some data was not valid ({fields})',
  buildName: 'Give the build a name',
  sourceUrl: 'The source link must start with http:// or https://',
  unknownShardStat: 'Unknown Archon Shard stat',
  unknownTimeZone: 'Unknown time zone',
  notFoundRoute: 'No route for {route}',
  internal: 'Something went wrong on the server',
  badRequest: 'The request was not valid',
} as const;

export type ServerMessageKey = keyof typeof en;

const es: Record<ServerMessageKey, string> = {
  noItem: 'No existe el elemento {id}',
  noSection: 'No existe la sección {id}',
  infoNoCheckbox: 'Las notas no tienen casilla',
  badSlot: 'El elemento {id} tiene {count} casilla(s)',
  notManual: 'Solo las secciones manuales se pueden vaciar a mano',
  hasDefaultItems:
    'Saca de esta sección los elementos predeterminados (u ocúltalos) antes de borrarla',
  unknownSectionInOrder: 'Hay una sección desconocida en el nuevo orden',
  badSlots: 'Las casillas no corresponden a un elemento de tipo "{kind}"',
  itemTwice: 'Hay un elemento repetido',
  unknownItemInOrder: 'Hay un elemento desconocido en el nuevo orden',
  noWarframe: 'No hay ningún warframe llamado "{slug}"',
  noBuild: 'No existe la build {id}',
  inBuildTwice: '{name} está dos veces en la build',
  unknownMod: 'Mod desconocido: {name}',
  notAura: '{name} no es un mod de aura',
  onlyAura: '{name} solo va en la ranura de aura',
  notExilus: '{name} no puede ir en la ranura Exilus',
  augmentFor: '{name} es un aumento de {warframe}',
  maxRank: '{name} llega como máximo al rango {max}',
  unknownArcane: 'Arcano desconocido: {name}',
  ownAbility: '{name} ya es una habilidad de {warframe}',
  helminthCant: 'El Helminto no puede dar {name}',
  buildTwice: 'Hay una build repetida',
  unknownBuildInOrder: 'Hay una build desconocida en el nuevo orden',
  listEveryBuild: 'Incluye todas las builds de este warframe',
  noAccount: 'Primero guarda tu ID de cuenta',
  profileTooSoon: 'Se actualizó hace poco. Vuelve a intentarlo en {minutes} min.',
  profileUnavailable:
    'No se pudo leer tu perfil. Revisa el ID de cuenta y vuelve a intentarlo más tarde.',
  rateLimited: 'Vuelve a intentarlo en {seconds} s',
  noGoal: 'No existe el objetivo {id}',
  alreadyGoal: '{name} ya es uno de tus objetivos',
  searchFirst: 'Primero busca el objeto y luego agrégalo desde los resultados',
  noPart: '{name} no tiene la pieza {part}',
  badCount: '{name} solo necesita {count} × {part}',
  partNotNeeded: 'Ninguno de tus objetivos necesita esa pieza',
  cantCraft: 'Aún no se puede fabricar. Falta: {list}.',
  cantBuild: 'Aún no se puede construir. Falta: {list}.',
  notCrafted: '{name} no se fabrica; indica cuántos tienes',
  nothingToUndo: 'No hay nada que deshacer',
  resourceNotNeeded: 'Ninguno de tus objetivos necesita ese recurso',
  alreadyBuilt: '{name} ya está construido',
  alreadyActive: '{name} ya está activo',
  goalTwice: 'Hay un objetivo repetido',
  unknownGoalInOrder: 'Hay un objetivo desconocido en el nuevo orden',
  itemGone: 'warframestat.us ya no tiene {name}; se conserva la receta guardada',
  queryTooShort: 'Escribe al menos {min} letras para buscar',
  itemsUnavailable:
    'No se puede conectar con warframestat.us para buscar objetos. Inténtalo cuando tengas conexión.',
  recipeUnavailable:
    'No se puede conectar con warframestat.us para actualizar esta receta. Inténtalo cuando tengas conexión.',
  warframesUnavailable:
    'No se puede conectar con warframestat.us para cargar los warframes. Inténtalo cuando tengas conexión.',
  warframesTooSoon: 'Se actualizó hace poco. Vuelve a intentarlo en {minutes} min.',
  warframesRefreshFailed:
    'Ahora no se puede conectar con warframestat.us. Se conserva la lista guardada.',
  invalid: 'Hay datos que no son válidos ({fields})',
  buildName: 'Ponle un nombre a la build',
  sourceUrl: 'El enlace de la fuente debe empezar con http:// o https://',
  unknownShardStat: 'Atributo de Fragmento de Arconte desconocido',
  unknownTimeZone: 'Zona horaria desconocida',
  notFoundRoute: 'No existe la ruta {route}',
  internal: 'Algo salió mal en el servidor',
  badRequest: 'La solicitud no era válida',
};

const dictionaries: Record<Language, Record<ServerMessageKey, string>> = { en, es };

/** A value in a message: text, a number, or a list of amounts ("1.250 Créditos, 2 Forma"). */
export type MessageValue = string | number | { count: number; name: string }[];
export type MessageParams = Record<string, MessageValue>;

const LOCALES: Record<Language, string> = { en: 'en-US', es: 'es' };

/** Numbers in the language's format, always grouped: "25,000" / "25.000". */
function formatNumber(lang: Language, value: number): string {
  return new Intl.NumberFormat(LOCALES[lang], { useGrouping: 'always' }).format(value);
}

function formatValue(lang: Language, value: MessageValue): string {
  if (typeof value === 'number') return formatNumber(lang, value);
  if (typeof value === 'string') return value;
  return value.map((v) => `${formatNumber(lang, v.count)} ${v.name}`).join(', ');
}

export function message(lang: Language, key: ServerMessageKey, params: MessageParams = {}): string {
  return dictionaries[lang][key].replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : formatValue(lang, value);
  });
}

export function isServerMessageKey(value: string): value is ServerMessageKey {
  return value in en;
}
