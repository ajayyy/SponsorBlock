import { FILTER_GUARD_MS } from "../../src/sabr/core/strategy";
import { AWAIT_PREFETCH_TIMEOUT_MS, createFetchHook } from "../../src/sabr/main/fetchHook";
import { createCacheStore } from "../../src/sabr/main/cacheStore";
import { createHoldRegistry } from "../../src/sabr/main/holdRegistry";
import {
    SAMPLE_VIDEO_ID,
    buildSabrRequestBody,
    concatBytes,
    fakeTimers,
    fieldLen,
    fieldVarint,
    umpProtectionOk,
    umpSegment
} from "./fixtures";

const URL = "https://rr3---sn-x.googlevideo.com/videoplayback?id=o-ABC&sabr=1&rn=5";
const UMP = "application/vnd.yt-ump";
const TARGET_MS = 150000;
const CACHED_BODY = Uint8Array.from([9, 8, 7, 6, 5]);

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup() {
    const fake = fakeTimers();
    const clock = { now: 1000 };
    const world = {
        enabled: true,
        holdForced: false,
        armedEndMs: 150000 as number | null,
        armedStartMs: null as number | null,
        currentTimeMs: 30000,
        bufferedEndSec: 41 as number | null,
        isMainPlayer: true
    };
    const realFetch = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>(() => Promise.resolve(new Response("network")));
    const store = createCacheStore({ now: () => clock.now });
    const holds = createHoldRegistry({ realFetch: (request) => realFetch(request), timers: fake.timers });
    const events = {
        onPlayerRequest: jest.fn(),
        onCacheServed: jest.fn(),
        onHeld: jest.fn(),
        onTrace: jest.fn(),
        onFiltered: jest.fn()
    };
    const hook = createFetchHook({
        realFetch,
        state: {
            isEnabled: () => world.enabled,
            armedStartMs: () => world.armedStartMs,
            armedEndMs: () => world.armedEndMs,
            isHoldForced: () => world.holdForced
        },
        probe: {
            currentTimeMs: () => world.currentTimeMs,
            bufferedEndSec: () => world.bufferedEndSec,
            isMainPlayer: () => world.isMainPlayer
        },
        store,
        holds,
        events,
        timers: fake.timers
    });

    const sabrRequest = (playerTimeMs: number, body?: Uint8Array, init: RequestInit = {}) =>
        new Request(URL, { method: "POST", body: body ?? buildSabrRequestBody({ playerTimeMs }), ...init });

    const prefetched = (options: { ready: boolean; formatsKey?: string }) => {
        const handle = store.reserve({
            targetMs: TARGET_MS,
            streamKey: "o-ABC",
            formatsKey: options.formatsKey ?? "251,400",
            abort: jest.fn()
        });
        if (options.ready) handle.resolve(CACHED_BODY, UMP, 1200);
        return handle;
    };

    return { world, realFetch, store, holds, events, hook, sabrRequest, prefetched, fake };
}

