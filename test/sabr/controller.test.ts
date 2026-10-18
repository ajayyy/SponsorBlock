import { getPlayerTimeMs } from "../../src/sabr/core/sabrRequest";
import { TO_CONTENT_SOURCE, TO_MAIN_SOURCE, ToContentMessage } from "../../src/sabr/protocol";
import { createCacheStore } from "../../src/sabr/main/cacheStore";
import {
    NO_PLAYER_TIME_STREAK_LIMIT,
    SOFT_ANOMALY_LIMIT,
    STALL_RELEASE_MS,
    STATS_TIMEOUT_MS,
    WATCHDOG_MS,
    WATCHDOG_WINDOW_MS,
    createController
} from "../../src/sabr/main/controller";
import { createHoldRegistry } from "../../src/sabr/main/holdRegistry";
import { SAMPLE_VIDEO_ID, buildPrefetchResponse, buildSabrRequestBody, fakeTimers } from "./fixtures";

const URL = "https://rr3---sn-x.googlevideo.com/videoplayback?id=o-ABC&sabr=1&rn=5";
const UMP = "application/vnd.yt-ump";
const SESSION = "sess1";
const START_MS = 40000;
const END_MS = 150000;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const umpResponse = (bytes: Uint8Array): Response =>
    new Response(bytes, { status: 200, headers: { "content-type": UMP } });

function setup() {
    const fake = fakeTimers();
    const clock = { now: 1000 };
    const world = {
        currentTimeMs: 20000,
        bufferedEndSec: 41 as number | null,
        ranges: "0.0-41.0",
        playbackRate: 1,
        paused: false,
        videoId: SAMPLE_VIDEO_ID as string | null
    };
    const posted: ToContentMessage[] = [];
    const kick = jest.fn();
    const realFetch = jest.fn<Promise<Response>, [Request]>(() => Promise.resolve(umpResponse(buildPrefetchResponse(END_MS))));
    const store = createCacheStore({ now: () => clock.now });
    const holds = createHoldRegistry({ realFetch: (request) => realFetch(request), timers: fake.timers });
    const controller = createController({
        store,
        holds,
        probe: {
            currentTimeMs: () => world.currentTimeMs,
            bufferedEndSec: () => world.bufferedEndSec,
            bufferedRanges: () => world.ranges,
            isMainPlayer: () => true,
            playbackRate: () => world.playbackRate,
            isPaused: () => world.paused,
            videoId: () => world.videoId,
            kick
        },
        realFetch,
        post: (message) => { posted.push(message); },
        now: () => clock.now,
        timers: fake.timers
    });

    let seq = 0;
    const send = (body: Record<string, unknown>, session = SESSION) =>
        controller.handleMessage({ source: TO_MAIN_SOURCE, v: 1, session, seq: ++seq, ...body });
    const hello = (enabled = true, session = SESSION) => send({ type: "hello", enabled }, session);
    const target = (startMs = START_MS, endMs = END_MS) => ({ videoID: SAMPLE_VIDEO_ID, startMs, endMs, durationMs: 213000 });
    const arm = (startMs = START_MS, endMs = END_MS) => send({ type: "arm", target: target(startMs, endMs) });
    const playerRequest = (playerTimeMs = 20000) => {
        const body = buildSabrRequestBody({ playerTimeMs });
        controller.events.onPlayerRequest({
            request: new Request(URL, { method: "POST", body }),
            body,
            playerTimeMs,
            streamKey: "o-ABC",
            formatsKey: "251,400"
        });
    };
    const advance = (ms: number) => {
        clock.now += ms;
        fake.advance(ms);
    };
    const messages = (type: ToContentMessage["type"]) => posted.filter((message) => message.type === type);
    const holdOne = () => holds.hold(new Request(URL, { method: "POST", body: "x" })).catch(() => undefined);

    return { fake, clock, world, posted, kick, realFetch, store, holds, controller, send, hello, arm, target, playerRequest, advance, messages, holdOne };
}

