/*
 * The content-script end of the conversation with the page-side SABR script.
 *
 * It owns the session, performs the handshake, sends the decision of what to prepare for
 * (never repeating one it already sent) and logs what the page script reports back. If the page
 * script is absent or switches itself off, the bridge simply goes quiet: skipping works as before.
 */

import {
    DisarmReason,
    ResetReason,
    SABR_PROTOCOL_VERSION,
    TO_MAIN_SOURCE,
    ToContentMessage,
    ToMainMessage,
    parseToContentMessage
} from "../protocol";
import type { Timers } from "../main/holdRegistry";
import type { ShapingDecision } from "./skipTarget";

/** How long to wait for the page script to answer before saying it is not there. */
export const PAGE_SCRIPT_TIMEOUT_MS = 5000;

type MessageListener = (event: { readonly source: unknown; readonly data: unknown }) => void;

export interface BridgeWindow {
    readonly location: { readonly origin: string };
    addEventListener(type: "message", listener: MessageListener): void;
    removeEventListener(type: "message", listener: MessageListener): void;
    postMessage(message: unknown, targetOrigin: string): void;
}

export interface BridgeDeps {
    readonly win: BridgeWindow;
    readonly newSessionId: () => string;
    readonly log: {
        debug(message: string): void;
        warn(message: string): void;
    };
    readonly timers: Timers;
}

export interface SabrBridge {
    /** Starts listening; greets the page script if the option is on. */
    init(enabled: boolean): void;
    setEnabled(enabled: boolean): void;
    /** On, and the page script has not switched itself off. */
    isActive(): boolean;
    update(decision: ShapingDecision): void;
    reset(reason: ResetReason): void;
    dispose(): void;
}

type MessageBody = ToMainMessage extends infer M ? (M extends unknown ? Omit<M, "source" | "v" | "session" | "seq"> : never) : never;

const signatureOf = (decision: ShapingDecision): string => {
    if (decision.kind === "disarm") return "disarm";

    const { videoID, startMs, endMs, durationMs } = decision.target;
    return `arm:${videoID}:${startMs}:${endMs}:${durationMs}`;
};

export function createSabrBridge(deps: BridgeDeps): SabrBridge {
    const { win, log, timers } = deps;

    let session: string | null = null;
    let enabled = false;
    let connected = false;
    let pageScriptDisabled = false;
    let seq = 0;
    let lastSignature: string | null = null;
    let pending: ShapingDecision | null = null;
    let timeoutHandle: unknown = null;
    let disposed = false;

    const isActive = (): boolean => enabled && !pageScriptDisabled;

    function post(body: MessageBody): void {
        if (session === null) return;

        seq += 1;
        win.postMessage({ source: TO_MAIN_SOURCE, v: SABR_PROTOCOL_VERSION, session, seq, ...body }, win.location.origin);
    }

    function stopWaiting(): void {
        if (timeoutHandle !== null) timers.clear(timeoutHandle);
        timeoutHandle = null;
    }

    function sendHello(): void {
        // Without a session the bridge was never started in this frame: nobody could answer.
        if (session === null) return;

        connected = false;
        post({ type: "hello", enabled });

        stopWaiting();
        timeoutHandle = timers.set(() => {
            timeoutHandle = null;
            log.warn("[SB] Faster skipping: page script not present (reload the YouTube tab after changing the option)");
        }, PAGE_SCRIPT_TIMEOUT_MS);
    }

    function send(decision: ShapingDecision): void {
        const signature = signatureOf(decision);
        if (signature === lastSignature) return;

        lastSignature = signature;
        if (decision.kind === "arm") post({ type: "arm", target: decision.target });
        else post({ type: "disarm", reason: decision.reason as DisarmReason });
    }

    function describe(message: ToContentMessage): void {
        switch (message.type) {
            case "status":
                if (message.state === "disabled") {
                    pageScriptDisabled = true;
                    log.warn(`[SB] Faster skipping switched itself off for this page: ${message.reason ?? "unknown reason"}`);
                } else {
                    log.debug("[SB] Faster skipping: SABR traffic seen");
                }
                break;
            case "anomaly":
                (message.fatal ? log.warn : log.debug)(`[SB] Faster skipping anomaly: ${message.code}${message.detail ? ` (${message.detail})` : ""}`);
                break;
            case "stats":
                log.debug(`[SB] Faster skipping: skip ${message.startMs}-${message.endMs} ms resumed in ${message.seekToPlayingMs ?? "unknown"} ms, `
                    + `prefetched ${message.prefetchBytes} bytes in ${message.prefetchMs} ms, ${message.heldRequests} requests held`);
                break;
            case "shaping":
                log.debug(`[SB] Faster skipping: ${message.mode} requests before ${message.startMs} ms`);
                break;
            case "trace":
                log.debug(`[SB] Faster skipping trace: ${message.event}${message.detail ? ` ${message.detail}` : ""}`);
                break;
            default:
                break;
        }
    }

    const onMessage: MessageListener = (event) => {
        if (event.source !== win) return;

        const message = parseToContentMessage(event.data);
        if (!message) return;

        if (message.type === "ready" && message.session === null) {
            // The page script has just started (or restarted): introduce ourselves.
            if (enabled) sendHello();
            return;
        }
        if (message.session !== session) return;

        if (message.type === "ready") {
            connected = true;
            stopWaiting();
            log.debug("[SB] Faster skipping: page script connected");
            if (pending) send(pending);
            return;
        }

        describe(message);
    };

    return {
        init(enabledAtStart) {
            session = deps.newSessionId();
            enabled = enabledAtStart;
            win.addEventListener("message", onMessage);
            if (enabled) sendHello();
        },

        setEnabled(next) {
            enabled = next;
            if (next) {
                if (connected) post({ type: "setEnabled", enabled: true });
                else sendHello();
                return;
            }

            if (connected) post({ type: "setEnabled", enabled: false });
            lastSignature = null;
            pending = null;
        },

        isActive,

        update(decision) {
            if (!isActive()) return;

            pending = decision;
            if (connected) send(decision);
        },

        reset(reason) {
            lastSignature = null;
            pending = null;
            if (connected) post({ type: "reset", reason });
        },

        dispose() {
            if (disposed) return;
            disposed = true;

            if (connected) post({ type: "reset", reason: "cleanup" });
            win.removeEventListener("message", onMessage);
            stopWaiting();
        }
    };
}
