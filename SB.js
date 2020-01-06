SB = {};

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
            })
        },
        get: function(obj, prop) {
            return SB.localconfig[prop]
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
        if (key.startsWith("sponsorTimes")) {
            SB.config.sponsorTimes.set(key.substr(12), SB.config[key]);
            delete SB.config[key];
        }
    }
}

async function config() {
    await fetchConfig();
    addDefaults();
    migrate();
    SB.config = configProxy();
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
	"trackViewCount": false,
	"dontShowNotice": false,
	"hideVideoPlayerControls": false,
	"hideInfoButtonPlayerControls": false,
	"hideDeleteButtonPlayerControls": false
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
