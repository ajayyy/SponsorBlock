/*
 * MEDIA_HEADER (UMP part 20) payload: a protobuf message describing one media segment.
 * Field numbers below were verified against real SABR responses.
 */

import { ProtoField, WIRE_LENGTH_DELIMITED, WIRE_VARINT, readVarint, splitFields } from "./protobuf";

const FIELD_HEADER_ID = 1;
const FIELD_VIDEO_ID = 2;
const FIELD_ITAG = 3;
const FIELD_IS_INIT_SEGMENT = 8;
const FIELD_SEQUENCE_NUMBER = 9;
const FIELD_START_MS = 11;
const FIELD_DURATION_MS = 12;

/** Real headers are around a hundred bytes; anything much larger is not worth taking apart. */
export const MAX_MEDIA_HEADER_BYTES = 4096;
const MAX_VIDEO_ID_LENGTH = 64;
const PRINTABLE_ASCII_MIN = 0x20;
const PRINTABLE_ASCII_MAX = 0x7e;

export interface MediaHeader {
    readonly headerId: number;
    readonly videoId: string | null;
    readonly itag: number | null;
    readonly isInit: boolean;
    readonly sequence: number | null;
    readonly startMs: number | null;
    readonly durationMs: number | null;
}

function uniqueField(fields: ReadonlyArray<ProtoField>, fieldNumber: number): ProtoField | null {
    const matches = fields.filter((field) => field.field === fieldNumber);
    return matches.length === 1 ? matches[0] : null;
}

function readVarintField(payload: Uint8Array, fields: ReadonlyArray<ProtoField>, fieldNumber: number): number | null {
    const field = uniqueField(fields, fieldNumber);
    if (!field || field.wire !== WIRE_VARINT) return null;

    return readVarint(payload, field.payloadStart)?.value ?? null;
}

function readAsciiField(payload: Uint8Array, fields: ReadonlyArray<ProtoField>, fieldNumber: number): string | null {
    const field = uniqueField(fields, fieldNumber);
    if (!field || field.wire !== WIRE_LENGTH_DELIMITED) return null;

    const text = payload.subarray(field.payloadStart, field.payloadEnd);
    if (text.length === 0 || text.length > MAX_VIDEO_ID_LENGTH) return null;
    if (text.some((byte) => byte < PRINTABLE_ASCII_MIN || byte > PRINTABLE_ASCII_MAX)) return null;

    return String.fromCharCode(...text);
}

/** Returns null when the payload is not a well-formed header with exactly one header id. */
export function parseMediaHeader(payload: Uint8Array): MediaHeader | null {
    if (payload.length > MAX_MEDIA_HEADER_BYTES) return null;

    const fields = splitFields(payload);
    if (!fields) return null;

    const headerId = readVarintField(payload, fields, FIELD_HEADER_ID);
    if (headerId === null) return null;

    return {
        headerId,
        videoId: readAsciiField(payload, fields, FIELD_VIDEO_ID),
        itag: readVarintField(payload, fields, FIELD_ITAG),
        isInit: readVarintField(payload, fields, FIELD_IS_INIT_SEGMENT) === 1,
        sequence: readVarintField(payload, fields, FIELD_SEQUENCE_NUMBER),
        startMs: readVarintField(payload, fields, FIELD_START_MS),
        durationMs: readVarintField(payload, fields, FIELD_DURATION_MS)
    };
}
