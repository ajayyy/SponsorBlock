import {
    MAX_DETAIL_LENGTH,
    MIN_RANGE_MS,
    SABR_PROTOCOL_VERSION,
    TO_CONTENT_SOURCE,
    TO_MAIN_SOURCE,
    parseToContentMessage,
    parseToMainMessage
} from "../../src/sabr/protocol";

const toMainBase = { source: TO_MAIN_SOURCE, v: SABR_PROTOCOL_VERSION, session: "abc123XYZ_-", seq: 1 };
const target = { videoID: "dQw4w9WgXcQ", startMs: 40000, endMs: 150000, durationMs: 213000 };
const arm = { ...toMainBase, type: "arm", target };

const toContentBase = { source: TO_CONTENT_SOURCE, v: SABR_PROTOCOL_VERSION, session: "abc123XYZ_-" };

describe("parseToMainMessage: accepted messages", () => {
    test.each([
        ["hello", { ...toMainBase, type: "hello", enabled: true }],
        ["setEnabled", { ...toMainBase, type: "setEnabled", enabled: false }],
        ["arm", arm],
        ["disarm", { ...toMainBase, type: "disarm", reason: "noTarget" }],
        ["reset", { ...toMainBase, type: "reset", reason: "videoChange" }]
    ])("accepts a valid %s message", (_name, message) => {
        expect(parseToMainMessage(message)).toEqual(message);
    });

    test.each(["noTarget", "ad", "unsupported", "disabled"])("accepts disarm reason %s", (reason) => {
        expect(parseToMainMessage({ ...toMainBase, type: "disarm", reason })).not.toBeNull();
    });

    test.each(["videoChange", "cleanup"])("accepts reset reason %s", (reason) => {
        expect(parseToMainMessage({ ...toMainBase, type: "reset", reason })).not.toBeNull();
    });

    test("drops fields it does not know about", () => {
        const parsed = parseToMainMessage({ ...arm, extra: "x", target: { ...target, extra: 1 } });

        expect(parsed).toEqual(arm);
    });

    test("accepts a range that ends just past the reported duration", () => {
        const message = { ...arm, target: { ...target, endMs: target.durationMs + 1000 } };

        expect(parseToMainMessage(message)).not.toBeNull();
    });

    test("accepts a range of exactly the minimum length", () => {
        const message = { ...arm, target: { ...target, startMs: 40000, endMs: 40000 + MIN_RANGE_MS } };

        expect(parseToMainMessage(message)).not.toBeNull();
    });
});

describe("parseToMainMessage: rejected input", () => {
    test.each([null, undefined, "arm", 5, true, [], [arm]])("rejects %p", (input) => {
        expect(parseToMainMessage(input)).toBeNull();
    });

    test("rejects another source", () => {
        expect(parseToMainMessage({ ...arm, source: "sponsorblock" })).toBeNull();
        expect(parseToMainMessage({ ...arm, source: TO_CONTENT_SOURCE })).toBeNull();
    });

    test("rejects another protocol version", () => {
        expect(parseToMainMessage({ ...arm, v: SABR_PROTOCOL_VERSION + 1 })).toBeNull();
        expect(parseToMainMessage({ ...arm, v: undefined })).toBeNull();
    });

    test.each([
        ["missing", undefined],
        ["empty", ""],
        ["too long", "a".repeat(65)],
        ["containing spaces", "a b"],
        ["not a string", 12]
    ])("rejects a session that is %s", (_name, session) => {
        expect(parseToMainMessage({ ...arm, session })).toBeNull();
    });

    test.each([-1, 1.5, "1", Number.NaN, Infinity, undefined])("rejects sequence number %p", (seq) => {
        expect(parseToMainMessage({ ...arm, seq })).toBeNull();
    });

    test("rejects an unknown or missing type", () => {
        expect(parseToMainMessage({ ...toMainBase, type: "explode" })).toBeNull();
        expect(parseToMainMessage({ ...toMainBase })).toBeNull();
    });

    test("rejects a non-boolean enabled flag", () => {
        expect(parseToMainMessage({ ...toMainBase, type: "hello", enabled: "yes" })).toBeNull();
        expect(parseToMainMessage({ ...toMainBase, type: "setEnabled" })).toBeNull();
    });

    test("rejects unknown disarm and reset reasons", () => {
        expect(parseToMainMessage({ ...toMainBase, type: "disarm", reason: "because" })).toBeNull();
        expect(parseToMainMessage({ ...toMainBase, type: "reset", reason: "noTarget" })).toBeNull();
        expect(parseToMainMessage({ ...toMainBase, type: "disarm" })).toBeNull();
    });

    test.each([
        ["a missing target", undefined],
        ["a target that is not an object", "40000"],
        ["a short video id", { ...target, videoID: "short" }],
        ["a video id with illegal characters", { ...target, videoID: "dQw4w9WgXc!" }],
        ["a non-integer start", { ...target, startMs: 40000.5 }],
        ["a negative start", { ...target, startMs: -1 }],
        ["a non-finite end", { ...target, endMs: Infinity }],
        ["NaN as the duration", { ...target, durationMs: Number.NaN }],
        ["an end before the start", { ...target, startMs: 150000, endMs: 40000 }],
        ["an empty range", { ...target, startMs: 40000, endMs: 40000 }],
        ["a range shorter than the minimum", { ...target, startMs: 40000, endMs: 40000 + MIN_RANGE_MS - 1 }],
        ["an end far beyond the duration", { ...target, endMs: target.durationMs + 1001 }]
    ])("rejects an arm message with %s", (_name, badTarget) => {
        expect(parseToMainMessage({ ...arm, target: badTarget })).toBeNull();
    });
});