describe("controller: handshake and sessions", () => {
    test("answers hello with ready for that session", () => {
        const { hello, posted } = setup();

        hello();

        expect(posted).toEqual([{ source: TO_CONTENT_SOURCE, v: 1, session: SESSION, type: "ready" }]);
    });

    test("follows the enabled flag from hello and setEnabled", () => {
        const { hello, send, controller } = setup();

        hello(false);
        expect(controller.state.isEnabled()).toBe(false);

        send({ type: "setEnabled", enabled: true });
        expect(controller.state.isEnabled()).toBe(true);
    });

    test("ignores everything before the handshake", () => {
        const { arm, controller } = setup();

        arm();

        expect(controller.state.armedStartMs()).toBeNull();
    });

    test("ignores messages from another session", () => {
        const { hello, send, controller, target } = setup();
        hello();

        send({ type: "arm", target: target() }, "intruder");

        expect(controller.state.armedStartMs()).toBeNull();
    });

    test("ignores stale or repeated sequence numbers", () => {
        const { hello, controller, target } = setup();
        hello();
        const arm = (seq: number, startMs: number) => controller.handleMessage({
            source: TO_MAIN_SOURCE, v: 1, session: SESSION, seq, type: "arm", target: target(startMs, startMs + 100000)
        });

        arm(50, 40000);
        arm(50, 60000);
        arm(10, 70000);

        expect(controller.state.armedStartMs()).toBe(40000);
    });

    test("a new hello takes over and starts from a clean slate", () => {
        const { hello, arm, controller, holds, holdOne, realFetch, posted } = setup();
        hello();
        arm();
        holdOne();

        hello(true, "sess2");

        expect(controller.state.armedStartMs()).toBeNull();
        expect(holds.count()).toBe(0);
        expect(realFetch).toHaveBeenCalledTimes(1);
        expect(posted[posted.length - 1]).toMatchObject({ session: "sess2", type: "ready" });
    });

    test("never throws on malformed input", () => {
        const { controller } = setup();

        expect(() => {
            controller.handleMessage(null);
            controller.handleMessage("hello");
            controller.handleMessage({ source: TO_MAIN_SOURCE });
        }).not.toThrow();
    });
});

describe("controller: arming and resetting", () => {
    test("arm and disarm drive the armed start", () => {
        const { hello, arm, send, controller } = setup();
        hello();

        arm();
        expect(controller.state.armedStartMs()).toBe(START_MS);

        send({ type: "disarm", reason: "noTarget" });
        expect(controller.state.armedStartMs()).toBeNull();
    });

    test("disarm sends held requests on their way", async () => {
        const { hello, arm, send, holds, holdOne, realFetch } = setup();
        hello();
        arm();
        holdOne();

        send({ type: "disarm", reason: "noTarget" });
        await flush();

        expect(holds.count()).toBe(0);
        expect(realFetch).toHaveBeenCalledTimes(1);
    });

    test("disarm keeps a finished prefetch for the request that follows the skip", async () => {
        const { hello, arm, playerRequest, send, store } = setup();
        hello();
        arm();
        playerRequest();
        await flush();

        send({ type: "disarm", reason: "noTarget" });

        expect(store.candidates()).toHaveLength(1);
    });

    test("reset forgets the target, the cache and held requests", async () => {
        const { hello, arm, playerRequest, send, store, holds, holdOne, controller } = setup();
        hello();
        arm();
        playerRequest();
        await flush();
        holdOne();

        send({ type: "reset", reason: "videoChange" });

        expect(controller.state.armedStartMs()).toBeNull();
        expect(store.size()).toBe(0);
        expect(holds.count()).toBe(0);
    });

    test("a target that starts elsewhere lets go of the requests held for the old one", async () => {
        const { hello, arm, holds, holdOne, realFetch } = setup();
        hello();
        arm();
        holdOne();
        holdOne();

        arm(60000, 170000);
        await flush();

        expect(holds.count()).toBe(0);
        expect(holds.totalSinceRelease()).toBe(0);
        expect(realFetch).toHaveBeenCalledTimes(2);
    });

    test("the same segment with a new end keeps holding", () => {
        const { hello, arm, holds, holdOne } = setup();
        hello();
        arm();
        holdOne();

        arm(START_MS, END_MS + 10000);

        expect(holds.count()).toBe(1);
        expect(holds.totalSinceRelease()).toBe(1);
    });

    test("switching the feature off releases and clears everything", async () => {
        const { hello, arm, playerRequest, send, store, holds, holdOne, controller } = setup();
        hello();
        arm();
        playerRequest();
        await flush();
        holdOne();

        send({ type: "setEnabled", enabled: false });

        expect(controller.state.isEnabled()).toBe(false);
        expect(controller.state.armedStartMs()).toBeNull();
        expect(store.size()).toBe(0);
        expect(holds.count()).toBe(0);
    });
});

