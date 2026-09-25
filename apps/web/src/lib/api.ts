import type {
  Facets,
  Filters,
  FolderNode,
  Preference,
  Preview,
  SaveResult,
  Stats,
  Status,
} from './types';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Fired on 401 so the shell can show the login screen. */
export const AUTH_EVENT = 'pm:unauthorized';
/** Fired after any successful mutation so views refresh. */
export const CHANGE_EVENT = 'pm:changed';

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: 'same-origin', headers: {} };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { 'content-type': 'application/json' };
  }
  const res = await fetch(url, init);
  if (res.status === 401 && !url.startsWith('/api/auth/'))
    window.dispatchEvent(new Event(AUTH_EVENT));
  const type = res.headers.get('content-type') ?? '';
  const data = type.includes('json') ? await res.json() : await res.text();
  if (!res.ok) {
    const message =
      typeof data === 'object' && data && 'error' in data
        ? String(data.error)
        : `Ошибка ${res.status}`;
    throw new ApiError(message, res.status);
  }
  if (method !== 'GET') window.dispatchEvent(new Event(CHANGE_EVENT));
  return data as T;
}

const qs = (params: Record<string, string | number | undefined>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : '';
};

export const api = {
  me: () => request<{ auth_required: boolean; authenticated: boolean }>('GET', '/api/auth/me'),
  login: (email: string, password: string) =>
    request<{ ok: true }>('POST', '/api/auth/login', { email, password }),
  logout: () => request<{ ok: true }>('POST', '/api/auth/logout'),

  transcribe: (blob: Blob, filename: string) => {
    const form = new FormData();
    form.append('audio', blob, filename);
    return request<{ text: string }>('POST', '/api/transcribe', form);
  },
  preview: (text: string) => request<Preview>('POST', '/api/preferences/preview', { text }),
  save: (preview: Preview, source: 'voice' | 'text') =>
    request<SaveResult>('POST', '/api/preferences', {
      preview: { text: preview.text, enrichment: preview.enrichment },
      source,
    }),
  list: (f: Filters & { limit?: number }) =>
    request<{ items: { preference: Preference; score: number | null }[]; next: string | null }>(
      'GET',
      `/api/preferences${qs({ ...f })}`,
    ),
  update: (id: string, patch: Partial<Preference>) =>
    request<Preference>('PATCH', `/api/preferences/${id}`, patch),
  remove: (id: string) => request<{ ok: true }>('DELETE', `/api/preferences/${id}`),

  folders: () => request<{ tree: FolderNode[] }>('GET', '/api/folders'),
  createFolder: (name: string, parent_id: string | null) =>
    request<FolderNode>('POST', '/api/folders', { name, parent_id }),
  updateFolder: (id: string, patch: { name?: string; parent_id?: string | null }) =>
    request<FolderNode>('PATCH', `/api/folders/${id}`, patch),
  removeFolder: (id: string, force: boolean) =>
    request<{ folders: number; preferences: number }>(
      'DELETE',
      `/api/folders/${id}${force ? '?force=true' : ''}`,
    ),

  facets: (f: Filters) => request<Facets>('GET', `/api/facets${qs({ ...f, q: undefined })}`),
  stats: () => request<Stats>('GET', '/api/stats'),
  status: () => request<Status>('GET', '/api/status'),
  exportMd: (folder?: string) => request<string>('GET', `/api/export.md${qs({ folder })}`),
};
