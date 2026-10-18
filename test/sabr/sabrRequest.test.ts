import {
    PLAYER_TIME_PATH,
    getFormatsKey,
    getPlayerTimeMs,
    getStreamKey,
    isSabrRequest,
    withPlayerTimeMs
} from "../../src/sabr/core/sabrRequest";
import { findVarintAtPath } from "../../src/sabr/core/protobuf";
import { concatBytes, fieldLen, fieldVarint } from "./fixtures";

const SABR_URL =
    "https://rr3---sn-example.googlevideo.com/videoplayback?expire=1&id=o-ABC123&source=youtube&sabr=1&rn=3&alr=yes";

const abrState = (playerTimeMs: number): Uint8Array =>
    concatBytes(fieldVarint(13, 993651), fieldVarint(28, playerTimeMs), fieldVarint(29, 4));

const requestBody = (playerTimeMs: number): Uint8Array =>
    concatBytes(fieldLen(1, abrState(playerTimeMs)), fieldLen(2, Uint8Array.from([1, 2, 3])), fieldVarint(36, 19));

describe("isSabrRequest", () => {
    test("accepts a SABR media POST", () => {
        expect(isSabrRequest({ url: SABR_URL, method: "POST" })).toBe(true);
    });

    test("treats the method case-insensitively", () => {
        expect(isSabrRequest({ url: SABR_URL, method: "post" })).toBe(true);
    });

    test("rejects other methods", () => {
        expect(isSabrRequest({ url: SABR_URL, method: "GET" })).toBe(false);
    });

    test("rejects requests without sabr=1", () => {
        expect(isSabrRequest({ url: SABR_URL.replace("sabr=1", "sabr=0"), method: "POST" })).toBe(false);
        expect(isSabrRequest({ url: SABR_URL.replace("&sabr=1", ""), method: "POST" })).toBe(false);
    });

    test("rejects other paths", () => {
        const url = "https://rr3---sn-example.googlevideo.com/api/stats/qoe?sabr=1";

        expect(isSabrRequest({ url, method: "POST" })).toBe(false);
    });

    test("rejects hosts outside googlevideo.com", () => {
        const url = "https://example.com/videoplayback?sabr=1";
        const lookalike = "https://googlevideo.com.evil.example/videoplayback?sabr=1";

        expect(isSabrRequest({ url, method: "POST" })).toBe(false);
        expect(isSabrRequest({ url: lookalike, method: "POST" })).toBe(false);
    });

    test("rejects URLs that cannot be parsed", () => {
        expect(isSabrRequest({ url: "not a url", method: "POST" })).toBe(false);
        expect(isSabrRequest({ url: "", method: "POST" })).toBe(false);
    });
});

describe("getStreamKey", () => {
    test("returns the media id", () => {
        expect(getStreamKey(SABR_URL)).toBe("o-ABC123");
    });

    test("returns null when there is no id or the URL is invalid", () => {
        expect(getStreamKey("https://rr3---sn-example.googlevideo.com/videoplayback?sabr=1")).toBeNull();
        expect(getStreamKey("not a url")).toBeNull();
    });
});

describe("getFormatsKey", () => {
    const format = (itag: number): Uint8Array =>
        fieldLen(2, concatBytes(fieldVarint(1, itag), fieldVarint(2, 1766955883819090)));

    test("lists the selected formats in a stable order", () => {
        const body = concatBytes(fieldLen(1, abrState(1)), format(400), format(251), format(313));

        expect(getFormatsKey(body)).toBe("251,313,400");
    });

    test("does not depend on the order the formats were sent in", () => {
        const forward = concatBytes(format(251), format(400));
        const backward = concatBytes(format(400), format(251));

        expect(getFormatsKey(forward)).toBe(getFormatsKey(backward));
    });

    test("compares numerically, not as text", () => {
        expect(getFormatsKey(concatBytes(format(1000), format(251)))).toBe("251,1000");
    });

    test("returns null when no formats are selected yet", () => {
        expect(getFormatsKey(fieldLen(1, abrState(1)))).toBeNull();
    });

    test("returns null when a format entry cannot be read", () => {
        const broken = fieldLen(2, Uint8Array.from([0x0a, 0x7f]));

        expect(getFormatsKey(concatBytes(format(251), broken))).toBeNull();
        expect(getFormatsKey(fieldLen(2, fieldVarint(3, 1)))).toBeNull();
    });

    test("returns null for a malformed body", () => {
        expect(getFormatsKey(Uint8Array.from([0x0a, 0x7f, 0x01]))).toBeNull();
    });
});

describe("getPlayerTimeMs / withPlayerTimeMs", () => {
    test("reads the player time", () => {
        expect(getPlayerTimeMs(requestBody(40000))).toBe(40000);
    });

    test("returns null when the player time is missing", () => {
        expect(getPlayerTimeMs(fieldLen(1, fieldVarint(13, 1)))).toBeNull();
    });

    test("rewrites only the player time", () => {
        const rewritten = withPlayerTimeMs(requestBody(40000), 150000);

        expect(rewritten).toEqual(requestBody(150000));
        expect(findVarintAtPath(rewritten as Uint8Array, PLAYER_TIME_PATH)).toBe(150000);
    });

    test("returns null instead of guessing when the player time cannot be rewritten", () => {
        expect(withPlayerTimeMs(fieldLen(1, fieldVarint(13, 1)), 150000)).toBeNull();
        expect(withPlayerTimeMs(requestBody(1), -5)).toBeNull();
    });
});
