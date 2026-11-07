import {
    CACHE_MATCH_TOLERANCE_MS,
    CacheCandidate,
    EXPLAIN_RANGE_MS,
    FILTER_GUARD_MS,
    HOLD_MARGIN_SEC,
    MAX_HELD_REQUESTS,
    RequestContext,
    chooseStrategy,
    describeCacheMiss,
    describeStrategy
} from "../../src/sabr/core/strategy";

const candidate: CacheCandidate = {
    id: "entry-1",
    targetMs: 150000,
    streamKey: "o-ABC",
    formatsKey: "251,400",
    used: false,
    expired: false,
    ready: true
};

/** A player request shortly before an armed segment; each test changes one thing. */
const beforeSegment: RequestContext = {
    enabled: true,
    hasInit: false,
    isMainPlayer: true,
    armedStartMs: 40000,
    armedEndMs: 150000,
    holdForced: false,
    playerTimeMs: 30000,
    playheadMs: 30200,
    bufferedEndSec: 41,
    streamKey: "o-ABC",
    formatsKey: "251,400",
    cache: [],
    heldCount: 0
};

/** The player's request right after the skip, asking for the end of the segment. */
const afterSkip: RequestContext = {
    ...beforeSegment,
    armedStartMs: null,
    armedEndMs: null,
    playerTimeMs: 150000,
    playheadMs: 150000,
    bufferedEndSec: null,
    cache: [candidate]
};

const choose = (base: RequestContext, overrides: Partial<RequestContext>) =>
    chooseStrategy({ ...base, ...overrides });

describe("chooseStrategy: gates", () => {
    test("passes everything while the feature is off", () => {
        expect(choose(afterSkip, { enabled: false })).toEqual({ kind: "pass", reason: "disabled" });
    });

    test("passes a request made with extra fetch init options", () => {
        expect(choose(afterSkip, { hasInit: true })).toEqual({ kind: "pass", reason: "hasInit" });
    });

    test("passes quickly when there is neither a target nor anything cached", () => {
        expect(choose(beforeSegment, { armedStartMs: null })).toEqual({ kind: "pass", reason: "noTarget" });
    });

    test("passes a request whose player time could not be read", () => {
        expect(choose(afterSkip, { playerTimeMs: null })).toEqual({ kind: "pass", reason: "noPlayerTime" });
    });

    test("passes requests that do not come from the main player", () => {
        expect(choose(afterSkip, { isMainPlayer: false })).toEqual({ kind: "pass", reason: "notMainPlayer" });
        expect(choose(beforeSegment, { isMainPlayer: false })).toEqual({ kind: "pass", reason: "notMainPlayer" });
    });
});

describe("chooseStrategy: serving from the cache", () => {
    test("serves a ready entry for the request that follows the skip", () => {
        expect(chooseStrategy(afterSkip)).toEqual({ kind: "cache", entryId: "entry-1" });
    });

    test("waits for an entry that is still downloading", () => {
        const downloading = { ...candidate, ready: false };

        expect(choose(afterSkip, { cache: [downloading] })).toEqual({ kind: "awaitPrefetch", entryId: "entry-1" });
    });

    test.each([
        ["exactly at the tolerance", CACHE_MATCH_TOLERANCE_MS, true],
        ["just inside the tolerance", -CACHE_MATCH_TOLERANCE_MS + 1, true],
        ["just outside the tolerance", CACHE_MATCH_TOLERANCE_MS + 1, false],
        ["far from the target", 60000, false]
    ])("matches a request %s", (_name, offsetMs, matches) => {
        const result = choose(afterSkip, { playerTimeMs: candidate.targetMs + offsetMs });

        expect(result.kind === "cache").toBe(matches);
    });

    test.each([
        ["already used", { used: true }],
        ["expired", { expired: true }],
        ["from another stream", { streamKey: "o-OTHER" }],
        ["made for different formats", { formatsKey: "251,401" }]
    ])("never serves an entry that is %s", (_name, overrides) => {
        expect(choose(afterSkip, { cache: [{ ...candidate, ...overrides }] }).kind).toBe("pass");
    });

    test("serves an entry whose formats are all still allowed even if the player now allows more", () => {
        const result = choose(afterSkip, { formatsKey: "251,399,400,401", cache: [{ ...candidate, formatsKey: "251,399,400" }] });

        expect(result).toEqual({ kind: "cache", entryId: "entry-1" });
    });

    test("does not serve an entry that contains a format the player no longer allows", () => {
        const result = choose(afterSkip, { formatsKey: "251,400", cache: [{ ...candidate, formatsKey: "251,400,401" }] });

        expect(result.kind).toBe("pass");
    });

    test("still matches when the request has no stream or format key to compare", () => {
        const result = choose(afterSkip, { streamKey: null, formatsKey: null });

        expect(result).toEqual({ kind: "cache", entryId: "entry-1" });
    });

    test("prefers the entry closest to the requested position", () => {
        const near = { ...candidate, id: "near", targetMs: 150500 };
        const far = { ...candidate, id: "far", targetMs: 152500 };

        expect(choose(afterSkip, { cache: [far, near] })).toEqual({ kind: "cache", entryId: "near" });
    });

    test("serves the cache even if another segment is armed after the skip", () => {
        expect(choose(afterSkip, { armedStartMs: 300000 })).toEqual({ kind: "cache", entryId: "entry-1" });
    });
});

