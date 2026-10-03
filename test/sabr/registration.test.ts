import {
    FAST_SKIP_SCRIPT_ID,
    ScriptingApi,
    syncFastSkipRegistration
} from "../../src/sabr/background/registration";

function setup(options: { registered?: boolean } = {}) {
    let registered = options.registered ?? false;
    const api = {
        getRegisteredContentScripts: jest.fn(() => Promise.resolve(registered ? [{ id: FAST_SKIP_SCRIPT_ID }] : [])),
        registerContentScripts: jest.fn(() => { registered = true; return Promise.resolve(); }),
        unregisterContentScripts: jest.fn(() => { registered = false; return Promise.resolve(); })
    };
    const log = jest.fn();
    const sync = (enabled: boolean, overrides: { supported?: boolean; api?: ScriptingApi | null } = {}) =>
        syncFastSkipRegistration({
            enabled,
            supported: overrides.supported ?? true,
            api: overrides.api === undefined ? api : overrides.api,
            log
        });

    return { api, log, sync };
}

describe("syncFastSkipRegistration: turning the feature on", () => {
    test("registers the page script when it is not registered yet", async () => {
        const { api, sync } = setup();

        const outcome = await sync(true);

        expect(outcome).toBe("registered");
        expect(api.registerContentScripts).toHaveBeenCalledTimes(1);
        expect(api.registerContentScripts).toHaveBeenCalledWith([
            {
                id: FAST_SKIP_SCRIPT_ID,
                js: ["js/sabr.js"],
                matches: ["https://www.youtube.com/*"],
                runAt: "document_start",
                allFrames: false,
                world: "MAIN",
                persistAcrossSessions: true
            }
        ]);
    });

    test("leaves an existing registration alone", async () => {
        const { api, sync } = setup({ registered: true });

        const outcome = await sync(true);

        expect(outcome).toBe("unchanged");
        expect(api.registerContentScripts).not.toHaveBeenCalled();
        expect(api.unregisterContentScripts).not.toHaveBeenCalled();
    });
});

describe("syncFastSkipRegistration: turning the feature off", () => {
    test("removes the page script so nothing is injected into YouTube any more", async () => {
        const { api, sync } = setup({ registered: true });

        const outcome = await sync(false);

        expect(outcome).toBe("unregistered");
        expect(api.unregisterContentScripts).toHaveBeenCalledWith({ ids: [FAST_SKIP_SCRIPT_ID] });
    });

    test("does nothing when it was never registered", async () => {
        const { api, sync } = setup();

        const outcome = await sync(false);

        expect(outcome).toBe("unchanged");
        expect(api.registerContentScripts).not.toHaveBeenCalled();
        expect(api.unregisterContentScripts).not.toHaveBeenCalled();
    });

    test("still removes a leftover registration when the browser is not supported", async () => {
        const { api, sync } = setup({ registered: true });

        const outcome = await sync(false, { supported: false });

        expect(outcome).toBe("unregistered");
        expect(api.unregisterContentScripts).toHaveBeenCalledTimes(1);
    });
});

describe("syncFastSkipRegistration: changes that overlap", () => {
    test("ends up unregistered when the option is switched off right after being switched on", async () => {
        const { api, sync } = setup();

        const outcomes = await Promise.all([sync(true), sync(false)]);

        expect(outcomes).toEqual(["registered", "unregistered"]);
        expect(await api.getRegisteredContentScripts()).toEqual([]);
    });

    test("ends up registered when the option is switched on right after being switched off", async () => {
        const { api, sync } = setup({ registered: true });

        const outcomes = await Promise.all([sync(false), sync(true)]);

        expect(outcomes).toEqual(["unregistered", "registered"]);
        expect(await api.getRegisteredContentScripts()).toHaveLength(1);
    });

    test("carries on with later changes after one failed", async () => {
        const { api, sync } = setup();
        api.registerContentScripts.mockRejectedValueOnce(new Error("busy"));

        const outcomes = await Promise.all([sync(true), sync(true)]);

        expect(outcomes).toEqual(["failed", "registered"]);
    });
});

describe("syncFastSkipRegistration: environments and failures", () => {
    test("does not register in an unsupported browser", async () => {
        const { api, sync } = setup();

        const outcome = await sync(true, { supported: false });

        expect(outcome).toBe("unsupported");
        expect(api.registerContentScripts).not.toHaveBeenCalled();
    });

    test("does nothing when the scripting API is missing", async () => {
        const { sync } = setup();

        expect(await sync(true, { api: null })).toBe("unsupported");
        expect(await sync(false, { api: null })).toBe("unsupported");
    });

    test("treats a failed lookup as not registered", async () => {
        const { api, sync } = setup();
        api.getRegisteredContentScripts.mockRejectedValueOnce(new Error("no"));

        const outcome = await sync(true);

        expect(outcome).toBe("registered");
    });

    test("reports a failed registration instead of throwing", async () => {
        const { api, log, sync } = setup();
        api.registerContentScripts.mockRejectedValueOnce(new Error("Invalid world"));

        const outcome = await sync(true);

        expect(outcome).toBe("failed");
        expect(log).toHaveBeenCalledWith(expect.stringContaining("Invalid world"));
    });

    test("reports a failed removal instead of throwing", async () => {
        const { api, log, sync } = setup({ registered: true });
        api.unregisterContentScripts.mockRejectedValueOnce(new Error("busy"));

        const outcome = await sync(false);

        expect(outcome).toBe("failed");
        expect(log).toHaveBeenCalledWith(expect.stringContaining("busy"));
    });
});
