import { HealthResponse } from '@warframehub/shared';

/** Fetches /api/health and validates it against the shared schema. */
export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const res = await fetch('/api/health', { signal });
  if (!res.ok) throw new Error(`API returned ${res.status}`);
  return HealthResponse.parse(await res.json());
}