describe("fetch hook: requests it must not touch", () => {
    test("passes a plain URL straight through", async () => {
        const { hook, realFetch, events } = setup();

        await hook("https://example.com/data.json");

        expect(realFetch).toHaveBeenCalledWith("https://example.com/data.json", undefined);
        expect(events.onPlayerRequest).not.toHaveBeenCalled();
    });

    test("passes a request made with init options straight through", async () => {
        const { hook, realFetch, events, sabrRequest } = setup();
        const request = sabrRequest(30000);
        const init = { keepalive: true };

        await hook(request, init);

        expect(realFetch).toHaveBeenCalledWith(request, init);
        expect(events.onPlayerRequest).not.toHaveBeenCalled();
    });

    test("passes other requests straight through", async () => {
        const { hook, realFetch, events } = setup();
        const request = new Request("https://www.youtube.com/youtubei/v1/next", { method: "POST", body: "{}" });

        await hook(request);

        expect(realFetch).toHaveBeenCalledWith(request, undefined);
        expect(events.onPlayerRequest).not.toHaveBeenCalled();
    });

    test("does not even read the request while disabled", async () => {
        const { hook, realFetch, world, events, sabrRequest } = setup();
        world.enabled = false;
        const request = sabrRequest(30000);

        await hook(request);

        expect(realFetch).toHaveBeenCalledWith(request, undefined);
        expect(request.bodyUsed).toBe(false);
        expect(events.onPlayerRequest).not.toHaveBeenCalled();
    });

    test("sends the request on unchanged when the observer fails", async () => {
        const { hook, realFetch, events, sabrRequest } = setup();
        events.onPlayerRequest.mockImplementation(() => {
            throw new Error("observer broke");
        });
        const request = sabrRequest(30000);

        const response = await hook(request);

        expect(realFetch).toHaveBeenCalledWith(request, undefined);
        expect(await response.text()).toBe("network");
    });

    test("sends the request on unchanged when reading the player state fails", async () => {
        const { hook, realFetch, world, sabrRequest } = setup();
        Object.defineProperty(world, "currentTimeMs", {
            get() {
                throw new Error("player went away");
            }
        });
        const request = sabrRequest(30000);

        await hook(request);

        expect(realFetch).toHaveBeenCalledWith(request, undefined);
    });

    test("still reports a failure of the real request itself", async () => {
        const { hook, realFetch, sabrRequest } = setup();
        realFetch.mockRejectedValueOnce(new TypeError("network down"));

        await expect(hook(sabrRequest(30000))).rejects.toThrow("network down");
        expect(realFetch).toHaveBeenCalledTimes(1);
    });
});

describe("fetch hook: observing the player's requests", () => {
    test("reports what the request says and still sends the original untouched", async () => {
        const { hook, realFetch, events, sabrRequest } = setup();
        const request = sabrRequest(30000);

        const response = await hook(request);

        expect(await response.text()).toBe("network");
        expect(realFetch).toHaveBeenCalledWith(request, undefined);
        expect(request.bodyUsed).toBe(false);
        expect(events.onPlayerRequest).toHaveBeenCalledTimes(1);
        const info = events.onPlayerRequest.mock.calls[0][0];
        expect(info).toMatchObject({ playerTimeMs: 30000, streamKey: "o-ABC", formatsKey: "251,400" });
        expect(info.body).toEqual(buildSabrRequestBody({ playerTimeMs: 30000 }));
        expect(info.request).not.toBe(request);
        expect(info.request.bodyUsed).toBe(false);
    });

    test("reports a request whose player time is missing, without a position, and lets it through", async () => {
        const { hook, realFetch, events, sabrRequest } = setup();
        const request = sabrRequest(0, concatBytes(fieldLen(1, fieldVarint(13, 1))));

        await hook(request);

        expect(events.onPlayerRequest).toHaveBeenCalledTimes(1);
        expect(events.onPlayerRequest.mock.calls[0][0]).toMatchObject({ playerTimeMs: null });
        expect(realFetch).toHaveBeenCalledWith(request, undefined);
    });

    test("falls back to the network when the request body cannot be read", async () => {
        const { hook, realFetch, events } = setup();
        const request = new Request(URL, { method: "POST", body: "x" });
        jest.spyOn(request, "clone").mockImplementation(() => { throw new TypeError("locked"); });

        await hook(request);

        expect(realFetch).toHaveBeenCalledWith(request, undefined);
        expect(events.onPlayerRequest).not.toHaveBeenCalled();
    });
});

