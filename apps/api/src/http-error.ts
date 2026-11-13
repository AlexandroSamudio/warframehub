import { message, type MessageParams, type ServerMessageKey } from './i18n.js';

/**
 * An error that becomes `{ error: { code, message } }` with the given status (SPEC §6).
 * It carries a message key and values; the error handler writes the message in the user's
 * language. `message` is the English text, for logs.
 */
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    readonly key: ServerMessageKey,
    readonly params: MessageParams = {},
  ) {
    super(message('en', key, params));
    this.name = 'HttpError';
  }
}