describe("controller: starting a prefetch", () => {
    test("copies the player's request with the end of the segment as the position", async () => {
        const { hello, arm, playerRequest, realFetch, store } = setup();
        hello();
        arm();

        playerRequest();
        await flush();

        expect(realFetch).toHaveBeenCalledTimes(1);
        const sent = realFetch.mock.calls[0][0];
        expect(getPlayerTimeMs(new Uint8Array(await sent.arrayBuffer()))).toBe(END_MS);
        expect(store.candidates()).toMatchObject([{ targetMs: END_MS, ready: true }]);
    });

    test("waits for a request from the player to copy", async () => {
        const { hello, arm, playerRequest, realFetch } = setup();
        hello();

        arm();
        await flush();
        expect(realFetch).not.toHaveBeenCalled();

        playerRequest();
        await flush();
        expect(realFetch).toHaveBeenCalledTimes(1);
    });

    test("waits until the segment is close enough, then starts on the next time update", async () => {
        const { hello, arm, playerRequest, controller, world, realFetch } = setup();
        hello();
        arm();
        world.currentTimeMs = 0;
        playerRequest();
        await flush();
        expect(realFetch).not.toHaveBeenCalled();

        world.currentTimeMs = 25000;
        controller.onPlayerEvent("timeupdate");
        await flush();

        expect(realFetch).toHaveBeenCalledTimes(1);
    });

    test("starts only one prefetch per target", async () => {
        const { hello, arm, playerRequest, controller, realFetch } = setup();
        hello();
        arm();

        playerRequest();
        playerRequest();
        controller.onPlayerEvent("timeupdate");
        await flush();

        expect(realFetch).toHaveBeenCalledTimes(1);
    });

    test("does not prefetch while the feature is disabled", async () => {
        const { hello, arm, playerRequest, realFetch } = setup();
        hello(false);
        arm();

        playerRequest();
        await flush();

        expect(realFetch).not.toHaveBeenCalled();
    });

    test("does not prefetch when the player is showing a different video", async () => {
        const { hello, arm, playerRequest, world, realFetch } = setup();
        hello();
        arm();
        world.videoId = "AAAAAAAAAAA";

        playerRequest();
        await flush();

        expect(realFetch).not.toHaveBeenCalled();
    });

    test("tells the content script when the request cannot be rewritten", async () => {
        const { hello, arm, controller, messages, realFetch } = setup();
        hello();
        arm();

        controller.events.onPlayerRequest({
            request: new Request(URL, { method: "POST", body: "x" }),
            body: Uint8Array.from([0x0a, 0x7f]),
            playerTimeMs: 20000,
            streamKey: null,
            formatsKey: null
        });
        await flush();

        expect(realFetch).not.toHaveBeenCalled();
        expect(messages("anomaly")).toMatchObject([{ code: "noPlayerTime", fatal: false }]);
    });
});

describe("controller: requests that carry no player position", () => {
    const withoutPosition = (controller: ReturnType<typeof setup>["controller"]) => controller.events.onPlayerRequest({
        request: new Request(URL, { method: "POST", body: "x" }),
        body: Uint8Array.from([0x0a, 0x00]),
        playerTimeMs: null,
        streamKey: "o-ABC",
        formatsKey: null
    });

    test("never uses such a request as the template for a prefetch", async () => {
        const { hello, arm, playerRequest, controller, realFetch, world } = setup();
        hello();
        arm();
        world.currentTimeMs = 0;
        playerRequest(0);
        withoutPosition(controller);
        world.currentTimeMs = 25000;

        controller.onPlayerEvent("timeupdate");
        await flush();

        expect(realFetch).toHaveBeenCalledTimes(1);
        expect(getPlayerTimeMs(new Uint8Array(await realFetch.mock.calls[0][0].arrayBuffer()))).toBe(END_MS);
    });

    test("tolerates them when they come now and then, without any anomaly", () => {
        const { hello, playerRequest, controller, messages } = setup();
        hello();

        for (let round = 0; round < 5; round++) {
            for (let i = 0; i < NO_PLAYER_TIME_STREAK_LIMIT - 1; i++) withoutPosition(controller);
            playerRequest();
        }

        expect(controller.state.isEnabled()).toBe(true);
        expect(messages("anomaly")).toEqual([]);
    });

    test("switches the feature off when every request lacks a position, which means the protocol changed", () => {
        const { hello, controller, messages } = setup();
        hello();

        for (let i = 0; i < NO_PLAYER_TIME_STREAK_LIMIT; i++) withoutPosition(controller);

        expect(messages("anomaly")).toMatchObject([{ code: "noPlayerTime", fatal: true }]);
        expect(messages("status")).toMatchObject([{ state: "disabled" }]);
        expect(controller.state.isEnabled()).toBe(false);
    });
});

