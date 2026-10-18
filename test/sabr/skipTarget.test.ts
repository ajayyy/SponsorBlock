import {
    END_GUARD_SEC,
    LOOKAHEAD_HORIZON_SEC,
    LOOKAHEAD_STEPS,
    MIN_RANGE_SEC,
    NextSkip,
    SkipCandidate,
    SkipTargetContext,
    collectCandidates,
    deriveShapingDecision
} from "../../src/sabr/content/skipTarget";

const context: SkipTargetContext = {
    enabled: true,
    videoID: "dQw4w9WgXcQ",
    durationSec: 213,
    isSupportedPage: true,
    isLive: false,
    isInline: false,
    isAdPlaying: false,
    hasTimeOffset: false,
    channelKnown: true,
    skippingDisabled: false,
    isLoopedChapter: false
};

const candidate: SkipCandidate = {
    startSec: 40,
    endSec: 150,
    isSkipAction: true,
    autoSkip: true,
    shouldSkip: true,
    visible: true,
    isStartEntry: true,
    fromUnsubmitted: false
};

const arms = (target: Partial<SkipCandidate> = {}) => deriveShapingDecision(context, [{ ...candidate, ...target }]);

describe("deriveShapingDecision: choosing a segment", () => {
    test("arms an auto-skipped segment", () => {
        expect(deriveShapingDecision(context, [candidate])).toEqual({
            kind: "arm",
            target: { videoID: "dQw4w9WgXcQ", startMs: 40000, endMs: 150000, durationMs: 213000 }
        });
    });

    test("arms the earliest eligible segment whatever the input order", () => {
        const later = { ...candidate, startSec: 160, endSec: 200 };

        const decision = deriveShapingDecision(context, [later, candidate]);

        expect(decision.kind === "arm" && decision.target.startMs).toBe(40000);
    });

    test("looks past segments that are not eligible", () => {
        const manual = { ...candidate, startSec: 10, endSec: 30, autoSkip: false };
        const later = { ...candidate, startSec: 160, endSec: 200 };

        const decision = deriveShapingDecision(context, [manual, later]);

        expect(decision.kind === "arm" && decision.target.startMs).toBe(160000);
    });

    test("does not reorder the list it was given", () => {
        const input = [{ ...candidate, startSec: 160, endSec: 200 }, candidate];
        const snapshot = input.map((entry) => entry.startSec);

        deriveShapingDecision(context, input);

        expect(input.map((entry) => entry.startSec)).toEqual(snapshot);
    });

    test("rounds times to whole milliseconds", () => {
        const decision = arms({ startSec: 40.0004, endSec: 150.0006 });

        expect(decision.kind === "arm" && [decision.target.startMs, decision.target.endMs]).toEqual([40000, 150001]);
    });

    test("has nothing to arm without candidates", () => {
        expect(deriveShapingDecision(context, [])).toEqual({ kind: "disarm", reason: "noTarget" });
    });

    test.each([
        ["not a skip action", { isSkipAction: false }],
        ["not skipped automatically", { autoSkip: false }],
        ["not meant to be skipped", { shouldSkip: false }],
        ["hidden", { visible: false }],
        ["not the start of a segment", { isStartEntry: false }],
        ["still unsubmitted", { fromUnsubmitted: true }],
        ["ending where the video ends", { endSec: context.durationSec - END_GUARD_SEC }],
        ["shorter than the minimum", { endSec: 40 + MIN_RANGE_SEC - 0.01 }],
        ["empty", { endSec: 40 }],
        ["running backwards", { startSec: 150, endSec: 40 }],
        ["starting at a non-finite time", { startSec: Number.NaN }],
        ["ending at a non-finite time", { endSec: Infinity }]
    ])("does not arm a segment that is %s", (_name, overrides) => {
        expect(arms(overrides)).toEqual({ kind: "disarm", reason: "noTarget" });
    });

    test("arms a segment that is exactly the minimum length", () => {
        expect(arms({ endSec: 40 + MIN_RANGE_SEC }).kind).toBe("arm");
    });

    test("arms a segment that ends just before the end guard", () => {
        expect(arms({ endSec: context.durationSec - END_GUARD_SEC - 0.01 }).kind).toBe("arm");
    });
});

