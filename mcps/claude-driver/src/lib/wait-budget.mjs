// A new request must not reset the deadline for native maintenance evidence.
// Keep three minutes of margin below the reader's twelve-minute freshness cap.
export const MAINTENANCE_INTERVAL_MS = 9 * 60 * 1000
export function waitDeadline({now, maxMs, listedAt}) {
 const normal = now + maxMs, listed = Date.parse(listedAt)
 return Number.isFinite(listed) && listed <= now
  ? Math.min(normal, listed + MAINTENANCE_INTERVAL_MS) : normal
}
