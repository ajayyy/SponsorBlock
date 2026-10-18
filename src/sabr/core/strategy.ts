/*
 * Decides what to do with each media request the player makes.
 *
 *  - cache / awaitPrefetch: the request that follows a skip is answered from a prefetched response
 *  - hold: the player has buffered past the start of an upcoming skipped segment, so
 *          further requests are not sent (they would only download content that is skipped)
 *  - pass: leave the request alone. This is the answer whenever anything is in doubt.
 */

/** A request is answered from the cache when the player asks for roughly the prefetched position. */
export const CACHE_MATCH_TOLERANCE_MS = 3000;
/**
 * Hold only once the buffer extends this far beyond the segment start. It must be smaller than
 * FILTER_GUARD_MS: after filtering, the buffer reaches about the guard past the segment start.
 */
export const HOLD_MARGIN_SEC = 0.3;
/**
 * Segments starting up to this long after the segment start are still kept when an answer is
 * filtered: playback must be able to reach the skip without running dry a moment early. The
 * segment containing the point that far into the skipped range is always kept, so the buffer
 * ends at least this far past the start. Larger values keep more skipped video for no benefit
 * (a log showed a whole 6 s video segment kept for a 1 s guard).
 */
export const FILTER_GUARD_MS = 400;
/** Safety valve: never starve the player of more than this many requests in a row. */
export const MAX_HELD_REQUESTS = 6;

/** A cache miss is only worth explaining when the request asks for a position this close to an entry. */
export const EXPLAIN_RANGE_MS = 10000;

export interface CacheCandidate {
    readonly id: string;
    readonly targetMs: number;
    readonly streamKey: string | null;
    readonly formatsKey: string | null;
    readonly used: boolean;
    readonly expired: boolean;
    /** The whole response is available; otherwise it is still downloading. */
    readonly ready: boolean;
}

export interface RequestContext {
    /** The feature is on and has not shut itself down for this page. */
    readonly enabled: boolean;
    /** The request was made with extra fetch options, so what will be sent is ambiguous. */
    readonly hasInit: boolean;
    /** The request comes from the main player (no ad playing, no DRM, matching video). */
    readonly isMainPlayer: boolean;
    /** Start of the next auto-skipped segment the content script armed, in ms. */
    readonly armedStartMs: number | null;
    readonly armedEndMs: number | null;
    /** A filtered answer was left without any allowed segment, so requests must be held from now on. */
    readonly holdForced: boolean;
    /** player_time_ms from the request body. */
    readonly playerTimeMs: number | null;
    readonly playheadMs: number;
    /** End of the buffered range containing the playhead, in seconds. */
    readonly bufferedEndSec: number | null;
    readonly streamKey: string | null;
    readonly formatsKey: string | null;
    readonly cache: ReadonlyArray<CacheCandidate>;
    readonly heldCount: number;
}

export type PassReason =
    | "disabled"
    | "hasInit"
    | "noTarget"
    | "noPlayerTime"
    | "notMainPlayer"
    | "pastTarget"
    | "holdLimit";

export type Strategy =
    | { readonly kind: "pass"; readonly reason: PassReason }
    | { readonly kind: "cache"; readonly entryId: string }
    | { readonly kind: "awaitPrefetch"; readonly entryId: string }
    | { readonly kind: "hold" }
    /** Send the request, but remove the segments starting in [dropFromMs, dropToMs) from the answer. */
    | { readonly kind: "filter"; readonly dropFromMs: number; readonly dropToMs: number };

const pass = (reason: PassReason): Strategy => ({ kind: "pass", reason });

/** Keys only have to agree when both sides know them. */
const keysAgree = (a: string | null, b: string | null): boolean => a === null || b === null || a === b;

const splitFormats = (key: string): ReadonlyArray<string> => key.split(",");

/**
 * Data fetched while some set of formats was allowed stays usable as long as every one of those
 * formats is still allowed. The player often allows a few more after a seek, which must not
 * invalidate what was prefetched.
 */
function formatsCompatible(cached: string | null, requested: string | null): boolean {
    if (cached === null || requested === null) return true;

    const allowed = splitFormats(requested);
    return splitFormats(cached).every((format) => allowed.includes(format));
}

