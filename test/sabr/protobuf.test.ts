import {
    encodeVarint,
    findVarintAtPath,
    readVarint,
    replaceVarintAtPath,
    splitFields
} from "../../src/sabr/core/protobuf";
import {
    concatBytes,
    fieldFixed32,
    fieldFixed64,
    fieldLen,
    fieldVarint,
    maxUint64Varint,
    tagBytes,
    varintBytes
} from "./fixtures";

const PLAYER_TIME_PATH = [1, 28] as const;

describe("readVarint", () => {
    test.each([0, 1, 127, 128, 300, 16383, 16384, 2 ** 31, 2 ** 32 + 5, 2 ** 35, Number.MAX_SAFE_INTEGER])(
        "decodes %d at a non-zero offset",
        (value) => {
            const bytes = concatBytes(Uint8Array.from([0xff]), varintBytes(value));

            expect(readVarint(bytes, 1)).toEqual({ value, next: bytes.length });
        }
    );

    test("returns null for a truncated varint", () => {
        expect(readVarint(Uint8Array.from([0x80]), 0)).toBeNull();
    });

    test("returns null when the value does not fit into a safe integer", () => {
        expect(readVarint(varintBytes(2 ** 53), 0)).toBeNull();
        expect(readVarint(maxUint64Varint(), 0)).toBeNull();
    });

    test("returns null for a varint longer than 10 bytes", () => {
        const tooLong = new Uint8Array(11).fill(0x80);

        expect(readVarint(tooLong, 0)).toBeNull();
    });

    test("returns null when the offset is outside of the buffer", () => {
        expect(readVarint(Uint8Array.from([0x01]), 1)).toBeNull();
        expect(readVarint(Uint8Array.from([0x01]), -1)).toBeNull();
    });
});

describe("encodeVarint", () => {
    test.each([0, 127, 128, 300, 40000, 150000, 2 ** 31, 2 ** 35, Number.MAX_SAFE_INTEGER])(
        "matches the reference encoder for %d",
        (value) => {
            expect(encodeVarint(value)).toEqual(varintBytes(value));
        }
    );

    test.each([-1, 1.5, Number.NaN, Infinity, 2 ** 53])("rejects %p", (value) => {
        expect(() => encodeVarint(value)).toThrow(RangeError);
    });
});

describe("splitFields", () => {
    test("returns an empty list for an empty buffer", () => {
        expect(splitFields(new Uint8Array(0))).toEqual([]);
    });

    test("describes varint, length-delimited, fixed32 and fixed64 fields with their byte ranges", () => {
        const varint = fieldVarint(1, 150);
        const len = fieldLen(2, Uint8Array.from([1, 2, 3]));
        const fixed32 = fieldFixed32(3);
        const fixed64 = fieldFixed64(4);
        const bytes = concatBytes(varint, len, fixed32, fixed64);

        const fields = splitFields(bytes);

        expect(fields).toEqual([
            { field: 1, wire: 0, start: 0, payloadStart: 1, payloadEnd: varint.length, end: varint.length },
            {
                field: 2,
                wire: 2,
                start: varint.length,
                payloadStart: varint.length + 2,
                payloadEnd: varint.length + len.length,
                end: varint.length + len.length
            },
            {
                field: 3,
                wire: 5,
                start: varint.length + len.length,
                payloadStart: varint.length + len.length + 1,
                payloadEnd: varint.length + len.length + fixed32.length,
                end: varint.length + len.length + fixed32.length
            },
            {
                field: 4,
                wire: 1,
                start: varint.length + len.length + fixed32.length,
                payloadStart: varint.length + len.length + fixed32.length + 1,
                payloadEnd: bytes.length,
                end: bytes.length
            }
        ]);
    });

    test("skips a 10-byte varint value without decoding it", () => {
        const bytes = concatBytes(tagBytes(141, 0), maxUint64Varint(), fieldVarint(1, 7));

        const fields = splitFields(bytes);

        expect(fields?.map((f) => f.field)).toEqual([141, 1]);
    });

    test("accepts large field numbers", () => {
        const bytes = fieldVarint(388565617, 1);

        expect(splitFields(bytes)?.map((f) => f.field)).toEqual([388565617]);
    });

    test.each([
        ["start group", 3],
        ["end group", 4],
        ["reserved wire type 6", 6],
        ["reserved wire type 7", 7]
    ])("returns null for %s", (_name, wire) => {
        expect(splitFields(concatBytes(tagBytes(1, wire), Uint8Array.from([0])))).toBeNull();
    });

    test("returns null for field number 0", () => {
        expect(splitFields(Uint8Array.from([0x00, 0x01]))).toBeNull();
    });

    test("returns null when a length-delimited field overruns the buffer", () => {
        const bytes = concatBytes(tagBytes(1, 2), varintBytes(10), Uint8Array.from([1, 2, 3]));

        expect(splitFields(bytes)).toBeNull();
    });

    test("returns null for truncated fixed-width fields", () => {
        expect(splitFields(concatBytes(tagBytes(1, 5), Uint8Array.from([1, 2])))).toBeNull();
        expect(splitFields(concatBytes(tagBytes(1, 1), Uint8Array.from([1, 2, 3])))).toBeNull();
    });

    test("returns null for a truncated tag", () => {
        expect(splitFields(Uint8Array.from([0x80]))).toBeNull();
    });
});

