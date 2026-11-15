import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { z } from 'zod';
import { BuildContent } from '@warframehub/shared';

/**
 * A shared build (SPEC §14.1): the whole build as one line of text that can be pasted in a
 * chat. The app only runs on one's own computer, so a link to it would lead nowhere for
 * anyone else; the text carries the build itself: "wfhub-build1:" and the build as
 * compressed JSON in base64url. Nothing is sent anywhere.
 */
const PREFIX = 'wfhub-build1:';
/** The biggest build we accept back (a guide of 20,000 characters is the largest part). */
const MAX_JSON_BYTES = 200_000;

const Shared = z.object({
  v: z.literal(1),
  slug: z.string().regex(/^[a-z0-9-]{1,40}$/),
  name: z.string(),
  content: z.unknown(),
});

export interface SharedBuild {
  slug: string;
  name: string;
  content: BuildContent;
}

export function encodeShare(build: SharedBuild): string {
  const json = JSON.stringify({ v: 1, slug: build.slug, name: build.name, content: build.content });
  return PREFIX + deflateRawSync(Buffer.from(json, 'utf8')).toString('base64url');
}

/** The build in a pasted code, or null when it isn't one of ours or is damaged. */
export function decodeShare(text: string): SharedBuild | null {
  // Pasting can add spaces, line breaks or quotes around the text.
  const code = text.replace(/\s+/g, '').replace(/^["'<`]+|["'>`]+$/g, '');
  if (!code.startsWith(PREFIX)) return null;
  try {
    const raw = inflateRawSync(Buffer.from(code.slice(PREFIX.length), 'base64url'), {
      maxOutputLength: MAX_JSON_BYTES,
    });
    const shared = Shared.parse(JSON.parse(raw.toString('utf8')));
    const content = BuildContent.safeParse(shared.content);
    const name = shared.name.trim().slice(0, 60);
    if (!content.success || name === '') return null;
    return { slug: shared.slug, name, content: content.data };
  } catch {
    return null;
  }
}
