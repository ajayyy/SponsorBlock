interface SBObject {
    configListeners: Array<Function>;
    defaults: any;
    localConfig: any;
    config: any;
}

// Allows a SBMap to be conveted into json form
// Currently used for local storage
class SBMap<T, U> extends Map {
    constructor(entries?: [T, U][]) {
        super();

        // Import all entries if they were given
        if (entries !== undefined) {
            for (const item of entries) {
                this.set(entries[0], entries[1])
            }
        }
    }

    toJSON() {
        return Array.from(this.entries());
    }
}


// TODO: Rename to something more meaningful
var SB: SBObject = {
    /**
     * Callback function when an option is updated
     */
    configListeners: [],
    defaults: {
        "sponsorTimes": new SBMap(),
        "startSponsorKeybind": ";",
        "submitKeybind": "'",
        "minutesSaved": 0,
        "skipCount": 0,
        "sponsorTimesContributed": 0,
        "disableSkipping": false,
        "disableAutoSkip": false,
        "trackViewCount": true,
        "dontShowNotice": false,
        "hideVideoPlayerControls": false,
        "hideInfoButtonPlayerControls": false,
        "hideDeleteButtonPlayerControls": false,
        "hideDiscordLaunches": 0,
        "hideDiscordLink": false,
        "invidiousInstances": ["invidio.us", "invidiou.sh", "invidious.snopyta.org"],
        "invidiousUpdateInfoShowCount": 0,
        "autoUpvote": true
    },
    localConfig: {},
    config: {}
};

// Function setup

// Proxy Map changes to Map in SB.localConfig
// Saves the changes to chrome.storage in json form
class MapIO {
    id: string;
    SBMap: SBMap<String, any>;

    constructor(id) {
	    // The name of the item in the array
        this.id = id;
	    // A local copy of the SBMap (SB.config.SBMapname.SBMap)
        this.SBMap = SB.localConfig[this.id];
    }

    set(key, value) {
	    // Proxy to SBMap
        this.SBMap.set(key, value);
        // Store updated SBMap locally
        chrome.storage.sync.set({
            [this.id]: encodeStoredItem(this.SBMap)
        });
        return this.SBMap;
    }

    get(key) {
        return this.SBMap.get(key);
    }
	
    has(key) {
        return this.SBMap.has(key);
    }
	
    size() {
        return this.SBMap.size;
    }
	
    delete(key) {
	    // Proxy to SBMap
        this.SBMap.delete(key);
	    // Store updated SBMap locally
	    chrome.storage.sync.set({
            [this.id]: encodeStoredItem(this.SBMap)
        });
    }

    clear() {
        this.SBMap.clear();
	    chrome.storage.sync.set({
            [this.id]: encodeStoredItem(this.SBMap)
        });
    }
}

/**
 * A SBMap cannot be stored in the chrome storage. 
 * This data will be encoded into an array instead as specified by the toJSON function.
 * 
 * @param {*} data 
 */
function encodeStoredItem(data) {
    // if data is SBMap convert to json for storing
    if(!(data instanceof SBMap)) return data;
    return JSON.stringify(data);
}

/**
 * A SBMap cannot be stored in the chrome storage. 
 * This data will be decoded from the array it is stored in
 * 
 * @param {*} data 
 */
function decodeStoredItem(data) {
    if(typeof data !== "string") return data;
    
    try {
        let str = JSON.parse(data);
        
        if(!Array.isArray(str)) return data;
        return new SBMap(str);
    } catch(e) {

        // If all else fails, return the data
        return data;
    }
}

function configProxy(): void {
    chrome.storage.onChanged.addListener((changes, namespace) => {
        for (const key in changes) {
            SB.localConfig[key] = decodeStoredItem(changes[key].newValue);
        }

        for (const callback of SB.configListeners) {
            callback(changes);
        }
    });
	
    var handler: ProxyHandler<any> = {
        set(obj, prop, value) {
            SB.localConfig[prop] = value;

            chrome.storage.sync.set({
                [prop]: encodeStoredItem(value)
            });

            return true;
        },

        get(obj, prop): any {
            let data = SB.localConfig[prop];
            if(data instanceof SBMap) data = new MapIO(prop);

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
            SB.localConfig = items;  // Data is ready
            resolve();
        });
    });
}

function migrateOldFormats() { // Convert sponsorTimes format
    for (const key in SB.localConfig) {
        if (key.startsWith("sponsorTimes") && key !== "sponsorTimes" && key !== "sponsorTimesContributed") {
            SB.config.sponsorTimes.set(key.substr(12), SB.config[key]);
            delete SB.config[key];
        }
    }
}

async function setupConfig() {
    await fetchConfig();
    addDefaults();
    convertJSON();
    SB.config = configProxy();
    migrateOldFormats();
}

// Reset config
function resetConfig() {
    SB.config = SB.defaults;
};

function convertJSON() {
    Object.keys(SB.defaults).forEach(key => {
        SB.localConfig[key] = decodeStoredItem(SB.localConfig[key]);
    });
}

// Add defaults
function addDefaults() {
    for (const key in SB.defaults) {
        if(!SB.localConfig.hasOwnProperty(key)) {
	    SB.localConfig[key] = SB.defaults[key];
        }
    }
};

// Sync config
setupConfig();

export default SB;