import { validatePrefetchBody } from "../../src/sabr/core/cacheValidation";
import {
    MediaHeaderFixture,
    buildMediaHeaderPayload,
    concatBytes,
    fieldVarint,
    umpPart,
    umpVarintBytes
} from "./fixtures";

const VIDEO_ID = "dQw4w9WgXcQ";
const TARGET_MS = 150000;
const MAX_BYTES = 1024 * 1024;

const header = (fixture: MediaHeaderFixture): Uint8Array => umpPart(20, buildMediaHeaderPayload(fixture));
const media = (headerId: number): Uint8Array => umpPart(21, Uint8Array.from([headerId, 1, 2, 3, 4]));
const mediaEnd = (headerId: number): Uint8Array => umpPart(22, Uint8Array.from([headerId]));
const protectionOk = (): Uint8Array => umpPart(58, fieldVarint(1, 1));

function segment(fixture: MediaHeaderFixture): Uint8Array {
    return concatBytes(header(fixture), media(fixture.headerId), mediaEnd(fixture.headerId));
}

/** A response shaped like a real one that starts a little before the target. */
function validResponse(): Uint8Array {
    return concatBytes(
        protectionOk(),
        umpPart(35, fieldVarint(1, 15001)),
        segment({ headerId: 0, videoId: VIDEO_ID, itag: 251, isInit: true }),
        segment({ headerId: 1, videoId: VIDEO_ID, itag: 251, sequence: 15, startMs: 140001, durationMs: 10000 }),
        segment({ headerId: 2, videoId: VIDEO_ID, itag: 400, sequence: 28, startMs: 148000, durationMs: 4000 })
    );
}

const expectation = { targetMs: TARGET_MS, videoId: VIDEO_ID, maxBytes: MAX_BYTES };

