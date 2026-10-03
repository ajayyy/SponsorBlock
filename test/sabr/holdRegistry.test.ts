import { createHoldRegistry } from "../../src/sabr/main/holdRegistry";
import { fakeTimers } from "./fixtures";

const URL = "https://rr3---sn-x.googlevideo.com/videoplayback?sabr=1";

function setup(maxHoldMs = 1000) {
    const fake = fakeTimers();
    const realFetch = jest.fn<Promise<Response>, [Request]>(() => Promise.resolve(new Response("real")));
    const registry = createHoldRegistry({ realFetch, timers: fake.timers, maxHoldMs });
    const makeRequest = (signal?: AbortSignal) => new Request(URL, { method: "POST", body: "x", signal });

    return { fake, realFetch, registry, makeRequest };
}

/** Lets pending promise callbacks run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("hold registry", () => {
    test("keeps a request pending without touching the network", async () => {
        const { registry, realFetch, makeRequest } = setup();
        let settled = false;

        registry.hold(makeRequest()).then(() => { settled = true; }, () => { settled = true; });
        await flush();

        expect(settled).toBe(false);
        expect(realFetch).not.toHaveBeenCalled();
        expect(registry.count()).toBe(1);
    });

    test("releasing sends the very same request and delivers its response", async () => {
        const { registry, realFetch, makeRequest } = setup();
        const request = makeRequest();
        const held = registry.hold(request);

        registry.releaseAll();
        const response = await held;

        expect(realFetch).toHaveBeenCalledTimes(1);
        expect(realFetch).toHaveBeenCalledWith(request);
        expect(await response.text()).toBe("real");
        expect(registry.count()).toBe(0);
    });

    test("releases every held request", async () => {
        const { registry, realFetch, makeRequest } = setup();
        const held = [registry.hold(makeRequest()), registry.hold(makeRequest()), registry.hold(makeRequest())];

        registry.releaseAll();
        await Promise.all(held);

        expect(realFetch).toHaveBeenCalledTimes(3);
    });

    test("passes a network failure on to the player", async () => {
        const { registry, realFetch, makeRequest } = setup();
        realFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
        const held = registry.hold(makeRequest());

        registry.releaseAll();

        await expect(held).rejects.toThrow("Failed to fetch");
    });

    test("counts holds since the last release", async () => {
        const { registry, makeRequest } = setup();

        registry.hold(makeRequest());
        registry.hold(makeRequest());
        expect(registry.totalSinceRelease()).toBe(2);

        registry.releaseAll();
        expect(registry.totalSinceRelease()).toBe(0);
        expect(registry.count()).toBe(0);
    });

    test("counts a request that was aborted while held", async () => {
        const { registry, makeRequest } = setup();
        const controller = new AbortController();
        registry.hold(makeRequest(controller.signal)).catch(() => undefined);

        controller.abort();
        await flush();

        expect(registry.count()).toBe(0);
        expect(registry.totalSinceRelease()).toBe(1);
    });
});

describe("hold registry: when the player gives up", () => {
    test("rejects with AbortError when the player aborts a held request", async () => {
        const { registry, realFetch, makeRequest } = setup();
        const controller = new AbortController();
        const held = registry.hold(makeRequest(controller.signal));

        controller.abort();

        await expect(held).rejects.toMatchObject({ name: "AbortError" });
        expect(realFetch).not.toHaveBeenCalled();
    });

    test("rejects immediately for a request that is already aborted", async () => {
        const { registry, realFetch, makeRequest } = setup();
        const controller = new AbortController();
        controller.abort();

        await expect(registry.hold(makeRequest(controller.signal))).rejects.toMatchObject({ name: "AbortError" });
        expect(registry.count()).toBe(0);
        expect(realFetch).not.toHaveBeenCalled();
    });

    test("does not send a request that was aborted before the release", async () => {
        const { registry, realFetch, makeRequest } = setup();
        const controller = new AbortController();
        registry.hold(makeRequest(controller.signal)).catch(() => undefined);
        controller.abort();

        registry.releaseAll();
        await flush();

        expect(realFetch).not.toHaveBeenCalled();
    });
});

describe("hold registry: the longest a request may wait", () => {
    test("releases a request on its own after the maximum hold time", async () => {
        const { registry, realFetch, fake, makeRequest } = setup(1000);
        const held = registry.hold(makeRequest());

        fake.advance(999);
        expect(realFetch).not.toHaveBeenCalled();

        fake.advance(1);
        await held;

        expect(realFetch).toHaveBeenCalledTimes(1);
        expect(registry.count()).toBe(0);
    });

    test("does not leave timers behind after a release or an abort", async () => {
        const { registry, fake, makeRequest } = setup();
        const controller = new AbortController();
        registry.hold(makeRequest()).catch(() => undefined);
        registry.hold(makeRequest(controller.signal)).catch(() => undefined);

        controller.abort();
        registry.releaseAll();
        await flush();

        expect(fake.pendingCount()).toBe(0);
    });
});
