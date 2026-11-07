/*
 * Minimal protobuf wire-format helpers.
 *
 * Only what is needed to read and rewrite single varint fields inside a larger
 * message without a schema. Everything here is pure and never mutates its input.
 * Values are handled as JavaScript numbers (safe up to 2^53 - 1); anything that
 * does not fit is reported as null so callers can fall back to untouched traffic.
 */

const MAX_VARINT_BYTES = 10;
const VARINT_PAYLOAD_MASK = 0x7f;
const VARINT_CONTINUATION_BIT = 0x80;
const VARINT_BASE = 128;
const TAG_WIRE_TYPE_DIVISOR = 8;
const FIXED32_BYTES = 4;
const FIXED64_BYTES = 8;

export const WIRE_VARINT = 0;
export const WIRE_FIXED64 = 1;
export const WIRE_LENGTH_DELIMITED = 2;
export const WIRE_FIXED32 = 5;

export type WireType = typeof WIRE_VARINT | typeof WIRE_FIXED64 | typeof WIRE_LENGTH_DELIMITED | typeof WIRE_FIXED32;

export interface VarintResult {
    readonly value: number;
    readonly next: number;
}

export interface ProtoField {
    readonly field: number;
    readonly wire: WireType;
    /** Offset of the tag. */
    readonly start: number;
    /** Offset of the first payload byte (after the length prefix for length-delimited fields). */
    readonly payloadStart: number;
    readonly payloadEnd: number;
    /** Offset right after the field. */
    readonly end: number;
}

export function readVarint(bytes: Uint8Array, offset: number): VarintResult | null {
    if (!Number.isInteger(offset) || offset < 0) return null;

    let value = 0;
    let multiplier = 1;
    for (let i = 0; i < MAX_VARINT_BYTES; i++) {
        const index = offset + i;
        if (index >= bytes.length) return null;

        const byte = bytes[index];
        value += (byte & VARINT_PAYLOAD_MASK) * multiplier;
        if (value > Number.MAX_SAFE_INTEGER) return null;
        if ((byte & VARINT_CONTINUATION_BIT) === 0) return { value, next: index + 1 };

        multiplier *= VARINT_BASE;
    }

    return null;
}

export function encodeVarint(value: number): Uint8Array {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new RangeError(`Cannot encode ${value} as a varint`);
    }

    const encoded: number[] = [];
    let rest = value;
    while (rest >= VARINT_BASE) {
        encoded.push((rest % VARINT_BASE) | VARINT_CONTINUATION_BIT);
        rest = Math.floor(rest / VARINT_BASE);
    }
    encoded.push(rest);

    return Uint8Array.from(encoded);
}

/** Returns the offset after a varint without decoding its value (it may not fit a safe integer). */
function skipVarint(bytes: Uint8Array, offset: number): number | null {
    for (let i = 0; i < MAX_VARINT_BYTES; i++) {
        const index = offset + i;
        if (index >= bytes.length) return null;
        if ((bytes[index] & VARINT_CONTINUATION_BIT) === 0) return index + 1;
    }

    return null;
}

function readField(bytes: Uint8Array, start: number): ProtoField | null {
    const tag = readVarint(bytes, start);
    if (!tag) return null;

    const field = Math.floor(tag.value / TAG_WIRE_TYPE_DIVISOR);
    const wire = tag.value % TAG_WIRE_TYPE_DIVISOR;
    if (field === 0) return null;

    switch (wire) {
        case WIRE_VARINT: {
            const end = skipVarint(bytes, tag.next);
            return end === null ? null : { field, wire, start, payloadStart: tag.next, payloadEnd: end, end };
        }
        case WIRE_FIXED64:
        case WIRE_FIXED32: {
            const end = tag.next + (wire === WIRE_FIXED64 ? FIXED64_BYTES : FIXED32_BYTES);
            return end > bytes.length ? null : { field, wire, start, payloadStart: tag.next, payloadEnd: end, end };
        }
        case WIRE_LENGTH_DELIMITED: {
            const length = readVarint(bytes, tag.next);
            if (!length) return null;

            const end = length.next + length.value;
            return end > bytes.length ? null : { field, wire, start, payloadStart: length.next, payloadEnd: end, end };
        }
        default:
            // Groups (3, 4) and reserved wire types are not used by the messages we touch.
            return null;
    }
}

/** Splits a message into its top-level fields, or returns null if it is not well-formed. */
export function splitFields(bytes: Uint8Array): ReadonlyArray<ProtoField> | null {
    const fields: ProtoField[] = [];
    let offset = 0;
    while (offset < bytes.length) {
        const field = readField(bytes, offset);
        if (!field) return null;

        fields.push(field);
        offset = field.end;
    }

    return fields;
}

function concatBytes(...parts: ReadonlyArray<Uint8Array>): Uint8Array {
    const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let offset = 0;
    for (const part of parts) {
        result.set(part, offset);
        offset += part.length;
    }

    return result;
}

/** Finds the only occurrence of a field number, or null if it is absent, repeated or the message is malformed. */
function findUniqueField(bytes: Uint8Array, fieldNumber: number): ProtoField | null {
    const fields = splitFields(bytes);
    if (!fields) return null;

    const matches = fields.filter((field) => field.field === fieldNumber);
    return matches.length === 1 ? matches[0] : null;
}

export function findVarintAtPath(bytes: Uint8Array, path: ReadonlyArray<number>): number | null {
    if (path.length === 0) return null;

    const [head, ...rest] = path;
    const target = findUniqueField(bytes, head);
    if (!target) return null;

    if (rest.length === 0) {
        if (target.wire !== WIRE_VARINT) return null;
        return readVarint(bytes, target.payloadStart)?.value ?? null;
    }

    if (target.wire !== WIRE_LENGTH_DELIMITED) return null;
    return findVarintAtPath(bytes.subarray(target.payloadStart, target.payloadEnd), rest);
}

/** Returns a copy of the message with the varint at `path` replaced and all parent lengths recomputed. */
export function replaceVarintAtPath(bytes: Uint8Array, path: ReadonlyArray<number>, value: number): Uint8Array | null {
    if (path.length === 0 || !Number.isSafeInteger(value) || value < 0) return null;

    const [head, ...rest] = path;
    const target = findUniqueField(bytes, head);
    if (!target) return null;

    const before = bytes.subarray(0, target.start);
    const after = bytes.subarray(target.end);

    if (rest.length === 0) {
        if (target.wire !== WIRE_VARINT) return null;
        return concatBytes(before, encodeVarint(head * TAG_WIRE_TYPE_DIVISOR + WIRE_VARINT), encodeVarint(value), after);
    }

    if (target.wire !== WIRE_LENGTH_DELIMITED) return null;
    const inner = replaceVarintAtPath(bytes.subarray(target.payloadStart, target.payloadEnd), rest, value);
    if (!inner) return null;

    return concatBytes(
        before,
        encodeVarint(head * TAG_WIRE_TYPE_DIVISOR + WIRE_LENGTH_DELIMITED),
        encodeVarint(inner.length),
        inner,
        after
    );
}
