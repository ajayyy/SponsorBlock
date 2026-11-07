import { MAX_UMP_PART_SIZE, readUmpVarint, splitUmpParts } from "../../src/sabr/core/ump";
import { concatBytes, umpPart, umpVarintBytes } from "./fixtures";

const BOUNDARIES = [
    0, 1, 127,
    128, 129, 16383,
    16384, 16385, 2 ** 21 - 1,
    2 ** 21, 2 ** 21 + 1, 2 ** 28 - 1,
    2 ** 28, 2 ** 28 + 1, 2 ** 32 - 1
];

describe("readUmpVarint", () => {
    test.each(BOUNDARIES)("decodes %d at a non-zero offset", (value) => {
        const bytes = concatBytes(Uint8Array.from([0xaa, 0xbb]), umpVarintBytes(value));

        expect(readUmpVarint(bytes, 2)).toEqual({ value, next: bytes.length });
    });

    test("returns null when the offset is outside of the buffer", () => {
        expect(readUmpVarint(Uint8Array.from([0x01]), 1)).toBeNull();
        expect(readUmpVarint(Uint8Array.from([0x01]), -1)).toBeNull();
    });

    test.each([
        ["2-byte", [0x80]],
        ["3-byte", [0xc0, 0x01]],
        ["4-byte", [0xe0, 0x01, 0x02]],
        ["5-byte", [0xf0, 0x01, 0x02, 0x03]]
    ])("returns null for a truncated %s varint", (_name, bytes) => {
        expect(readUmpVarint(Uint8Array.from(bytes), 0)).toBeNull();
    });
});

describe("splitUmpParts", () => {
    test("returns no parts for an empty buffer", () => {
        expect(splitUmpParts(new Uint8Array(0))).toEqual({ parts: [], consumed: 0 });
    });

    test("describes every part with its byte ranges", () => {
        const first = umpPart(20, Uint8Array.from([1, 2, 3]));
        const second = umpPart(21, new Uint8Array(200).fill(7));
        const third = umpPart(22, Uint8Array.from([0]));
        const bytes = concatBytes(first, second, third);

        const result = splitUmpParts(bytes);

        expect(result).toEqual({
            parts: [
                { type: 20, start: 0, payloadStart: 2, payloadEnd: first.length },
                { type: 21, start: first.length, payloadStart: first.length + 3, payloadEnd: first.length + second.length },
                {
                    type: 22,
                    start: first.length + second.length,
                    payloadStart: first.length + second.length + 2,
                    payloadEnd: bytes.length
                }
            ],
            consumed: bytes.length
        });
    });

    test("accepts zero-length parts", () => {
        const bytes = concatBytes(umpPart(35), umpPart(58));

        expect(splitUmpParts(bytes)?.parts.map((part) => part.type)).toEqual([35, 58]);
    });

    test("stops before a part whose payload is not fully available", () => {
        const complete = umpPart(20, Uint8Array.from([1, 2, 3]));
        const partial = umpPart(21, new Uint8Array(50)).subarray(0, 20);

        const result = splitUmpParts(concatBytes(complete, partial));

        expect(result?.parts).toHaveLength(1);
        expect(result?.consumed).toBe(complete.length);
    });

    test("stops before a truncated part header", () => {
        const complete = umpPart(20, Uint8Array.from([1]));
        const truncatedHeader = Uint8Array.from([21, 0x80]);

        const result = splitUmpParts(concatBytes(complete, truncatedHeader));

        expect(result?.consumed).toBe(complete.length);
    });

    test("returns null for a part larger than the allowed maximum", () => {
        const header = concatBytes(umpVarintBytes(21), umpVarintBytes(MAX_UMP_PART_SIZE + 1));

        expect(splitUmpParts(header)).toBeNull();
    });

    test("finds the same parts when the buffer is processed in two steps", () => {
        const bytes = concatBytes(
            umpPart(20, Uint8Array.from([5, 6])),
            umpPart(21, new Uint8Array(300)),
            umpPart(22, Uint8Array.from([0]))
        );
        const whole = splitUmpParts(bytes);

        for (let cut = 1; cut < bytes.length; cut++) {
            const head = splitUmpParts(bytes.subarray(0, cut));
            const resumed = splitUmpParts(bytes.subarray(head?.consumed ?? 0));
            const total = (head?.parts.length ?? 0) + (resumed?.parts.length ?? 0);

            expect(total).toBe(whole?.parts.length);
        }
    });
});
