export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public data: any = {},
  ) {
    super(message);
  }
}

let csrfToken = '';
export const setCsrf = (t: string) => {
  csrfToken = t;
};

type Listener = (code: string) => void;
const authListeners = new Set<Listener>();
export const onAuthError = (l: Listener) => {
  authListeners.add(l);
  return () => {
    authListeners.delete(l);
  };
};

export interface RequestOpts {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
  raw?: boolean;
  keepalive?: boolean;
}

export async function api<T = any>(path: string, opts: RequestOpts = {}): Promise<T> {
  const method = opts.method ?? (opts.body !== undefined ? 'POST' : 'GET');
  let url = `/api/v1${path}`;
  if (opts.query) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.query)) if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
    const s = q.toString();
    if (s) url += `?${s}`;
  }
  const headers: Record<string, string> = {};
  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) body = opts.body;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  if (method !== 'GET' && csrfToken) headers['X-CSRF-Token'] = csrfToken;
  let res: Response;
  try {
    res = await fetch(url, { method, headers, body, credentials: 'same-origin', signal: opts.signal, keepalive: opts.keepalive });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'network', 'Connexion impossible. Vérifie ton réseau.');
  }
  if (opts.raw) return res as unknown as T;
  const isJson = (res.headers.get('content-type') ?? '').includes('application/json');
  const data = isJson ? await res.json() : await res.text();
  if (!res.ok) {
    const code = (isJson && data?.error) || 'error';
    if (res.status === 401 || code === 'must_change_password') authListeners.forEach((l) => l(code));
    throw new ApiError(res.status, code, (isJson && data?.message) || 'Une erreur est survenue.', data);
  }
  return data as T;
}

export const tzOffset = () => new Date().getTimezoneOffset();

export function mediaUrl(id: string | null | undefined) {
  return id ? `/api/v1/media/${encodeURIComponent(id)}` : undefined;
}

export async function uploadMedia(file: File): Promise<{ id: string; kind: 'image' | 'audio' }> {
  const fd = new FormData();
  fd.append('file', file);
  return api('/media', { method: 'POST', body: fd });
}

export async function download(path: string, fallbackName: string) {
  const res = await api<Response>(path, { raw: true });
  if (!res.ok) throw new ApiError(res.status, 'error', 'Téléchargement impossible.');
  const blob = await res.blob();
  const cd = res.headers.get('content-disposition') ?? '';
  const name = /filename="([^"]+)"/.exec(cd)?.[1] ?? fallbackName;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