describe("fetch hook: answering from the cache after a skip", () => {
    test("serves a ready prefetch instead of going to the network", async () => {
        const { hook, realFetch, events, prefetched, sabrRequest } = setup();
        prefetched({ ready: true });

        const response = await hook(sabrRequest(TARGET_MS));

        expect(realFetch).not.toHaveBeenCalled();
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe(UMP);
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(CACHED_BODY);
        expect(events.onCacheServed).toHaveBeenCalledWith({ targetMs: TARGET_MS, bytes: 5, prefetchMs: 1200 });
    });

    test("serves each prefetch only once", async () => {
        const { hook, realFetch, prefetched, sabrRequest } = setup();
        prefetched({ ready: true });

        await hook(sabrRequest(TARGET_MS));
        await hook(sabrRequest(TARGET_MS));

        expect(realFetch).toHaveBeenCalledTimes(1);
    });

    test("ignores a prefetch made for other formats", async () => {
        const { hook, realFetch, events, prefetched, sabrRequest } = setup();
        prefetched({ ready: true, formatsKey: "251,401" });

        await hook(sabrRequest(TARGET_MS));

        expect(realFetch).toHaveBeenCalledTimes(1);
        expect(events.onCacheServed).not.toHaveBeenCalled();
        expect(events.onTrace).toHaveBeenCalledWith("cache-miss", expect.stringContaining("formats=differs(251,401|251,400)"));
    });

    test("stays quiet about misses when nothing is cached", async () => {
        const { hook, events, sabrRequest } = setup();

        await hook(sabrRequest(TARGET_MS));

        expect(events.onTrace).not.toHaveBeenCalledWith("cache-miss", expect.anything());
    });

    test("does not call a request that was served from the cache a miss", async () => {
        const { hook, events, prefetched, sabrRequest } = setup();
        prefetched({ ready: true });

        await hook(sabrRequest(TARGET_MS));

        expect(events.onTrace).not.toHaveBeenCalledWith("cache-miss", expect.anything());
    });

    test("ignores the cache for requests that do not come from the main player", async () => {
        const { hook, realFetch, world, prefetched, sabrRequest } = setup();
        prefetched({ ready: true });
        world.isMainPlayer = false;

        await hook(sabrRequest(TARGET_MS));

        expect(realFetch).toHaveBeenCalledTimes(1);
    });

    test("ignores the cache for a position far from the prefetched one", async () => {
        const { hook, realFetch, prefetched, sabrRequest } = setup();
        prefetched({ ready: true });

        await hook(sabrRequest(TARGET_MS + 60000));

        expect(realFetch).toHaveBeenCalledTimes(1);
    });
});

describe("fetch hook: waiting for a prefetch that is still downloading", () => {
    test("holds the player's request until the prefetch finishes, then serves it", async () => {
        const { hook, realFetch, store, prefetched, sabrRequest } = setup();
        const handle = prefetched({ ready: false });
        let result: Response | null = null;
        hook(sabrRequest(TARGET_MS)).then((response) => { result = response; });

        await flush();
        expect(result).toBeNull();

        handle.resolve(CACHED_BODY, UMP, 800);
        await flush();

        expect(result).not.toBeNull();
        expect(new Uint8Array(await (result as unknown as Response).arrayBuffer())).toEqual(CACHED_BODY);
        expect(realFetch).not.toHaveBeenCalled();
        expect(store.candidates()[0].used).toBe(true);
    });

    test("goes to the network if the prefetch fails", async () => {
        const { hook, realFetch, prefetched, sabrRequest } = setup();
        const handle = prefetched({ ready: false });
        const pending = hook(sabrRequest(TARGET_MS));

        handle.fail();
        const response = await pending;

        expect(await response.text()).toBe("network");
        expect(realFetch).toHaveBeenCalledTimes(1);
    });

    test("goes to the network if the prefetch takes too long", async () => {
        const { hook, realFetch, prefetched, sabrRequest, fake } = setup();
        prefetched({ ready: false });
        const pending = hook(sabrRequest(TARGET_MS));
        await flush();

        fake.advance(AWAIT_PREFETCH_TIMEOUT_MS);
        const response = await pending;

        expect(await response.text()).toBe("network");
        expect(realFetch).toHaveBeenCalledTimes(1);
    });

    test("cancels a prefetch that took too long, so the same data is not downloaded twice", async () => {
        const { hook, store, sabrRequest, fake } = setup();
        const abort = jest.fn();
        store.reserve({ targetMs: TARGET_MS, streamKey: "o-ABC", formatsKey: "251,400", abort });
        const pending = hook(sabrRequest(TARGET_MS));
        await flush();

        fake.advance(AWAIT_PREFETCH_TIMEOUT_MS);
        await pending;

        expect(abort).toHaveBeenCalledTimes(1);
        expect(store.size()).toBe(0);
    });

    test("rejects like fetch does when the player aborts while waiting", async () => {
        const { hook, realFetch, prefetched, sabrRequest, fake } = setup();
        prefetched({ ready: false });
        const controller = new AbortController();
        const pending = hook(sabrRequest(TARGET_MS, undefined, { signal: controller.signal }));
        await flush();

        controller.abort();

        await expect(pending).rejects.toMatchObject({ name: "AbortError" });
        expect(realFetch).not.toHaveBeenCalled();
        expect(fake.pendingCount()).toBe(0);
    });
});

