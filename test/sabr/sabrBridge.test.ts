import { ShapingDecision } from "../../src/sabr/content/skipTarget";
import { PAGE_SCRIPT_TIMEOUT_MS, createSabrBridge } from "../../src/sabr/content/sabrBridge";
import {
    SABR_PROTOCOL_VERSION,
    TO_CONTENT_SOURCE,
    TO_MAIN_SOURCE,
    ToMainMessage,
    parseToMainMessage
} from "../../src/sabr/protocol";
import { SAMPLE_VIDEO_ID, fakeTimers } from "./fixtures";

const SESSION = "session1";
const ORIGIN = "https://www.youtube.com";

const armDecision = (startMs = 40000, endMs = 150000): ShapingDecision => ({
    kind: "arm",
    target: { videoID: SAMPLE_VIDEO_ID, startMs, endMs, durationMs: 213000 }
});
const disarmDecision = (reason: "noTarget" | "ad" = "noTarget"): ShapingDecision => ({ kind: "disarm", reason });

function setup(enabledAtStart = true) {
    const fake = fakeTimers();
    const listeners = new Set<(event: { source: unknown; data: unknown }) => void>();
    const sent: ToMainMessage[] = [];
    const win = {
        location: { origin: ORIGIN },
        addEventListener: (_type: "message", listener: (event: { source: unknown; data: unknown }) => void) => { listeners.add(listener); },
        removeEventListener: (_type: "message", listener: (event: { source: unknown; data: unknown }) => void) => { listeners.delete(listener); },
        postMessage: (message: unknown, origin: string) => {
            expect(origin).toBe(ORIGIN);
            const parsed = parseToMainMessage(message);
            if (parsed) sent.push(parsed);
        }
    };
    const log = { debug: jest.fn(), warn: jest.fn() };
    const bridge = createSabrBridge({ win, newSessionId: () => SESSION, log, timers: fake.timers });

    const fromMain = (body: Record<string, unknown>, source: unknown = win) => {
        listeners.forEach((listener) => listener({
            source,
            data: { source: TO_CONTENT_SOURCE, v: SABR_PROTOCOL_VERSION, session: SESSION, ...body }
        }));
    };
    const connect = () => fromMain({ type: "ready" });
    const types = () => sent.map((message) => message.type);

    bridge.init(enabledAtStart);

    return { bridge, sent, log, fake, listeners, fromMain, connect, types };
}

describe("bridge: handshake", () => {
    test("greets the page script right away when the option is on", () => {
        const { sent } = setup();

        expect(sent).toEqual([
            { source: TO_MAIN_SOURCE, v: SABR_PROTOCOL_VERSION, session: SESSION, seq: 1, type: "hello", enabled: true }
        ]);
    });

    test("stays silent while the option is off", () => {
        const { sent, bridge } = setup(false);

        bridge.update(armDecision());

        expect(sent).toEqual([]);
        expect(bridge.isActive()).toBe(false);
    });

    test("greets again when the page script announces itself later", () => {
        const { sent, fromMain } = setup();

        fromMain({ type: "ready", session: null });

        expect(sent.filter((message) => message.type === "hello")).toHaveLength(2);
    });

    test("does not greet an announcing page script while the option is off", () => {
        const { sent, fromMain } = setup(false);

        fromMain({ type: "ready", session: null });

        expect(sent).toEqual([]);
    });

    test("warns once if the page script never answers", () => {
        const { log, fake } = setup();

        fake.advance(PAGE_SCRIPT_TIMEOUT_MS);

        expect(log.warn).toHaveBeenCalledTimes(1);
        expect(log.warn).toHaveBeenCalledWith(expect.stringContaining("not present"));
    });

    test("does not warn once the page script has answered", () => {
        const { log, fake, connect } = setup();

        connect();
        fake.advance(PAGE_SCRIPT_TIMEOUT_MS);

        expect(log.warn).not.toHaveBeenCalled();
    });

    test("ignores messages that did not come from the page itself or belong to another session", () => {
        const { bridge, sent, fromMain } = setup();

        fromMain({ type: "ready" }, {});
        fromMain({ type: "ready", session: "other" });
        bridge.update(armDecision());

        expect(sent.map((message) => message.type)).toEqual(["hello"]);
    });
});

