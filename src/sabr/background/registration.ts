/*
 * Keeps the registration of the page-side SABR script in step with the experimental option.
 *
 * The script is registered as a dynamic content script that runs in the page's own context
 * only while the option is on. When the option is off nothing is registered, so the page is
 * left completely alone: there is no code to be disabled, because there is no code.
 */

export const FAST_SKIP_SCRIPT_ID = "sb-fast-skip-main";

const SCRIPT_FILE = "js/sabr.js";
const SCRIPT_MATCHES = ["https://www.youtube.com/*"];

export interface RegisteredScriptInfo {
    readonly id: string;
}

export interface ScriptDefinition {
    readonly id: string;
    readonly js: ReadonlyArray<string>;
    readonly matches: ReadonlyArray<string>;
    readonly runAt: "document_start";
    readonly allFrames: boolean;
    readonly world: "MAIN";
    readonly persistAcrossSessions: boolean;
}

/** The parts of chrome.scripting used here. */
export interface ScriptingApi {
    getRegisteredContentScripts(filter: { ids: string[] }): Promise<ReadonlyArray<RegisteredScriptInfo>>;
    registerContentScripts(scripts: ScriptDefinition[]): Promise<void>;
    unregisterContentScripts(filter: { ids: string[] }): Promise<void>;
}

export interface SyncOptions {
    /** The experimental option is on. */
    readonly enabled: boolean;
    /** The browser can run content scripts in the page's own context (Chromium). */
    readonly supported: boolean;
    readonly api: ScriptingApi | null;
    readonly log: (message: string) => void;
}

export type SyncOutcome = "registered" | "unregistered" | "unchanged" | "unsupported" | "failed";

const scriptDefinition = (): ScriptDefinition => ({
    id: FAST_SKIP_SCRIPT_ID,
    js: [SCRIPT_FILE],
    matches: SCRIPT_MATCHES,
    runAt: "document_start",
    allFrames: false,
    world: "MAIN",
    persistAcrossSessions: true
});

const describeError = (error: unknown): string => (error instanceof Error ? error.message : String(error));

async function isRegistered(api: ScriptingApi): Promise<boolean> {
    try {
        return (await api.getRegisteredContentScripts({ ids: [FAST_SKIP_SCRIPT_ID] })).length > 0;
    } catch {
        return false;
    }
}

/**
 * Updates run one after another: each reads the current registration and then changes it, so two
 * overlapping updates (the option switched on and straight off) would both read the old state.
 */
let pending: Promise<unknown> = Promise.resolve();

export function syncFastSkipRegistration(options: SyncOptions): Promise<SyncOutcome> {
    const result = pending.then(() => applyRegistration(options));
    pending = result.catch(() => undefined);
    return result;
}

async function applyRegistration({ enabled, supported, api, log }: SyncOptions): Promise<SyncOutcome> {
    if (!api) return "unsupported";
    // Even in an unsupported browser a leftover registration (e.g. synced settings) is cleaned up.
    if (enabled && !supported) return "unsupported";

    try {
        const registered = await isRegistered(api);

        if (enabled && !registered) {
            await api.registerContentScripts([scriptDefinition()]);
            return "registered";
        }
        if (!enabled && registered) {
            await api.unregisterContentScripts({ ids: [FAST_SKIP_SCRIPT_ID] });
            return "unregistered";
        }

        return "unchanged";
    } catch (error) {
        log(`[SB] Faster skipping: could not update the page script registration: ${describeError(error)}`);
        return "failed";
    }
}
