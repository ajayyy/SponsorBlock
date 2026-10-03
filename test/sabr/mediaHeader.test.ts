import { MAX_MEDIA_HEADER_BYTES, parseMediaHeader } from "../../src/sabr/core/mediaHeader";
import { buildMediaHeaderPayload, concatBytes, fieldLen, fieldVarint } from "./fixtures";

describe("parseMediaHeader", () => {
    test("parses a media segment header", () => {
        const payload = buildMediaHeaderPayload({
            headerId: 1,
            videoId: "dQw4w9WgXcQ",
            itag: 251,
            sequence: 3,
            startMs: 20001,
            durationMs: 10000
        });

        expect(parseMediaHeader(payload)).toEqual({
            headerId: 1,
            videoId: "dQw4w9WgXcQ",
            itag: 251,
            isInit: false,
            sequence: 3,
            startMs: 20001,
            durationMs: 10000
        });
    });

    test("keeps a start time of zero distinct from a missing one", () => {
        const first = parseMediaHeader(buildMediaHeaderPayload({ headerId: 1, itag: 251, sequence: 1, startMs: 0, durationMs: 10001 }));
        const withoutStart = parseMediaHeader(buildMediaHeaderPayload({ headerId: 1, itag: 251, sequence: 1 }));

        expect(first?.startMs).toBe(0);
        expect(withoutStart?.startMs).toBeNull();
    });

    test("recognises an init segment, which has no timing", () => {
        const payload = buildMediaHeaderPayload({ headerId: 0, videoId: "dQw4w9WgXcQ", itag: 400, isInit: true });

        expect(parseMediaHeader(payload)).toEqual({
            headerId: 0,
            videoId: "dQw4w9WgXcQ",
            itag: 400,
            isInit: true,
            sequence: null,
            startMs: null,
            durationMs: null
        });
    });

    test("reports a missing video id as null", () => {
        const payload = buildMediaHeaderPayload({ headerId: 2, itag: 251, sequence: 1, startMs: 0, durationMs: 1 });

        expect(parseMediaHeader(payload)?.videoId).toBeNull();
    });

    test("reports a video id that is not plain ASCII as null", () => {
        const payload = concatBytes(fieldVarint(1, 0), fieldLen(2, Uint8Array.from([0xff, 0xfe, 0x41])));

        const header = parseMediaHeader(payload);

        expect(header).not.toBeNull();
        expect(header?.videoId).toBeNull();
    });

    test("returns null when the header id is missing or repeated", () => {
        expect(parseMediaHeader(fieldVarint(3, 251))).toBeNull();
        expect(parseMediaHeader(concatBytes(fieldVarint(1, 0), fieldVarint(1, 1)))).toBeNull();
    });

    test("refuses a payload far larger than any real header instead of splitting it into fields", () => {
        const padding = fieldLen(99, new Uint8Array(MAX_MEDIA_HEADER_BYTES + 1));
        const payload = concatBytes(buildMediaHeaderPayload({ headerId: 1, itag: 251 }), padding);

        expect(parseMediaHeader(payload)).toBeNull();
    });

    test("returns null for malformed protobuf", () => {
        expect(parseMediaHeader(Uint8Array.from([0x0a, 0x7f, 0x01]))).toBeNull();
        expect(parseMediaHeader(new Uint8Array(0))).toBeNull();
    });
});
