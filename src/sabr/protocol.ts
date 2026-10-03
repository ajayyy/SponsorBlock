/*
 * Messages exchanged over window.postMessage between the content script (isolated world)
 * and the SABR script running in the page (MAIN world).
 *
 * The page can post arbitrary messages too, so everything that arrives is treated as untrusted
 * and re-built field by field; anything that does not match exactly is dropped (returns null).
 * No logic or state lives here: this file only defines the wire format.
 */

export const SABR_PROTOCOL_VERSION = 1;
export const TO_MAIN_SOURCE = "sb-sabr";
export const TO_CONTENT_SOURCE = "sb-sabr-main";

/** Ranges shorter than this are not worth preparing for (the player's read-ahead covers them). */
export const MIN_RANGE_MS = 8000;
export const MAX_DETAIL_LENGTH = 200;

const MAX_SESSION_LENGTH = 64;
/** Trace events are short identifiers like "prefetch-start". */
const TRACE_EVENT_PATTERN = /^[A-Za-z0-9:_-]{1,40}$/;
const SESSION_PATTERN = /^[A-Za-z0-9_-]+$/;
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
/** The skip may end right at the end of the video, whose reported duration can be slightly short. */
const END_PAST_DURATION_TOLERANCE_MS = 1000;

const DISARM_REASONS = ["noTarget", "ad", "unsupported", "disabled"] as const;
const RESET_REASONS = ["videoChange", "cleanup"] as const;
const STATUS_STATES = ["sabrSeen", "disabled"] as const;
const SHAPING_MODES = ["hold"] as const;
const ANOMALY_CODES = [
    "noPlayerTime",
    "playerTimeMismatch",
    "prefetchRejected",
    "stallAfterCache",
    "rateLimited",
    "stallNoSkip",
    "hookBypassed",
    "unexpected"
] as const;

export type DisarmReason = typeof DISARM_REASONS[number];
export type ResetReason = typeof RESET_REASONS[number];
export type StatusState = typeof STATUS_STATES[number];
export type ShapingMode = typeof SHAPING_MODES[number];
export type AnomalyCode = typeof ANOMALY_CODES[number];

/** The next range that is guaranteed to be skipped automatically. */
export interface ArmTarget {
    readonly videoID: string;
    readonly startMs: number;
    readonly endMs: number;
    readonly durationMs: number;
}

interface ToMainBase {
    readonly source: typeof TO_MAIN_SOURCE;
    readonly v: typeof SABR_PROTOCOL_VERSION;
    readonly session: string;
    /** Strictly increasing within a session; stale or replayed messages are ignored by the receiver. */
    readonly seq: number;
}

export type ToMainMessage = ToMainBase & (
    | { readonly type: "hello"; readonly enabled: boolean }
    | { readonly type: "setEnabled"; readonly enabled: boolean }
    | { readonly type: "arm"; readonly target: ArmTarget }
    | { readonly type: "disarm"; readonly reason: DisarmReason }
    | { readonly type: "reset"; readonly reason: ResetReason }
);

interface ToContentBase {
    readonly source: typeof TO_CONTENT_SOURCE;
    readonly v: typeof SABR_PROTOCOL_VERSION;
    /** The session the message answers to, or null before a handshake. */
    readonly session: string | null;
}

export interface SkipStats {
    readonly videoID: string;
    readonly startMs: number;
    readonly endMs: number;
    readonly prefetchBytes: number;
    readonly prefetchMs: number;
    readonly cacheHit: boolean;
    readonly seekToPlayingMs: number | null;
    readonly heldRequests: number;
}

export type ToContentMessage = ToContentBase & (
    | { readonly type: "ready" }
    | { readonly type: "status"; readonly state: StatusState; readonly reason?: string }
    | { readonly type: "shaping"; readonly videoID: string; readonly startMs: number; readonly mode: ShapingMode }
    | ({ readonly type: "stats" } & SkipStats)
    | { readonly type: "anomaly"; readonly code: AnomalyCode; readonly fatal: boolean; readonly detail?: string }
    | { readonly type: "trace"; readonly event: string; readonly detail?: string }
);

type Fields = Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is Fields =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const isCount = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

const isSession = (value: unknown): value is string =>
    typeof value === "string" && value.length > 0 && value.length <= MAX_SESSION_LENGTH && SESSION_PATTERN.test(value);

const isVideoID = (value: unknown): value is string => typeof value === "string" && VIDEO_ID_PATTERN.test(value);

const oneOf = <T extends string>(allowed: ReadonlyArray<T>, value: unknown): value is T =>
    typeof value === "string" && (allowed as ReadonlyArray<string>).includes(value);

