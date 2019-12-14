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
    if ((urlObject.pathname == "/watch" || urlObject.pathname == "/watch/") && urlObject.searchParams.has("v")) {
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
    var objects = document.getElementsByClassName("popupBody")[0].children;
    for (var j = 0; j < objects.length; j++) {
        var obj = objects[j];

        var valStrH = obj.innerHTML.toString();
        var valNewH = valStrH.replace(/__MSG_(\w+)__/g, function(match, v1)
        {
            return v1 ? chrome.i18n.getMessage(v1) : "";
        });

        if(valNewH != valStrH)
        {
            obj.innerHTML = valNewH;
        }
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