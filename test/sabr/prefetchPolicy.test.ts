import {
    BASE_REQUEST_MAX_AGE_MS,
    MAX_PREFETCHES_PER_MINUTE,
    MIN_BUFFER_AHEAD_SEC,
    PREFETCH_LEAD_SEC,
    PrefetchContext,
    decidePrefetch
} from "../../src/sabr/core/prefetchPolicy";

/** A situation in which prefetching should start; each test changes one thing. */
const ready: PrefetchContext = {
    enabled: true,
    targetStartSec: 100,
    currentTimeSec: 85,
    playbackRate: 1,
    bufferedEndSec: 100,
    baseRequestAgeMs: 2000,
    hasEntryForTarget: false,
    recentPrefetchCount: 0
};

const decide = (overrides: Partial<PrefetchContext>) => decidePrefetch({ ...ready, ...overrides });

describe("decidePrefetch", () => {
    test("starts when everything is in place", () => {
        expect(decidePrefetch(ready)).toEqual({ start: true });
    });

    test("does nothing while the feature is disabled", () => {
        expect(decide({ enabled: false })).toEqual({ start: false, reason: "disabled" });
    });

    test.each([
        ["playhead is at the segment start", 100],
        ["playhead is past the segment start", 120]
    ])("does nothing when the %s", (_name, currentTimeSec) => {
        expect(decide({ currentTimeSec })).toEqual({ start: false, reason: "passed" });
    });

    test("does not start a second prefetch for the same target", () => {
        expect(decide({ hasEntryForTarget: true })).toEqual({ start: false, reason: "alreadyHave" });
    });

    test("needs a request from the player to copy", () => {
        expect(decide({ baseRequestAgeMs: null })).toEqual({ start: false, reason: "noBaseRequest" });
    });

    test("does not copy a stale request", () => {
        expect(decide({ baseRequestAgeMs: BASE_REQUEST_MAX_AGE_MS + 1 })).toEqual({
            start: false,
            reason: "staleBaseRequest"
        });
        expect(decide({ baseRequestAgeMs: BASE_REQUEST_MAX_AGE_MS }).start).toBe(true);
    });

    describe("lead time", () => {
        test("starts exactly at the lead and not earlier", () => {
            const target = 100;

            expect(decide({ currentTimeSec: target - PREFETCH_LEAD_SEC, bufferedEndSec: target }).start).toBe(true);
            expect(decide({ currentTimeSec: target - PREFETCH_LEAD_SEC - 0.001, bufferedEndSec: target })).toEqual({
                start: false,
                reason: "tooEarly"
            });
        });

        test("measures the lead in wall-clock time at 2x speed", () => {
            // twice the lead's worth of video is left at 2x
            const startsAt = 100 - PREFETCH_LEAD_SEC * 2;

            expect(decide({ currentTimeSec: startsAt, playbackRate: 2, bufferedEndSec: 100 }).start).toBe(true);
            expect(decide({ currentTimeSec: startsAt - 1, playbackRate: 2, bufferedEndSec: 100 })).toEqual({
                start: false,
                reason: "tooEarly"
            });
        });

        test("measures the lead in wall-clock time at 0.5x speed", () => {
            // half the lead's worth of video is left at 0.5x
            const startsAt = 100 - PREFETCH_LEAD_SEC / 2;

            expect(decide({ currentTimeSec: startsAt, playbackRate: 0.5, bufferedEndSec: 100 }).start).toBe(true);
            expect(decide({ currentTimeSec: startsAt - 1, playbackRate: 0.5, bufferedEndSec: 100 })).toEqual({
                start: false,
                reason: "tooEarly"
            });
        });
    });

    describe("buffer health", () => {
        test("accepts a buffer that already reaches the segment", () => {
            expect(decide({ currentTimeSec: 99, bufferedEndSec: 100 }).start).toBe(true);
        });

        test("accepts a buffer with enough runway even if it stops short of the segment", () => {
            const currentTimeSec = 85;

            expect(decide({ currentTimeSec, bufferedEndSec: currentTimeSec + MIN_BUFFER_AHEAD_SEC }).start).toBe(true);
        });

        test("waits while the player is still struggling to buffer", () => {
            const currentTimeSec = 85;

            expect(decide({ currentTimeSec, bufferedEndSec: currentTimeSec + MIN_BUFFER_AHEAD_SEC - 0.5 })).toEqual({
                start: false,
                reason: "bufferLow"
            });
        });

        test("waits when nothing is buffered around the playhead", () => {
            expect(decide({ bufferedEndSec: null })).toEqual({ start: false, reason: "bufferLow" });
        });
    });

    test("is rate limited", () => {
        expect(decide({ recentPrefetchCount: MAX_PREFETCHES_PER_MINUTE - 1 }).start).toBe(true);
        expect(decide({ recentPrefetchCount: MAX_PREFETCHES_PER_MINUTE })).toEqual({
            start: false,
            reason: "rateLimited"
        });
    });

    test.each([
        ["a zero playback rate", { playbackRate: 0 }],
        ["a negative playback rate", { playbackRate: -1 }],
        ["a non-finite playback rate", { playbackRate: Number.NaN }],
        ["a non-finite playhead", { currentTimeSec: Infinity }],
        ["a non-finite target", { targetStartSec: Number.NaN }]
    ])("refuses to guess with %s", (_name, overrides) => {
        expect(decide(overrides)).toEqual({ start: false, reason: "invalidInput" });
    });

    test("reports the first failing condition when several fail", () => {
        const result = decide({ enabled: false, hasEntryForTarget: true, baseRequestAgeMs: null });

        expect(result).toEqual({ start: false, reason: "disabled" });
    });
});
