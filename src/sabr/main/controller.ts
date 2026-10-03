/*
 * The brain of the page-side SABR script.
 *
 * It owns the state of the feature: which session it talks to, whether it is on, which segment
 * is armed, the player's last request (the template for a prefetch) and the safety nets. It
 * starts prefetches when the policy says so, reports what happens to the content script, and
 * shuts the feature down for the page at the first sign of trouble. All outside effects (fetch,
 * posting messages, the player, timers, the clock) come in through `deps`, so it runs under test
 * without a browser.
 */

import { decidePrefetch } from "../core/prefetchPolicy";
import {
    AnomalyCode,
    ArmTarget,
    MAX_DETAIL_LENGTH,
    SABR_PROTOCOL_VERSION,
    TO_CONTENT_SOURCE,
    ToContentMessage,
    parseToMainMessage
} from "../protocol";
import type { CacheStore } from "./cacheStore";
import type { HookEvents, HookState, PlayerProbe, PlayerRequestInfo } from "./fetchHook";
import type { HoldRegistry, Timers } from "./holdRegistry";
import { PrefetchOutcome, startPrefetch } from "./prefetcher";

/** This many unexpected-but-survivable events on one page switch the feature off. */
export const SOFT_ANOMALY_LIMIT = 3;
/** No progress for this long, shortly after a skip served from the cache, switches the feature off. */
export const WATCHDOG_MS = 6000;
export const WATCHDOG_WINDOW_MS = 30000;
/** A player that stalls at the segment start but is not skipped within this time is let go. */
export const STALL_RELEASE_MS = 2500;
export const STATS_TIMEOUT_MS = 10000;
/**
 * Some of the player's media requests legitimately carry no position. Only this many in a row,
 * with not a single normal request in between, means the request format has changed.
 */
export const NO_PLAYER_TIME_STREAK_LIMIT = 5;

const PREFETCH_RATE_WINDOW_MS = 60000;
const STALL_ZONE_BEFORE_SEC = 0.5;
const STALL_ZONE_AFTER_SEC = 1.0;
const MS_PER_SECOND = 1000;

export interface ControllerProbe extends PlayerProbe {
    /** Every buffered range, e.g. "0.0-41.3|108.3-143.7", for the debug log. */
    bufferedRanges(): string;
    playbackRate(): number;
    isPaused(): boolean;
    /** The id of the video the player currently shows, or null if unknown. */
    videoId(): string | null;
    /** Nudges a stuck player by seeking to where it already is. */
    kick(): void;
}

export type PlayerEventName = "timeupdate" | "playing" | "seeking" | "seeked" | "waiting";

export interface ControllerDeps {
    readonly store: CacheStore;
    readonly holds: HoldRegistry;
    readonly probe: ControllerProbe;
    readonly realFetch: (request: Request) => Promise<Response>;
    readonly post: (message: ToContentMessage) => void;
    readonly now: () => number;
    readonly timers: Timers;
}