describe("fetch hook: removing skipped segments from answers", () => {
    const kept = [umpProtectionOk(), umpSegment({ headerId: 1, videoId: SAMPLE_VIDEO_ID, itag: 400, sequence: 7, startMs: 36000, durationMs: 6000 })];
    const dropped = [
        umpSegment({ headerId: 2, videoId: SAMPLE_VIDEO_ID, itag: 251, sequence: 5, startMs: 50001, durationMs: 10000 }),
        umpSegment({ headerId: 3, videoId: SAMPLE_VIDEO_ID, itag: 400, sequence: 9, startMs: 60000, durationMs: 6000 })
    ];
    const answer = () => new Response(concatBytes(...kept, ...dropped), { status: 200, headers: { "content-type": UMP } });

    const shortBuffer = (world: ReturnType<typeof setup>["world"]) => {
        world.armedStartMs = 40000;
        world.bufferedEndSec = 35;
    };

    test("removes the segments inside the skipped range, keeping the rest in order", async () => {
        const { hook, realFetch, world, sabrRequest } = setup();
        shortBuffer(world);
        realFetch.mockResolvedValueOnce(answer());

        const response = await hook(sabrRequest(30000));

        expect(new Uint8Array(await response.arrayBuffer())).toEqual(concatBytes(...kept));
    });

    test("passes the status and content type of the answer on", async () => {
        const { hook, realFetch, world, sabrRequest } = setup();
        shortBuffer(world);
        realFetch.mockResolvedValueOnce(answer());

        const response = await hook(sabrRequest(30000));

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe(UMP);
    });

    test("reports what it removed once the whole answer has been read", async () => {
        const { hook, realFetch, world, events, sabrRequest } = setup();
        shortBuffer(world);
        realFetch.mockResolvedValueOnce(answer());

        const response = await hook(sabrRequest(30000));
        expect(events.onFiltered).not.toHaveBeenCalled();
        await response.arrayBuffer();

        expect(events.onFiltered).toHaveBeenCalledWith(
            { droppedSegments: 2, droppedBytes: dropped[0].length + dropped[1].length, keptSegments: 1 },
            { dropped: ["i251#5@50001+10000", "i400#9@60000+6000"], kept: ["i400#7@36000+6000"] }
        );
    });

    test("explains what it did with each request made before an armed segment", async () => {
        const { hook, world, events, sabrRequest } = setup();
        shortBuffer(world);

        await hook(sabrRequest(30000));

        expect(events.onTrace).toHaveBeenCalledWith(
            "request",
            `pt=30000 head=30000 buf=35 armed=40000-150000 -> filter ${40000 + FILTER_GUARD_MS}-150000`
        );
    });

    test("describes a held request in the same way", async () => {
        const { hook, world, events, sabrRequest } = setup();
        world.armedStartMs = 40000;
        world.bufferedEndSec = 41;
        hook(sabrRequest(30000)).catch(() => undefined);

        await flush();

        expect(events.onTrace).toHaveBeenCalledWith("request", "pt=30000 head=30000 buf=41 armed=40000-150000 -> hold");
    });

    test("also traces requests made while nothing is armed, so an unprotected request is visible", async () => {
        const { hook, events, sabrRequest } = setup();

        await hook(sabrRequest(30000));

        expect(events.onTrace).toHaveBeenCalledWith("request", "pt=30000 head=30000 buf=41 armed=none -> pass:noTarget");
    });

    test("does not trace requests whose position is unknown", async () => {
        const { hook, events, sabrRequest } = setup();

        await hook(sabrRequest(0, concatBytes(fieldLen(1, fieldVarint(13, 1)))));

        expect(events.onTrace).not.toHaveBeenCalled();
    });

    test("keeps a segment starting within the guard after the start of the segment", async () => {
        const { hook, realFetch, world, sabrRequest } = setup();
        shortBuffer(world);
        const nearStart = umpSegment({ headerId: 1, videoId: SAMPLE_VIDEO_ID, itag: 251, sequence: 5, startMs: 40001, durationMs: 10000 });
        realFetch.mockResolvedValueOnce(new Response(nearStart, { status: 200, headers: { "content-type": UMP } }));

        const response = await hook(sabrRequest(30000));

        expect(new Uint8Array(await response.arrayBuffer())).toEqual(nearStart);
    });

    test("leaves an answer that is not UMP alone", async () => {
        const { hook, realFetch, world, events, sabrRequest } = setup();
        shortBuffer(world);
        realFetch.mockResolvedValueOnce(new Response("plain", { status: 200, headers: { "content-type": "text/plain" } }));

        const response = await hook(sabrRequest(30000));

        expect(await response.text()).toBe("plain");
        expect(events.onFiltered).not.toHaveBeenCalled();
    });

    test("leaves an error answer alone", async () => {
        const { hook, realFetch, world, sabrRequest } = setup();
        shortBuffer(world);
        const failure = new Response("boom", { status: 500, headers: { "content-type": UMP } });
        realFetch.mockResolvedValueOnce(failure);

        const response = await hook(sabrRequest(30000));

        expect(response).toBe(failure);
    });

    test("holds instead of filtering once the player has buffered past the start", async () => {
        const { hook, realFetch, world, sabrRequest } = setup();
        world.armedStartMs = 40000;
        world.bufferedEndSec = 41;
        hook(sabrRequest(30000)).catch(() => undefined);

        await flush();

        expect(realFetch).not.toHaveBeenCalled();
    });

    test("holds even with a short buffer once filtering has left an answer empty", async () => {
        const { hook, realFetch, world, sabrRequest } = setup();
        shortBuffer(world);
        world.holdForced = true;
        hook(sabrRequest(30000)).catch(() => undefined);

        await flush();

        expect(realFetch).not.toHaveBeenCalled();
    });
});

