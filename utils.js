var isBackgroundScript = false;
var onInvidious = false;

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
    if(url.startsWith("https://www.youtube.com/tv#/")) url = url.replace("#", "");
	
    //Attempt to parse url
    let urlObject = null;
    try { 
        urlObject = new URL(url);
    } catch (e) {      
        console.error("[SB] Unable to parse URL: " + url);
        return false;
    }

    //Check if valid hostname
    if (SB.config && SB.config.invidiousInstances.includes(urlObject.host)) {
        onInvidious = true;
    } else if (!["www.youtube.com", "www.youtube-nocookie.com"].includes(urlObject.host)) {
        if (!SB.config) {
            // Call this later, in case this is an Invidious tab
            wait(() => SB.config !== undefined).then(() => videoIDChange(getYouTubeVideoID(url)));
        }

        return false
    }

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

/**
 * Asks for the optional permissions required for all extra sites.
 * It also starts the content script registrations.
 * 
 * For now, it is just SB.config.invidiousInstances.
 * 
 * @param {CallableFunction} callback
 */
function setupExtraSitePermissions(callback) {
    // Request permission
    let permissions = ["declarativeContent"];
    if (isFirefox()) permissions = [];

    chrome.permissions.request({
        origins: getInvidiousInstancesRegex(),
        permissions: permissions
    }, async function (granted) {
        if (granted) {
            setupExtraSiteContentScripts();
        } else {
            if (isFirefox()) {
                if (isBackgroundScript) {
                    if (contentScriptRegistrations[request.id]) {
                        contentScriptRegistrations[request.id].unregister();
                        delete contentScriptRegistrations[request.id];
                    }
                } else {
                    chrome.runtime.sendMessage({
                        message: "unregisterContentScript",
                        id: "invidious"
                    });
                }
            } else {
                chrome.declarativeContent.onPageChanged.removeRules(["invidious"]);
            }
        }

        callback(granted);
    });
}

/**
 * Registers the content scripts for the extra sites.
 * Will use a different method depending on the browser.
 * This is called by setupExtraSitePermissions().
 * 
 * For now, it is just SB.config.invidiousInstances.
 */
function setupExtraSiteContentScripts() {
    let js = [
        "config.js",
        "SB.js",
        "utils/previewBar.js",
        "utils/skipNotice.js",
        "utils.js",
        "content.js",
        "popup.js"
    ];
    let css = [
        "content.css",
        "./libs/Source+Sans+Pro.css",
        "popup.css"
    ];

    if (isFirefox()) {
        let firefoxJS = [];
        for (const file of js) {
            firefoxJS.push({file});
        }
        let firefoxCSS = [];
        for (const file of css) {
            firefoxCSS.push({file});
        }

        let registration = {
            message: "registerContentScript",
            id: "invidious",
            allFrames: true,
            js: firefoxJS,
            css: firefoxCSS,
            matches: getInvidiousInstancesRegex()
        };

        if (isBackgroundScript) {
            registerFirefoxContentScript(registration);
        } else {
            chrome.runtime.sendMessage(registration);
        }
    } else {
        chrome.declarativeContent.onPageChanged.removeRules(["invidious"], function() {
            let conditions = [];
            for (const regex of getInvidiousInstancesRegex()) {
                conditions.push(new chrome.declarativeContent.PageStateMatcher({
                    pageUrl: { urlMatches: regex }
                }));
            }
            
            // Add page rule
            let rule = {
                id: "invidious",
                conditions,
                actions: [new chrome.declarativeContent.RequestContentScript({
                    allFrames: true,
                    js,
                    css
                })]
            };
            
            chrome.declarativeContent.onPageChanged.addRules([rule]);
        });
    }
}

function localizeHtmlPage() {
    //Localize by replacing __MSG_***__ meta tags
    var objects = document.getElementsByClassName("sponsorBlockPageBody")[0].children;
    for (var j = 0; j < objects.length; j++) {
        var obj = objects[j];
        
        let localizedMessage = getLocalizedMessage(obj.innerHTML.toString());
        if (localizedMessage) obj.innerHTML = localizedMessage;
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

/**
 * @returns {String[]} Invidious Instances in regex form
 */
function getInvidiousInstancesRegex() {
    var invidiousInstancesRegex = [];
    for (const url of SB.config.invidiousInstances) {
        invidiousInstancesRegex.push("https://*." + url + "/*");
        invidiousInstancesRegex.push("http://*." + url + "/*");
    }

    return invidiousInstancesRegex;
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

/**
 * Is this Firefox (web-extensions)
 */
function isFirefox() {
    return typeof(browser) !== "undefined";
}
