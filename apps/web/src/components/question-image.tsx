import { useState } from 'react';
import { driveQuestionImage } from '@tuition/contracts';
import { Button } from './ui/button';

export function QuestionImage({ url, alt }: { url?: string; alt?: string }) {
  if (!url?.trim()) return null;
  const image = driveQuestionImage(url);
  if (!image) return <p className="error" role="alert">Paste a Google Drive image file link, not a folder link.</p>;
  return <ImagePreview key={image.imageUrl} {...image} alt={alt?.trim() || 'Question illustration'}/>;
}
function ImagePreview({ sourceUrl, imageUrl, alt }: { sourceUrl: string; imageUrl: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  return <figure className="question-image">
    {!failed && <><img key={retry} src={imageUrl} alt={alt} referrerPolicy="no-referrer" onLoad={() => setLoading(false)} onError={() => { setFailed(true); setLoading(false); }}/>{loading && <p role="status" className="muted">Loading image…</p>}</>}
    {failed && <div role="status"><p>Image could not load. Check that the Drive file is an image and shared with “Anyone with the link”.</p><Button type="button" variant="outline" onClick={() => { setFailed(false); setLoading(true); setRetry(v => v + 1); }}>Retry image</Button></div>}
    <figcaption><a href={sourceUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Open image in Google Drive ↗</a></figcaption>
  </figure>;
}
