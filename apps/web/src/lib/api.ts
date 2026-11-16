export class ApiFailure extends Error { constructor(public status: number, message: string) { super(message); } }
const apiOrigin = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/$/, '');
export async function downloadReport(path:string,filename:string):Promise<void> {
  const response=await fetch(`${apiOrigin}/api${path}`,{credentials:'include',headers:{'X-Requested-With':'tuition-web'}});
  if(!response.ok){const body=await response.json().catch(()=>null);throw new ApiFailure(response.status,body?.error?.message||'Could not download report');}
  const blob=await response.blob();const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export async function api<T>(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST'): Promise<T> {
  const response = await fetch(`${apiOrigin}/api${path}`, { method, credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'tuition-web' }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (response.status === 204) return undefined as T;
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new ApiFailure(response.status, result?.error?.message || 'Unable to reach the service. Please try again.');
  return result.data;
}