describe("bridge: sending decisions", () => {
    test("holds a decision back until the page script has answered, then sends it", () => {
        const { bridge, types, connect } = setup();

        bridge.update(armDecision());
        expect(types()).toEqual(["hello"]);

        connect();
        expect(types()).toEqual(["hello", "arm"]);
    });

    test("sends only the latest decision made before the answer", () => {
        const { bridge, sent, connect } = setup();

        bridge.update(armDecision(40000, 150000));
        bridge.update(armDecision(60000, 170000));
        connect();

        const arms = sent.filter((message) => message.type === "arm");
        expect(arms).toHaveLength(1);
        expect(arms[0]).toMatchObject({ target: { startMs: 60000, endMs: 170000 } });
    });

    test("sends the target and the reason as decided", () => {
        const { bridge, sent, connect } = setup();
        connect();

        bridge.update(armDecision());
        bridge.update(disarmDecision("ad"));

        expect(sent.slice(1)).toMatchObject([
            { type: "arm", target: { videoID: SAMPLE_VIDEO_ID, startMs: 40000, endMs: 150000, durationMs: 213000 } },
            { type: "disarm", reason: "ad" }
        ]);
    });

    test("does not repeat a decision it has already sent", () => {
        const { bridge, types, connect } = setup();
        connect();

        bridge.update(armDecision());
        bridge.update(armDecision());
        bridge.update(disarmDecision());
        bridge.update(disarmDecision("ad"));

        expect(types()).toEqual(["hello", "arm", "disarm"]);
    });

    test("sends a changed target", () => {
        const { bridge, types, connect } = setup();
        connect();

        bridge.update(armDecision(40000, 150000));
        bridge.update(armDecision(60000, 170000));

        expect(types()).toEqual(["hello", "arm", "arm"]);
    });

    test("numbers its messages in strictly increasing order", () => {
        const { bridge, sent, connect } = setup();
        connect();

        bridge.update(armDecision());
        bridge.update(disarmDecision());
        bridge.update(armDecision(60000, 170000));

        const seqs = sent.map((message) => message.seq);
        expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
        expect(new Set(seqs).size).toBe(seqs.length);
    });
});

describe("bridge: turning the option on and off", () => {
    test("tells a connected page script when the option is switched off and stops sending", () => {
        const { bridge, sent, types, connect } = setup();
        connect();

        bridge.setEnabled(false);
        bridge.update(armDecision());

        expect(sent[sent.length - 1]).toMatchObject({ type: "setEnabled", enabled: false });
        expect(types().filter((type) => type === "arm")).toHaveLength(0);
        expect(bridge.isActive()).toBe(false);
    });

    test("tells a connected page script when the option is switched back on, and resends the target", () => {
        const { bridge, sent, connect } = setup();
        connect();
        bridge.update(armDecision());
        bridge.setEnabled(false);

        bridge.setEnabled(true);
        bridge.update(armDecision());

        expect(sent.filter((message) => message.type === "setEnabled")).toMatchObject([{ enabled: false }, { enabled: true }]);
        expect(sent.filter((message) => message.type === "arm")).toHaveLength(2);
    });

    test("greets the page script when switched on before it was ever connected", () => {
        const { bridge, sent } = setup(false);

        bridge.setEnabled(true);

        expect(sent).toMatchObject([{ type: "hello", enabled: true }]);
    });
});

