/*
 * Wires everything together in the page: replaces window.fetch with the hook, listens for
 * messages from the content script and for the player's media events.
 *
 * Takes a narrow description of the window so it can be tested with plain objects. Installing
 * twice (for instance after the extension was updated) disposes the previous copy first.
 */

import { SABR_PROTOCOL_VERSION, TO_CONTENT_SOURCE } from "../protocol";
import { PlayerEventName, createController } from "./controller";
import { createCacheStore } from "./cacheStore";
import { createFetchHook } from "./fetchHook";
import { createHoldRegistry, systemTimers } from "./holdRegistry";
import { ProbeDocument, createPlayerProbe } from "./playerProbe";

const SINGLETON_SLOT = Symbol.for("sponsorblock.sabrShaper");
const PLAYER_EVENTS: ReadonlyArray<PlayerEventName> = ["timeupdate", "playing", "seeking", "seeked", "waiting"];
const VIDEO_TAG = "VIDEO";

type MessageListener = (event: { readonly source: unknown; readonly data: unknown }) => void;
type MediaListener = (event: { readonly target: unknown }) => void;

export interface PageWindow {
    fetch: typeof fetch;
    readonly location: { readonly origin: string };
    readonly document: ProbeDocument & {
        addEventListener(type: string, listener: MediaListener, capture: boolean): void;
        removeEventListener(type: string, listener: MediaListener, capture: boolean): void;
    };
    addEventListener(type: "message", listener: MessageListener): void;
    removeEventListener(type: "message", listener: MessageListener): void;
    postMessage(message: unknown, targetOrigin: string): void;
}

interface Installed {
    dispose(): void;
}

const isVideo = (target: unknown): boolean =>
    typeof target === "object" && target !== null && (target as { tagName?: unknown }).tagName === VIDEO_TAG;

/** Returns a function that undoes the installation. */
export function installSabrShaper(win: PageWindow): () => void {
    const slots = win as unknown as Record<symbol, Installed | undefined>;
    slots[SINGLETON_SLOT]?.dispose();

    const originalFetch = win.fetch;
    const realFetch = originalFetch.bind(win);
    const realRequestFetch = (request: Request): Promise<Response> => realFetch(request);

    const store = createCacheStore({ now: () => Date.now() });
    const holds = createHoldRegistry({ realFetch: realRequestFetch });
    const probe = createPlayerProbe(win.document);
    const controller = createController({
        store,
        holds,
        probe,
        realFetch: realRequestFetch,
        post: (message) => win.postMessage(message, win.location.origin),
        now: () => Date.now(),
        timers: systemTimers
    });
    const hook = createFetchHook({ realFetch, state: controller.state, probe, store, holds, events: controller.events });

    const onMessage: MessageListener = (event) => {
        if (event.source === win) controller.handleMessage(event.data);
    };
    const mediaListeners = PLAYER_EVENTS.map((name) => {
        const listener: MediaListener = (event) => {
            if (isVideo(event.target)) controller.onPlayerEvent(name);
        };
        return { name, listener };
    });

    win.fetch = hook;
    win.addEventListener("message", onMessage);
    mediaListeners.forEach(({ name, listener }) => win.document.addEventListener(name, listener, true));

    let disposed = false;
    const installed: Installed = {
        dispose() {
            if (disposed) return;
            disposed = true;

            win.removeEventListener("message", onMessage);
            mediaListeners.forEach(({ name, listener }) => win.document.removeEventListener(name, listener, true));
            controller.dispose();
            if (win.fetch === hook) win.fetch = originalFetch;
            if (slots[SINGLETON_SLOT] === installed) delete slots[SINGLETON_SLOT];
        }
    };
    slots[SINGLETON_SLOT] = installed;

    win.postMessage(
        { source: TO_CONTENT_SOURCE, v: SABR_PROTOCOL_VERSION, session: null, type: "ready" },
        win.location.origin
    );

    return () => installed.dispose();
}
