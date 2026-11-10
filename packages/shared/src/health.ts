import { z } from 'zod';

/** Response of `GET /api/health`. */
export const HealthResponse = z.object({
  status: z.literal('ok'),
  app: z.literal('warframehub'),
  version: z.string(),
  /** Server clock in UTC (ISO 8601). Reset logic always uses this, never the browser clock. */
  serverTime: z.iso.datetime(),
  /** Folder that holds the database (read-only info for the Settings screen). */
  dataDir: z.string(),
});
export type HealthResponse = z.infer<typeof HealthResponse>;
