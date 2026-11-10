import { z } from 'zod';

/** Every error response from the API has this shape (SPEC §6). */
export const ApiError = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
export type ApiError = z.infer<typeof ApiError>;