describe("controller: when the server objects", () => {
    test("shuts the feature down for the page after the server blocks a prefetch", async () => {
        const { hello, arm, playerRequest, realFetch, controller, store, messages } = setup();
        realFetch.mockResolvedValueOnce(new Response("", { status: 429 }));
        hello();
        arm();

        playerRequest();
        await flush();

        expect(messages("anomaly")).toMatchObject([{ code: "rateLimited", fatal: true }]);
        expect(messages("status")).toMatchObject([{ state: "disabled" }]);
        expect(controller.state.isEnabled()).toBe(false);
        expect(store.size()).toBe(0);
    });

    test("stays off even if the content script asks to turn it on again", async () => {
        const { hello, arm, playerRequest, realFetch, send, controller } = setup();
        realFetch.mockResolvedValueOnce(new Response("", { status: 403 }));
        hello();
        arm();
        playerRequest();
        await flush();

        send({ type: "setEnabled", enabled: true });

        expect(controller.state.isEnabled()).toBe(false);
    });

    test("tells a content script that reconnects that the feature is off", async () => {
        const { hello, arm, playerRequest, realFetch, messages } = setup();
        realFetch.mockResolvedValueOnce(new Response("", { status: 429 }));
        hello();
        arm();
        playerRequest();
        await flush();

        hello(true, "sess2");

        expect(messages("status")).toHaveLength(2);
    });

    test("tolerates a couple of rejected answers and then gives up", async () => {
        const { hello, arm, playerRequest, realFetch, controller, messages, world } = setup();
        realFetch.mockImplementation(() => Promise.resolve(umpResponse(buildPrefetchResponse(60000))));
        world.currentTimeMs = 30000;
        hello();

        for (let attempt = 0; attempt < SOFT_ANOMALY_LIMIT; attempt++) {
            arm(40000 + attempt * 1000, END_MS + attempt * 1000);
            playerRequest();
            await flush();
            expect(controller.state.isEnabled()).toBe(attempt < SOFT_ANOMALY_LIMIT - 1);
        }

        expect(messages("anomaly")).toHaveLength(SOFT_ANOMALY_LIMIT);
        expect(messages("status")).toMatchObject([{ state: "disabled" }]);
    });
});