export interface Controller {
    readonly state: HookState;
    readonly events: HookEvents;
    handleMessage(data: unknown): void;
    onPlayerEvent(name: PlayerEventName): void;
    dispose(): void;
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type ContentBody = DistributiveOmit<ToContentMessage, "source" | "v" | "session">;

interface PlayerRequestTemplate {
    readonly info: PlayerRequestInfo;
    readonly capturedAt: number;
}

interface PrefetchMeta {
    readonly startMs: number;
    readonly videoID: string;
}

interface PendingStats extends PrefetchMeta {
    readonly endMs: number;
    readonly prefetchBytes: number;
    readonly prefetchMs: number;
}

export function createController(deps: ControllerDeps): Controller {
    const { store, holds, probe, timers } = deps;

    let session: string | null = null;
    let lastSeq = -1;
    let enabled = false;
    let autoDisabledReason: string | null = null;
    let armed: ArmTarget | null = null;
    let template: PlayerRequestTemplate | null = null;
    let softAnomalies = 0;
    let missingPlayerTimeStreak = 0;
    let lastWaitReason: string | null = null;
    let holdForced = false;
    let prefetchStarts: ReadonlyArray<number> = [];
    let shapingSentFor: number | null = null;
    let heldSinceStats = 0;
    let servedAt: number | null = null;
    let seekingAt: number | null = null;
    let pendingStats: PendingStats | null = null;
    let stallTimer: unknown = null;
    let watchdogTimer: unknown = null;
    let statsTimer: unknown = null;
    const prefetchMeta = new Map<number, PrefetchMeta>();

    const isActive = (): boolean => enabled && autoDisabledReason === null;

    function post(body: ContentBody): void {
        if (session === null) return;
        deps.post({ source: TO_CONTENT_SOURCE, v: SABR_PROTOCOL_VERSION, session, ...body } as ToContentMessage);
    }

    /** A note for the debug log of the content script; it explains what the page script is doing and why. */
    function trace(event: string, detail?: string): void {
        post(detail === undefined
            ? { type: "trace", event }
            : { type: "trace", event, detail: detail.slice(0, MAX_DETAIL_LENGTH) });
    }

    /** Says why a prefetch is not under way, but only when the reason changes. */
    function reportWait(reason: string): void {
        if (reason === lastWaitReason) return;

        lastWaitReason = reason;
        trace("prefetch-wait", reason);
    }

    function cancel(timer: unknown): null {
        if (timer !== null) timers.clear(timer);
        return null;
    }

    function clearTimers(): void {
        stallTimer = cancel(stallTimer);
        watchdogTimer = cancel(watchdogTimer);
        statsTimer = cancel(statsTimer);
    }

    /** Stops all interference: requests go on their way, cached data is dropped. */
    function deactivate(): void {
        armed = null;
        holdForced = false;
        pendingStats = null;
        clearTimers();
        holds.releaseAll();
        store.clear();
    }

    function resetRuntime(): void {
        deactivate();
        template = null;
        missingPlayerTimeStreak = 0;
        prefetchStarts = [];
        prefetchMeta.clear();
        shapingSentFor = null;
        heldSinceStats = 0;
        servedAt = null;
        seekingAt = null;
    }

    function disable(reason: string): void {
        autoDisabledReason = reason;
        deactivate();
        post({ type: "status", state: "disabled", reason });
    }

    function handleAnomaly(code: AnomalyCode, fatal: boolean): void {
        post({ type: "anomaly", code, fatal });
        if (fatal) {
            disable(code);
            return;
        }

        softAnomalies += 1;
        if (softAnomalies >= SOFT_ANOMALY_LIMIT) disable("tooManyAnomalies");
    }

    function traceOutcome(outcome: PrefetchOutcome): void {
        switch (outcome.kind) {
            case "ready":
                trace("prefetch-ready", `bytes=${outcome.bytes} ms=${outcome.ms}`);
                break;
            case "rejected":
                trace("prefetch-rejected", outcome.reason);
                break;
            case "blocked":
                trace("prefetch-blocked", `status=${outcome.status}`);
                break;
            case "failed":
                trace("prefetch-failed");
                break;
            case "aborted":
                trace("prefetch-aborted");
                break;
        }
    }

    function onPrefetchOutcome(outcome: PrefetchOutcome): void {
        traceOutcome(outcome);
        if (!isActive()) return;
        if (outcome.kind === "blocked") handleAnomaly("rateLimited", true);
        if (outcome.kind === "rejected") handleAnomaly("prefetchRejected", false);
    }

    function launchPrefetch(target: ArmTarget, source: PlayerRequestTemplate): void {
        const now = deps.now();
        prefetchStarts = [...prefetchStarts.filter((startedAt) => now - startedAt < PREFETCH_RATE_WINDOW_MS), now];

        const handle = startPrefetch(
            { realFetch: deps.realFetch, store, now: deps.now },
            {
                request: source.info.request,
                body: source.info.body,
                streamKey: source.info.streamKey,
                formatsKey: source.info.formatsKey,
                videoId: target.videoID
            },
            target.endMs
        );
        if (!handle) {
            handleAnomaly("noPlayerTime", false);
            return;
        }

        prefetchMeta.set(target.endMs, { startMs: target.startMs, videoID: target.videoID });
        trace("prefetch-start", `target=${target.endMs}`);
        void handle.done.then(onPrefetchOutcome);
    }

    function evaluatePrefetch(): void {
        if (!isActive() || armed === null || template === null) return;

        const shownVideo = probe.videoId();
        if (shownVideo !== null && shownVideo !== armed.videoID) {
            reportWait("videoMismatch");
            return;
        }

        const now = deps.now();
        const decision = decidePrefetch({
            enabled: true,
            targetStartSec: armed.startMs / MS_PER_SECOND,
            currentTimeSec: probe.currentTimeMs() / MS_PER_SECOND,
            playbackRate: probe.playbackRate(),
            bufferedEndSec: probe.bufferedEndSec(),
            baseRequestAgeMs: now - template.capturedAt,
            hasEntryForTarget: store.hasTarget(armed.endMs),
            recentPrefetchCount: prefetchStarts.filter((startedAt) => now - startedAt < PREFETCH_RATE_WINDOW_MS).length
        });
        if (decision.start === true) {
            lastWaitReason = null;
            launchPrefetch(armed, template);
        } else if (decision.start === false && decision.reason !== "alreadyHave") {
            reportWait(decision.reason);
        }
    }

    function setArmed(target: ArmTarget): void {
        // Requests held for a segment that starts elsewhere would otherwise wait for a skip that never comes.
        if (armed !== null && armed.startMs !== target.startMs) holds.releaseAll();

        armed = target;
        lastWaitReason = null;
        holdForced = false;
        evaluatePrefetch();
    }

    function disarm(): void {
        armed = null;
        holdForced = false;
        stallTimer = cancel(stallTimer);
        holds.releaseAll();
    }

    function bindSession(id: string, seq: number, wantEnabled: boolean): void {
        session = id;
        lastSeq = seq;
        resetRuntime();
        enabled = wantEnabled;
        post({ type: "ready" });
        if (autoDisabledReason !== null) post({ type: "status", state: "disabled", reason: autoDisabledReason });
    }

    function handleMessage(data: unknown): void {
        const message = parseToMainMessage(data);
        if (!message) return;

        if (message.type === "hello") {
            bindSession(message.session, message.seq, message.enabled);
            return;
        }
        if (message.session !== session || message.seq <= lastSeq) return;
        lastSeq = message.seq;

        switch (message.type) {
            case "setEnabled":
                enabled = message.enabled;
                if (!enabled) deactivate();
                break;
            case "arm":
                if (isActive()) setArmed(message.target);
                break;
            case "disarm":
                disarm();
                break;
            case "reset":
                resetRuntime();
                break;
        }
    }

    function flushStats(seekToPlayingMs: number | null): void {
        statsTimer = cancel(statsTimer);
        if (!pendingStats) return;

        post({ type: "stats", ...pendingStats, cacheHit: true, seekToPlayingMs, heldRequests: heldSinceStats });
        pendingStats = null;
        heldSinceStats = 0;
    }

    function onWatchdog(): void {
        watchdogTimer = null;
        if (probe.isPaused()) return;

        handleAnomaly("stallAfterCache", true);
        probe.kick();
    }

    /** Armed shortly after a skip served from the cache: the player must keep making progress. */
    function rearmWatchdog(): void {
        watchdogTimer = cancel(watchdogTimer);
        const recentlyServed = servedAt !== null && deps.now() - servedAt <= WATCHDOG_WINDOW_MS;
        if (!isActive() || !recentlyServed || probe.isPaused()) return;

        watchdogTimer = timers.set(onWatchdog, WATCHDOG_MS);
    }

    function onStallTimeout(): void {
        stallTimer = null;
        holds.releaseAll();
        armed = null;
        handleAnomaly("stallNoSkip", false);
    }

    function checkStall(): void {
        if (armed === null || holds.count() === 0 || stallTimer !== null) return;

        const startSec = armed.startMs / MS_PER_SECOND;
        const currentSec = probe.currentTimeMs() / MS_PER_SECOND;
        if (currentSec < startSec - STALL_ZONE_BEFORE_SEC || currentSec > startSec + STALL_ZONE_AFTER_SEC) return;

        stallTimer = timers.set(onStallTimeout, STALL_RELEASE_MS);
    }

    function onPlayerEvent(name: PlayerEventName): void {
        switch (name) {
            case "timeupdate":
                store.pruneBehind(probe.currentTimeMs());
                evaluatePrefetch();
                rearmWatchdog();
                break;
            case "playing": {
                evaluatePrefetch();
                rearmWatchdog();
                const mark = seekingAt ?? servedAt;
                seekingAt = null;
                if (pendingStats) flushStats(mark === null ? null : deps.now() - mark);
                break;
            }
            case "seeking":
                seekingAt = deps.now();
                stallTimer = cancel(stallTimer);
                // Forced holding was based on the buffer around the old position.
                holdForced = false;
                if (armed !== null) trace("buffer", `at-seek armed=${armed.startMs}-${armed.endMs} buffered=${probe.bufferedRanges()}`);
                break;
            case "seeked":
                evaluatePrefetch();
                rearmWatchdog();
                break;
            case "waiting":
                checkStall();
                break;
        }
    }

    const events: HookEvents = {
        onPlayerRequest(info) {
            if (!isActive()) return;

            if (info.playerTimeMs === null) {
                missingPlayerTimeStreak += 1;
                if (missingPlayerTimeStreak === NO_PLAYER_TIME_STREAK_LIMIT) handleAnomaly("noPlayerTime", true);
                return;
            }

            missingPlayerTimeStreak = 0;
            template = { info, capturedAt: deps.now() };
            evaluatePrefetch();
        },

        onCacheServed(info) {
            servedAt = deps.now();
            rearmWatchdog();

            const meta = prefetchMeta.get(info.targetMs);
            if (!meta) return;

            pendingStats = { ...meta, endMs: info.targetMs, prefetchBytes: info.bytes, prefetchMs: info.prefetchMs };
            statsTimer = cancel(statsTimer);
            statsTimer = timers.set(() => flushStats(null), STATS_TIMEOUT_MS);
        },

        onHeld() {
            heldSinceStats += 1;
            if (armed === null || shapingSentFor === armed.startMs) return;

            shapingSentFor = armed.startMs;
            post({ type: "shaping", videoID: armed.videoID, startMs: armed.startMs, mode: "hold" });
            trace("buffer", `at-hold head=${probe.currentTimeMs()} buffered=${probe.bufferedRanges()}`);
        },

        onTrace: trace,

        onFiltered(stats, segments) {
            if (stats.droppedSegments === 0) return;

            trace("filter", `dropped=${stats.droppedSegments} kept=${stats.keptSegments} bytes=${stats.droppedBytes}`);
            if (segments) {
                trace("filter-dropped", segments.dropped.join(","));
                trace("filter-kept", segments.kept.join(","));
            }
            if (stats.keptSegments === 0 && !holdForced) {
                holdForced = true;
                trace("hold-forced");
            }
        }
    };

    return {
        state: {
            isEnabled: isActive,
            armedStartMs: () => armed?.startMs ?? null,
            armedEndMs: () => armed?.endMs ?? null,
            isHoldForced: () => holdForced
        },
        events,
        handleMessage,
        onPlayerEvent,

        dispose() {
            enabled = false;
            deactivate();
        }
    };
}
