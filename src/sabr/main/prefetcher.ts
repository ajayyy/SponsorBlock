/*
 * Prefetches the media that follows an upcoming skipped segment.
 *
 * The player's own most recent media request is copied with only the player time changed to
 * the end of the segment. The answer is read with a size limit, validated, and stored so it
 * can be handed to the player when it asks for that position after the skip.
 *
 * Nothing here throws: every failure is reported as an outcome, and a failed or rejected
 * prefetch simply leaves no entry behind (the player then makes its own request as usual).
 */

import { CacheRejection, validatePrefetchBody } from "../core/cacheValidation";
import { withPlayerTimeMs } from "../core/sabrRequest";
import type { CacheStore } from "./cacheStore";

export const MAX_PREFETCH_BYTES = 32 * 1024 * 1024;

const UMP_CONTENT_TYPE = "application/vnd.yt-ump";
/** The server refusing or rate limiting us; the caller should stop prefetching altogether. */
const BLOCKED_STATUSES: ReadonlyArray<number> = [403, 429];

export interface PrefetchBase {
    /** The player's request to copy; its body must not have been read (it is never consumed here). */
    readonly request: Request;
    /** The same body as bytes. */
    readonly body: Uint8Array;
    readonly streamKey: string | null;
    readonly formatsKey: string | null;
    /** The video every segment of the answer must belong to. */
    readonly videoId: string | null;
}

export interface PrefetchDeps {
    readonly realFetch: (request: Request) => Promise<Response>;
    readonly store: CacheStore;
    readonly now: () => number;
    readonly maxBytes?: number;
}

export type PrefetchRejection = CacheRejection | "status" | "contentType";

export type PrefetchOutcome =
    | { readonly kind: "ready"; readonly bytes: number; readonly ms: number }
    | { readonly kind: "rejected"; readonly reason: PrefetchRejection }
    | { readonly kind: "blocked"; readonly status: number }
    | { readonly kind: "failed" }
    | { readonly kind: "aborted" };

export interface PrefetchHandle {
    readonly id: string;
    readonly done: Promise<PrefetchOutcome>;
}

function concatChunks(chunks: ReadonlyArray<Uint8Array>, total: number): Uint8Array {
    const result = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
    }

    return result;
}

/** Reads the whole body, or gives up (and stops the download) once it exceeds `maxBytes`. */
async function readLimited(response: Response, maxBytes: number): Promise<Uint8Array | null> {
    if (!response.body) return new Uint8Array(0);

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;

    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        total += value.length;
        if (total > maxBytes) {
            await reader.cancel();
            return null;
        }
        chunks.push(value);
    }

    return concatChunks(chunks, total);
}

function buildRequest(template: Request, body: Uint8Array, signal: AbortSignal): Request | null {
    try {
        return new Request(template, { body, signal });
    } catch {
        return null;
    }
}

/** Returns null when the player's request cannot be rewritten, in which case nothing is started. */
export function startPrefetch(deps: PrefetchDeps, base: PrefetchBase, targetMs: number): PrefetchHandle | null {
    const body = withPlayerTimeMs(base.body, targetMs);
    if (!body) return null;

    const controller = new AbortController();
    // Built before a slot is reserved: a slot that is never settled would block later prefetches.
    const request = buildRequest(base.request, body, controller.signal);
    if (!request) return null;

    const entry = deps.store.reserve({
        targetMs,
        streamKey: base.streamKey,
        formatsKey: base.formatsKey,
        abort: () => controller.abort()
    });
    const maxBytes = deps.maxBytes ?? MAX_PREFETCH_BYTES;
    const startedAt = deps.now();

    const reject = (reason: PrefetchRejection): PrefetchOutcome => {
        entry.fail();
        return { kind: "rejected", reason };
    };

    async function download(): Promise<PrefetchOutcome> {
        const response = await deps.realFetch(request);

        if (BLOCKED_STATUSES.includes(response.status)) {
            entry.fail();
            return { kind: "blocked", status: response.status };
        }
        if (!response.ok) return reject("status");

        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.includes(UMP_CONTENT_TYPE)) return reject("contentType");

        const bytes = await readLimited(response, maxBytes);
        if (bytes === null) return reject("tooLarge");

        const check = validatePrefetchBody(bytes, { targetMs, videoId: base.videoId, maxBytes });
        if (check.ok === false) return reject(check.reason);

        const ms = deps.now() - startedAt;
        entry.resolve(bytes, contentType, ms);
        return { kind: "ready", bytes: bytes.length, ms };
    }

    const done = download().catch((): PrefetchOutcome => {
        entry.fail();
        return controller.signal.aborted ? { kind: "aborted" } : { kind: "failed" };
    });

    return { id: entry.id, done };
}
