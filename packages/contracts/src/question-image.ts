/** Accept only Google Drive file links; never fetch arbitrary user-supplied URLs. */
export function driveQuestionImage(value: string): { sourceUrl: string; imageUrl: string } | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.hostname !== 'drive.google.com' || url.port || url.username || url.password) return null;
    const match = url.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]+)(?:\/(?:view|preview))?\/?$/);
    const id = match?.[1] || (['/open','/uc','/thumbnail'].includes(url.pathname) ? url.searchParams.get('id') : null);
    if (!id || !/^[A-Za-z0-9_-]{10,200}$/.test(id)) return null;
    const resourceKey = url.searchParams.get('resourcekey');
    if (resourceKey && !/^[A-Za-z0-9_-]{1,200}$/.test(resourceKey)) return null;
    const source = new URL(`https://drive.google.com/file/d/${id}/view`);
    const image = new URL('https://drive.google.com/thumbnail');
    image.searchParams.set('id', id); image.searchParams.set('sz', 'w1600');
    if (resourceKey) { source.searchParams.set('resourcekey', resourceKey); image.searchParams.set('resourcekey', resourceKey); }
    return { sourceUrl: source.toString(), imageUrl: image.toString() };
  } catch { return null; }
}