describe("parseToContentMessage", () => {
    const stats = {
        videoID: "dQw4w9WgXcQ",
        startMs: 40000,
        endMs: 150000,
        prefetchBytes: 2583323,
        prefetchMs: 28741,
        cacheHit: true,
        seekToPlayingMs: 82,
        heldRequests: 4
    };

    test.each([
        ["ready without a session", { ...toContentBase, session: null, type: "ready" }],
        ["ready with a session", { ...toContentBase, type: "ready" }],
        ["status sabrSeen", { ...toContentBase, type: "status", state: "sabrSeen" }],
        ["status disabled with a reason", { ...toContentBase, type: "status", state: "disabled", reason: "anomaly" }],
        ["shaping", { ...toContentBase, type: "shaping", videoID: "dQw4w9WgXcQ", startMs: 40000, mode: "hold" }],
        ["stats", { ...toContentBase, type: "stats", ...stats }],
        ["stats without a measured skip", { ...toContentBase, type: "stats", ...stats, seekToPlayingMs: null }],
        ["a soft anomaly", { ...toContentBase, type: "anomaly", code: "prefetchRejected", fatal: false }],
        ["a fatal anomaly with detail", { ...toContentBase, type: "anomaly", code: "unexpected", fatal: true, detail: "boom" }],
        ["a trace without detail", { ...toContentBase, type: "trace", event: "prefetch-start" }],
        ["a trace with detail", { ...toContentBase, type: "trace", event: "cache-miss", detail: "d=0 ready=true formats=same" }]
    ])("accepts %s", (_name, message) => {
        expect(parseToContentMessage(message)).toEqual(message);
    });

    test.each([null, undefined, "ready", 1, []])("rejects %p", (input) => {
        expect(parseToContentMessage(input)).toBeNull();
    });

    test("rejects messages meant for the other direction", () => {
        expect(parseToContentMessage(arm)).toBeNull();
        expect(parseToMainMessage({ ...toContentBase, type: "ready" })).toBeNull();
    });

    test("rejects an unknown type, state, code or mode", () => {
        expect(parseToContentMessage({ ...toContentBase, type: "party" })).toBeNull();
        expect(parseToContentMessage({ ...toContentBase, type: "status", state: "dancing" })).toBeNull();
        expect(parseToContentMessage({ ...toContentBase, type: "anomaly", code: "oops", fatal: false })).toBeNull();
        expect(
            parseToContentMessage({ ...toContentBase, type: "shaping", videoID: "dQw4w9WgXcQ", startMs: 1, mode: "magic" })
        ).toBeNull();
    });

    test("rejects stats with invalid numbers", () => {
        expect(parseToContentMessage({ ...toContentBase, type: "stats", ...stats, prefetchBytes: -1 })).toBeNull();
        expect(parseToContentMessage({ ...toContentBase, type: "stats", ...stats, cacheHit: "yes" })).toBeNull();
        expect(parseToContentMessage({ ...toContentBase, type: "stats", ...stats, heldRequests: Number.NaN })).toBeNull();
    });

    test("rejects an anomaly whose detail is too long", () => {
        const message = {
            ...toContentBase,
            type: "anomaly",
            code: "unexpected",
            fatal: true,
            detail: "x".repeat(MAX_DETAIL_LENGTH + 1)
        };

        expect(parseToContentMessage(message)).toBeNull();
    });

    test.each([
        ["a missing event", undefined],
        ["an empty event", ""],
        ["an event with spaces", "prefetch start"],
        ["an event that is too long", "x".repeat(41)],
        ["an event that is not a string", 5]
    ])("rejects a trace with %s", (_name, event) => {
        expect(parseToContentMessage({ ...toContentBase, type: "trace", event })).toBeNull();
    });

    test("rejects a trace whose detail is too long", () => {
        const message = { ...toContentBase, type: "trace", event: "cache-miss", detail: "x".repeat(MAX_DETAIL_LENGTH + 1) };

        expect(parseToContentMessage(message)).toBeNull();
    });

    test("rejects a session that is neither null nor a valid id", () => {
        expect(parseToContentMessage({ ...toContentBase, session: "bad session", type: "ready" })).toBeNull();
        expect(parseToContentMessage({ ...toContentBase, session: 5, type: "ready" })).toBeNull();
    });
});
