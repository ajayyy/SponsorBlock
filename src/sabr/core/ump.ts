/*
 * UMP ("application/vnd.yt-ump") framing used by SABR responses.
 *
 * A response is a sequence of parts: [type][payload size][payload], where type and size
 * are UMP variable-length integers (the number of leading one bits of the first byte
 * selects a total length of 1-5 bytes, the rest is the value, little-endian).
 */

/** Part types observed in real SABR responses. Anything else is passed through untouched. */
export const UMP_MEDIA_HEADER = 20;
export const UMP_MEDIA = 21;
export const UMP_MEDIA_END = 22;
export const UMP_NEXT_REQUEST_POLICY = 35;
export const UMP_FORMAT_INITIALIZATION_METADATA = 42;
export const UMP_SABR_REDIRECT = 43;
export const UMP_STREAM_PROTECTION_STATUS = 58;

/** A single part is never expected to be anywhere near this large; refuse to buffer it. */
export const MAX_UMP_PART_SIZE = 64 * 1024 * 1024;

const ONE_BYTE_LIMIT = 128;
const TWO_BYTE_LIMIT = 192;
const THREE_BYTE_LIMIT = 224;
const FOUR_BYTE_LIMIT = 240;
const BYTE_RADIX = 256;

export interface UmpVarintResult {
    readonly value: number;
    readonly next: number;
}

export interface UmpPart {
    readonly type: number;
    /** Offset of the part header (the type varint). */
    readonly start: number;
    readonly payloadStart: number;
    readonly payloadEnd: number;
}

export interface UmpSplitResult {
    readonly parts: ReadonlyArray<UmpPart>;
    /** Number of leading bytes that belong to complete parts; the rest is an unfinished tail. */
    readonly consumed: number;
}

function varintLength(firstByte: number): number {
    if (firstByte < ONE_BYTE_LIMIT) return 1;
    if (firstByte < TWO_BYTE_LIMIT) return 2;
    if (firstByte < THREE_BYTE_LIMIT) return 3;
    if (firstByte < FOUR_BYTE_LIMIT) return 4;
    return 5;
}

/** Reads a UMP varint; returns null when the buffer ends before the varint does. */
export function readUmpVarint(bytes: Uint8Array, offset: number): UmpVarintResult | null {
    if (!Number.isInteger(offset) || offset < 0 || offset >= bytes.length) return null;

    const first = bytes[offset];
    const length = varintLength(first);
    if (offset + length > bytes.length) return null;

    const next = offset + length;
    switch (length) {
        case 1:
            return { value: first, next };
        case 2:
            return { value: (first & 0x3f) + 2 ** 6 * bytes[offset + 1], next };
        case 3:
            return { value: (first & 0x1f) + 2 ** 5 * (bytes[offset + 1] + BYTE_RADIX * bytes[offset + 2]), next };
        case 4:
            return {
                value: (first & 0x0f)
                    + 2 ** 4 * (bytes[offset + 1] + BYTE_RADIX * (bytes[offset + 2] + BYTE_RADIX * bytes[offset + 3])),
                next
            };
        default:
            return {
                value: bytes[offset + 1]
                    + BYTE_RADIX * (bytes[offset + 2] + BYTE_RADIX * (bytes[offset + 3] + BYTE_RADIX * bytes[offset + 4])),
                next
            };
    }
}

/**
 * Splits as many complete parts as the buffer contains.
 * Returns null only when a part claims an implausible size.
 */
export function splitUmpParts(bytes: Uint8Array): UmpSplitResult | null {
    const parts: UmpPart[] = [];
    let offset = 0;

    while (offset < bytes.length) {
        const type = readUmpVarint(bytes, offset);
        if (!type) break;

        const size = readUmpVarint(bytes, type.next);
        if (!size) break;
        if (size.value > MAX_UMP_PART_SIZE) return null;

        const payloadEnd = size.next + size.value;
        if (payloadEnd > bytes.length) break;

        parts.push({ type: type.value, start: offset, payloadStart: size.next, payloadEnd });
        offset = payloadEnd;
    }

    return { parts, consumed: offset };
}
