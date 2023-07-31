import * as CompileConfig from "../config.json";

import Config from "./config";
import { Registration } from "./types";
import "content-scripts-register-polyfill";
import { sendRealRequestToCustomServer, setupBackgroundRequestProxy } from "./maze-utils/background-request-proxy";
import { setupTabUpdates } from "./maze-utils/tab-updates";
import { generateUserID } from "./maze-utils/setup";
import { isFirefoxOrSafari } from "./maze-utils/";

// Make the config public for debugging purposes

window.SB = Config;

import Utils from "./utils";
import { getExtensionIdsToImportFrom } from "./utils/crossExtension";
import { isFirefoxOrSafari } from "./maze-utils";
import { injectUpdatedScripts } from "./maze-utils/cleanup";
import { logWarn } from "./utils/logger";
const utils = new Utils({
    registerFirefoxContentScript,
    unregisterFirefoxContentScript
});

const popupPort: Record<string, chrome.runtime.Port> = {};

// Used only on Firefox, which does not support non persistent background pages.
const contentScriptRegistrations = {};

// Register content script if needed
utils.wait(() => Config.config !== null).then(function() {
    if (Config.config.supportInvidious) utils.setupExtraSiteContentScripts();
});

setupBackgroundRequestProxy();
setupTabUpdates(Config);

function isUnsafe(sender)  {
    // Only trust messages from extension pages.
    // https://chromium.googlesource.com/chromium/src/+/master/docs/security/compromised-renderers.md#Messaging
    if (sender.origin) {
        if (sender.origin === location.origin) return false;
        console.warn(`Unsafe message from: ${sender.origin} via MessageSender.origin`);
    } else if (sender.url && isFirefoxOrSafari()) {
        const senderOrigin = new URL(sender.url).origin;
        if (senderOrigin === location.origin) return false;
        console.warn(`Unsafe message from: ${senderOrigin} via MessageSender.url`);
    }
    return true;
}

chrome.runtime.onMessage.addListener(function (request, sender, callback) {
    switch(request.message) {
        case "openConfig":
            chrome.tabs.create({url: chrome.runtime.getURL('options/options.html' + (request.hash ? '#' + request.hash : ''))});
            return false;
        case "openHelp":
            chrome.tabs.create({url: chrome.runtime.getURL('help/index.html')});
            return false;
        case "openPage":
            chrome.tabs.create({url: chrome.runtime.getURL(request.url)});
            return false;
        case "submitVote":
            submitVote(request.type, request.UUID, request.category).then(callback);

            //this allows the callback to be called later
            return true;
        case "registerContentScript":
            if (isUnsafe(sender)) return false;
            utils.setupExtraSiteContentScripts();
            return false;
        case "unregisterContentScript":
            if (isUnsafe(sender)) return false;
            unregisterFirefoxContentScript(request.id)
            return false;
        case "tabs": {
            if (isUnsafe(sender)) return false;
            chrome.tabs.query({
                active: true,
                currentWindow: true
            }, tabs => {
                chrome.tabs.sendMessage(
                    tabs[0].id,
                    request.data,
                    (response) => {
                        callback(response);
                    }
                );
            });
            return true;
        }
        case "time":
        case "infoUpdated":
        case "videoChanged":
            if (sender.tab) {
                popupPort[sender.tab.id]?.postMessage(request);
            }
            return false;
        default:
            return false;
	}
});

chrome.runtime.onMessageExternal.addListener((request, sender, callback) => {
    if (getExtensionIdsToImportFrom().includes(sender.id)) {
        if (request.message === "requestConfig") {
            callback({
                userID: Config.config.userID,
                allowExpirements: Config.config.allowExpirements,
                showDonationLink: Config.config.showDonationLink,
                showUpsells: Config.config.showUpsells,
                darkMode: Config.config.darkMode,
            })
        }
    }
});

chrome.runtime.onConnect.addListener((port) => {
    if (port.name === "popup") {
        chrome.tabs.query({
            active: true,
            currentWindow: true
        }, tabs => {
            popupPort[tabs[0].id] = port;
        });
    }
});

//add help page on install
chrome.runtime.onInstalled.addListener(function () {
    // This let's the config sync to run fully before checking.
    // This is required on Firefox
    setTimeout(async () => {
        const userID = Config.config.userID;

        // If there is no userID, then it is the first install.
        if (!userID){
            //open up the install page
            chrome.tabs.create({url: chrome.extension.getURL("/help/index.html")});

            //generate a userID
            const newUserID = generateUserID();
            //save this UUID
            Config.config.userID = newUserID;

            // Don't show update notification
            Config.config.categoryPillUpdate = true;
        }

        if (Config.config.supportInvidious) {
            if (!(await utils.containsInvidiousPermission())) {
                chrome.tabs.create({url: chrome.extension.getURL("/permissions/index.html")});
            }
        }
    }, 1500);

    // Only do this once the old version understands how to clean itself up
    if (!isFirefoxOrSafari() && chrome.runtime.getManifest().version !== "5.4.13") {
        injectUpdatedScripts().catch(logWarn);
    }
});

/**
 * Only works on Firefox.
 * Firefox requires that it be applied after every extension restart.
 *
 * @param {JSON} options
 */
function registerFirefoxContentScript(options: Registration) {
    const oldRegistration = contentScriptRegistrations[options.id];
    if (oldRegistration) oldRegistration.unregister();

    chrome.contentScripts.register({
        allFrames: options.allFrames,
        js: options.js,
        css: options.css,
        matches: options.matches
    }).then((registration) => void (contentScriptRegistrations[options.id] = registration));
}

/**
 * Only works on Firefox.
 * Firefox requires that this is handled by the background script
 *
 */
function unregisterFirefoxContentScript(id: string) {
    if (contentScriptRegistrations[id]) {
        contentScriptRegistrations[id].unregister();
        delete contentScriptRegistrations[id];
    }
}

async function submitVote(type: number, UUID: string, category: string) {
    let userID = Config.config.userID;

    if (userID == undefined || userID === "undefined") {
        //generate one
        userID = generateUserID();
        Config.config.userID = userID;
    }

    const typeSection = (type !== undefined) ? "&type=" + type : "&category=" + category;

    //publish this vote
    const response = await asyncRequestToServer("POST", "/api/voteOnSponsorTime?UUID=" + UUID + "&userID=" + userID + typeSection);

    if (response.ok) {
        return {
            successType: 1,
            responseText: await response.text()
        };
    } else if (response.status == 405) {
        //duplicate vote
        return {
            successType: 0,
            statusCode: response.status,
            responseText: await response.text()
        };
    } else {
        //error while connect
        return {
            successType: -1,
            statusCode: response.status,
            responseText: await response.text()
        };
    }
}


async function asyncRequestToServer(type: string, address: string, data = {}) {
    const serverAddress = Config.config.testingServer ? CompileConfig.testingServerAddress : Config.config.serverAddress;

    return await (sendRealRequestToCustomServer(type, serverAddress + address, data));
}
