/*
 * Decides whether a prefetched SABR response may be handed to the player.
 *
 * The check is deliberately strict: a response is only accepted when it is complete,
 * belongs to the expected video, shows no sign of the server objecting, and really
 * starts around the requested position (proof that the server honoured the rewritten
 * player time). Rejecting is always safe: the player simply makes its own request.
 */

import { MediaHeader, parseMediaHeader } from "./mediaHeader";
import { findVarintAtPath } from "./protobuf";
import {
    UMP_MEDIA_END,
    UMP_MEDIA_HEADER,
    UMP_SABR_REDIRECT,
    UMP_STREAM_PROTECTION_STATUS,
    UmpPart,
    splitUmpParts
} from "./ump";

/** Audio segments are ~10 s long, so the first one may begin this much before the target. */
export const SEGMENT_LEAD_TOLERANCE_MS = 15000;
/** The first segment may begin slightly after the target (rounding of segment boundaries). */
export const SEGMENT_LAG_TOLERANCE_MS = 1000;

const PROTECTION_STATUS_PATH = [1];
const PROTECTION_STATUS_OK = 1;

export type CacheRejection =
    | "tooLarge"
    | "malformed"
    | "truncated"
    | "protection"
    | "redirect"
    | "noMedia"
    | "wrongVideo"
    | "wrongPosition";

export interface PrefetchExpectation {
    readonly targetMs: number;
    /** When set, every segment in the response must belong to this video. */
    readonly videoId: string | null;
    readonly maxBytes: number;
}

export type CacheValidation =
    | {
        readonly ok: true;
        readonly firstSegmentStartMs: number;
        readonly segmentCount: number;
        readonly bytes: number;
    }
    | { readonly ok: false; readonly reason: CacheRejection };

const reject = (reason: CacheRejection): CacheValidation => ({ ok: false, reason });

function payloadOf(body: Uint8Array, part: UmpPart): Uint8Array {
    return body.subarray(part.payloadStart, part.payloadEnd);
}

function hasBadProtectionStatus(body: Uint8Array, parts: ReadonlyArray<UmpPart>): boolean {
    return parts
        .filter((part) => part.type === UMP_STREAM_PROTECTION_STATUS)
        .some((part) => findVarintAtPath(payloadOf(body, part), PROTECTION_STATUS_PATH) !== PROTECTION_STATUS_OK);
}

/** MEDIA_END carries the header id of the segment it closes in its first byte. */
function endedHeaderIds(body: Uint8Array, parts: ReadonlyArray<UmpPart>): ReadonlySet<number> {
    return new Set(
        parts
            .filter((part) => part.type === UMP_MEDIA_END && part.payloadEnd > part.payloadStart)
            .map((part) => body[part.payloadStart])
    );
}

function parseHeaders(body: Uint8Array, parts: ReadonlyArray<UmpPart>): ReadonlyArray<MediaHeader> | null {
    const headers = parts
        .filter((part) => part.type === UMP_MEDIA_HEADER)
        .map((part) => parseMediaHeader(payloadOf(body, part)));

    return headers.every((header): header is MediaHeader => header !== null) ? headers : null;
}

export function validatePrefetchBody(body: Uint8Array, expectation: PrefetchExpectation): CacheValidation {
    if (body.length > expectation.maxBytes) return reject("tooLarge");

    const split = splitUmpParts(body);
    if (!split) return reject("malformed");
    if (split.consumed !== body.length) return reject("truncated");

    const { parts } = split;
    if (hasBadProtectionStatus(body, parts)) return reject("protection");
    if (parts.some((part) => part.type === UMP_SABR_REDIRECT)) return reject("redirect");

    const headers = parseHeaders(body, parts);
    if (!headers) return reject("malformed");

    const ended = endedHeaderIds(body, parts);
    if (!headers.every((header) => ended.has(header.headerId))) return reject("truncated");

    const segments = headers.filter((header) => !header.isInit);
    if (segments.length === 0) return reject("noMedia");

    if (expectation.videoId !== null && headers.some((header) => header.videoId !== expectation.videoId)) {
        return reject("wrongVideo");
    }

    const starts = segments.map((segment) => segment.startMs);
    if (!starts.every((start): start is number => start !== null)) return reject("malformed");

    const firstSegmentStartMs = Math.min(...starts);
    const tooEarly = firstSegmentStartMs < expectation.targetMs - SEGMENT_LEAD_TOLERANCE_MS;
    const tooLate = firstSegmentStartMs > expectation.targetMs + SEGMENT_LAG_TOLERANCE_MS;
    if (tooEarly || tooLate) return reject("wrongPosition");

    return { ok: true, firstSegmentStartMs, segmentCount: segments.length, bytes: body.length };
}
