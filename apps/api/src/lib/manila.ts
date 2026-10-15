// Manila is UTC+8 with no DST, so month boundaries are shifted-UTC math
// instead of a timezone database lookup.
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

export function manilaMonthBounds(now: Date): { from: Date; to: Date } {
  const shifted = new Date(now.getTime() + MANILA_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth();
  return {
    from: new Date(Date.UTC(year, month, 1) - MANILA_OFFSET_MS),
    to: new Date(Date.UTC(year, month + 1, 1) - MANILA_OFFSET_MS),
  };
}
