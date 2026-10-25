/** Uploaded photos live on the API; external image URLs are already complete. */
export function imageUrl(path: string): string {
  const base: string = import.meta.env.VITE_API_BASE_URL ?? '';
  return path.startsWith('/uploads/') ? `${base.replace(/\/+$/, '')}${path}` : path;
}
