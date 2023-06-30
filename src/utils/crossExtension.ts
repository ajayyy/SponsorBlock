import * as CompileConfig from "../../config.json";

import Config from "../config";
import { isSafari } from "../maze-utils/config";
import { isFirefoxOrSafari } from "../maze-utils";

export function isDeArrowInstalled(): Promise<boolean> {
    if (Config.config.deArrowInstalled) {
        return Promise.resolve(true);
    } else {
        return new Promise((resolve) => {
            const extensionIds = getExtensionIdsToImportFrom();

            let count = 0;
            for (const id of extensionIds) {
                chrome.runtime.sendMessage(id, { message: "isInstalled" }, (response) => {
                    if (chrome.runtime.lastError) {
                        count++;

                        if (count === extensionIds.length) {
                            resolve(false);
                        }
                        return;
                    }

                    resolve(response);
                    if (response) {
                        Config.config.deArrowInstalled = true;
                    }
                });
            }
        });
    }
}

export function getExtensionIdsToImportFrom(): string[] {
    if (isSafari()) {
        return CompileConfig.extensionImportList.safari;
    } else if (isFirefoxOrSafari()) {
        return CompileConfig.extensionImportList.firefox;
    } else {
        return CompileConfig.extensionImportList.chromium;
    }
}