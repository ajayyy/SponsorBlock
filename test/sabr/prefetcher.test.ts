import { getPlayerTimeMs } from "../../src/sabr/core/sabrRequest";
import { createCacheStore } from "../../src/sabr/main/cacheStore";
import { MAX_PREFETCH_BYTES, PrefetchBase, startPrefetch } from "../../src/sabr/main/prefetcher";
import { SAMPLE_VIDEO_ID, buildPrefetchResponse, buildSabrRequestBody } from "./fixtures";

const URL = "https://rr3---sn-x.googlevideo.com/videoplayback?id=o-ABC&sabr=1&rn=5";
const TARGET_MS = 150000;
const UMP = "application/vnd.yt-ump";

const umpResponse = (bytes: Uint8Array, init: ResponseInit = {}): Response =>
    new Response(bytes, { status: 200, headers: { "content-type": UMP }, ...init });

function setup(options: { maxBytes?: number } = {}) {
    const clock = { now: 1000 };
    const store = createCacheStore({ now: () => clock.now });
    const bodyBytes = buildSabrRequestBody({ playerTimeMs: 30000 });
    const request = new Request(URL, { method: "POST", body: bodyBytes, headers: { "x-test": "1" } });
    const base: PrefetchBase = {
        request,
        body: bodyBytes,
        streamKey: "o-ABC",
        formatsKey: "251,400",
        videoId: SAMPLE_VIDEO_ID
    };
    const realFetch = jest.fn<Promise<Response>, [Request]>(() => Promise.resolve(umpResponse(buildPrefetchResponse(TARGET_MS))));
    const deps = { realFetch, store, now: () => clock.now, ...options };

    return { clock, store, base, realFetch, deps };
}

describe("startPrefetch: the request it sends", () => {
    test("asks for the target position using the player's own request settings", async () => {
        const { base, deps, realFetch } = setup();

        const handle = startPrefetch(deps, base, TARGET_MS);
        await handle?.done;

        expect(realFetch).toHaveBeenCalledTimes(1);
        const sent = realFetch.mock.calls[0][0];
        expect(sent.method).toBe("POST");
        expect(sent.url).toBe(URL);
        expect(sent.headers.get("x-test")).toBe("1");
        expect(getPlayerTimeMs(new Uint8Array(await sent.arrayBuffer()))).toBe(TARGET_MS);
    });

    test("does not share the player's abort signal, so the player cancelling its own request cannot kill it", async () => {
        const { base, deps, realFetch } = setup();

        await startPrefetch(deps, base, TARGET_MS)?.done;

        expect(realFetch.mock.calls[0][0].signal).not.toBe(base.request.signal);
    });

    test("leaves the player's request and body untouched", async () => {
        const { base, deps } = setup();
        const bodySnapshot = Uint8Array.from(base.body);

        await startPrefetch(deps, base, TARGET_MS)?.done;

        expect(base.request.bodyUsed).toBe(false);
        expect(base.body).toEqual(bodySnapshot);
    });

    test("does nothing when the player's request has no player time to rewrite", () => {
        const { base, deps, realFetch, store } = setup();

        const handle = startPrefetch(deps, { ...base, body: Uint8Array.from([0x0a, 0x7f]) }, TARGET_MS);

        expect(handle).toBeNull();
        expect(realFetch).not.toHaveBeenCalled();
        expect(store.size()).toBe(0);
    });

    test("leaves no stuck entry behind when the request cannot be built", () => {
        const { base, deps, realFetch, store } = setup();
        const unusable = { ...base, request: {} as unknown as Request };

        const handle = startPrefetch(deps, unusable, TARGET_MS);

        expect(handle).toBeNull();
        expect(realFetch).not.toHaveBeenCalled();
        expect(store.size()).toBe(0);
    });
});

describe("startPrefetch: a good answer", () => {
    test("is stored as a ready entry and reported with its size and duration", async () => {
        const { base, deps, store, clock, realFetch } = setup();
        const expected = buildPrefetchResponse(TARGET_MS);
        realFetch.mockImplementationOnce(async () => {
            clock.now += 1500;
            return umpResponse(expected);
        });

        const handle = startPrefetch(deps, base, TARGET_MS);
        const outcome = await handle?.done;

        expect(outcome).toEqual({ kind: "ready", bytes: expected.length, ms: 1500 });
        expect(store.candidates()).toHaveLength(1);
        expect(store.candidates()[0]).toMatchObject({ id: handle?.id, targetMs: TARGET_MS, ready: true });
        expect(store.take(handle?.id as string)?.body).toEqual(expected);
    });

    test("is registered with the stream and format keys of the request it was made from", async () => {
        const { base, deps, store } = setup();

        await startPrefetch(deps, base, TARGET_MS)?.done;

        expect(store.candidates()[0]).toMatchObject({ streamKey: "o-ABC", formatsKey: "251,400" });
    });

    test("is visible as downloading while the request is in flight", async () => {
        const { base, deps, store, realFetch } = setup();
        let finish: (response: Response) => void = () => undefined;
        realFetch.mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }));

        const handle = startPrefetch(deps, base, TARGET_MS);

        expect(store.candidates()[0]).toMatchObject({ ready: false });
        finish(umpResponse(buildPrefetchResponse(TARGET_MS)));
        await handle?.done;
        expect(store.candidates()[0]).toMatchObject({ ready: true });
    });
});

