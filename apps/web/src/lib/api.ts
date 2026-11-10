import {
  ApiError,
  ChecklistResponse,
  ClearSectionResponse,
  HealthResponse,
  PutTickResponse,
  SettingsResponse,
  TrackerResponse,
  WorldstateResponse,
  type CreateItemRequest,
  type CreateSectionRequest,
  type PutTickRequest,
  type UpdateItemRequest,
  type UpdateSettingsRequest,
  type UpdateSectionRequest,
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
  const body: unknown = res.status === 204 ? null : await res.json().catch(() => null);
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

// ---- edit mode -------------------------------------------------------------

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

export function getChecklist(): Promise<ChecklistResponse> {
  return request(ChecklistResponse, '/api/sections');
}

export function createSection(body: CreateSectionRequest): Promise<ChecklistResponse> {
  return request(ChecklistResponse, '/api/sections', json('POST', body));
}

export function updateSection(id: number, body: UpdateSectionRequest): Promise<ChecklistResponse> {
  return request(ChecklistResponse, `/api/sections/${id}`, json('PATCH', body));
}

export function deleteSection(id: number): Promise<ChecklistResponse> {
  return request(ChecklistResponse, `/api/sections/${id}`, json('DELETE'));
}

export function reorderSections(sectionIds: number[]): Promise<ChecklistResponse> {
  return request(ChecklistResponse, '/api/sections/reorder', json('POST', { sectionIds }));
}

export function createItem(body: CreateItemRequest): Promise<ChecklistResponse> {
  return request(ChecklistResponse, '/api/items', json('POST', body));
}

export function updateItem(id: number, body: UpdateItemRequest): Promise<ChecklistResponse> {
  return request(ChecklistResponse, `/api/items/${id}`, json('PATCH', body));
}

export function deleteItem(id: number): Promise<ChecklistResponse> {
  return request(ChecklistResponse, `/api/items/${id}`, json('DELETE'));
}

export function reorderItems(sectionId: number, itemIds: number[]): Promise<ChecklistResponse> {
  return request(ChecklistResponse, '/api/items/reorder', json('POST', { sectionId, itemIds }));
}

export function restoreDefaults(): Promise<ChecklistResponse> {
  return request(ChecklistResponse, '/api/checklist/restore-defaults', json('POST'));
}

export async function dismissNotice(): Promise<void> {
  await request({ parse: () => undefined }, '/api/checklist/dismiss-notice', json('POST'));
}

// ---- settings and lifecycle -------------------------------------------------

export function getSettings(): Promise<SettingsResponse> {
  return request(SettingsResponse, '/api/settings');
}

export function updateSettings(body: UpdateSettingsRequest): Promise<SettingsResponse> {
  return request(SettingsResponse, '/api/settings', json('PATCH', body));
}

/** Tells the server a page is still open (SPEC §9.2 idle shutdown). */
export async function heartbeat(): Promise<void> {
  await request({ parse: () => undefined }, '/api/heartbeat', json('POST'));
}

/** Quit button: stops the server. */
export async function shutdown(): Promise<void> {
  await request({ parse: () => undefined }, '/api/shutdown', json('POST'));
}
