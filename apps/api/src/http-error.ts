/** An error that becomes `{ error: { code, message } }` with the given status (SPEC §6). */
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}
