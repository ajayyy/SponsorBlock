/*
 * Streaming filter for UMP responses that removes the media of segments lying inside a range
 * the viewer will skip, so the player never buffers them.
 *
 * Whole segments are removed (MEDIA_HEADER, every MEDIA part and MEDIA_END of it); everything
 * else - init segments, policies, cookies, anything unknown - passes through byte for byte and
 * in the original order. The filter works on chunks as they arrive. Whenever it cannot be sure
 * what it is looking at, it lets the data through untouched.
 */

import { parseMediaHeader } from "./mediaHeader";
import { UMP_MEDIA, UMP_MEDIA_END, UMP_MEDIA_HEADER, UmpPart, splitUmpParts } from "./ump";

/** MEDIA and MEDIA_END carry the header id in their first byte, so larger ids cannot be matched. */
const MAX_MATCHABLE_HEADER_ID = 127;
/** Only the first few segments of each kind are described, to keep debug lines short. */
const MAX_LISTED_SEGMENTS = 8;
/**
 * An unfinished part is held back until it is complete. Real parts are far smaller than this;
 * when one grows past it the filter gives up and lets the rest through, rather than copying an
 * ever larger buffer for every chunk.
 */
export const MAX_BUFFERED_BYTES = 4 * 1024 * 1024;

export interface FilterRule {
    /** Segments starting at or after this time (and before `dropToMs`) are removed. */
    readonly dropFromMs: number;
    readonly dropToMs: number;
}

export interface FilterStats {
    readonly droppedSegments: number;
    readonly droppedBytes: number;
    /** Media segments (not init segments) that were passed on. */
    readonly keptSegments: number;
}

/** Segments as "i<itag>#<sequence>@<start ms>+<duration ms>", for the debug log. */
export interface FilterSegments {
    readonly dropped: ReadonlyArray<string>;
    readonly kept: ReadonlyArray<string>;
}

export interface UmpFilter {
    /** Feeds the next chunk; returns what may be forwarded now. */
    push(chunk: Uint8Array): Uint8Array;
    /** Called when the response ends; returns any unfinished tail unchanged. */
    flush(): Uint8Array;
    stats(): FilterStats;
    segments(): FilterSegments;
}

function concat(first: Uint8Array, second: Uint8Array): Uint8Array {
    if (first.length === 0) return second;

    const joined = new Uint8Array(first.length + second.length);
    joined.set(first);
    joined.set(second, first.length);
    return joined;
}

function concatAll(parts: ReadonlyArray<Uint8Array>): Uint8Array {
    const joined = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let offset = 0;
    for (const part of parts) {
        joined.set(part, offset);
        offset += part.length;
    }

    return joined;
}

export function createUmpFilter(rule: FilterRule): UmpFilter {
    const droppedIds = new Set<number>();
    let carry = new Uint8Array(0);
    let passThrough = false;
    let droppedSegments = 0;
    let droppedBytes = 0;
    let keptSegments = 0;
    const droppedList: string[] = [];
    const keptList: string[] = [];

    const describeSegment = (header: { itag: number | null; sequence: number | null; startMs: number | null; durationMs: number | null }): string =>
        `i${header.itag}#${header.sequence}@${header.startMs}+${header.durationMs}`;

    /** True when the part must be removed. */
    function shouldDrop(buffer: Uint8Array, part: UmpPart): boolean {
        const payload = buffer.subarray(part.payloadStart, part.payloadEnd);

        if (part.type === UMP_MEDIA_HEADER) {
            const header = parseMediaHeader(payload);
            if (!header) return false;

            const startsInRange = header.startMs !== null && header.startMs >= rule.dropFromMs && header.startMs < rule.dropToMs;
            if (!header.isInit && startsInRange && header.headerId <= MAX_MATCHABLE_HEADER_ID) {
                droppedIds.add(header.headerId);
                droppedSegments += 1;
                if (droppedList.length < MAX_LISTED_SEGMENTS) droppedList.push(describeSegment(header));
                return true;
            }

            // A header id can be reused once its segment is over, even if the end of a removed one was lost.
            droppedIds.delete(header.headerId);

            if (!header.isInit) {
                keptSegments += 1;
                if (keptList.length < MAX_LISTED_SEGMENTS) keptList.push(describeSegment(header));
            }
            return false;
        }

        if ((part.type === UMP_MEDIA || part.type === UMP_MEDIA_END) && payload.length > 0 && droppedIds.has(payload[0])) {
            if (part.type === UMP_MEDIA_END) droppedIds.delete(payload[0]);
            return true;
        }

        return false;
    }

    return {
        push(chunk) {
            if (passThrough) return chunk;

            const buffer = concat(carry, chunk);
            const split = splitUmpParts(buffer);
            if (!split) {
                passThrough = true;
                carry = new Uint8Array(0);
                return buffer;
            }

            const forwarded: Uint8Array[] = [];
            for (const part of split.parts) {
                if (shouldDrop(buffer, part)) droppedBytes += part.payloadEnd - part.start;
                else forwarded.push(buffer.subarray(part.start, part.payloadEnd));
            }
            carry = Uint8Array.from(buffer.subarray(split.consumed));

            if (carry.length > MAX_BUFFERED_BYTES) {
                passThrough = true;
                forwarded.push(carry);
                carry = new Uint8Array(0);
            }

            return concatAll(forwarded);
        },

        flush() {
            const tail = carry;
            carry = new Uint8Array(0);
            return tail;
        },

        stats: () => ({ droppedSegments, droppedBytes, keptSegments }),
        segments: () => ({ dropped: [...droppedList], kept: [...keptList] })
    };
}
