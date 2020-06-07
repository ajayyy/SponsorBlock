import * as CompileConfig from "../config.json";
import { CategorySelection, CategorySkipOption, PreviewBarOption } from "./types";

import Utils from "./utils";
const utils = new Utils();

interface SBConfig {
    userID: string,
    sponsorTimes: SBMap<string, any>,
    whitelistedChannels: string[],
    forceChannelCheck: boolean,
    startSponsorKeybind: string,
    submitKeybind: string,
    minutesSaved: number,
    skipCount: number,
    sponsorTimesContributed: number,
    submissionCountSinceCategories: number, // New count used to show the "Read The Guidelines!!" message
    unsubmittedWarning: boolean,
    disableSkipping: boolean,
    trackViewCount: boolean,
    dontShowNotice: boolean,
    hideVideoPlayerControls: boolean,
    hideInfoButtonPlayerControls: boolean,
    hideDeleteButtonPlayerControls: boolean,
    hideUploadButtonPlayerControls: boolean,
    hideDiscordLaunches: number,
    hideDiscordLink: boolean,
    invidiousInstances: string[],
    supportInvidious: boolean,
    serverAddress: string,
    minDuration: number,
    audioNotificationOnSkip,
    checkForUnlistedVideos: boolean,
    testingServer: boolean,

    categoryUpdateShowCount: number,

    // What categories should be skipped
    categorySelections: CategorySelection[],

    // Preview bar
    barTypes: {
        "sponsor": PreviewBarOption,
        "preview-sponsor": PreviewBarOption,
        "intro": PreviewBarOption,
        "preview-intro": PreviewBarOption,
        "outro": PreviewBarOption,
        "preview-outro": PreviewBarOption,
        "interaction": PreviewBarOption,
        "preview-interaction": PreviewBarOption,
        "selfpromo": PreviewBarOption,
        "preview-selfpromo": PreviewBarOption,
        "music_offtopic": PreviewBarOption,
        "preview-music_offtopic": PreviewBarOption
    }
}

interface SBObject {
    configListeners: Array<Function>;
    defaults: SBConfig;
    localConfig: SBConfig;
    config: SBConfig;

    // Functions
    encodeStoredItem<T>(data: T): T | Array<any>;
    convertJSON(): void;
}

// Allows a SBMap to be conveted into json form
// Currently used for local storage
class SBMap<T, U> extends Map {
    id: string;

    constructor(id: string, entries?: [T, U][]) {
        super();

        this.id = id;

        // Import all entries if they were given
        if (entries !== undefined) {
            for (const item of entries) {
                super.set(item[0], item[1])
            }
        }
    }

    set(key, value) {
        const result = super.set(key, value);

        // Store updated SBMap locally
        chrome.storage.sync.set({
            [this.id]: encodeStoredItem(this)
        });

        return result;
    }
	
    delete(key) {
        const result = super.delete(key);

	    // Store updated SBMap locally
	    chrome.storage.sync.set({
            [this.id]: encodeStoredItem(this)
        });

        return result;
    }

    clear() {
        const result = super.clear();

	    chrome.storage.sync.set({
            [this.id]: encodeStoredItem(this)
        });

        return result;
    }
}

var Config: SBObject = {
    /**
     * Callback function when an option is updated
     */
    configListeners: [],
    defaults: {
        userID: null,
        sponsorTimes: new SBMap("sponsorTimes"),
        whitelistedChannels: [],
        forceChannelCheck: false,
        startSponsorKeybind: ";",
        submitKeybind: "'",
        minutesSaved: 0,
        skipCount: 0,
        sponsorTimesContributed: 0,
        submissionCountSinceCategories: 0,
        unsubmittedWarning: true,
        disableSkipping: false,
        trackViewCount: true,
        dontShowNotice: false,
        hideVideoPlayerControls: false,
        hideInfoButtonPlayerControls: false,
        hideDeleteButtonPlayerControls: false,
        hideUploadButtonPlayerControls: false,
        hideDiscordLaunches: 0,
        hideDiscordLink: false,
        invidiousInstances: ["invidio.us", "invidious.snopyta.org"],
        supportInvidious: false,
        serverAddress: CompileConfig.serverAddress,
        minDuration: 0,
        audioNotificationOnSkip: false,
        checkForUnlistedVideos: false,
        testingServer: false,

        categoryUpdateShowCount: 0,

        categorySelections: [{
            name: "sponsor",
            option: CategorySkipOption.AutoSkip
        }],

        // Preview bar
        barTypes: {
            "sponsor": {
                color: "#00d400",
                opacity: "0.7"
            },
            "preview-sponsor": {
                color: "#007800",
                opacity: "0.7"
            },
            "intro": {
                color: "#00ffff",
                opacity: "0.7"
            },
            "preview-intro": {
                color: "#008080",
                opacity: "0.7"
            },
            "outro": {
                color: "#0202ed",
                opacity: "0.7"
            },
            "preview-outro": {
                color: "#000070",
                opacity: "0.7"
            },
            "interaction": {
                color: "#cc00ff",
                opacity: "0.7"
            },
            "preview-interaction": {
                color: "#6c0087",
                opacity: "0.7"
            },
            "selfpromo": {
                color: "#ffff00",
                opacity: "0.7"
            },
            "preview-selfpromo": {
                color: "#bfbf35",
                opacity: "0.7"
            },
            "music_offtopic": {
                color: "#ff9900",
                opacity: "0.7"
            },
            "preview-music_offtopic": {
                color: "#a6634a",
                opacity: "0.7"
            }
        }
    },
    localConfig: null,
    config: null,
    
    // Functions
    encodeStoredItem,
    convertJSON
};