describe("findVarintAtPath", () => {
    const abrState = (playerTimeMs: number): Uint8Array =>
        concatBytes(fieldVarint(13, 993651), fieldVarint(28, playerTimeMs), fieldVarint(29, 4));

    test("finds a nested varint", () => {
        const body = concatBytes(fieldLen(1, abrState(40000)), fieldLen(2, Uint8Array.from([9, 9])));

        expect(findVarintAtPath(body, PLAYER_TIME_PATH)).toBe(40000);
    });

    test("finds a zero value", () => {
        expect(findVarintAtPath(fieldLen(1, abrState(0)), PLAYER_TIME_PATH)).toBe(0);
    });

    test("returns null when the leaf field is absent", () => {
        const body = fieldLen(1, concatBytes(fieldVarint(13, 1), fieldVarint(29, 4)));

        expect(findVarintAtPath(body, PLAYER_TIME_PATH)).toBeNull();
    });

    test("returns null when the leaf field is duplicated", () => {
        const body = fieldLen(1, concatBytes(fieldVarint(28, 1), fieldVarint(28, 2)));

        expect(findVarintAtPath(body, PLAYER_TIME_PATH)).toBeNull();
    });

    test("returns null when the parent field is duplicated", () => {
        const body = concatBytes(fieldLen(1, abrState(1)), fieldLen(1, abrState(2)));

        expect(findVarintAtPath(body, PLAYER_TIME_PATH)).toBeNull();
    });

    test("returns null when the leaf has the wrong wire type", () => {
        const body = fieldLen(1, fieldLen(28, Uint8Array.from([1, 2])));

        expect(findVarintAtPath(body, PLAYER_TIME_PATH)).toBeNull();
    });

    test("returns null when an intermediate field is not length-delimited", () => {
        expect(findVarintAtPath(fieldVarint(1, 5), PLAYER_TIME_PATH)).toBeNull();
    });

    test("returns null for an empty path and for malformed input", () => {
        expect(findVarintAtPath(abrState(1), [])).toBeNull();
        expect(findVarintAtPath(Uint8Array.from([0x0a, 0x7f, 0x01]), PLAYER_TIME_PATH)).toBeNull();
    });

    test("returns null when the leaf value is not a safe integer", () => {
        const body = fieldLen(1, concatBytes(tagBytes(28, 0), maxUint64Varint()));

        expect(findVarintAtPath(body, PLAYER_TIME_PATH)).toBeNull();
    });
});

describe("replaceVarintAtPath", () => {
    const abrState = (playerTimeMs: number): Uint8Array =>
        concatBytes(fieldVarint(13, 993651), fieldVarint(28, playerTimeMs), fieldVarint(29, 4));

    const requestBody = (playerTimeMs: number): Uint8Array =>
        concatBytes(
            fieldLen(1, abrState(playerTimeMs)),
            fieldLen(2, Uint8Array.from([1, 2, 3])),
            fieldVarint(388565617, 1),
            fieldLen(19, Uint8Array.from([7]))
        );

    test("replaces the value and keeps every other byte", () => {
        const result = replaceVarintAtPath(requestBody(40000), PLAYER_TIME_PATH, 150000);

        expect(result).toEqual(requestBody(150000));
    });

    test("recomputes parent lengths when the varint grows", () => {
        const result = replaceVarintAtPath(requestBody(127), PLAYER_TIME_PATH, 128);

        expect(result).toEqual(requestBody(128));
        expect(findVarintAtPath(result as Uint8Array, PLAYER_TIME_PATH)).toBe(128);
    });

    test("recomputes parent lengths when the varint shrinks", () => {
        const result = replaceVarintAtPath(requestBody(150000), PLAYER_TIME_PATH, 0);

        expect(result).toEqual(requestBody(0));
    });

    test("does not mutate the input", () => {
        const input = requestBody(40000);
        const snapshot = Uint8Array.from(input);

        replaceVarintAtPath(input, PLAYER_TIME_PATH, 150000);

        expect(input).toEqual(snapshot);
    });

    test("returns a new array even when the value is unchanged", () => {
        const input = requestBody(40000);

        const result = replaceVarintAtPath(input, PLAYER_TIME_PATH, 40000);

        expect(result).toEqual(input);
        expect(result).not.toBe(input);
    });

    test("returns null when the path is missing, duplicated or the input is malformed", () => {
        const withoutLeaf = fieldLen(1, fieldVarint(13, 1));
        const duplicated = fieldLen(1, concatBytes(fieldVarint(28, 1), fieldVarint(28, 2)));

        expect(replaceVarintAtPath(withoutLeaf, PLAYER_TIME_PATH, 5)).toBeNull();
        expect(replaceVarintAtPath(duplicated, PLAYER_TIME_PATH, 5)).toBeNull();
        expect(replaceVarintAtPath(Uint8Array.from([0x0a, 0x7f]), PLAYER_TIME_PATH, 5)).toBeNull();
        expect(replaceVarintAtPath(requestBody(1), [], 5)).toBeNull();
    });

    test("rejects values that cannot be encoded", () => {
        expect(replaceVarintAtPath(requestBody(1), PLAYER_TIME_PATH, -1)).toBeNull();
        expect(replaceVarintAtPath(requestBody(1), PLAYER_TIME_PATH, 1.5)).toBeNull();
    });
});
