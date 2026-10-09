'use client';

import { ADMIN_AGENT_API } from './endpoint';

const IMPROVEMENT = 'improvement';
const LIST_LIMIT = 50;
let pendingReviewCache:
  { userId: number; expiresAt: number; value: number | null; pending?: Promise<number | null> } | undefined;

export async function countPendingReviews(userId: number): Promise<number | null> {
  // Header remounts share one read per minute. An outage is unknown, never a fabricated zero.
  if (pendingReviewCache?.userId === userId) {
    if (pendingReviewCache.pending) return pendingReviewCache.pending;
    if (pendingReviewCache.expiresAt > Date.now()) return pendingReviewCache.value;
  }
  const entry = { userId, expiresAt: 0, value: null } as NonNullable<typeof pendingReviewCache>;
  pendingReviewCache = entry;
  entry.pending = (async () => {
    try {
      const response = await fetch(`${ADMIN_AGENT_API.SERVER}/threads/search`, {
        method: 'POST',
        credentials: 'same-origin',
        signal: AbortSignal.timeout(5000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metadata: { graph: IMPROVEMENT },
          status: 'interrupted',
          limit: LIST_LIMIT,
          select: ['thread_id'],
        }),
      });
      const result = response.ok ? await response.json() : null;
      entry.value = Array.isArray(result) && result.every(row => typeof row?.thread_id === 'string') ? result.length : null;
    } catch {
      entry.value = null;
    }
    entry.expiresAt = Date.now() + 60_000;
    entry.pending = undefined;
    return entry.value;
  })();
  return entry.pending;
}
