import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { FETCH_TIMEOUT_MS, USER_AGENT, type FetchFn } from './worldstate.js';

/**
 * DE's Warframe images (portraits, ability icons), allowed for personal use (Alex,
 * 11 Nov 2026). Each one is downloaded from warframestat.us's CDN the first time it's
 * asked for and kept in the data folder (`$DATA/images/`), never in the repo. After that
 * it's served from disk, also offline.
 */
export const IMAGE_CDN = 'https://cdn.warframestat.us/img';
const NAME = /^[\w.-]+\.(png|jpg|jpeg|webp)$/i;
const MAX_BYTES = 2 * 1024 * 1024;
const TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

export interface ImageCacheOptions {
  /** Folder for the files. Without one (tests), nothing is stored and nothing is served. */
  dir?: string;
  fetch?: FetchFn;
  /** Only names this returns true for are fetched (the names the cached data mentions). */
  allowed: (name: string) => boolean;
  onError?: (name: string, error: unknown) => void;
}

export class ImageCache {
  private readonly fetchFn: FetchFn;
  private readonly inFlight = new Map<string, Promise<Buffer | null>>();

  constructor(private readonly options: ImageCacheOptions) {
    this.fetchFn = options.fetch ?? ((url, init) => fetch(url, init));
  }

  /** The image and its type, or null when it's not allowed or can't be had. */
  async get(name: string): Promise<{ body: Buffer; type: string } | null> {
    const dir = this.options.dir;
    if (!dir || !NAME.test(name) || !this.options.allowed(name)) return null;
    const type = TYPES[name.split('.').pop()!.toLowerCase()]!;
    const file = join(dir, name);
    if (existsSync(file)) return { body: await readFile(file), type };
    let pending = this.inFlight.get(name);
    if (!pending) {
      pending = this.download(dir, name, file).finally(() => this.inFlight.delete(name));
      this.inFlight.set(name, pending);
    }
    const body = await pending;
    return body ? { body, type } : null;
  }

  private async download(dir: string, name: string, file: string): Promise<Buffer | null> {
    try {
      const res = await this.fetchFn(`${IMAGE_CDN}/${encodeURIComponent(name)}`, {
        headers: { 'user-agent': USER_AGENT, accept: 'image/*' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      const type = res.headers.get('content-type') ?? '';
      if (!res.ok || !type.startsWith('image/'))
        throw new Error(`CDN answered ${res.status} ${type}`);
      const body = Buffer.from(await res.arrayBuffer());
      if (body.length === 0 || body.length > MAX_BYTES) throw new Error(`bad size ${body.length}`);
      await mkdir(dir, { recursive: true });
      // Written next to it first, so a half-written file is never served.
      const tmp = `${file}.part`;
      await writeFile(tmp, body);
      await rename(tmp, file);
      return body;
    } catch (error) {
      this.options.onError?.(name, error);
      return null;
    }
  }
}
