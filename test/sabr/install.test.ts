import { SABR_PROTOCOL_VERSION, TO_CONTENT_SOURCE, TO_MAIN_SOURCE } from "../../src/sabr/protocol";
import { PageWindow, installSabrShaper } from "../../src/sabr/main/install";

type Listener = (event: never) => void;

function listenerMap() {
    const map = new Map<string, Set<Listener>>();
    return {
        add: (type: string, listener: Listener) => {
            map.set(type, (map.get(type) ?? new Set()).add(listener));
        },
        remove: (type: string, listener: Listener) => {
            map.get(type)?.delete(listener);
        },
        get: (type: string) => [...(map.get(type) ?? [])],
        count: () => [...map.values()].reduce((sum, set) => sum + set.size, 0)
    };
}

function fakeWindow() {
    const windowListeners = listenerMap();
    const documentListeners = listenerMap();
    const posted: Array<[unknown, string]> = [];
    const original = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>(() => Promise.resolve(new Response("original")));

    const win = {
        fetch: original as unknown as typeof fetch,
        location: { origin: "https://www.youtube.com" },
        document: {
            addEventListener: (type: string, listener: Listener) => documentListeners.add(type, listener),
            removeEventListener: (type: string, listener: Listener) => documentListeners.remove(type, listener),
            querySelector: () => null,
            getElementById: () => null
        },
        addEventListener: (type: string, listener: Listener) => windowListeners.add(type, listener),
        removeEventListener: (type: string, listener: Listener) => windowListeners.remove(type, listener),
        postMessage: (message: unknown, origin: string) => { posted.push([message, origin]); }
    };

    const deliver = (data: unknown, source: unknown = win) => {
        windowListeners.get("message").forEach((listener) => (listener as (event: unknown) => void)({ source, data }));
    };

    return { win: win as unknown as PageWindow, raw: win, original, posted, windowListeners, documentListeners, deliver };
}

describe("install: taking over fetch", () => {
    test("wraps window.fetch and still passes ordinary calls through", async () => {
        const { win, original } = fakeWindow();

        installSabrShaper(win);
        const response = await win.fetch("https://example.com/data.json");

        expect(win.fetch).not.toBe(original);
        expect(original).toHaveBeenCalledWith("https://example.com/data.json", undefined);
        expect(await response.text()).toBe("original");
    });

    test("puts the original fetch back on dispose", () => {
        const { win, original, windowListeners, documentListeners } = fakeWindow();

        const dispose = installSabrShaper(win);
        dispose();

        expect(win.fetch).toBe(original);
        expect(windowListeners.count()).toBe(0);
        expect(documentListeners.count()).toBe(0);
    });

    test("leaves fetch alone on dispose if somebody else wrapped it afterwards", () => {
        const { win } = fakeWindow();
        const dispose = installSabrShaper(win);
        const other = jest.fn() as unknown as typeof fetch;
        win.fetch = other;

        dispose();

        expect(win.fetch).toBe(other);
    });

    test("can be disposed more than once", () => {
        const { win } = fakeWindow();
        const dispose = installSabrShaper(win);

        dispose();

        expect(() => dispose()).not.toThrow();
    });

    test("a second install replaces the first and leaves a single set of listeners", () => {
        const { win, original, windowListeners, documentListeners } = fakeWindow();
        installSabrShaper(win);
        const afterFirst = windowListeners.count() + documentListeners.count();

        installSabrShaper(win);

        expect(windowListeners.count() + documentListeners.count()).toBe(afterFirst);
        expect(win.fetch).not.toBe(original);
    });
});

describe("install: talking to the content script", () => {
    test("announces itself before any handshake", () => {
        const { win, posted } = fakeWindow();

        installSabrShaper(win);

        expect(posted).toEqual([
            [{ source: TO_CONTENT_SOURCE, v: SABR_PROTOCOL_VERSION, session: null, type: "ready" }, "https://www.youtube.com"]
        ]);
    });

    test("answers a hello that arrives as a window message", () => {
        const { win, posted, deliver } = fakeWindow();
        installSabrShaper(win);

        deliver({ source: TO_MAIN_SOURCE, v: SABR_PROTOCOL_VERSION, session: "sess1", seq: 1, type: "hello", enabled: true });

        expect(posted[posted.length - 1]).toEqual([
            { source: TO_CONTENT_SOURCE, v: SABR_PROTOCOL_VERSION, session: "sess1", type: "ready" },
            "https://www.youtube.com"
        ]);
    });

    test("ignores messages that were not posted by the page itself", () => {
        const { win, posted, deliver } = fakeWindow();
        installSabrShaper(win);
        const before = posted.length;

        deliver({ source: TO_MAIN_SOURCE, v: SABR_PROTOCOL_VERSION, session: "sess1", seq: 1, type: "hello", enabled: true }, {});

        expect(posted).toHaveLength(before);
    });
});

describe("install: following the player", () => {
    const MEDIA_EVENTS = ["timeupdate", "playing", "seeking", "seeked", "waiting"];

    test("listens to the player's media events while capturing", () => {
        const { win, documentListeners } = fakeWindow();

        installSabrShaper(win);

        MEDIA_EVENTS.forEach((name) => expect(documentListeners.get(name)).toHaveLength(1));
    });

    test("ignores events from elements other than the video", () => {
        const { win, documentListeners } = fakeWindow();
        installSabrShaper(win);

        expect(() => {
            documentListeners.get("timeupdate").forEach((listener) => (listener as (event: unknown) => void)({ target: { tagName: "DIV" } }));
            documentListeners.get("timeupdate").forEach((listener) => (listener as (event: unknown) => void)({ target: null }));
        }).not.toThrow();
    });

    test("passes video events on without failing", () => {
        const { win, documentListeners } = fakeWindow();
        installSabrShaper(win);

        expect(() => {
            MEDIA_EVENTS.forEach((name) => documentListeners.get(name).forEach(
                (listener) => (listener as (event: unknown) => void)({ target: { tagName: "VIDEO" } })
            ));
        }).not.toThrow();
    });
});