describe("controller: explaining itself in the debug log", () => {
    const traces = (messages: ReturnType<typeof setup>["messages"]) =>
        (messages("trace") as Array<{ event: string; detail?: string }>).map((m) => (m.detail ? `${m.event} ${m.detail}` : m.event));

    test("says why a prefetch has not started yet, once per reason", () => {
        const { hello, arm, playerRequest, controller, world, messages } = setup();
        hello();
        arm();
        world.currentTimeMs = 0;
        world.bufferedEndSec = 30;
        playerRequest(0);
        controller.onPlayerEvent("timeupdate");

        world.currentTimeMs = 25000;
        controller.onPlayerEvent("timeupdate");
        controller.onPlayerEvent("timeupdate");

        expect(traces(messages)).toEqual(["prefetch-wait tooEarly", "prefetch-wait bufferLow"]);
    });

    test("says when the player shows a different video than the armed segment belongs to", () => {
        const { hello, arm, playerRequest, world, messages } = setup();
        hello();
        arm();
        world.videoId = "AAAAAAAAAAA";

        playerRequest();

        expect(traces(messages)).toEqual(["prefetch-wait videoMismatch"]);
    });

    test("traces the start of a prefetch and its result", async () => {
        const { hello, arm, playerRequest, messages, realFetch } = setup();
        const bytes = buildPrefetchResponse(END_MS);
        realFetch.mockResolvedValueOnce(umpResponse(bytes));
        hello();
        arm();

        playerRequest();
        await flush();

        expect(traces(messages)).toEqual([`prefetch-start target=${END_MS}`, expect.stringMatching(new RegExp(`^prefetch-ready bytes=${bytes.length} ms=\\d+$`))]);
    });

    test("traces why an answer was rejected", async () => {
        const { hello, arm, playerRequest, messages, realFetch } = setup();
        realFetch.mockResolvedValueOnce(umpResponse(buildPrefetchResponse(60000)));
        hello();
        arm();

        playerRequest();
        await flush();

        expect(traces(messages)).toContain("prefetch-rejected wrongPosition");
    });

    test("traces a failed download", async () => {
        const { hello, arm, playerRequest, messages, realFetch } = setup();
        realFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
        hello();
        arm();

        playerRequest();
        await flush();

        expect(traces(messages)).toContain("prefetch-failed");
    });

    test("traces a refusal by the server", async () => {
        const { hello, arm, playerRequest, messages, realFetch } = setup();
        realFetch.mockResolvedValueOnce(new Response("", { status: 429 }));
        hello();
        arm();

        playerRequest();
        await flush();

        expect(traces(messages)).toContain("prefetch-blocked status=429");
    });

    test("shows how much is buffered when requests start being held", () => {
        const { hello, arm, controller, world, messages } = setup();
        hello();
        arm();
        world.currentTimeMs = 39800;
        world.ranges = "0.0-46.2";

        controller.events.onHeld();
        controller.events.onHeld();

        expect(traces(messages)).toEqual(["buffer at-hold head=39800 buffered=0.0-46.2"]);
    });

    test("shows how much is buffered when the player seeks while a segment is armed", () => {
        const { hello, arm, controller, world, messages } = setup();
        hello();
        arm();
        world.ranges = "0.0-46.2|148.0-170.0";

        controller.onPlayerEvent("seeking");

        expect(traces(messages)).toEqual([`buffer at-seek armed=40000-${END_MS} buffered=0.0-46.2|148.0-170.0`]);
    });

    test("does not trace seeks while nothing is armed", () => {
        const { hello, controller, messages } = setup();
        hello();

        controller.onPlayerEvent("seeking");

        expect(traces(messages)).toEqual([]);
    });

    test("lists the segments a filtered answer lost and kept", () => {
        const { hello, arm, controller, messages } = setup();
        hello();
        arm();

        controller.events.onFiltered(
            { droppedSegments: 2, droppedBytes: 300, keptSegments: 2 },
            { dropped: ["i251#5@50001+10000", "i400#9@60000+6000"], kept: ["i400#7@36000+6000", "i251#4@40001+10000"] }
        );

        expect(traces(messages)).toEqual([
            "filter dropped=2 kept=2 bytes=300",
            "filter-dropped i251#5@50001+10000,i400#9@60000+6000",
            "filter-kept i400#7@36000+6000,i251#4@40001+10000"
        ]);
    });

    test("passes on the notes made by the fetch hook", () => {
        const { hello, controller, messages } = setup();
        hello();

        controller.events.onTrace("cache-miss", "d=0 ready=true formats=same");

        expect(traces(messages)).toEqual(["cache-miss d=0 ready=true formats=same"]);
    });

    test("keeps notes short enough to be accepted by the content script", () => {
        const { hello, controller, messages } = setup();
        hello();

        controller.events.onTrace("cache-miss", "x".repeat(500));

        expect(traces(messages)[0].length).toBeLessThanOrEqual("cache-miss ".length + 200);
    });
});

