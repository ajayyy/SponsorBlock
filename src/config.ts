import * as CompileConfig from "../config.json";
import { CategorySelection, CategorySkipOption, PreviewBarOption, SponsorTime, StorageChangesObject, UnEncodedSegmentTimes as UnencodedSegmentTimes } from "./types";

import Utils from "./utils";
const utils = new Utils();

interface SBConfig {
    userID: string,
    /** Contains unsubmitted segments that the user has created. */
    segmentTimes: SBMap<string, SponsorTime[]>,
    defaultCategory: string,
    whitelistedChannels: string[],
    forceChannelCheck: boolean,
    skipKeybind: string,
    startSponsorKeybind: string,
    submitKeybind: string,
    minutesSaved: number,
    skipCount: number,
    sponsorTimesContributed: number,
    submissionCountSinceCategories: number, // New count used to show the "Read The Guidelines!!" message
    showTimeWithSkips: boolean,
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
    hashPrefix: boolean,
    refetchWhenNotFound: boolean,

    // What categories should be skipped
    categorySelections: CategorySelection[],

    // Preview bar
    barTypes: {
        "preview-chooseACategory": PreviewBarOption,
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
        "preview-music_offtopic": PreviewBarOption,
    }
}

export interface SBObject {
    configListeners: Array<(changes: StorageChangesObject) => unknown>;
    defaults: SBConfig;
    localConfig: SBConfig;
    config: SBConfig;

    // Functions
    encodeStoredItem<T>(data: T): T | UnencodedSegmentTimes;
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

    get(key): U {
        return super.get(key);
    }

    rawSet(key, value) {
        return super.set(key, value);
    }

    update() {
        // Store updated SBMap locally
        chrome.storage.sync.set({
            [this.id]: encodeStoredItem(this)
        });
    }

    set(key: T, value: U) {
        const result = super.set(key, value);

        this.update();
        return result;
    }
	
    delete(key) {
        const result = super.delete(key);

        // Make sure there are no empty elements
        for (const entry of this.entries()) {
            if (entry[1].length === 0) {
                super.delete(entry[0]);
            }
        }

        this.update();

        return result;
    }

    clear() {
        const result = super.clear();

        this.update();
        return result;
    }
}

