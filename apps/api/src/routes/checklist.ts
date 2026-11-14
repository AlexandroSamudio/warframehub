import {
  ChecklistResponse,
  CreateItemRequest,
  CreateSectionRequest,
  ReorderItemsRequest,
  ReorderSectionsRequest,
  UpdateItemRequest,
  UpdateSectionRequest,
} from '@warframehub/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createItem,
  createSection,
  deleteItem,
  deleteSection,
  dismissSeedNotice,
  loadChecklist,
  reorderItems,
  reorderSections,
  updateItem,
  updateSection,
} from '../db/checklist.js';
import type { Db } from '../db/client.js';
import { restoreDefaults } from '../db/init.js';
import type { SeedText } from '../domain/seed-text.js';
import type { SeedFile } from '../domain/seed.js';

export interface ChecklistRouteDeps {
  db: Db;
  userId: number;
  now: () => Date;
  seed: () => SeedFile;
  /** The default checklist's Spanish (SPEC §8.3). */
  text: () => SeedText;
}

const IdParams = z.object({ id: z.coerce.number().int().positive() });

/** Edit-mode routes (SPEC §6). Every change answers with the full checklist. */
export function registerChecklistRoutes(app: FastifyInstance, deps: ChecklistRouteDeps): void {
  const { db, userId, now, seed, text } = deps;
  const checklist = (): ChecklistResponse =>
    ChecklistResponse.parse(loadChecklist(db, userId, text()));

  app.get('/api/sections', async () => checklist());

  app.post('/api/sections', async (request, reply) => {
    createSection(db, userId, CreateSectionRequest.parse(request.body));
    return reply.code(201).send(checklist());
  });

  app.patch('/api/sections/:id', async (request) => {
    const { id } = IdParams.parse(request.params);
    updateSection(db, userId, id, UpdateSectionRequest.parse(request.body), text());
    return checklist();
  });

  app.delete('/api/sections/:id', async (request) => {
    const { id } = IdParams.parse(request.params);
    deleteSection(db, userId, id);
    return checklist();
  });

  app.post('/api/sections/reorder', async (request) => {
    reorderSections(db, userId, ReorderSectionsRequest.parse(request.body));
    return checklist();
  });

  app.post('/api/items', async (request, reply) => {
    createItem(db, userId, CreateItemRequest.parse(request.body), now());
    return reply.code(201).send(checklist());
  });

  app.patch('/api/items/:id', async (request) => {
    const { id } = IdParams.parse(request.params);
    updateItem(db, userId, id, UpdateItemRequest.parse(request.body), now(), text());
    return checklist();
  });

  app.delete('/api/items/:id', async (request) => {
    const { id } = IdParams.parse(request.params);
    deleteItem(db, userId, id, now());
    return checklist();
  });

  app.post('/api/items/reorder', async (request) => {
    reorderItems(db, userId, ReorderItemsRequest.parse(request.body), now());
    return checklist();
  });

  app.post('/api/checklist/restore-defaults', async () => {
    restoreDefaults(db, userId, seed(), now());
    return checklist();
  });

  app.post('/api/checklist/dismiss-notice', async (_request, reply) => {
    dismissSeedNotice(db, userId);
    return reply.code(204).send();
  });
}