describe("bridge: resetting and shutting down", () => {
    test("resets the page script and forgets what it has sent", () => {
        const { bridge, sent, connect } = setup();
        connect();
        bridge.update(armDecision());

        bridge.reset("videoChange");
        bridge.update(armDecision());

        expect(sent.map((message) => message.type)).toEqual(["hello", "arm", "reset", "arm"]);
        expect(sent[2]).toMatchObject({ reason: "videoChange" });
    });

    test("does not send a reset before the page script has answered", () => {
        const { bridge, types } = setup();

        bridge.reset("videoChange");

        expect(types()).toEqual(["hello"]);
    });

    test("dispose tells the page script to clean up and stops listening", () => {
        const { bridge, sent, listeners, connect } = setup();
        connect();

        bridge.dispose();

        expect(sent[sent.length - 1]).toMatchObject({ type: "reset", reason: "cleanup" });
        expect(listeners.size).toBe(0);
    });

    test("dispose can be called twice and leaves no timers behind", () => {
        const { bridge, fake } = setup();

        bridge.dispose();

        expect(() => bridge.dispose()).not.toThrow();
        expect(fake.pendingCount()).toBe(0);
    });
});

describe("bridge: what the page script reports", () => {
    test("stops sending once the page script has switched itself off", () => {
        const { bridge, types, log, fromMain, connect } = setup();
        connect();

        fromMain({ type: "status", state: "disabled", reason: "rateLimited" });
        bridge.update(armDecision());

        expect(types()).toEqual(["hello"]);
        expect(bridge.isActive()).toBe(false);
        expect(log.warn).toHaveBeenCalledWith(expect.stringContaining("rateLimited"));
    });

    test("logs anomalies, skip statistics and shaping for debugging", () => {
        const { log, fromMain, connect } = setup();
        connect();

        fromMain({ type: "anomaly", code: "prefetchRejected", fatal: false });
        fromMain({ type: "anomaly", code: "stallAfterCache", fatal: true });
        fromMain({
            type: "stats",
            videoID: SAMPLE_VIDEO_ID,
            startMs: 40000,
            endMs: 150000,
            prefetchBytes: 321,
            prefetchMs: 1200,
            cacheHit: true,
            seekToPlayingMs: 82,
            heldRequests: 4
        });
        fromMain({ type: "shaping", videoID: SAMPLE_VIDEO_ID, startMs: 40000, mode: "hold" });

        expect(log.debug).toHaveBeenCalledWith(expect.stringContaining("prefetchRejected"));
        expect(log.warn).toHaveBeenCalledWith(expect.stringContaining("stallAfterCache"));
        expect(log.debug).toHaveBeenCalledWith(expect.stringContaining("82"));
        expect(log.debug).toHaveBeenCalledWith(expect.stringContaining("hold"));
    });

    test("logs the page script's traces so a failed skip can be explained from the debug log", () => {
        const { log, fromMain, connect } = setup();
        connect();

        fromMain({ type: "trace", event: "prefetch-start", detail: "target=730508" });
        fromMain({ type: "trace", event: "cache-miss" });

        expect(log.debug).toHaveBeenCalledWith(expect.stringContaining("prefetch-start target=730508"));
        expect(log.debug).toHaveBeenCalledWith(expect.stringContaining("cache-miss"));
    });

    test("ignores malformed messages", () => {
        const { fromMain, log } = setup();

        expect(() => fromMain({ type: "teleport" })).not.toThrow();
        expect(log.warn).not.toHaveBeenCalled();
    });
});

describe("bridge: frames it was never started in", () => {
    test("neither greets nor waits for an answer when the option is switched on before init", () => {
        const fake = fakeTimers();
        const win = {
            location: { origin: ORIGIN },
            addEventListener: jest.fn(),
            removeEventListener: jest.fn(),
            postMessage: jest.fn()
        };
        const log = { debug: jest.fn(), warn: jest.fn() };
        const bridge = createSabrBridge({ win, newSessionId: () => SESSION, log, timers: fake.timers });

        bridge.setEnabled(true);
        fake.advance(PAGE_SCRIPT_TIMEOUT_MS * 2);

        expect(win.postMessage).not.toHaveBeenCalled();
        expect(log.warn).not.toHaveBeenCalled();
    });
});
