/*
 * When to start prefetching the media that follows an upcoming auto-skipped segment.
 *
 * Pure decision logic: the caller gathers the facts, this module only answers
 * "start now?" and, when not, why (useful for debug logging).
 */

/**
 * Start this many seconds (of real time) before the segment begins. The download takes as long
 * as the connection needs for the data: 13 s was measured for 7.6 MB on a slow connection.
 */
export const PREFETCH_LEAD_SEC = 30;
/** The player's last request is copied to build the prefetch; it must be fresh. */
export const BASE_REQUEST_MAX_AGE_MS = 30000;
/** Do not compete with the player for bandwidth while its own buffer is thin. */
export const MIN_BUFFER_AHEAD_SEC = 10;
export const MAX_PREFETCHES_PER_MINUTE = 4;

export interface PrefetchContext {
    readonly enabled: boolean;
    /** Where the segment to skip begins, in video seconds. */
    readonly targetStartSec: number;
    readonly currentTimeSec: number;
    readonly playbackRate: number;
    /** End of the buffered range containing the playhead, or null if there is none. */
    readonly bufferedEndSec: number | null;
    /** Age of the player's most recent media request, or null if none has been seen. */
    readonly baseRequestAgeMs: number | null;
    /** A prefetch for this target is already ready or in flight. */
    readonly hasEntryForTarget: boolean;
    /** Prefetches started during the last minute. */
    readonly recentPrefetchCount: number;
}

export type PrefetchSkipReason =
    | "disabled"
    | "invalidInput"
    | "passed"
    | "alreadyHave"
    | "noBaseRequest"
    | "staleBaseRequest"
    | "tooEarly"
    | "bufferLow"
    | "rateLimited";

export type PrefetchDecision =
    | { readonly start: true }
    | { readonly start: false; readonly reason: PrefetchSkipReason };

const skip = (reason: PrefetchSkipReason): PrefetchDecision => ({ start: false, reason });

function hasInvalidNumbers(context: PrefetchContext): boolean {
    const required = [context.targetStartSec, context.currentTimeSec, context.playbackRate];
    const optional = [context.bufferedEndSec, context.baseRequestAgeMs];

    return required.some((value) => !Number.isFinite(value))
        || optional.some((value) => value !== null && !Number.isFinite(value))
        || context.playbackRate <= 0;
}

function isBufferHealthy(context: PrefetchContext): boolean {
    if (context.bufferedEndSec === null) return false;

    const reachesSegment = context.bufferedEndSec >= context.targetStartSec;
    const hasRunway = context.bufferedEndSec - context.currentTimeSec >= MIN_BUFFER_AHEAD_SEC;
    return reachesSegment || hasRunway;
}

export function decidePrefetch(context: PrefetchContext): PrefetchDecision {
    if (!context.enabled) return skip("disabled");
    if (hasInvalidNumbers(context)) return skip("invalidInput");
    if (context.currentTimeSec >= context.targetStartSec) return skip("passed");
    if (context.hasEntryForTarget) return skip("alreadyHave");
    if (context.baseRequestAgeMs === null) return skip("noBaseRequest");
    if (context.baseRequestAgeMs > BASE_REQUEST_MAX_AGE_MS) return skip("staleBaseRequest");

    const secondsUntilSegment = (context.targetStartSec - context.currentTimeSec) / context.playbackRate;
    if (secondsUntilSegment > PREFETCH_LEAD_SEC) return skip("tooEarly");
    if (!isBufferHealthy(context)) return skip("bufferLow");
    if (context.recentPrefetchCount >= MAX_PREFETCHES_PER_MINUTE) return skip("rateLimited");

    return { start: true };
}