describe("validatePrefetchBody", () => {
    test("accepts a complete response that starts near the target", () => {
        const body = validResponse();

        expect(validatePrefetchBody(body, expectation)).toEqual({
            ok: true,
            firstSegmentStartMs: 140001,
            segmentCount: 2,
            bytes: body.length
        });
    });

    test("accepts any video id when none is expected", () => {
        expect(validatePrefetchBody(validResponse(), { ...expectation, videoId: null }).ok).toBe(true);
    });

    test("rejects a body above the size limit", () => {
        expect(validatePrefetchBody(validResponse(), { ...expectation, maxBytes: 10 })).toEqual({
            ok: false,
            reason: "tooLarge"
        });
    });

    test("rejects an empty body as having no media", () => {
        expect(validatePrefetchBody(new Uint8Array(0), expectation)).toEqual({ ok: false, reason: "noMedia" });
    });

    test("rejects a response that was cut short", () => {
        const body = validResponse();

        expect(validatePrefetchBody(body.subarray(0, body.length - 3), expectation)).toEqual({
            ok: false,
            reason: "truncated"
        });
    });

    test("rejects framing that cannot be parsed", () => {
        const body = concatBytes(umpVarintBytes(21), umpVarintBytes(2 ** 30));

        expect(validatePrefetchBody(body, expectation)).toEqual({ ok: false, reason: "malformed" });
    });

    test("rejects a media header that cannot be parsed", () => {
        const body = concatBytes(protectionOk(), umpPart(20, Uint8Array.from([0x0a, 0x7f, 0x01])));

        expect(validatePrefetchBody(body, expectation)).toEqual({ ok: false, reason: "malformed" });
    });

    test("rejects a segment without a start time", () => {
        const body = concatBytes(protectionOk(), segment({ headerId: 1, videoId: VIDEO_ID, itag: 251, sequence: 1 }));

        expect(validatePrefetchBody(body, expectation)).toEqual({ ok: false, reason: "malformed" });
    });

    test("rejects a response containing only init segments", () => {
        const body = concatBytes(protectionOk(), segment({ headerId: 0, videoId: VIDEO_ID, itag: 251, isInit: true }));

        expect(validatePrefetchBody(body, expectation)).toEqual({ ok: false, reason: "noMedia" });
    });

    test("rejects a segment whose end marker is missing", () => {
        const body = concatBytes(
            protectionOk(),
            header({ headerId: 1, videoId: VIDEO_ID, itag: 251, sequence: 15, startMs: 140001, durationMs: 10000 }),
            media(1)
        );

        expect(validatePrefetchBody(body, expectation)).toEqual({ ok: false, reason: "truncated" });
    });

    test("rejects media belonging to another video", () => {
        const other = concatBytes(
            protectionOk(),
            segment({ headerId: 1, videoId: "AAAAAAAAAAA", itag: 251, sequence: 15, startMs: 140001, durationMs: 10000 })
        );

        expect(validatePrefetchBody(other, expectation)).toEqual({ ok: false, reason: "wrongVideo" });
    });

    test("rejects media whose video id is missing when one is expected", () => {
        const unnamed = concatBytes(
            protectionOk(),
            segment({ headerId: 1, itag: 251, sequence: 15, startMs: 140001, durationMs: 10000 })
        );

        expect(validatePrefetchBody(unnamed, expectation)).toEqual({ ok: false, reason: "wrongVideo" });
    });

    test.each([
        ["far before the target", 40000],
        ["after the target", 160000],
        ["just before the allowed lead", TARGET_MS - 15001],
        ["just after the allowed lag", TARGET_MS + 1001]
    ])("rejects a first segment %s", (_name, startMs) => {
        const body = concatBytes(
            protectionOk(),
            segment({ headerId: 1, videoId: VIDEO_ID, itag: 251, sequence: 5, startMs, durationMs: 10000 })
        );

        expect(validatePrefetchBody(body, expectation)).toEqual({ ok: false, reason: "wrongPosition" });
    });

    test.each([
        ["at the edge of the allowed lead", TARGET_MS - 15000],
        ["at the edge of the allowed lag", TARGET_MS + 1000],
        ["exactly on the target", TARGET_MS]
    ])("accepts a first segment %s", (_name, startMs) => {
        const body = concatBytes(
            protectionOk(),
            segment({ headerId: 1, videoId: VIDEO_ID, itag: 251, sequence: 5, startMs, durationMs: 10000 })
        );

        expect(validatePrefetchBody(body, expectation).ok).toBe(true);
    });

    test("judges the position by the earliest segment of any format", () => {
        const body = concatBytes(
            protectionOk(),
            segment({ headerId: 1, videoId: VIDEO_ID, itag: 400, sequence: 28, startMs: 149000, durationMs: 4000 }),
            segment({ headerId: 2, videoId: VIDEO_ID, itag: 251, sequence: 15, startMs: 140001, durationMs: 10000 })
        );

        const result = validatePrefetchBody(body, expectation);

        expect(result.ok && result.firstSegmentStartMs).toBe(140001);
    });

    test("rejects a stream protection status other than OK", () => {
        const body = concatBytes(
            umpPart(58, fieldVarint(1, 3)),
            segment({ headerId: 1, videoId: VIDEO_ID, itag: 251, sequence: 15, startMs: 140001, durationMs: 10000 })
        );

        expect(validatePrefetchBody(body, expectation)).toEqual({ ok: false, reason: "protection" });
    });

    test("rejects a stream protection part that cannot be read", () => {
        const body = concatBytes(
            umpPart(58, Uint8Array.from([0x0a, 0x7f])),
            segment({ headerId: 1, videoId: VIDEO_ID, itag: 251, sequence: 15, startMs: 140001, durationMs: 10000 })
        );

        expect(validatePrefetchBody(body, expectation)).toEqual({ ok: false, reason: "protection" });
    });

    test("rejects a response that redirects the player elsewhere", () => {
        const body = concatBytes(
            protectionOk(),
            umpPart(43, Uint8Array.from([0x0a, 0x03, 0x68, 0x74, 0x74])),
            segment({ headerId: 1, videoId: VIDEO_ID, itag: 251, sequence: 15, startMs: 140001, durationMs: 10000 })
        );

        expect(validatePrefetchBody(body, expectation)).toEqual({ ok: false, reason: "redirect" });
    });
});
