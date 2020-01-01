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

fetchConfig = _ => new Promise(function(resolve, reject) {
    chrome.storage.sync.get(null, function(items) {
        SB.localconfig = items;  // Data is ready
        resolve();
    });
});

async function config() {
    await fetchConfig();
	addDefaults();
    SB.config = configProxy();
}

SB.defaults = {
	"startSponsorKeybind": ";",
	"submitKeybind": "'",
	"minutesSaved": 0,
	"skipCount": 0,
	"disableSkipping": false,
	"disableAutoSkip": false,
	"trackViewCount": false,
	"dontShowNoticeAgain": false
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
