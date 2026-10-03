/*
 * In-memory store for prefetched SABR responses.
 *
 * Holds a handful of entries for a short time. An entry is reserved while its download runs,
 * becomes ready when it finishes and can be taken out exactly once. Everything that is no
 * longer wanted (too old, left behind by the playhead, evicted, failed) is dropped and any
 * download still running for it is cancelled.
 */

import type { CacheCandidate } from "../core/strategy";

export const CACHE_TTL_MS = 120000;
export const MAX_CACHE_ENTRIES = 2;
/** An entry is useless once the playhead is this far past its target. */
export const PRUNE_BEHIND_MS = 5000;
/** How close a position must be to count as "already prefetched". */
export const TARGET_LOOKUP_TOLERANCE_MS = 1000;

export interface CacheStoreOptions {
    readonly now: () => number;
    readonly ttlMs?: number;
    readonly maxEntries?: number;
}

export interface ReserveSpec {
    readonly targetMs: number;
    readonly streamKey: string | null;
    readonly formatsKey: string | null;
    /** Cancels the download; called only while the entry is still downloading. */
    readonly abort: () => void;
}

export interface EntryHandle {
    readonly id: string;
    resolve(body: Uint8Array, contentType: string, prefetchMs: number): void;
    fail(): void;
}

export interface TakenEntry {
    readonly body: Uint8Array;
    readonly contentType: string;
    readonly bytes: number;
    readonly prefetchMs: number;
    readonly targetMs: number;
}

export interface CacheStore {
    reserve(spec: ReserveSpec): EntryHandle;
    candidates(): ReadonlyArray<CacheCandidate>;
    take(id: string): TakenEntry | null;
    whenSettled(id: string): Promise<void>;
    /** Forgets one entry, cancelling its download if it is still running. */
    discard(id: string): void;
    hasTarget(targetMs: number): boolean;
    pruneBehind(playheadMs: number): void;
    clear(): void;
    size(): number;
}

type SlotStatus = "loading" | "ready";

/** Internal bookkeeping; never leaves this module. */
interface Slot {
    readonly id: string;
    readonly spec: ReserveSpec;
    readonly createdAt: number;
    readonly settled: Promise<void>;
    readonly settle: () => void;
    status: SlotStatus;
    used: boolean;
    body: Uint8Array | null;
    contentType: string;
    prefetchMs: number;
}

export function createCacheStore(options: CacheStoreOptions): CacheStore {
    const ttlMs = options.ttlMs ?? CACHE_TTL_MS;
    const maxEntries = options.maxEntries ?? MAX_CACHE_ENTRIES;
    let slots: ReadonlyArray<Slot> = [];
    let counter = 0;

    const isExpired = (slot: Slot): boolean => options.now() - slot.createdAt > ttlMs;
    const isLive = (slot: Slot): boolean => !slot.used && !isExpired(slot);
    const find = (id: string): Slot | undefined => slots.find((slot) => slot.id === id);

    function drop(slot: Slot, cancelDownload: boolean): void {
        if (!slots.includes(slot)) return;

        slots = slots.filter((candidate) => candidate !== slot);
        if (cancelDownload && slot.status === "loading") slot.spec.abort();
        slot.settle();
    }

    function reserve(spec: ReserveSpec): EntryHandle {
        counter += 1;
        let settle: () => void = () => undefined;
        const settled = new Promise<void>((resolve) => { settle = resolve; });
        const slot: Slot = {
            id: `entry-${counter}`,
            spec,
            createdAt: options.now(),
            settled,
            settle,
            status: "loading",
            used: false,
            body: null,
            contentType: "",
            prefetchMs: 0
        };
        slots = [...slots, slot];
        slots.slice(0, Math.max(0, slots.length - maxEntries)).forEach((oldest) => drop(oldest, true));

        return {
            id: slot.id,
            resolve(body, contentType, prefetchMs) {
                if (!slots.includes(slot) || slot.status !== "loading") return;

                slot.status = "ready";
                slot.body = body;
                slot.contentType = contentType;
                slot.prefetchMs = prefetchMs;
                slot.settle();
            },
            fail() {
                if (slot.status === "loading") drop(slot, false);
            }
        };
    }

    return {
        reserve,

        candidates: () => slots.map((slot) => ({
            id: slot.id,
            targetMs: slot.spec.targetMs,
            streamKey: slot.spec.streamKey,
            formatsKey: slot.spec.formatsKey,
            used: slot.used,
            expired: isExpired(slot),
            ready: slot.status === "ready"
        })),

        take(id) {
            const slot = find(id);
            if (!slot || slot.status !== "ready" || !isLive(slot) || slot.body === null) return null;

            const taken: TakenEntry = {
                body: slot.body,
                contentType: slot.contentType,
                bytes: slot.body.length,
                prefetchMs: slot.prefetchMs,
                targetMs: slot.spec.targetMs
            };
            slot.used = true;
            slot.body = null;
            return taken;
        },

        whenSettled: (id) => find(id)?.settled ?? Promise.resolve(),

        discard(id) {
            const slot = find(id);
            if (slot) drop(slot, true);
        },

        hasTarget: (targetMs) => slots.some(
            (slot) => isLive(slot) && Math.abs(slot.spec.targetMs - targetMs) <= TARGET_LOOKUP_TOLERANCE_MS
        ),

        pruneBehind(playheadMs) {
            slots.filter((slot) => slot.spec.targetMs + PRUNE_BEHIND_MS < playheadMs).forEach((slot) => drop(slot, true));
        },

        clear() {
            slots.forEach((slot) => drop(slot, true));
        },

        size: () => slots.length
    };
}
