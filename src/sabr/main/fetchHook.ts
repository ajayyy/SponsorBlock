/*
 * The replacement for window.fetch installed in the page.
 *
 * Requests that are not SABR media requests, or that arrive while the feature is off, go
 * straight to the real fetch without being looked at. For the player's own media requests
 * it reads the body (from a clone), tells the controller about it, asks the strategy what to
 * do and then either answers from the prefetch cache, holds the request, or lets it through.
 * Anything unexpected falls back to the real fetch.
 */

import { getFormatsKey, getPlayerTimeMs, getStreamKey, isSabrRequest } from "../core/sabrRequest";
import { RequestContext, Strategy, chooseStrategy, describeCacheMiss, describeStrategy } from "../core/strategy";
import { FilterRule, FilterSegments, FilterStats, createUmpFilter } from "../core/umpFilter";
import type { CacheStore } from "./cacheStore";
import { HoldRegistry, Timers, abortError, systemTimers } from "./holdRegistry";

/** How long a request waits for a prefetch that is still downloading before going to the network. */
export const AWAIT_PREFETCH_TIMEOUT_MS = 10000;

export interface PlayerProbe {
    currentTimeMs(): number;
    /** End of the buffered range around the playhead, in seconds, or null if there is none. */
    bufferedEndSec(): number | null;
    /** Whether a request for this player position comes from the main player (not an ad, not DRM). */
    isMainPlayer(playerTimeMs: number): boolean;
}

export interface HookState {
    isEnabled(): boolean;
    /** Start of the next auto-skipped segment, in ms, or null when none is armed. */
    armedStartMs(): number | null;
    armedEndMs(): number | null;
    /** A filtered answer was left empty, so requests before the segment must now be held. */
    isHoldForced(): boolean;
}

export interface PlayerRequestInfo {
    /** A copy of the request whose body has not been read, usable as the template for a prefetch. */
    readonly request: Request;
    readonly body: Uint8Array;
    readonly playerTimeMs: number | null;
    readonly streamKey: string | null;
    readonly formatsKey: string | null;
}

export interface CacheServedInfo {
    readonly targetMs: number;
    readonly bytes: number;
    readonly prefetchMs: number;
}

export interface HookEvents {
    onPlayerRequest(info: PlayerRequestInfo): void;
    onCacheServed(info: CacheServedInfo): void;
    onHeld(): void;
    /** A short note for the debug log, e.g. why a request did not get the cached data. */
    onTrace(event: string, detail?: string): void;
    /** A filtered answer has been read to its end; says what was removed from it. */
    onFiltered(stats: FilterStats, segments?: FilterSegments): void;
}

const UMP_CONTENT_TYPE = "application/vnd.yt-ump";

export interface FetchHookDeps {
    readonly realFetch: typeof fetch;
    readonly state: HookState;
    readonly probe: PlayerProbe;
    readonly store: CacheStore;
    readonly holds: HoldRegistry;
    readonly events: HookEvents;
    readonly timers?: Timers;
}

async function readBody(request: Request): Promise<Uint8Array | null> {
    try {
        return new Uint8Array(await request.clone().arrayBuffer());
    } catch {
        return null;
    }
}

