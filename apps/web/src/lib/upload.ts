import { api } from './api';
import type { Media } from './types';

type UploadTicket = { media: Media; upload: { url: string; method: string; headers: Record<string, string> } };

/** PUTs a file straight to object storage with progress (fetch cannot report upload progress). */
function putWithProgress(url: string, file: File, headers: Record<string, string>, onProgress: (fraction: number) => void, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    for (const [key, value] of Object.entries(headers)) xhr.setRequestHeader(key, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status}).`)));
    xhr.onerror = () => reject(new Error('Upload failed. Check your connection and try again.'));
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));
    signal?.addEventListener('abort', () => xhr.abort());
    xhr.send(file);
  });
}

/**
 * Three-step upload: reserve a media slot (API), PUT the bytes to storage (browser → R2/MinIO),
 * then confirm so the API verifies the object and renders image variants.
 */
export async function uploadListingMedia(listingId: string, file: File, onProgress: (fraction: number) => void, signal?: AbortSignal) {
  const ticket = await api<UploadTicket>(`/admin/listings/${listingId}/media/uploads`, {
    method: 'POST',
    body: { fileName: file.name, contentType: file.type, sizeBytes: file.size },
  });
  try {
    await putWithProgress(ticket.upload.url, file, ticket.upload.headers, onProgress, signal);
    return await api<Media>(`/admin/media/${ticket.media.id}/complete`, { method: 'POST' });
  } catch (error) {
    await api(`/admin/media/${ticket.media.id}`, { method: 'DELETE' }).catch(() => undefined);
    throw error;
  }
}

export const acceptedMediaTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'video/mp4', 'video/webm', 'video/quicktime'];
