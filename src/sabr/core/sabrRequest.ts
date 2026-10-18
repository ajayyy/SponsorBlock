/*
 * Helpers for YouTube's SABR media requests: POST to <host>.googlevideo.com/videoplayback?sabr=1
 * with a protobuf body that describes the player state.
 *
 * Every function is defensive: when anything looks unexpected it answers null/false so the
 * caller can let the request through untouched.
 */

import { WIRE_LENGTH_DELIMITED, findVarintAtPath, replaceVarintAtPath, splitFields } from "./protobuf";

/** ClientAbrState (field 1) -> player_time_ms (field 28). */
export const PLAYER_TIME_PATH: ReadonlyArray<number> = [1, 28];

/** Repeated field 2: the formats the player allows the server to choose from (itag is its field 1). */
const SELECTED_FORMAT_FIELD = 2;
const FORMAT_ITAG_PATH: ReadonlyArray<number> = [1];

const SABR_HOST_SUFFIX = ".googlevideo.com";
const SABR_PATH = "/videoplayback";
const SABR_PARAM = "sabr";
const SABR_PARAM_VALUE = "1";
const STREAM_ID_PARAM = "id";

export interface RequestDescriptor {
    readonly url: string;
    readonly method: string;
}

function parseUrl(url: string): URL | null {
    try {
        return new URL(url);
    } catch {
        return null;
    }
}

export function isSabrRequest({ url, method }: RequestDescriptor): boolean {
    if (method.toUpperCase() !== "POST") return false;

    const parsed = parseUrl(url);
    if (!parsed) return false;

    return parsed.hostname.endsWith(SABR_HOST_SUFFIX)
        && parsed.pathname === SABR_PATH
        && parsed.searchParams.get(SABR_PARAM) === SABR_PARAM_VALUE;
}

/** Identifies the media stream a request belongs to, so cached data is never reused across videos. */
export function getStreamKey(url: string): string | null {
    return parseUrl(url)?.searchParams.get(STREAM_ID_PARAM) ?? null;
}

/**
 * A stable fingerprint of the formats the player currently allows, e.g. "251,313,400".
 * Null when none are listed yet or anything about them cannot be read.
 */
export function getFormatsKey(body: Uint8Array): string | null {
    const fields = splitFields(body);
    if (!fields) return null;

    const entries = fields.filter((field) => field.field === SELECTED_FORMAT_FIELD && field.wire === WIRE_LENGTH_DELIMITED);
    if (entries.length === 0) return null;

    const itags = entries.map((entry) => findVarintAtPath(body.subarray(entry.payloadStart, entry.payloadEnd), FORMAT_ITAG_PATH));
    if (!itags.every((itag): itag is number => itag !== null)) return null;

    return [...itags].sort((a, b) => a - b).join(",");
}

export function getPlayerTimeMs(body: Uint8Array): number | null {
    return findVarintAtPath(body, PLAYER_TIME_PATH);
}

export function withPlayerTimeMs(body: Uint8Array, playerTimeMs: number): Uint8Array | null {
    return replaceVarintAtPath(body, PLAYER_TIME_PATH, playerTimeMs);
}