describe("controller: when filtering leaves an answer empty", () => {
    const traces = (messages: ReturnType<typeof setup>["messages"]) =>
        (messages("trace") as Array<{ event: string; detail?: string }>).map((m) => (m.detail ? `${m.event} ${m.detail}` : m.event));

    test("exposes where the armed segment ends", () => {
        const { hello, arm, controller } = setup();
        hello();

        expect(controller.state.armedEndMs()).toBeNull();
        arm();

        expect(controller.state.armedEndMs()).toBe(END_MS);
    });

    test("forces requests to be held and says so, because the player would otherwise ask again at once", () => {
        const { hello, arm, controller, messages } = setup();
        hello();
        arm();

        controller.events.onFiltered({ droppedSegments: 2, droppedBytes: 300, keptSegments: 0 });

        expect(controller.state.isHoldForced()).toBe(true);
        expect(traces(messages)).toEqual(["filter dropped=2 kept=0 bytes=300", "hold-forced"]);
    });

    test("does not force it while the answer still gave the player something to play", () => {
        const { hello, arm, controller, messages } = setup();
        hello();
        arm();

        controller.events.onFiltered({ droppedSegments: 2, droppedBytes: 300, keptSegments: 1 });

        expect(controller.state.isHoldForced()).toBe(false);
        expect(traces(messages)).toEqual(["filter dropped=2 kept=1 bytes=300"]);
    });

    test("says nothing about an answer from which nothing was removed", () => {
        const { hello, arm, controller, messages } = setup();
        hello();
        arm();

        controller.events.onFiltered({ droppedSegments: 0, droppedBytes: 0, keptSegments: 0 });

        expect(controller.state.isHoldForced()).toBe(false);
        expect(traces(messages)).toEqual([]);
    });

    test.each([
        ["a different segment is armed", (s: ReturnType<typeof setup>) => s.arm(60000, 170000)],
        ["the segment is disarmed", (s: ReturnType<typeof setup>) => s.send({ type: "disarm", reason: "noTarget" })],
        ["the page script is reset", (s: ReturnType<typeof setup>) => s.send({ type: "reset", reason: "videoChange" })],
        // The buffer the hold was based on says nothing about the position the viewer jumped to.
        ["the viewer seeks", (s: ReturnType<typeof setup>) => s.controller.onPlayerEvent("seeking")]
    ])("forgets the forced hold when %s", (_name, change) => {
        const context = setup();
        context.hello();
        context.arm();
        context.controller.events.onFiltered({ droppedSegments: 1, droppedBytes: 10, keptSegments: 0 });

        change(context);

        expect(context.controller.state.isHoldForced()).toBe(false);
    });
});

describe("controller: reporting to the content script", () => {
    test("announces that requests are being held, once per segment", () => {
        const { hello, arm, controller, messages } = setup();
        hello();
        arm();

        controller.events.onHeld();
        controller.events.onHeld();

        expect(messages("shaping")).toEqual([
            { source: TO_CONTENT_SOURCE, v: 1, session: SESSION, type: "shaping", videoID: SAMPLE_VIDEO_ID, startMs: START_MS, mode: "hold" }
        ]);

        arm(60000, 170000);
        controller.events.onHeld();
        expect(messages("shaping")).toHaveLength(2);
    });

    test("reports how long playback took to resume after a skip served from the cache", async () => {
        const { hello, arm, playerRequest, controller, clock, messages } = setup();
        hello();
        arm();
        playerRequest();
        await flush();
        controller.events.onHeld();
        controller.events.onHeld();

        clock.now = 5000;
        controller.onPlayerEvent("seeking");
        controller.events.onCacheServed({ targetMs: END_MS, bytes: 321, prefetchMs: 1200 });
        clock.now = 5082;
        controller.onPlayerEvent("playing");

        expect(messages("stats")).toEqual([
            {
                source: TO_CONTENT_SOURCE,
                v: 1,
                session: SESSION,
                type: "stats",
                videoID: SAMPLE_VIDEO_ID,
                startMs: START_MS,
                endMs: END_MS,
                prefetchBytes: 321,
                prefetchMs: 1200,
                cacheHit: true,
                seekToPlayingMs: 82,
                heldRequests: 2
            }
        ]);
    });

    test("reports the skip without a timing if playback never resumes", async () => {
        const { hello, arm, playerRequest, controller, world, advance, messages } = setup();
        hello();
        arm();
        playerRequest();
        await flush();
        world.paused = true;

        controller.events.onCacheServed({ targetMs: END_MS, bytes: 321, prefetchMs: 1200 });
        advance(STATS_TIMEOUT_MS);

        expect(messages("stats")).toMatchObject([{ seekToPlayingMs: null, cacheHit: true }]);
    });

    test("does not report stats for a cache hit it knows nothing about", () => {
        const { hello, controller, messages } = setup();
        hello();

        controller.events.onCacheServed({ targetMs: 999999, bytes: 1, prefetchMs: 1 });
        controller.onPlayerEvent("playing");

        expect(messages("stats")).toEqual([]);
    });
});

