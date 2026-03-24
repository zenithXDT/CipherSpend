const rawBackendApiUrl = (
  (import.meta.env.VITE_BACKEND_API_URL as string | undefined) ??
  (import.meta.env.BACKEND_API_URL as string | undefined)
)?.trim();

export const BACKEND_API_BASE_URL = rawBackendApiUrl
  ? rawBackendApiUrl.replace(/\/+$/, '')
  : 'http://localhost:8000';

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${BACKEND_API_BASE_URL}${normalizedPath}`;
}