describe("fetch hook: holding requests before a segment", () => {
    test("holds a request once the buffer has run past the segment start", async () => {
        const { hook, realFetch, world, holds, events, sabrRequest } = setup();
        world.armedStartMs = 40000;
        const request = sabrRequest(30000);
        let settled = false;
        hook(request).then(() => { settled = true; }, () => { settled = true; });

        await flush();

        expect(settled).toBe(false);
        expect(realFetch).not.toHaveBeenCalled();
        expect(events.onHeld).toHaveBeenCalledTimes(1);
        expect(holds.count()).toBe(1);
    });

    test("sends the very same request for real when the hold is released", async () => {
        const { hook, realFetch, world, holds, sabrRequest } = setup();
        world.armedStartMs = 40000;
        const request = sabrRequest(30000);
        const pending = hook(request);
        await flush();

        holds.releaseAll();
        const response = await pending;

        expect(await response.text()).toBe("network");
        expect(realFetch).toHaveBeenCalledWith(request);
    });

    test("does not hold while the buffer is still short of the segment", async () => {
        const { hook, realFetch, world, sabrRequest } = setup();
        world.armedStartMs = 40000;
        world.bufferedEndSec = 35;

        await hook(sabrRequest(30000));

        expect(realFetch).toHaveBeenCalledTimes(1);
    });

    test("does not hold anything when no segment is armed", async () => {
        const { hook, realFetch, sabrRequest } = setup();

        await hook(sabrRequest(30000));

        expect(realFetch).toHaveBeenCalledTimes(1);
    });

    test("rejects a held request when the player aborts it", async () => {
        const { hook, realFetch, world, sabrRequest } = setup();
        world.armedStartMs = 40000;
        const controller = new AbortController();
        const pending = hook(sabrRequest(30000, undefined, { signal: controller.signal }));
        await flush();

        controller.abort();

        await expect(pending).rejects.toMatchObject({ name: "AbortError" });
        expect(realFetch).not.toHaveBeenCalled();
    });

    test("still reports a held request to the controller", async () => {
        const { hook, world, events, sabrRequest } = setup();
        world.armedStartMs = 40000;
        hook(sabrRequest(30000)).catch(() => undefined);

        await flush();

        expect(events.onPlayerRequest).toHaveBeenCalledTimes(1);
    });
});