describe("describeStrategy", () => {
    test.each([
        [{ kind: "pass", reason: "pastTarget" } as const, "pass:pastTarget"],
        [{ kind: "hold" } as const, "hold"],
        [{ kind: "cache", entryId: "entry-1" } as const, "cache"],
        [{ kind: "awaitPrefetch", entryId: "entry-1" } as const, "awaitPrefetch"],
        [{ kind: "filter", dropFromMs: 41000, dropToMs: 150000 } as const, "filter 41000-150000"]
    ])("describes %j as %s", (strategy, expected) => {
        expect(describeStrategy(strategy)).toBe(expected);
    });
});

describe("describeCacheMiss", () => {
    test("says nothing when nothing is cached or the position is unknown", () => {
        expect(describeCacheMiss({ ...afterSkip, cache: [] })).toBeNull();
        expect(describeCacheMiss({ ...afterSkip, playerTimeMs: null })).toBeNull();
    });

    test("says nothing about a request far from every cached position", () => {
        expect(describeCacheMiss({ ...afterSkip, playerTimeMs: candidate.targetMs + EXPLAIN_RANGE_MS + 1 })).toBeNull();
    });

    test("explains a miss caused by different formats", () => {
        const text = describeCacheMiss({ ...afterSkip, formatsKey: "251,401" });

        expect(text).toContain("formats=differs(251,400|251,401)");
        expect(text).toContain("stream=same");
        expect(text).toContain("d=0");
    });

    test("does not blame the formats when the cached ones are all still allowed", () => {
        const text = describeCacheMiss({ ...afterSkip, formatsKey: "251,400,401", cache: [{ ...candidate, ready: false }] });

        expect(text).toContain("formats=allowed");
        expect(text).toContain("ready=false");
    });

    test("explains a miss caused by a different stream", () => {
        const explanation = describeCacheMiss({ ...afterSkip, streamKey: "o-OTHER" });
        expect(explanation).toContain("stream=differs");
        // The debug log gets pasted into public issues, so stream ids must not end up in it.
        expect(explanation).not.toContain("o-OTHER");
    });

    test("reports whether the entry was ready, used or expired and whether the request was the main player's", () => {
        const text = describeCacheMiss({
            ...afterSkip,
            isMainPlayer: false,
            cache: [{ ...candidate, ready: false, used: true, expired: true }]
        });

        expect(text).toContain("ready=false");
        expect(text).toContain("used=true");
        expect(text).toContain("expired=true");
        expect(text).toContain("main=false");
    });

    test("describes the entry closest to the requested position", () => {
        const far = { ...candidate, id: "far", targetMs: 158000 };

        const text = describeCacheMiss({ ...afterSkip, playerTimeMs: 150500, cache: [far, candidate] });

        expect(text).toContain("d=500");
    });

    test("treats a missing key as unknown rather than as a difference", () => {
        expect(describeCacheMiss({ ...afterSkip, formatsKey: null })).toContain("formats=unknown");
    });

    test("stays short enough for a log line", () => {
        const text = describeCacheMiss({ ...afterSkip, formatsKey: "1,2,3,4,5,6,7,8,9,10,11,12", streamKey: "o-OTHER" });

        expect((text ?? "").length).toBeLessThan(200);
    });
});

describe("chooseStrategy: holding requests before a segment", () => {
    test("holds once the buffer is past the segment start by the margin", () => {
        expect(choose(beforeSegment, { bufferedEndSec: 40 + HOLD_MARGIN_SEC })).toEqual({ kind: "hold" });
    });

    const filtering = { kind: "filter", dropFromMs: 40000 + FILTER_GUARD_MS, dropToMs: 150000 };

    test("filters the answer instead of holding while the buffer is still short of the margin", () => {
        expect(choose(beforeSegment, { bufferedEndSec: 40 + HOLD_MARGIN_SEC - 0.1 })).toEqual(filtering);
    });

    test("filters the answer when nothing is buffered around the playhead", () => {
        expect(choose(beforeSegment, { bufferedEndSec: null })).toEqual(filtering);
    });

    test("holds regardless of the buffer once a filtered answer has been left empty", () => {
        expect(choose(beforeSegment, { holdForced: true, bufferedEndSec: null })).toEqual({ kind: "hold" });
        expect(choose(beforeSegment, { holdForced: true, bufferedEndSec: 20 })).toEqual({ kind: "hold" });
    });

    test("stops even a forced hold at the limit", () => {
        expect(choose(beforeSegment, { holdForced: true, heldCount: MAX_HELD_REQUESTS })).toEqual({
            kind: "pass",
            reason: "holdLimit"
        });
    });

    test("does not filter when the end of the segment is unknown", () => {
        expect(choose(beforeSegment, { armedEndMs: null, bufferedEndSec: null })).toEqual({
            kind: "pass",
            reason: "noTarget"
        });
    });

    test("stops holding after the limit so a stuck player cannot be starved forever", () => {
        expect(choose(beforeSegment, { heldCount: MAX_HELD_REQUESTS - 1 })).toEqual({ kind: "hold" });
        expect(choose(beforeSegment, { heldCount: MAX_HELD_REQUESTS })).toEqual({ kind: "pass", reason: "holdLimit" });
    });

    test.each([
        ["asks about a position inside the segment", { playerTimeMs: 40000 }],
        ["asks about a position beyond the segment start", { playerTimeMs: 90000 }],
        ["is made with the playhead already inside the segment", { playheadMs: 40500 }]
    ])("never holds a request that %s", (_name, overrides) => {
        expect(choose(beforeSegment, overrides)).toEqual({ kind: "pass", reason: "pastTarget" });
    });
});
