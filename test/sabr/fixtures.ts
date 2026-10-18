/*
 * Synthetic byte builders for the SABR tests.
 * The encoder here is intentionally independent from src/sabr/core so that the
 * tests do not validate the implementation against itself.
 */

export function concatBytes(...parts: ReadonlyArray<Uint8Array>): Uint8Array {
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const result = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
        result.set(part, offset);
        offset += part.length;
    }
    return result;
}

/** Protobuf base-128 varint, written with modulo arithmetic (valid up to 2^53). */
export function varintBytes(value: number): Uint8Array {
    const bytes: number[] = [];
    let rest = value;
    while (rest >= 128) {
        bytes.push((rest % 128) + 128);
        rest = Math.floor(rest / 128);
    }
    bytes.push(rest);
    return Uint8Array.from(bytes);
}

export function tagBytes(field: number, wireType: number): Uint8Array {
    return varintBytes(field * 8 + wireType);
}

export function fieldVarint(field: number, value: number): Uint8Array {
    return concatBytes(tagBytes(field, 0), varintBytes(value));
}

export function fieldLen(field: number, payload: Uint8Array): Uint8Array {
    return concatBytes(tagBytes(field, 2), varintBytes(payload.length), payload);
}

export function fieldFixed32(field: number, payload: Uint8Array = new Uint8Array(4)): Uint8Array {
    return concatBytes(tagBytes(field, 5), payload);
}

export function fieldFixed64(field: number, payload: Uint8Array = new Uint8Array(8)): Uint8Array {
    return concatBytes(tagBytes(field, 1), payload);
}

/** 10-byte varint for 2^64 - 1, the value YouTube sends in some config fields. */
export function maxUint64Varint(): Uint8Array {
    return Uint8Array.from([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01]);
}

/**
 * UMP variable-length integer: the number of leading one bits of the first byte
 * selects the total length (1-5 bytes), the remaining bits and following bytes
 * hold the value little-endian.
 */
export function umpVarintBytes(value: number): Uint8Array {
    if (value < 2 ** 7) return Uint8Array.from([value]);
    if (value < 2 ** 14) return Uint8Array.from([0x80 | (value % 2 ** 6), Math.floor(value / 2 ** 6)]);
    if (value < 2 ** 21) {
        return Uint8Array.from([0xc0 | (value % 2 ** 5), Math.floor(value / 2 ** 5) % 256, Math.floor(value / 2 ** 13)]);
    }
    if (value < 2 ** 28) {
        return Uint8Array.from([
            0xe0 | (value % 2 ** 4),
            Math.floor(value / 2 ** 4) % 256,
            Math.floor(value / 2 ** 12) % 256,
            Math.floor(value / 2 ** 20)
        ]);
    }
    return Uint8Array.from([
        0xf0,
        value % 256,
        Math.floor(value / 2 ** 8) % 256,
        Math.floor(value / 2 ** 16) % 256,
        Math.floor(value / 2 ** 24)
    ]);
}

export function umpPart(type: number, payload: Uint8Array = new Uint8Array(0)): Uint8Array {
    return concatBytes(umpVarintBytes(type), umpVarintBytes(payload.length), payload);
}

export interface MediaHeaderFixture {
    readonly headerId: number;
    readonly videoId?: string;
    readonly itag?: number;
    readonly isInit?: boolean;
    readonly sequence?: number;
    readonly startMs?: number;
    readonly durationMs?: number;
}

/** MEDIA_HEADER payload shaped like the ones observed in real SABR responses. */
export function buildMediaHeaderPayload(header: MediaHeaderFixture): Uint8Array {
    const ascii = (text: string): Uint8Array => Uint8Array.from(Array.from(text, (char) => char.charCodeAt(0)));
    const optional = (field: number, value: number | undefined): Uint8Array =>
        value === undefined ? new Uint8Array(0) : fieldVarint(field, value);

    return concatBytes(
        fieldVarint(1, header.headerId),
        header.videoId === undefined ? new Uint8Array(0) : fieldLen(2, ascii(header.videoId)),
        optional(3, header.itag),
        fieldVarint(4, 1766955883819090),
        fieldVarint(8, header.isInit ? 1 : 0),
        optional(9, header.sequence),
        fieldVarint(10, 16447),
        optional(11, header.startMs),
        optional(12, header.durationMs),
        fieldLen(13, concatBytes(fieldVarint(1, header.itag ?? 0), fieldVarint(2, 1766955883819090)))
    );
}

/** Manually advanced timers, so tests control exactly when delayed callbacks fire. */
export function fakeTimers() {
    let nextId = 1;
    let current = 0;
    const pending = new Map<number, { fn: () => void; at: number }>();

    return {
        timers: {
            set: (fn: () => void, ms: number): unknown => {
                const id = nextId++;
                pending.set(id, { fn, at: current + ms });
                return id;
            },
            clear: (handle: unknown): void => {
                pending.delete(handle as number);
            }
        },
        advance: (ms: number): void => {
            current += ms;
            for (const [id, timer] of [...pending]) {
                if (timer.at <= current) {
                    pending.delete(id);
                    timer.fn();
                }
            }
        },
        pendingCount: (): number => pending.size
    };
}

export const SAMPLE_VIDEO_ID = "dQw4w9WgXcQ";

/** A complete segment as it appears in a response: header, media data and end marker. */
export function umpSegment(fixture: MediaHeaderFixture): Uint8Array {
    return concatBytes(
        umpPart(20, buildMediaHeaderPayload(fixture)),
        umpPart(21, Uint8Array.from([fixture.headerId, 1, 2, 3, 4])),
        umpPart(22, Uint8Array.from([fixture.headerId]))
    );
}

export function umpProtectionOk(): Uint8Array {
    return umpPart(58, fieldVarint(1, 1));
}

/** A complete, valid answer to a request for the position `targetMs` (starts slightly before it). */
export function buildPrefetchResponse(targetMs: number, videoId: string = SAMPLE_VIDEO_ID): Uint8Array {
    return concatBytes(
        umpProtectionOk(),
        umpSegment({ headerId: 0, videoId, itag: 251, isInit: true }),
        umpSegment({ headerId: 1, videoId, itag: 251, sequence: 15, startMs: targetMs - 10000, durationMs: 10000 }),
        umpSegment({ headerId: 2, videoId, itag: 400, sequence: 28, startMs: targetMs - 2000, durationMs: 4000 })
    );
}

export interface SabrRequestBodyOptions {
    readonly playerTimeMs: number;
    readonly itags?: ReadonlyArray<number>;
}

/** Request body shaped like the player's: ABR state with the player time, then the allowed formats. */
export function buildSabrRequestBody({ playerTimeMs, itags = [251, 400] }: SabrRequestBodyOptions): Uint8Array {
    const abrState = concatBytes(fieldVarint(13, 993651), fieldVarint(28, playerTimeMs), fieldVarint(29, 4));
    const formats = itags.map((itag) => fieldLen(2, concatBytes(fieldVarint(1, itag), fieldVarint(2, 1766955883819090))));

    return concatBytes(fieldLen(1, abrState), ...formats, fieldVarint(36, 19));
}