// Function setup

/**
 * A SBMap cannot be stored in the chrome storage. 
 * This data will be encoded into an array instead
 * 
 * @param data 
 */
function encodeStoredItem<T>(data: T): T | Array<any>  {
    // if data is SBMap convert to json for storing
    if(!(data instanceof SBMap)) return data;
    return Array.from(data.entries());
}

/**
 * An SBMap cannot be stored in the chrome storage. 
 * This data will be decoded from the array it is stored in
 * 
 * @param {*} data 
 */
function decodeStoredItem<T>(id: string, data: T): T | SBMap<string, any> {
    if (!Config.defaults[id]) return data;

    if (Config.defaults[id] instanceof SBMap) {
        try {
            let jsonData: any = data;

            // Check if data is stored in the old format for SBMap (a JSON string)
            if (typeof data === "string") {
                try {	
                    jsonData = JSON.parse(data);	   
                } catch(e) {
                    // Continue normally (out of this if statement)
                }
            }

            if (!Array.isArray(jsonData)) return data;
            return new SBMap(id, jsonData);
        } catch(e) {
            console.error("Failed to parse SBMap: " + id);
        }
    }

    // If all else fails, return the data
    return data;
}

function configProxy(): any {
    chrome.storage.onChanged.addListener((changes, namespace) => {
        for (const key in changes) {
            Config.localConfig[key] = decodeStoredItem(key, changes[key].newValue);
        }

        for (const callback of Config.configListeners) {
            callback(changes);
        }
    });
	
    var handler: ProxyHandler<any> = {
        set(obj, prop, value) {
            Config.localConfig[prop] = value;

            chrome.storage.sync.set({
                [prop]: encodeStoredItem(value)
            });

            return true;
        },

        get(obj, prop): any {
            let data = Config.localConfig[prop];

            return obj[prop] || data;
        },
	
        deleteProperty(obj, prop) {
            chrome.storage.sync.remove(<string> prop);
            
            return true;
        }

    };

    return new Proxy({handler}, handler);
}

function fetchConfig() { 
    return new Promise((resolve, reject) => {
        chrome.storage.sync.get(null, function(items) {
            Config.localConfig = <SBConfig> <unknown> items;  // Data is ready
            resolve();
        });
    });
}

async function migrateOldFormats() {
    if (Config.config["disableAutoSkip"]) {
        for (const selection of Config.config.categorySelections) {
            if (selection.name === "sponsor") {
                selection.option = CategorySkipOption.ManualSkip;

                chrome.storage.sync.remove("disableAutoSkip");
            }
        }
    }

    // Auto vote removal
    if (Config.config["autoUpvote"]) {
        chrome.storage.sync.remove("autoUpvote");
    }

    // mobileUpdateShowCount removal
    if (Config.config["mobileUpdateShowCount"] !== undefined) {
        chrome.storage.sync.remove("mobileUpdateShowCount");
    }

    // Channel URLS
    if (Config.config.whitelistedChannels.length > 0 && 
            (Config.config.whitelistedChannels[0] == null || Config.config.whitelistedChannels[0].includes("/"))) {
        let newChannelList: string[] = [];
        for (const item of Config.config.whitelistedChannels) {
            if (item != null) {
                if (item.includes("/channel/")) {
                    newChannelList.push(item.split("/")[2]);
                } else if (item.includes("/user/") &&  utils.isContentScript()) {
                    // Replace channel URL with channelID
                    let response = await utils.asyncRequestToCustomServer("GET", "https://sponsor.ajay.app/invidious/api/v1/channels/" + item.split("/")[2] + "?fields=authorId");
                
                    if (response.ok) {
                        newChannelList.push((JSON.parse(response.responseText)).authorId);
                    } else {
                        // Add it at the beginning so it gets converted later
                        newChannelList.unshift(item);
                    }
                } else if (item.includes("/user/")) {
                    // Add it at the beginning so it gets converted later (The API can only be called in the content script due to CORS issues)
                    newChannelList.unshift(item);
                } else {
                    newChannelList.push(item);
                }
            }
        }

        Config.config.whitelistedChannels = newChannelList;
    }

    // Check if off-topic category needs to be removed
    for (let i = 0; i < Config.config.categorySelections.length; i++) {
        if (Config.config.categorySelections[i].name === "offtopic") {
            Config.config.categorySelections.splice(i, 1);
            // Call set listener
            Config.config.categorySelections = Config.config.categorySelections;
            break;
        }
    }
}

async function setupConfig() {
    await fetchConfig();
    addDefaults();
    convertJSON();
    Config.config = configProxy();
    migrateOldFormats();
}

// Reset config
function resetConfig() {
    Config.config = Config.defaults;
};

function convertJSON(): void {
    Object.keys(Config.localConfig).forEach(key => {
        Config.localConfig[key] = decodeStoredItem(key, Config.localConfig[key]);
    });
}

// Add defaults
function addDefaults() {
    for (const key in Config.defaults) {
        if(!Config.localConfig.hasOwnProperty(key)) {
	        Config.localConfig[key] = Config.defaults[key];
        }
    }
};

// Sync config
setupConfig();

export default Config;