describe("controller: a held player that is never skipped", () => {
    const stalledSetup = () => {
        const context = setup();
        context.hello();
        context.arm();
        context.world.currentTimeMs = 40100;
        context.holdOne();
        return context;
    };

    test("lets the player carry on if it stalls at the segment but no skip follows", async () => {
        const { controller, advance, holds, realFetch, messages } = stalledSetup();

        controller.onPlayerEvent("waiting");
        advance(STALL_RELEASE_MS);
        await flush();

        expect(holds.count()).toBe(0);
        expect(realFetch).toHaveBeenCalledTimes(1);
        expect(controller.state.armedStartMs()).toBeNull();
        expect(messages("anomaly")).toMatchObject([{ code: "stallNoSkip", fatal: false }]);
    });

    test("does nothing if the skip arrives in time", () => {
        const { controller, advance, holds } = stalledSetup();

        controller.onPlayerEvent("waiting");
        controller.onPlayerEvent("seeking");
        advance(STALL_RELEASE_MS);

        expect(holds.count()).toBe(1);
    });

    test("ignores stalls well before the segment", () => {
        const { controller, advance, holds, world } = stalledSetup();
        world.currentTimeMs = 30000;

        controller.onPlayerEvent("waiting");
        advance(STALL_RELEASE_MS);

        expect(holds.count()).toBe(1);
    });

    test("ignores stalls when nothing is being held", () => {
        const { controller, advance, holds, messages } = stalledSetup();
        holds.releaseAll();

        controller.onPlayerEvent("waiting");
        advance(STALL_RELEASE_MS);

        expect(messages("anomaly")).toEqual([]);
    });
});

describe("controller: watching for a frozen player after a cache hit", () => {
    const servedSetup = async () => {
        const context = setup();
        context.hello();
        context.arm();
        context.playerRequest();
        await flush();
        context.controller.events.onCacheServed({ targetMs: END_MS, bytes: 321, prefetchMs: 1200 });
        return context;
    };

    test("shuts the feature down and nudges the player if it stops making progress", async () => {
        const { advance, kick, controller, messages } = await servedSetup();

        advance(WATCHDOG_MS);

        expect(messages("anomaly")).toMatchObject([{ code: "stallAfterCache", fatal: true }]);
        expect(controller.state.isEnabled()).toBe(false);
        expect(kick).toHaveBeenCalledTimes(1);
    });

    test("stays quiet while the player keeps reporting progress", async () => {
        const { advance, controller, kick } = await servedSetup();

        for (let step = 0; step < 4; step++) {
            advance(WATCHDOG_MS - 1000);
            controller.onPlayerEvent("timeupdate");
        }

        expect(kick).not.toHaveBeenCalled();
    });

    test("does not mistake a pause for a freeze", async () => {
        const { advance, world, kick } = await servedSetup();
        world.paused = true;

        advance(WATCHDOG_MS * 2);

        expect(kick).not.toHaveBeenCalled();
    });

    test("stops watching after the window has passed", async () => {
        const { advance, controller, kick } = await servedSetup();

        for (let elapsed = 0; elapsed <= WATCHDOG_WINDOW_MS; elapsed += 5000) {
            advance(5000);
            controller.onPlayerEvent("timeupdate");
        }
        advance(WATCHDOG_MS * 2);

        expect(kick).not.toHaveBeenCalled();
    });
});

describe("controller: housekeeping", () => {
    test("drops prefetched data once the playhead has moved well past it", async () => {
        const { hello, arm, playerRequest, controller, world, store } = setup();
        hello();
        arm();
        playerRequest();
        await flush();
        expect(store.size()).toBe(1);

        world.currentTimeMs = END_MS + 10000;
        controller.onPlayerEvent("timeupdate");

        expect(store.size()).toBe(0);
    });

    test("after dispose the feature is off, so a hook left in the chain lets everything through", () => {
        const { hello, controller } = setup();
        hello();
        expect(controller.state.isEnabled()).toBe(true);

        controller.dispose();

        expect(controller.state.isEnabled()).toBe(false);
    });

    test("dispose releases requests, clears the cache and leaves no timers running", async () => {
        const { hello, arm, playerRequest, controller, fake, holds, holdOne, store } = setup();
        hello();
        arm();
        playerRequest();
        await flush();
        holdOne();
        controller.events.onCacheServed({ targetMs: END_MS, bytes: 1, prefetchMs: 1 });

        controller.dispose();

        expect(holds.count()).toBe(0);
        expect(store.size()).toBe(0);
        expect(fake.pendingCount()).toBe(0);
    });
});