function findCacheMatch(context: RequestContext, playerTimeMs: number): CacheCandidate | null {
    const matches = context.cache
        .filter((entry) => !entry.used && !entry.expired)
        .filter((entry) => keysAgree(entry.streamKey, context.streamKey))
        .filter((entry) => formatsCompatible(entry.formatsKey, context.formatsKey))
        .filter((entry) => Math.abs(entry.targetMs - playerTimeMs) <= CACHE_MATCH_TOLERANCE_MS);

    const distance = (entry: CacheCandidate): number => Math.abs(entry.targetMs - playerTimeMs);
    return matches.reduce<CacheCandidate | null>(
        (best, entry) => (best === null || distance(entry) < distance(best) ? entry : best),
        null
    );
}

/** What to do with a request made before an armed segment: keep the player from buffering inside it. */
function chooseBeforeSegment(context: RequestContext, armedStartMs: number, armedEndMs: number, playerTimeMs: number): Strategy {
    if (playerTimeMs >= armedStartMs || context.playheadMs >= armedStartMs) return pass("pastTarget");

    const bufferReady = context.bufferedEndSec !== null
        && context.bufferedEndSec >= armedStartMs / 1000 + HOLD_MARGIN_SEC;
    if (context.holdForced || bufferReady) {
        return context.heldCount >= MAX_HELD_REQUESTS ? pass("holdLimit") : { kind: "hold" };
    }

    return { kind: "filter", dropFromMs: armedStartMs + FILTER_GUARD_MS, dropToMs: armedEndMs };
}

/** A short description of the decision, for the debug log. */
export function describeStrategy(strategy: Strategy): string {
    switch (strategy.kind) {
        case "pass":
            return `pass:${strategy.reason}`;
        case "filter":
            return `filter ${strategy.dropFromMs}-${strategy.dropToMs}`;
        default:
            return strategy.kind;
    }
}

/** Says whether two stream keys agree without printing them: the debug log ends up in public issues. */
const keyState = (cached: string | null, requested: string | null): string => {
    if (cached === null || requested === null) return "unknown";
    return cached === requested ? "same" : "differs";
};

const formatsState = (cached: string | null, requested: string | null): string => {
    if (cached === null || requested === null) return "unknown";
    if (cached === requested) return "same";
    return formatsCompatible(cached, requested) ? "allowed" : `differs(${cached}|${requested})`;
};

/**
 * A compact explanation, for the debug log, of why a request that asked for a cached position
 * did not get the cached data. Null when there is nothing worth explaining.
 */
export function describeCacheMiss(context: RequestContext): string | null {
    if (context.playerTimeMs === null || context.cache.length === 0) return null;

    const requested = context.playerTimeMs;
    const distance = (entry: CacheCandidate): number => Math.abs(entry.targetMs - requested);
    const nearest = [...context.cache].sort((a, b) => distance(a) - distance(b))[0];
    if (distance(nearest) > EXPLAIN_RANGE_MS) return null;

    return [
        `d=${distance(nearest)}`,
        `ready=${nearest.ready}`,
        `used=${nearest.used}`,
        `expired=${nearest.expired}`,
        `main=${context.isMainPlayer}`,
        `stream=${keyState(nearest.streamKey, context.streamKey)}`,
        `formats=${formatsState(nearest.formatsKey, context.formatsKey)}`
    ].join(" ");
}

export function chooseStrategy(context: RequestContext): Strategy {
    if (!context.enabled) return pass("disabled");
    if (context.hasInit) return pass("hasInit");
    if (context.armedStartMs === null && context.cache.length === 0) return pass("noTarget");
    if (context.playerTimeMs === null) return pass("noPlayerTime");
    if (!context.isMainPlayer) return pass("notMainPlayer");

    const match = findCacheMatch(context, context.playerTimeMs);
    if (match) return match.ready ? { kind: "cache", entryId: match.id } : { kind: "awaitPrefetch", entryId: match.id };

    if (context.armedStartMs === null || context.armedEndMs === null) return pass("noTarget");
    return chooseBeforeSegment(context, context.armedStartMs, context.armedEndMs, context.playerTimeMs);
}
