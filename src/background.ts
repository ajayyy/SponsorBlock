import * as CompileConfig from "../config.json";

import Config from "./config";
import { Registration } from "./types";
import "content-scripts-register-polyfill";
import { sendRealRequestToCustomServer, setupBackgroundRequestProxy } from "./maze-utils/background-request-proxy";
import { setupTabUpdates } from "./maze-utils/tab-updates";
import { generateUserID } from "./maze-utils/setup";

// Make the config public for debugging purposes

window.SB = Config;

import Utils from "./utils";
import { getExtensionIdsToImportFrom } from "./utils/crossExtension";
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
            registerFirefoxContentScript(request);
            return false;
        case "unregisterContentScript":
            unregisterFirefoxContentScript(request.id)
            return false;
        case "tabs": {
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