describe("collectCandidates", () => {
    const upcoming = (startSec: number, endSec = startSec + 30): NextSkip => ({
        scheduledTimeSec: startSec,
        candidate: { ...candidate, startSec, endSec }
    });

    /** A stand-in for SponsorBlock's own "what comes next after this time" lookup. */
    const timeline = (skips: ReadonlyArray<NextSkip>) => jest.fn((afterSec: number) =>
        skips.find((skip) => skip.scheduledTimeSec >= afterSec) ?? null);

    test("lists the upcoming skips in order, asking for each one after the previous", () => {
        const next = timeline([upcoming(40), upcoming(100), upcoming(160)]);

        const result = collectCandidates(10, next);

        expect(result.map((entry) => entry.startSec)).toEqual([40, 100, 160]);
        expect(next.mock.calls.map(([after]) => after)).toEqual([10, 40.001, 100.001, 160.001]);
    });

    test("returns nothing when there is nothing coming up", () => {
        expect(collectCandidates(10, timeline([]))).toEqual([]);
    });

    test("stops after the maximum number of steps", () => {
        const skips = Array.from({ length: LOOKAHEAD_STEPS + 5 }, (_, i) => upcoming(20 + i * 10));

        expect(collectCandidates(0, timeline(skips))).toHaveLength(LOOKAHEAD_STEPS);
    });

    test("stops looking beyond the horizon", () => {
        const next = timeline([upcoming(40), upcoming(LOOKAHEAD_HORIZON_SEC + 100), upcoming(LOOKAHEAD_HORIZON_SEC + 200)]);

        const result = collectCandidates(0, next);

        expect(result.map((entry) => entry.startSec)).toEqual([40]);
    });

    test("always moves forward even if the lookup keeps returning the same moment", () => {
        const stuck = jest.fn((): NextSkip => upcoming(40));

        const result = collectCandidates(0, stuck);

        expect(result.length).toBeLessThanOrEqual(LOOKAHEAD_STEPS);
        const asked = stuck.mock.calls.length;
        expect(asked).toBeLessThanOrEqual(LOOKAHEAD_STEPS);
    });

    test("includes candidates that are not eligible, leaving the choice to the decision", () => {
        const manual: NextSkip = { scheduledTimeSec: 40, candidate: { ...candidate, startSec: 40, autoSkip: false } };

        const result = collectCandidates(0, timeline([manual, upcoming(100)]));

        expect(result.map((entry) => entry.autoSkip)).toEqual([false, true]);
    });
});

describe("deriveShapingDecision: when the page does not qualify", () => {
    const decide = (overrides: Partial<SkipTargetContext>) =>
        deriveShapingDecision({ ...context, ...overrides }, [candidate]);

    test("reports a disabled feature", () => {
        expect(decide({ enabled: false })).toEqual({ kind: "disarm", reason: "disabled" });
    });

    test("reports a playing ad", () => {
        expect(decide({ isAdPlaying: true })).toEqual({ kind: "disarm", reason: "ad" });
    });

    test.each([
        ["an unsupported page", { isSupportedPage: false }],
        ["a live stream", { isLive: true }],
        ["an inline preview", { isInline: true }],
        ["a shifted timeline", { hasTimeOffset: true }],
        ["an unknown channel", { channelKnown: false }],
        ["disabled skipping", { skippingDisabled: true }],
        ["a looped chapter", { isLoopedChapter: true }],
        ["a missing video id", { videoID: null }],
        ["a zero duration", { durationSec: 0 }],
        ["a non-finite duration", { durationSec: Infinity }]
    ])("reports %s as unsupported", (_name, overrides) => {
        expect(decide(overrides)).toEqual({ kind: "disarm", reason: "unsupported" });
    });

    test("puts the disabled flag ahead of every other reason", () => {
        expect(decide({ enabled: false, isAdPlaying: true, isLive: true })).toEqual({
            kind: "disarm",
            reason: "disabled"
        });
    });

    test("puts an ad ahead of unsupported conditions", () => {
        expect(decide({ isAdPlaying: true, isLive: true })).toEqual({ kind: "disarm", reason: "ad" });
    });
});
