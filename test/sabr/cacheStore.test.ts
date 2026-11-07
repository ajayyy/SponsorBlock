import {
    CACHE_TTL_MS,
    MAX_CACHE_ENTRIES,
    PRUNE_BEHIND_MS,
    TARGET_LOOKUP_TOLERANCE_MS,
    createCacheStore
} from "../../src/sabr/main/cacheStore";

function setup(options: { ttlMs?: number; maxEntries?: number } = {}) {
    const clock = { now: 1000 };
    const store = createCacheStore({ now: () => clock.now, ...options });
    const abort = jest.fn();
    const spec = (targetMs = 150000) => ({ targetMs, streamKey: "o-ABC", formatsKey: "251,400", abort });

    return { clock, store, abort, spec };
}

const body = Uint8Array.from([1, 2, 3, 4]);

describe("cache store: lifecycle of an entry", () => {
    test("a reserved entry is visible as downloading", () => {
        const { store, spec } = setup();

        const handle = store.reserve(spec());

        expect(store.candidates()).toEqual([
            {
                id: handle.id,
                targetMs: 150000,
                streamKey: "o-ABC",
                formatsKey: "251,400",
                used: false,
                expired: false,
                ready: false
            }
        ]);
    });

    test("a resolved entry is ready and can be taken exactly once", () => {
        const { store, spec } = setup();
        const handle = store.reserve(spec());

        handle.resolve(body, "application/vnd.yt-ump", 1500);

        expect(store.candidates()[0].ready).toBe(true);
        expect(store.take(handle.id)).toEqual({
            body,
            contentType: "application/vnd.yt-ump",
            bytes: 4,
            prefetchMs: 1500,
            targetMs: 150000
        });
        expect(store.take(handle.id)).toBeNull();
        expect(store.candidates()[0].used).toBe(true);
    });

    test("a downloading entry cannot be taken and stays available", () => {
        const { store, spec } = setup();
        const handle = store.reserve(spec());

        expect(store.take(handle.id)).toBeNull();
        expect(store.candidates()[0].used).toBe(false);
    });

    test("a failed entry disappears from the candidates", () => {
        const { store, spec } = setup();
        const handle = store.reserve(spec());

        handle.fail();

        expect(store.candidates()).toEqual([]);
        expect(store.take(handle.id)).toBeNull();
    });

    test("an unknown id yields nothing", () => {
        const { store } = setup();

        expect(store.take("entry-404")).toBeNull();
    });
});

describe("cache store: waiting for a download", () => {
    test("settles when the entry resolves", async () => {
        const { store, spec } = setup();
        const handle = store.reserve(spec());
        let settled = false;
        const waiting = store.whenSettled(handle.id).then(() => { settled = true; });

        await Promise.resolve();
        expect(settled).toBe(false);

        handle.resolve(body, "application/vnd.yt-ump", 10);
        await waiting;

        expect(settled).toBe(true);
    });

    test("settles when the entry fails", async () => {
        const { store, spec } = setup();
        const handle = store.reserve(spec());
        const waiting = store.whenSettled(handle.id);

        handle.fail();

        await expect(waiting).resolves.toBeUndefined();
    });

    test("settles immediately for an unknown id", async () => {
        const { store } = setup();

        await expect(store.whenSettled("entry-404")).resolves.toBeUndefined();
    });

    test("settles when the entry is cleared away", async () => {
        const { store, spec } = setup();
        const handle = store.reserve(spec());
        const waiting = store.whenSettled(handle.id);

        store.clear();

        await expect(waiting).resolves.toBeUndefined();
    });
});

