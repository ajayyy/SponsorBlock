import Config from "../config";
import Utils from "../utils";
import * as CompileConfig from "../../config.json";

const utils = new Utils();

export async function checkLicenseKey(licenseKey: string): Promise<boolean> {
    const result = await utils.asyncRequestToServer("GET", "/api/verifyToken", {
        licenseKey
    });

    try {
        if (result.ok && JSON.parse(result.responseText).allowed) {
            Config.config.payments.chaptersAllowed = true;
            Config.config.showChapterInfoMessage = false;
            Config.config.payments.lastCheck = Date.now();
            Config.forceSyncUpdate("payments");

            return true;
        }
    } catch (e) { } //eslint-disable-line no-empty

    return false
}

/**
 * The other one also tried refreshing, so returns a promise
 */
export function noRefreshFetchingChaptersAllowed(): boolean {
    return Config.config.payments.chaptersAllowed || CompileConfig["freeChapterAccess"];
}

export async function fetchingChaptersAllowed(): Promise<boolean> {
    if (Config.config.payments.freeAccess || CompileConfig["freeChapterAccess"]) {
        return true;
    }

    //more than 14 days
    if (Config.config.payments.licenseKey && Date.now() - Config.config.payments.lastCheck > 14 * 24 * 60 * 60 * 1000) {
        const licensePromise = checkLicenseKey(Config.config.payments.licenseKey);

        if (!Config.config.payments.chaptersAllowed) {
            return licensePromise;
        }
    }

    if (Config.config.payments.chaptersAllowed) return true;

    if (Config.config.payments.lastCheck === 0 && Date.now() - Config.config.payments.lastFreeCheck > 2 * 24 * 60 * 60 * 1000) {
        Config.config.payments.lastFreeCheck = Date.now();
        Config.forceSyncUpdate("payments");

        // Check for free access if no license key, and it is the first time
        const result = await utils.asyncRequestToServer("GET", "/api/userInfo", {
            value: "freeChaptersAccess",
            publicUserID: await utils.getHash(Config.config.userID)
        });

        try {
            if (result.ok) {
                const userInfo = JSON.parse(result.responseText);

                Config.config.payments.lastCheck = Date.now();
                if (userInfo.freeChaptersAccess) {
                    Config.config.payments.freeAccess = true;
                    Config.config.payments.chaptersAllowed = true;
                    Config.config.showChapterInfoMessage = false;
                    Config.forceSyncUpdate("payments");

                    return true;
                }
            }
        } catch (e) { } //eslint-disable-line no-empty
    }

    return false;
}
