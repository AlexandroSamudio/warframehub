import {
  ApiError,
  Build,
  BuildOptionsResponse,
  BuildView,
  ChecklistResponse,
  ClearSectionResponse,
  GoalsResponse,
  HealthResponse,
  ItemSearchResponse,
  ProfileResponse,
  PutTickResponse,
  SettingsResponse,
  TrackerResponse,
  WarframeDetail,
  WarframesResponse,
  WorldstateResponse,
  type BuildContent,
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

// ---- goal planner -----------------------------------------------------------

export function searchItems(q: string, signal?: AbortSignal): Promise<ItemSearchResponse> {
  return request(ItemSearchResponse, `/api/goals/search?q=${encodeURIComponent(q)}`, { signal });
}

export function getGoals(): Promise<GoalsResponse> {
  return request(GoalsResponse, '/api/goals');
}

export function addGoal(uniqueName: string): Promise<GoalsResponse> {
  return request(GoalsResponse, '/api/goals', json('POST', { uniqueName }));
}

export function setPartNote(
  goalId: number,
  componentKey: string,
  note: string,
): Promise<GoalsResponse> {
  return request(
    GoalsResponse,
    `/api/goals/${goalId}/parts`,
    json('PATCH', { componentKey, note }),
  );
}

export function setStock(key: string, amount: number): Promise<GoalsResponse> {
  return request(GoalsResponse, '/api/resources', json('PUT', { key, amount }));
}

/** Uses up the parts and resources (blocked when short); `useStock: false` only marks it. */
export function markBuilt(goalId: number, useStock = true): Promise<GoalsResponse> {
  return request(GoalsResponse, `/api/goals/${goalId}/built`, json('POST', { useStock }));
}

export function reactivateGoal(goalId: number): Promise<GoalsResponse> {
  return request(GoalsResponse, `/api/goals/${goalId}/reactivate`, json('POST'));
}

export function deleteGoal(goalId: number): Promise<GoalsResponse> {
  return request(GoalsResponse, `/api/goals/${goalId}`, json('DELETE'));
}

export function reorderGoals(goalIds: number[]): Promise<GoalsResponse> {
  return request(GoalsResponse, '/api/goals/reorder', json('POST', { goalIds }));
}

export function refreshGoal(goalId: number): Promise<GoalsResponse> {
  return request(GoalsResponse, `/api/goals/${goalId}/refresh`, json('POST'));
}

export function getProfile(): Promise<ProfileResponse> {
  return request(ProfileResponse, '/api/profile');
}

export function setProfileAccount(accountId: string): Promise<ProfileResponse> {
  return request(ProfileResponse, '/api/profile/account', json('PUT', { accountId }));
}

/** One call to DE. The server refuses a second one inside the hour. */
export function refreshProfile(): Promise<ProfileResponse> {
  return request(ProfileResponse, '/api/profile/refresh', json('POST'));
}

export function forgetProfile(): Promise<ProfileResponse> {
  return request(ProfileResponse, '/api/profile', json('DELETE'));
}

/** Sets a part's shared amounts: blueprints held, finished parts. */
export function setPartStock(
  key: string,
  amounts: { blueprints?: number; crafted?: number },
): Promise<GoalsResponse> {
  return request(GoalsResponse, '/api/parts', json('PUT', { key, ...amounts }));
}

/** One Craft: uses the blueprint and materials, adds a finished part. */
export function craftPart(key: string): Promise<GoalsResponse> {
  return request(GoalsResponse, '/api/parts/craft', json('POST', { key }));
}

/** Puts back the last craft or build. */
export function undoLast(): Promise<GoalsResponse> {
  return request(GoalsResponse, '/api/undo', json('POST'));
}

/** Every Warframe, A–Z (fetched from warframestat.us at most weekly by the server). */
export function getWarframes(): Promise<WarframesResponse> {
  return request(WarframesResponse, '/api/warframes');
}

export function getWarframe(slug: string): Promise<WarframeDetail> {
  return request(WarframeDetail, `/api/warframes/${encodeURIComponent(slug)}`);
}

/** Fetches the list again now (the server allows it once an hour). */
export function refreshWarframes(): Promise<WarframesResponse> {
  return request(WarframesResponse, '/api/warframes/refresh', json('POST'));
}

/** Where a Warframe image is served from (downloaded once, then local). */
/** A polarity symbol (DE's, from the Warframe wiki, cached by the API). */
export function polarityUrl(polarity: string): string {
  return `/api/polarities/${encodeURIComponent(polarity)}`;
}

export function imageUrl(file: string): string {
  return `/api/images/${encodeURIComponent(file)}`;
}

// ---- builds (SPEC §14.1) ------------------------------------------------------

export function getBuildOptions(slug: string): Promise<BuildOptionsResponse> {
  return request(BuildOptionsResponse, `/api/builds/options?slug=${encodeURIComponent(slug)}`);
}

/** One build with its pictures and effects (as on the Builds page). */
export function getBuild(id: number): Promise<BuildView> {
  return request(BuildView, `/api/builds/${id}`);
}

export function createBuild(slug: string, name: string, content: BuildContent): Promise<Build> {
  return request(Build, '/api/builds', json('POST', { slug, name, content }));
}

export function updateBuild(id: number, name: string, content: BuildContent): Promise<Build> {
  return request(Build, `/api/builds/${id}`, json('PUT', { name, content }));
}

export async function deleteBuild(id: number): Promise<void> {
  await request({ parse: () => undefined }, `/api/builds/${id}`, { method: 'DELETE' });
}

export function reorderBuilds(slug: string, buildIds: number[]): Promise<Build[]> {
  return request(
    { parse: (data: unknown) => Build.array().parse(data) },
    '/api/builds/reorder',
    json('POST', { slug, buildIds }),
  );
}