function parseTarget(value: unknown): ArmTarget | null {
    if (!isRecord(value)) return null;

    const { videoID, startMs, endMs, durationMs } = value;
    if (!isVideoID(videoID) || !isCount(startMs) || !isCount(endMs) || !isCount(durationMs)) return null;
    if (endMs - startMs < MIN_RANGE_MS) return null;
    if (endMs > durationMs + END_PAST_DURATION_TOLERANCE_MS) return null;

    return { videoID, startMs, endMs, durationMs };
}

export function parseToMainMessage(input: unknown): ToMainMessage | null {
    if (!isRecord(input) || input.source !== TO_MAIN_SOURCE || input.v !== SABR_PROTOCOL_VERSION) return null;
    if (!isSession(input.session) || !isCount(input.seq)) return null;

    const base: ToMainBase = { source: TO_MAIN_SOURCE, v: SABR_PROTOCOL_VERSION, session: input.session, seq: input.seq };

    switch (input.type) {
        case "hello":
        case "setEnabled":
            return typeof input.enabled === "boolean" ? { ...base, type: input.type, enabled: input.enabled } : null;
        case "arm": {
            const target = parseTarget(input.target);
            return target ? { ...base, type: "arm", target } : null;
        }
        case "disarm":
            return oneOf(DISARM_REASONS, input.reason) ? { ...base, type: "disarm", reason: input.reason } : null;
        case "reset":
            return oneOf(RESET_REASONS, input.reason) ? { ...base, type: "reset", reason: input.reason } : null;
        default:
            return null;
    }
}

/** Optional free text: absent is fine, present must be a short string. */
function parseDetail(value: unknown): { readonly ok: boolean; readonly text?: string } {
    if (value === undefined) return { ok: true };
    return typeof value === "string" && value.length <= MAX_DETAIL_LENGTH ? { ok: true, text: value } : { ok: false };
}

function parseStats(input: Fields): SkipStats | null {
    const { videoID, startMs, endMs, prefetchBytes, prefetchMs, cacheHit, seekToPlayingMs, heldRequests } = input;
    const seekOk = seekToPlayingMs === null || isCount(seekToPlayingMs);

    if (!isVideoID(videoID) || !isCount(startMs) || !isCount(endMs)) return null;
    if (!isCount(prefetchBytes) || !isCount(prefetchMs) || typeof cacheHit !== "boolean" || !seekOk) return null;
    if (!isCount(heldRequests)) return null;

    return { videoID, startMs, endMs, prefetchBytes, prefetchMs, cacheHit, seekToPlayingMs: seekToPlayingMs as number | null, heldRequests };
}

/** A session id, null before the handshake, or undefined when the value is neither. */
function readNullableSession(value: unknown): string | null | undefined {
    if (value === null) return null;
    return isSession(value) ? value : undefined;
}

export function parseToContentMessage(input: unknown): ToContentMessage | null {
    if (!isRecord(input) || input.source !== TO_CONTENT_SOURCE || input.v !== SABR_PROTOCOL_VERSION) return null;

    const session = readNullableSession(input.session);
    if (session === undefined) return null;

    const base: ToContentBase = { source: TO_CONTENT_SOURCE, v: SABR_PROTOCOL_VERSION, session };

    switch (input.type) {
        case "ready":
            return { ...base, type: "ready" };
        case "status": {
            const detail = parseDetail(input.reason);
            if (!oneOf(STATUS_STATES, input.state) || !detail.ok) return null;
            return detail.text === undefined
                ? { ...base, type: "status", state: input.state }
                : { ...base, type: "status", state: input.state, reason: detail.text };
        }
        case "shaping":
            return isVideoID(input.videoID) && isCount(input.startMs) && oneOf(SHAPING_MODES, input.mode)
                ? { ...base, type: "shaping", videoID: input.videoID, startMs: input.startMs, mode: input.mode }
                : null;
        case "stats": {
            const stats = parseStats(input);
            return stats ? { ...base, type: "stats", ...stats } : null;
        }
        case "anomaly": {
            const detail = parseDetail(input.detail);
            if (!oneOf(ANOMALY_CODES, input.code) || typeof input.fatal !== "boolean" || !detail.ok) return null;
            return detail.text === undefined
                ? { ...base, type: "anomaly", code: input.code, fatal: input.fatal }
                : { ...base, type: "anomaly", code: input.code, fatal: input.fatal, detail: detail.text };
        }
        case "trace": {
            const detail = parseDetail(input.detail);
            if (typeof input.event !== "string" || !TRACE_EVENT_PATTERN.test(input.event) || !detail.ok) return null;
            return detail.text === undefined
                ? { ...base, type: "trace", event: input.event }
                : { ...base, type: "trace", event: input.event, detail: detail.text };
        }
        default:
            return null;
    }
}