describe("startPrefetch: answers that must not be used", () => {
    test.each([403, 429])("treats HTTP %i as the server blocking us", async (status) => {
        const { base, deps, store, realFetch } = setup();
        realFetch.mockResolvedValueOnce(umpResponse(new Uint8Array(0), { status }));

        const outcome = await startPrefetch(deps, base, TARGET_MS)?.done;

        expect(outcome).toEqual({ kind: "blocked", status });
        expect(store.size()).toBe(0);
    });

    test("rejects other error statuses", async () => {
        const { base, deps, store, realFetch } = setup();
        realFetch.mockResolvedValueOnce(umpResponse(new Uint8Array(0), { status: 500 }));

        const outcome = await startPrefetch(deps, base, TARGET_MS)?.done;

        expect(outcome).toEqual({ kind: "rejected", reason: "status" });
        expect(store.size()).toBe(0);
    });

    test("rejects an answer that is not UMP", async () => {
        const { base, deps, store, realFetch } = setup();
        realFetch.mockResolvedValueOnce(new Response("<html>", { status: 200, headers: { "content-type": "text/html" } }));

        const outcome = await startPrefetch(deps, base, TARGET_MS)?.done;

        expect(outcome).toEqual({ kind: "rejected", reason: "contentType" });
        expect(store.size()).toBe(0);
    });

    test("rejects an answer that fails validation and says why", async () => {
        const { base, deps, store, realFetch } = setup();
        realFetch.mockResolvedValueOnce(umpResponse(buildPrefetchResponse(TARGET_MS, "AAAAAAAAAAA")));

        const outcome = await startPrefetch(deps, base, TARGET_MS)?.done;

        expect(outcome).toEqual({ kind: "rejected", reason: "wrongVideo" });
        expect(store.size()).toBe(0);
    });

    test("rejects an answer that starts at the wrong position", async () => {
        const { base, deps, realFetch } = setup();
        realFetch.mockResolvedValueOnce(umpResponse(buildPrefetchResponse(60000)));

        const outcome = await startPrefetch(deps, base, TARGET_MS)?.done;

        expect(outcome).toEqual({ kind: "rejected", reason: "wrongPosition" });
    });

    test("gives up on an answer larger than the limit and stops downloading it", async () => {
        const { base, deps, store, realFetch } = setup({ maxBytes: 100 });
        const cancelled = jest.fn();
        const chunks = [new Uint8Array(60), new Uint8Array(60), new Uint8Array(60)];
        const stream = new ReadableStream<Uint8Array>({
            pull(controller) {
                const chunk = chunks.shift();
                if (chunk) controller.enqueue(chunk);
                else controller.close();
            },
            cancel: cancelled
        });
        realFetch.mockResolvedValueOnce(new Response(stream, { status: 200, headers: { "content-type": UMP } }));

        const outcome = await startPrefetch(deps, base, TARGET_MS)?.done;

        expect(outcome).toEqual({ kind: "rejected", reason: "tooLarge" });
        expect(cancelled).toHaveBeenCalled();
        expect(store.size()).toBe(0);
    });

    test("has a generous default limit", () => {
        expect(MAX_PREFETCH_BYTES).toBe(32 * 1024 * 1024);
    });
});

describe("startPrefetch: failures", () => {
    test("reports a network error without throwing", async () => {
        const { base, deps, store, realFetch } = setup();
        realFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

        const outcome = await startPrefetch(deps, base, TARGET_MS)?.done;

        expect(outcome).toEqual({ kind: "failed" });
        expect(store.size()).toBe(0);
    });

    test("reports a cancelled download as aborted", async () => {
        const { base, deps, store, realFetch } = setup();
        realFetch.mockImplementationOnce((request) => new Promise<Response>((_resolve, reject) => {
            request.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }));

        const handle = startPrefetch(deps, base, TARGET_MS);
        store.clear();
        const outcome = await handle?.done;

        expect(outcome).toEqual({ kind: "aborted" });
        expect(store.size()).toBe(0);
    });
});
