/*
 * Keeps player requests "on hold": the promise stays pending and nothing is sent, so the
 * player waits as if on a very slow connection. A held request is either
 *  - released: the very same request is sent for real, or
 *  - aborted by the player itself (it does so when the user seeks or the video changes).
 */

/** No request is ever held longer than this, whatever else happens. */
export const MAX_HOLD_MS = 10 * 60 * 1000;

export interface Timers {
    set(callback: () => void, ms: number): unknown;
    clear(handle: unknown): void;
}

export interface HoldRegistryDeps {
    readonly realFetch: (request: Request) => Promise<Response>;
    readonly timers?: Timers;
    readonly maxHoldMs?: number;
}

export interface HoldRegistry {
    hold(request: Request): Promise<Response>;
    /** Sends every held request for real. */
    releaseAll(): void;
    /** Requests currently being held. */
    count(): number;
    /** Requests held since the last release; the strategy uses it as a safety valve. */
    totalSinceRelease(): number;
}

export const systemTimers: Timers = {
    set: (callback, ms) => setTimeout(callback, ms),
    clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)
};

/** The rejection `fetch` itself produces when its signal is aborted. */
export const abortError = (): DOMException => new DOMException("The operation was aborted.", "AbortError");

export function createHoldRegistry(deps: HoldRegistryDeps): HoldRegistry {
    const timers = deps.timers ?? systemTimers;
    const maxHoldMs = deps.maxHoldMs ?? MAX_HOLD_MS;
    const releasers = new Set<() => void>();
    let total = 0;

    function hold(request: Request): Promise<Response> {
        total += 1;

        return new Promise<Response>((resolve, reject) => {
            const { signal } = request;
            if (signal.aborted) {
                reject(abortError());
                return;
            }

            const finish = (): void => {
                releasers.delete(release);
                timers.clear(timer);
                signal.removeEventListener("abort", onAbort);
            };
            const release = (): void => {
                finish();
                deps.realFetch(request).then(resolve, reject);
            };
            const onAbort = (): void => {
                finish();
                reject(abortError());
            };

            signal.addEventListener("abort", onAbort, { once: true });
            const timer = timers.set(release, maxHoldMs);
            releasers.add(release);
        });
    }

    return {
        hold,

        releaseAll() {
            const pending = [...releasers];
            total = 0;
            pending.forEach((release) => release());
        },

        count: () => releasers.size,
        totalSinceRelease: () => total
    };
}
