SB = {};

Map.prototype.toJSON = function() {
    return Array.from(this.entries());
};

class MapIO extends Map {
    constructor(id) {
        super();
        
		this.id = id;
		this.map = SB.localconfig[this.id];
    }

    set(key, value) {
        this.map.set(key, value);

        SB.config.handler.set(undefined, this.id, storeEncode(this.map));

		return this.map;
    }
	
	get(key) {
		return this.map.get(key);
    }
	
	has(key) {
		return this.map.has(key);
    }
	
	toJSON() {
		return Array.from(this.map.entries());
    }
	 
	deleteProperty(key) {
		if (this.map.has(key)) {
			this.map.delete(key);
			return true;
		} else {
			return false;
		}
	}
	
	size() {
		return this.map.size;
    }
	
	delete(key) {
		this.map.delete(key);
        
        SB.config.handler.set(undefined, this.id, storeEncode(this.map));
    }
}

function storeEncode(data) {
	if(!(data instanceof Map)) return data;
	return JSON.stringify(data);
}

function mapDecode(data, key) {
    if(typeof data !== "string") return data;
    
	try {
		let str = JSON.parse(data);
		if(!Array.isArray(str)) return data;
		return new Map(str);
    } catch(e) {
        return data
    }
}

function mapProxy(data, key) {
	if(!(data instanceof Map)) return data;
	return new MapIO(key);
}

function configProxy() {
    chrome.storage.onChanged.addListener((changes, namespace) => {
        for (key in changes) {
	    	Reflect.set(SB.localconfig, key, mapDecode(changes[key].newValue, key));
        }
    });
	
    var handler = {
        set: function(obj, prop, value) {
            chrome.storage.sync.set({
                [prop]: storeEncode(value)
            });
        },
        get: function(obj, prop) {
			return obj[prop] || mapProxy(Reflect.get(SB.localconfig, prop), prop);
        }
		
    };

    return new Proxy({handler}, handler);
}

fetchConfig = () => new Promise((resolve, reject) => {
    chrome.storage.sync.get(null, function(items) {
        SB.localconfig = items;  // Data is ready
        resolve();
    });
});

function migrate() { // Convert sponsorTimes format
    for (key in SB.localconfig) {
        if (key.startsWith("sponsorTimes") && key !== "sponsorTimes" && key !== "sponsorTimesContributed") {
            SB.config.sponsorTimes.set(key.substr(12), SB.config[key]);
            delete SB.config[key];
        }
    }
}

async function config() {
    await fetchConfig();
	addDefaults();
	convertJson();
	SB.config = configProxy();
    migrate();
}

SB.defaults = {
	"sponsorTimes": new Map(),
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
	"hideDiscordLink": false
}

// Reset config
function resetConfig() {
	SB.config = SB.defaults;
};

function convertJson() {
	Object.keys(SB.defaults).forEach(key => {
		SB.localconfig[key] = mapDecode(SB.localconfig[key], key);
	});
}
// Add defaults
function addDefaults() {
	Object.keys(SB.defaults).forEach(key => {
		if(!SB.localconfig.hasOwnProperty(key)) {
			SB.localconfig[key] = SB.defaults[key];
		}
	});
};

// Sync config
config();
