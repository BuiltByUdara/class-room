export class ApiFailure extends Error { constructor(public status: number, message: string) { super(message); } }
const apiOrigin = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/$/, '');
export async function api<T>(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST'): Promise<T> {
  const response = await fetch(`${apiOrigin}/api${path}`, { method, credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'tuition-web' }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (response.status === 204) return undefined as T;
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new ApiFailure(response.status, result?.error?.message || 'Unable to reach the service. Please try again.');
  return result.data;
}
