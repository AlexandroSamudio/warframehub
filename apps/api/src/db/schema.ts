import type { ItemKind, PeriodType } from '@warframehub/shared';
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/**
 * Database schema (SPEC §5). Timestamps are stored as UTC milliseconds.
 * Every user-owned row carries `user_id`; v1 has a single local user.
 */

export type Origin = 'default' | 'custom';

// Timestamps are set by the app (from its injectable clock), never by SQL defaults.
const createdAt = () => integer('created_at', { mode: 'timestamp_ms' }).notNull();

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  createdAt: createdAt(),
});

export const settings = sqliteTable(
  'settings',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    valueJson: text('value_json').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);

export const sections = sqliteTable(
  'sections',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    period: text('period').$type<PeriodType>().notNull(),
    sortOrder: integer('sort_order').notNull(),
    origin: text('origin').$type<Origin>().notNull(),
    hidden: integer('hidden', { mode: 'boolean' }).notNull().default(false),
    /** Set when the user changes a default section, so seed updates leave it alone (SPEC §5.1). */
    edited: integer('edited', { mode: 'boolean' }).notNull().default(false),
    /** Set when the user reorders sections, so seed updates keep their order. */
    reordered: integer('reordered', { mode: 'boolean' }).notNull().default(false),
    seedId: text('seed_id'),
  },
  (t) => [
    uniqueIndex('sections_user_slug').on(t.userId, t.slug),
    uniqueIndex('sections_user_seed').on(t.userId, t.seedId),
  ],
);

export const items = sqliteTable(
  'items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sectionId: integer('section_id')
      .notNull()
      .references(() => sections.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    kind: text('kind').$type<ItemKind>().notNull(),
    /** `ItemSlots` as JSON for `counter` / `subticks`, otherwise null. */
    slotsJson: text('slots_json'),
    verify: integer('verify', { mode: 'boolean' }).notNull().default(false),
    linkUrl: text('link_url'),
    sortOrder: integer('sort_order').notNull(),
    hidden: integer('hidden', { mode: 'boolean' }).notNull().default(false),
    origin: text('origin').$type<Origin>().notNull(),
    seedId: text('seed_id'),
    /** Set when the user changes a default item, so seed updates leave it alone (SPEC §5.1). */
    edited: integer('edited', { mode: 'boolean' }).notNull().default(false),
    /** Set when the user moves the item, so seed updates keep its section and order. */
    reordered: integer('reordered', { mode: 'boolean' }).notNull().default(false),
    createdAt: createdAt(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    uniqueIndex('items_user_seed').on(t.userId, t.seedId),
    index('items_section').on(t.sectionId),
  ],
);

export const ticks = sqliteTable(
  'ticks',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    itemId: integer('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    slot: integer('slot').notNull(),
    periodKey: text('period_key').notNull(),
    checkedAt: integer('checked_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.itemId, t.slot, t.periodKey] })],
);

/** The number used in `manual:<counter>` period keys; goes up when the user presses Clear. */
export const manualCounters = sqliteTable(
  'manual_counters',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sectionId: integer('section_id')
      .notNull()
      .references(() => sections.id, { onDelete: 'cascade' }),
    counter: integer('counter').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.sectionId] })],
);

export const worldstateCache = sqliteTable(
  'worldstate_cache',
  {
    source: text('source').notNull(),
    endpoint: text('endpoint').notNull(),
    fetchedAt: integer('fetched_at', { mode: 'timestamp_ms' }).notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    payloadJson: text('payload_json').notNull(),
    lastError: text('last_error'),
  },
  (t) => [primaryKey({ columns: [t.source, t.endpoint] })],
);

/** Which seed version has been applied, per user (each user gets their own copy of the defaults). */
export const seedMeta = sqliteTable('seed_meta', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  seedVersion: integer('seed_version').notNull(),
  appliedAt: integer('applied_at', { mode: 'timestamp_ms' }).notNull(),
});
