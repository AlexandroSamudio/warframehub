import {
  ApiError,
  ClearSectionResponse,
  HealthResponse,
  PutTickResponse,
  TrackerResponse,
  WorldstateResponse,
  type PutTickRequest,
} from '@warframehub/shared';

/** A failed API call, with the server's error code when it sent one. */
export class ApiCallError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiCallError';
  }
}

async function request<T>(
  schema: { parse: (data: unknown) => T },
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init.body ? { 'content-type': 'application/json', ...init.headers } : init.headers,
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = ApiError.safeParse(body);
    throw parsed.success
      ? new ApiCallError(res.status, parsed.data.error.code, parsed.data.error.message)
      : new ApiCallError(res.status, 'http_error', `API returned ${res.status}`);
  }
  return schema.parse(body);
}

export function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return request(HealthResponse, '/api/health', { signal });
}

export function getTracker(signal?: AbortSignal): Promise<TrackerResponse> {
  return request(TrackerResponse, '/api/tracker', { signal });
}

export function putTick(body: PutTickRequest): Promise<PutTickResponse> {
  return request(PutTickResponse, '/api/ticks', { method: 'PUT', body: JSON.stringify(body) });
}

export function clearSection(sectionId: number): Promise<ClearSectionResponse> {
  return request(ClearSectionResponse, `/api/sections/${sectionId}/clear`, { method: 'POST' });
}

export function getWorldstate(signal?: AbortSignal): Promise<WorldstateResponse> {
  return request(WorldstateResponse, '/api/worldstate', { signal });
}

export function refreshWorldstate(): Promise<WorldstateResponse> {
  return request(WorldstateResponse, '/api/worldstate/refresh', { method: 'POST' });
}