const Config: SBObject = {
    /**
     * Callback function when an option is updated
     */
    configListeners: [],
    defaults: {
        userID: null,
        segmentTimes: new SBMap("segmentTimes"),
        defaultCategory: "chooseACategory",
        whitelistedChannels: [],
        forceChannelCheck: false,
        skipKeybind: "Enter",
        startSponsorKeybind: ";",
        submitKeybind: "'",
        minutesSaved: 0,
        skipCount: 0,
        sponsorTimesContributed: 0,
        submissionCountSinceCategories: 0,
        showTimeWithSkips: true,
        disableSkipping: false,
        trackViewCount: true,
        dontShowNotice: false,
        hideVideoPlayerControls: false,
        hideInfoButtonPlayerControls: false,
        hideDeleteButtonPlayerControls: false,
        hideUploadButtonPlayerControls: false,
        hideDiscordLaunches: 0,
        hideDiscordLink: false,
        invidiousInstances: ["invidious.snopyta.org"],
        supportInvidious: false,
        serverAddress: CompileConfig.serverAddress,
        minDuration: 0,
        audioNotificationOnSkip: false,
        checkForUnlistedVideos: false,
        testingServer: false,
        hashPrefix: false,
        refetchWhenNotFound: true,

        categorySelections: [{
            name: "sponsor",
            option: CategorySkipOption.AutoSkip
        }],

        // Preview bar
        barTypes: {
            "preview-chooseACategory": {
                color: "#ffffff",
                opacity: "0.7"
            },
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
function encodeStoredItem<T>(data: T): T | UnencodedSegmentTimes  {
    // if data is SBMap convert to json for storing
    if(!(data instanceof SBMap)) return data;
    return Array.from(data.entries()).filter((element) => element[1].length > 0); // Remove empty entries
}

/**
 * An SBMap cannot be stored in the chrome storage. 
 * This data will be decoded from the array it is stored in
 * 
 * @param {*} data 
 */
function decodeStoredItem<T>(id: string, data: T): T | SBMap<string, SponsorTime[]> {
    if (!Config.defaults[id]) return data;

    if (Config.defaults[id] instanceof SBMap) {
        try {
            if (!Array.isArray(data)) return data;
            return new SBMap(id, data as UnencodedSegmentTimes);
        } catch(e) {
            console.error("Failed to parse SBMap: " + id);
        }
    }

    // If all else fails, return the data
    return data;
}

function configProxy(): SBConfig {
    chrome.storage.onChanged.addListener((changes: {[key: string]: chrome.storage.StorageChange}) => {
        for (const key in changes) {
            Config.localConfig[key] = decodeStoredItem(key, changes[key].newValue);
        }

        for (const callback of Config.configListeners) {
            callback(changes);
        }
    });
	
    const handler: ProxyHandler<SBConfig> = {
        set<K extends keyof SBConfig>(obj: SBConfig, prop: K, value: SBConfig[K]) {
            Config.localConfig[prop] = value;

            chrome.storage.sync.set({
                [prop]: encodeStoredItem(value)
            });

            return true;
        },

        get<K extends keyof SBConfig>(obj: SBConfig, prop: K): SBConfig[K] {
            const data = Config.localConfig[prop];

            return obj[prop] || data;
        },
	
        deleteProperty(obj: SBConfig, prop: keyof SBConfig) {
            chrome.storage.sync.remove(<string> prop);
            
            return true;
        }

    };

    return new Proxy<SBConfig>({handler} as unknown as SBConfig, handler);
}

function fetchConfig(): Promise<void> { 
    return new Promise((resolve) => {
        chrome.storage.sync.get(null, function(items) {
            Config.localConfig = <SBConfig> <unknown> items;  // Data is ready
            resolve();
        });
    });
}

function migrateOldFormats(config: SBConfig) {
    if (config["disableAutoSkip"]) {
        for (const selection of config.categorySelections) {
            if (selection.name === "sponsor") {
                selection.option = CategorySkipOption.ManualSkip;

                chrome.storage.sync.remove("disableAutoSkip");
            }
        }
    }

    // Auto vote removal
    if (config["autoUpvote"]) {
        chrome.storage.sync.remove("autoUpvote");
    }
    // mobileUpdateShowCount removal
    if (config["mobileUpdateShowCount"] !== undefined) {
        chrome.storage.sync.remove("mobileUpdateShowCount");
    }
    // categoryUpdateShowCount removal
    if (config["categoryUpdateShowCount"] !== undefined) {
        chrome.storage.sync.remove("categoryUpdateShowCount");
    }

    // Channel URLS
    if (config.whitelistedChannels.length > 0 && 
            (config.whitelistedChannels[0] == null || config.whitelistedChannels[0].includes("/"))) {
        const channelURLFixer = async() => {
            const newChannelList: string[] = [];
            for (const item of config.whitelistedChannels) {
                if (item != null) {
                    if (item.includes("/channel/")) {
                        newChannelList.push(item.split("/")[2]);
                    } else if (item.includes("/user/") &&  utils.isContentScript()) {

                        
                        // Replace channel URL with channelID
                        const response = await utils.asyncRequestToCustomServer("GET", "https://sponsor.ajay.app/invidious/api/v1/channels/" + item.split("/")[2] + "?fields=authorId");
                    
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

            config.whitelistedChannels = newChannelList;
        }

        channelURLFixer();
    }

    // Check if off-topic category needs to be removed
    for (let i = 0; i < config.categorySelections.length; i++) {
        if (config.categorySelections[i].name === "offtopic") {
            config.categorySelections.splice(i, 1);
            // Call set listener
            config.categorySelections = config.categorySelections;
            break;
        }
    }

    // Migrate old "sponsorTimes"
    if (config["sponsorTimes"]) {
        let jsonData: unknown = config["sponsorTimes"];

        // Check if data is stored in the old format for SBMap (a JSON string)
        if (typeof jsonData === "string") {
            try {	
                jsonData = JSON.parse(jsonData);	   
            } catch(e) {
                // Continue normally (out of this if statement)
            }
        }

        // Otherwise junk data
        if (Array.isArray(jsonData)) {
            const oldMap = new Map(jsonData);
            oldMap.forEach((sponsorTimes: number[][], key) => {
                const segmentTimes: SponsorTime[] = [];
                for (const segment of sponsorTimes) {
                    segmentTimes.push({
                        segment: segment,
                        category: "sponsor",
                        UUID: null
                    });
                }

                config.segmentTimes.rawSet(key, segmentTimes);
            });

            config.segmentTimes.update();
        }

        chrome.storage.sync.remove("sponsorTimes");
    }
}

async function setupConfig() {
    await fetchConfig();
    addDefaults();
    convertJSON();
    const config = configProxy();
    migrateOldFormats(config);

    Config.config = config;
}

function convertJSON(): void {
    Object.keys(Config.localConfig).forEach(key => {
        Config.localConfig[key] = decodeStoredItem(key, Config.localConfig[key]);
    });
}

// Add defaults
function addDefaults() {
    for (const key in Config.defaults) {
        if(!Object.prototype.hasOwnProperty.call(Config.localConfig, key)) {
            Config.localConfig[key] = Config.defaults[key];
        } else if (key === "barTypes") {
            for (const key2 in Config.defaults[key]) {
                if(!Object.prototype.hasOwnProperty.call(Config.localConfig[key], key2)) {
                    Config.localConfig[key][key2] = Config.defaults[key][key2];
                }
            }
        }
    }
}

// Sync config
setupConfig();

export default Config;