describe("cache store: expiry and limits", () => {
    test("marks an entry as expired after the time to live and refuses to hand it out", () => {
        const { store, spec, clock } = setup({ ttlMs: 5000 });
        const handle = store.reserve(spec());
        handle.resolve(body, "application/vnd.yt-ump", 10);

        clock.now += 5001;

        expect(store.candidates()[0].expired).toBe(true);
        expect(store.take(handle.id)).toBeNull();
    });

    test("keeps an entry that is exactly at the time to live", () => {
        const { store, spec, clock } = setup({ ttlMs: 5000 });
        store.reserve(spec());

        clock.now += 5000;

        expect(store.candidates()[0].expired).toBe(false);
    });

    test("uses sensible defaults", () => {
        expect(CACHE_TTL_MS).toBe(120000);
        expect(MAX_CACHE_ENTRIES).toBe(2);
        expect(PRUNE_BEHIND_MS).toBe(5000);
    });

    test("evicts the oldest entry beyond the maximum and cancels its download", () => {
        const { store, spec, abort } = setup({ maxEntries: 2 });
        const first = store.reserve(spec(100000));
        store.reserve(spec(200000));

        store.reserve(spec(300000));

        expect(store.candidates().map((c) => c.targetMs)).toEqual([200000, 300000]);
        expect(abort).toHaveBeenCalledTimes(1);
        expect(store.take(first.id)).toBeNull();
    });

    test("does not cancel the download of an evicted entry that already finished", () => {
        const { store, spec, abort } = setup({ maxEntries: 1 });
        const first = store.reserve(spec(100000));
        first.resolve(body, "application/vnd.yt-ump", 10);

        store.reserve(spec(200000));

        expect(abort).not.toHaveBeenCalled();
    });

    test("ignores a late result for an entry that was evicted", () => {
        const { store, spec } = setup({ maxEntries: 1 });
        const first = store.reserve(spec(100000));
        store.reserve(spec(200000));

        first.resolve(body, "application/vnd.yt-ump", 10);

        expect(store.candidates().map((c) => c.targetMs)).toEqual([200000]);
        expect(store.take(first.id)).toBeNull();
    });
});

describe("cache store: lookups and cleanup", () => {
    test.each([
        ["exactly on the target", 150000, true],
        ["inside the tolerance", 150000 + TARGET_LOOKUP_TOLERANCE_MS, true],
        ["outside the tolerance", 150000 + TARGET_LOOKUP_TOLERANCE_MS + 1, false]
    ])("hasTarget is answered for a position %s", (_name, targetMs, expected) => {
        const { store, spec } = setup();
        store.reserve(spec());

        expect(store.hasTarget(targetMs)).toBe(expected);
    });

    test("hasTarget ignores failed, used and expired entries", () => {
        const { store, spec, clock } = setup({ ttlMs: 5000 });
        const failed = store.reserve(spec(100000));
        failed.fail();
        const used = store.reserve(spec(200000));
        used.resolve(body, "application/vnd.yt-ump", 10);
        store.take(used.id);

        expect(store.hasTarget(100000)).toBe(false);
        expect(store.hasTarget(200000)).toBe(false);

        const stale = store.reserve(spec(300000));
        stale.resolve(body, "application/vnd.yt-ump", 10);
        clock.now += 5001;

        expect(store.hasTarget(300000)).toBe(false);
    });

    test("pruneBehind drops entries the playhead has left far behind and cancels unfinished ones", () => {
        const { store, spec, abort } = setup({ maxEntries: 5 });
        store.reserve(spec(100000));
        const done = store.reserve(spec(120000));
        done.resolve(body, "application/vnd.yt-ump", 10);
        store.reserve(spec(300000));

        store.pruneBehind(120000 + PRUNE_BEHIND_MS + 1);

        expect(store.candidates().map((c) => c.targetMs)).toEqual([300000]);
        expect(abort).toHaveBeenCalledTimes(1);
    });

    test("pruneBehind keeps entries the playhead has only just passed", () => {
        const { store, spec } = setup();
        store.reserve(spec(100000));

        store.pruneBehind(100000 + PRUNE_BEHIND_MS);

        expect(store.size()).toBe(1);
    });

    test("discard forgets one entry and cancels its download", () => {
        const { store, spec, abort } = setup();
        const loading = store.reserve(spec(100000));
        const done = store.reserve(spec(200000));
        done.resolve(body, "application/vnd.yt-ump", 10);

        store.discard(loading.id);

        expect(store.candidates().map((c) => c.targetMs)).toEqual([200000]);
        expect(abort).toHaveBeenCalledTimes(1);
    });

    test("discard ignores an unknown entry", () => {
        const { store, spec } = setup();
        store.reserve(spec());

        store.discard("entry-unknown");

        expect(store.size()).toBe(1);
    });

    test("clear cancels unfinished downloads and forgets everything", () => {
        const { store, spec, abort } = setup({ maxEntries: 5 });
        store.reserve(spec(100000));
        const done = store.reserve(spec(200000));
        done.resolve(body, "application/vnd.yt-ump", 10);

        store.clear();

        expect(store.size()).toBe(0);
        expect(abort).toHaveBeenCalledTimes(1);
    });
});