export function createFetchHook(deps: FetchHookDeps): typeof fetch {
    const timers = deps.timers ?? systemTimers;

    /** Resolves when the entry settles or the wait times out; rejects if the player aborts meanwhile. */
    function waitForPrefetch(entryId: string, signal: AbortSignal): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (signal.aborted) {
                reject(abortError());
                return;
            }

            const cleanup = (): void => {
                timers.clear(timer);
                signal.removeEventListener("abort", onAbort);
            };
            const finish = (): void => {
                cleanup();
                resolve();
            };
            const onAbort = (): void => {
                cleanup();
                reject(abortError());
            };

            signal.addEventListener("abort", onAbort, { once: true });
            const timer = timers.set(finish, AWAIT_PREFETCH_TIMEOUT_MS);
            deps.store.whenSettled(entryId).then(finish);
        });
    }

    function serveFromCache(entryId: string, input: Request): Promise<Response> {
        const taken = deps.store.take(entryId);
        if (!taken) {
            // Still downloading after the wait, or no longer usable: the player fetches the same data itself now.
            deps.store.discard(entryId);
            return deps.realFetch(input, undefined);
        }

        deps.events.onCacheServed({ targetMs: taken.targetMs, bytes: taken.bytes, prefetchMs: taken.prefetchMs });
        return Promise.resolve(new Response(taken.body, { status: 200, headers: { "content-type": taken.contentType } }));
    }

    /** Streams the answer through the filter; anything that is not a plain successful UMP answer is returned as is. */
    function filterAnswer(response: Response, rule: FilterRule): Response {
        const contentType = response.headers.get("content-type") ?? "";
        if (!response.ok || !response.body || !contentType.includes(UMP_CONTENT_TYPE)) return response;

        const filter = createUmpFilter(rule);
        const transform = new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
                const forwarded = filter.push(chunk);
                if (forwarded.length > 0) controller.enqueue(forwarded);
            },
            flush(controller) {
                const tail = filter.flush();
                if (tail.length > 0) controller.enqueue(tail);
                deps.events.onFiltered(filter.stats(), filter.segments());
            }
        });

        return new Response(response.body.pipeThrough(transform), {
            status: response.status,
            statusText: response.statusText,
            headers: { "content-type": contentType }
        });
    }

    async function respond(strategy: Strategy, input: Request): Promise<Response> {
        switch (strategy.kind) {
            case "filter":
                return filterAnswer(await deps.realFetch(input, undefined), { dropFromMs: strategy.dropFromMs, dropToMs: strategy.dropToMs });
            case "cache":
                return serveFromCache(strategy.entryId, input);
            case "awaitPrefetch":
                await waitForPrefetch(strategy.entryId, input.signal);
                return serveFromCache(strategy.entryId, input);
            case "hold":
                deps.events.onHeld();
                return deps.holds.hold(input);
            default:
                return deps.realFetch(input, undefined);
        }
    }

    async function handle(input: RequestInfo | URL, init: RequestInit | undefined): Promise<Response> {
        const isCandidate = deps.state.isEnabled()
            && init === undefined
            && input instanceof Request
            && isSabrRequest({ url: input.url, method: input.method });
        if (!isCandidate) return deps.realFetch(input, init);

        const request = input as Request;
        const body = await readBody(request);
        if (body === null) return deps.realFetch(input, init);

        // Nothing in here may get in the way of the player's own request.
        const strategy = decide(request, body);
        if (strategy === null) return deps.realFetch(input, init);

        return respond(strategy, request);
    }

    /** Null when anything in the decision went wrong: the request is then sent on as it is. */
    function decide(request: Request, body: Uint8Array): Strategy | null {
        try {
            const playerTimeMs = getPlayerTimeMs(body);
            const streamKey = getStreamKey(request.url);
            const formatsKey = getFormatsKey(body);

            deps.events.onPlayerRequest({ request: request.clone(), body, playerTimeMs, streamKey, formatsKey });

            const context = describeRequest(playerTimeMs, streamKey, formatsKey);
            const strategy = chooseStrategy(context);
            traceDecision(context, strategy);
            return strategy;
        } catch {
            return null;
        }
    }

    function describeRequest(playerTimeMs: number | null, streamKey: string | null, formatsKey: string | null): RequestContext {
        return {
            enabled: true,
            hasInit: false,
            isMainPlayer: playerTimeMs !== null && deps.probe.isMainPlayer(playerTimeMs),
            armedStartMs: deps.state.armedStartMs(),
            armedEndMs: deps.state.armedEndMs(),
            holdForced: deps.state.isHoldForced(),
            playerTimeMs,
            playheadMs: deps.probe.currentTimeMs(),
            bufferedEndSec: deps.probe.bufferedEndSec(),
            streamKey,
            formatsKey,
            cache: deps.store.candidates(),
            heldCount: deps.holds.totalSinceRelease()
        };
    }

    function traceDecision(context: RequestContext, strategy: Strategy): void {
        if (context.playerTimeMs !== null) {
            const buffered = context.bufferedEndSec ?? "none";
            const armedRange = context.armedStartMs !== null && context.armedEndMs !== null
                ? `${context.armedStartMs}-${context.armedEndMs}`
                : "none";
            deps.events.onTrace(
                "request",
                `pt=${context.playerTimeMs} head=${context.playheadMs} buf=${buffered} armed=${armedRange} -> ${describeStrategy(strategy)}`
            );
        }
        if (strategy.kind === "pass") {
            const explanation = describeCacheMiss(context);
            if (explanation) deps.events.onTrace("cache-miss", explanation);
        }
    }

    return (input, init) => handle(input, init);
}
