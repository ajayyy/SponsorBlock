import * as CompileConfig from "../config.json";

import Config from "./config";
import { Registration } from "./types";

// Make the config public for debugging purposes

window.SB = Config;

import Utils from "./utils";
const utils = new Utils({
    registerFirefoxContentScript,
    unregisterFirefoxContentScript
});

// Used only on Firefox, which does not support non persistent background pages.
const contentScriptRegistrations = {};

// Register content script if needed
if (utils.isFirefox()) {
    utils.wait(() => Config.config !== null).then(function() {
        if (Config.config.supportInvidious) utils.setupExtraSiteContentScripts();
    });
} 

chrome.tabs.onUpdated.addListener(function(tabId) {
	chrome.tabs.sendMessage(tabId, {
        message: 'update',
	}, () => void chrome.runtime.lastError ); // Suppress error on Firefox
});

chrome.runtime.onMessage.addListener(function (request, sender, callback) {
	switch(request.message) {
        case "openConfig":
            chrome.runtime.openOptionsPage();
            return;
        case "openHelp":
            chrome.tabs.create({url: chrome.runtime.getURL('help/index_en.html')});
            return;
        case "openPage":
            chrome.tabs.create({url: chrome.runtime.getURL(request.url)});
            return;
        case "sendRequest":
            sendRequestToCustomServer(request.type, request.url, request.data).then(async (response) => {
                callback({
                    responseText: await response.text(),
                    status: response.status,
                    ok: response.ok
                });
            });
        
            return true;
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
	}
});

//add help page on install
chrome.runtime.onInstalled.addListener(function () {
    // This let's the config sync to run fully before checking.
    // This is required on Firefox
    setTimeout(function() {
        const userID = Config.config.userID;

        // If there is no userID, then it is the first install.
        if (!userID){
            //open up the install page
            chrome.tabs.create({url: chrome.extension.getURL("/help/index_en.html")});

            //generate a userID
            const newUserID = utils.generateUserID();
            //save this UUID
            Config.config.userID = newUserID;
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

    browser.contentScripts.register({
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
    contentScriptRegistrations[id].unregister();
    delete contentScriptRegistrations[id];
}

async function submitVote(type: number, UUID: string, category: string) {
    let userID = Config.config.userID;

    if (userID == undefined || userID === "undefined") {
        //generate one
        userID = utils.generateUserID();
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

    return await (sendRequestToCustomServer(type, serverAddress + address, data));
}

/**
 * Sends a request to the specified url
 * 
 * @param type The request type "GET", "POST", etc.
 * @param address The address to add to the SponsorBlock server address
 * @param callback 
 */
async function sendRequestToCustomServer(type: string, url: string, data = {}) {
    // If GET, convert JSON to parameters
    if (type.toLowerCase() === "get") {
        for (const key in data) {
            const seperator = url.includes("?") ? "&" : "?";
            const value = (typeof(data[key]) === "string") ? data[key]: JSON.stringify(data[key]);
            url += seperator + key + "=" + value;
        }

        data = null;
    }

    const response = await fetch(url, {
        method: type,
        headers: {
            'Content-Type': 'application/json'
        },
        redirect: 'follow',
        body: data ? JSON.stringify(data) : null
    });

    return response;
}