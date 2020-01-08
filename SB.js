SB = {};

class ListenerMap extends Map {
    constructor(name) {
        super();

        this.name = name;
    }

    set(key, value) {
        super.set(key, value);

        this.updateListener(this.name, this);
    }

    delete(key) {
        this.updateListener(this.name, this);

        return super.set(key);
    }

    clear() {
        return super.clear();
    }

    forEach(callbackfn) {
        return super.forEach(callbackfn);
    }

    get(key) {
        return super.get(key);
    }

    has(key) {
        return super.has(key);
    }
}

function mapHandler(name, object) {
    SB.config[name] = SB.config[name];
    // chrome.storage.sync.set({
    //     [name]: object
    // });

    // console.log(name)
    // console.log(object)
}

function configProxy() {
    chrome.storage.onChanged.addListener((changes, namespace) => {
        for (key in changes) {
            SB.localconfig[key] = changes[key].newValue;
        }
    });

    var handler = {
        set: function(obj, prop, value) {
            chrome.storage.sync.set({
                [prop]: value
            });
        },
        get: function(obj, prop) {
            return SB.localconfig[prop];
        }
    };

    return new Proxy({}, handler);
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
    // Setup sponsorTime listener
    SB.localconfig.sponsorTimes.updateListener = mapHandler;

    SB.config = configProxy();
    migrate();
    
    
}

SB.defaults = {
	"sponsorTimes": new ListenerMap("sponsorTimes"),
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
