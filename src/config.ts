import * as CompileConfig from "../config.json";

interface SBConfig {
    userID: string,
    sponsorTimes: SBMap<string, any>,
    whitelistedChannels: Array<any>,
    startSponsorKeybind: string,
    submitKeybind: string,
    minutesSaved: number,
    skipCount: number,
    sponsorTimesContributed: number,
    disableSkipping: boolean,
    disableAutoSkip: boolean,
    trackViewCount: boolean,
    dontShowNotice: boolean,
    hideVideoPlayerControls: boolean,
    hideInfoButtonPlayerControls: boolean,
    hideDeleteButtonPlayerControls: boolean,
    hideUploadButtonPlayerControls: boolean,
    hideDiscordLaunches: number,
    hideDiscordLink: boolean,
    invidiousInstances: string[],
    autoUpvote: boolean,
    supportInvidious: boolean,
    serverAddress: string,
    minDuration: number,
    checkForUnlistedVideos: boolean,
    mobileUpdateShowCount: number
}

interface SBObject {
    configListeners: Array<Function>;
    defaults: SBConfig;
    localConfig: SBConfig;
    config: SBConfig;
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

    toJSON() {
        return Array.from(this.entries());
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
        startSponsorKeybind: ";",
        submitKeybind: "'",
        minutesSaved: 0,
        skipCount: 0,
        sponsorTimesContributed: 0,
        disableSkipping: false,
        disableAutoSkip: false,
        trackViewCount: true,
        dontShowNotice: false,
        hideVideoPlayerControls: false,
        hideInfoButtonPlayerControls: false,
        hideDeleteButtonPlayerControls: false,
        hideUploadButtonPlayerControls: false,
        hideDiscordLaunches: 0,
        hideDiscordLink: false,
        invidiousInstances: ["invidio.us", "invidiou.sh", "invidious.snopyta.org"],
        autoUpvote: true,
        supportInvidious: false,
        serverAddress: CompileConfig.serverAddress,
        minDuration: 0,
        checkForUnlistedVideos: false,
        mobileUpdateShowCount: 0
    },
    localConfig: null,
    config: null
};

// Function setup

/**
 * A SBMap cannot be stored in the chrome storage. 
 * This data will be encoded into an array instead as specified by the toJSON function.
 * 
 * @param data 
 */
function encodeStoredItem(data) {
    // if data is SBMap convert to json for storing
    if(!(data instanceof SBMap)) return data;
    return JSON.stringify(data);
}

/**
 * An SBMap cannot be stored in the chrome storage. 
 * This data will be decoded from the array it is stored in
 * 
 * @param {*} data 
 */
function decodeStoredItem(id: string, data) {
    if(typeof data !== "string") return data;
    
    try {
        let str = JSON.parse(data);
        
        if(!Array.isArray(str)) return data;
        return new SBMap(id, str);
    } catch(e) {

        // If all else fails, return the data
        return data;
    }
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

function migrateOldFormats() { // Convert sponsorTimes format
    for (const key in Config.localConfig) {
        if (key.startsWith("sponsorTimes") && key !== "sponsorTimes" && key !== "sponsorTimesContributed") {
            Config.config.sponsorTimes.set(key.substr(12), Config.config[key]);
            delete Config.config[key];
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

function convertJSON() {
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