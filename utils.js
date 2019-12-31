SB = {};

function configProxy() {
    chrome.storage.onChanged.addListener((changes, namespace) => {
        for (key in changes) {
            localconfig[key] = changes[key].newValue;
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
    SB.localconfig = {};
    await fetchConfig();
    SB.config = configProxy();
}

// Sync config
config();

// Function that can be used to wait for a condition before returning
async function wait(condition, timeout = 5000, check = 100) { 
    return await new Promise((resolve, reject) => {
        setTimeout(() => reject("TIMEOUT"), timeout);

        let intervalCheck = () => {
            let result = condition();
            if (result !== false) {
                resolve(result);
                clearInterval(interval);
            };
        };

        let interval = setInterval(intervalCheck, check);
        
        //run the check once first, this speeds it up a lot
        intervalCheck();
    });
}

function getYouTubeVideoID(url) {
    // For YouTube TV support
    if(document.URL.startsWith("https://www.youtube.com/tv#/")) url = url.replace("#", "");
	
    //Attempt to parse url
    let urlObject = null;
    try { 
        urlObject = new URL(url);
    } catch (e) {      
        console.error("[SB] Unable to parse URL: " + url);
        return false;
    }

    //Check if valid hostname
    if(!["www.youtube.com","www.youtube-nocookie.com"].includes(urlObject.host)) return false; 

    //Get ID from searchParam
    if (urlObject.searchParams.has("v") && ["/watch", "/watch/"].includes(urlObject.pathname) || urlObject.pathname.startsWith("/tv/watch")) {
        id = urlObject.searchParams.get("v");
        return id.length == 11 ? id : false;
    } else if (urlObject.pathname.startsWith("/embed/")) {
        try {
            return urlObject.pathname.substr(7, 11);
        } catch (e) {
            console.error("[SB] Video ID not valid for " + url);
            return false;
        }
    } 
	return false;
}

function localizeHtmlPage() {
    //Localize by replacing __MSG_***__ meta tags
    var objects = document.getElementsByClassName("sponsorBlockPageBody")[0].children;
    for (var j = 0; j < objects.length; j++) {
        var obj = objects[j];
        
        let localizedMessage = getLocalizedMessage(obj.innerHTML.toString());
        if (localizedMessage) obj.innerHTML = localizedMessage;

        // Try on each attribute
        let attributes = obj.getAttributeNames();
        for (const attribute of attributes) {
            localizedMessage = getLocalizedMessage(obj.getAttribute(attribute).toString());
            if (localizedMessage) obj.setAttribute(attribute) = localizedMessage;
        }
    }
}

function getLocalizedMessage(text) {
    var valNewH = text.replace(/__MSG_(\w+)__/g, function(match, v1) {
        return v1 ? chrome.i18n.getMessage(v1) : "";
    });

    if(valNewH != text) {
        return valNewH;
    } else {
        return false;
    }
}

function generateUserID(length = 36) {
    let charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    if (window.crypto && window.crypto.getRandomValues) {
            values = new Uint32Array(length);
            window.crypto.getRandomValues(values);
            for (i = 0; i < length; i++) {
                    result += charset[values[i] % charset.length];
            }
            return result;
    } else {
            for (let i = 0; i < length; i++) {
                result += charset[Math.floor(Math.random() * charset.length)];
            }
            return result;
    }
}

/**
 * Gets the error message in a nice string
 * 
 * @param {int} statusCode 
 * @returns {string} errorMessage
 */
function getErrorMessage(statusCode) {
    let errorMessage = "";
                        
    if([400, 429, 409, 502, 0].includes(statusCode)) {
        //treat them the same
        if (statusCode == 503) statusCode = 502;

        errorMessage = chrome.i18n.getMessage(statusCode + "") + " " + chrome.i18n.getMessage("errorCode") + statusCode
                        + "\n\n" + chrome.i18n.getMessage("statusReminder");
    } else {
        errorMessage = chrome.i18n.getMessage("connectionError") + statusCode;
    }

    return errorMessage;
}
