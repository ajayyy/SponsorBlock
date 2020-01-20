isBackgroundScript = true;

// Used only on Firefox, which does not support non persistent background pages.
var contentScriptRegistrations = {};

// Register content script if needed
if (isFirefox()) {
    wait(() => SB.config !== undefined).then(function() {
        if (SB.config.supportInvidious) setupExtraSiteContentScripts();
    });
} 

chrome.tabs.onUpdated.addListener(function(tabId) {
	chrome.tabs.sendMessage(tabId, {
        message: 'update',
	}, () => void chrome.runtime.lastError ); // Suppress error on Firefox
});

chrome.runtime.onMessage.addListener(function (request, sender, callback) {
	switch(request.message) {
        case "openConfig":
            chrome.runtime.openOptionsPage();
            return
        case "submitTimes":
            submitTimes(request.videoID, callback);
        
            //this allows the callback to be called later by the submitTimes function
            return true; 
        case "addSponsorTime":
            addSponsorTime(request.time, request.videoID, callback);
        
            //this allows the callback to be called later
            return true;
        
        case "getSponsorTimes":
            getSponsorTimes(request.videoID, function(sponsorTimes) {
                callback({
                    sponsorTimes: sponsorTimes
                })
            });
        
            //this allows the callback to be called later
            return true;
        case "submitVote":
            submitVote(request.type, request.UUID, callback);
        
            //this allows the callback to be called later
            return true;
        case "alertPrevious":
            chrome.notifications.create("stillThere" + Math.random(), {
                type: "basic",
                title: chrome.i18n.getMessage("wantToSubmit") + " " + request.previousVideoID + "?",
                message: chrome.i18n.getMessage("leftTimes"),
                iconUrl: "./icons/LogoSponsorBlocker256px.png"
            });
        case "registerContentScript": 
            registerFirefoxContentScript(request);
            return false;
        case "unregisterContentScript": 
            contentScriptRegistrations[request.id].unregister();
            delete contentScriptRegistrations[request.id];
            
            return false;
	}
});

//add help page on install
chrome.runtime.onInstalled.addListener(function (object) {
    // This let's the config sync to run fully before checking.
    // This is required on Firefox
    setTimeout(function() {
        const userID = SB.config.userID;

        // If there is no userID, then it is the first install.
        if (!userID){
            //open up the install page
            chrome.tabs.create({url: chrome.extension.getURL("/help/index_en.html")});

            //generate a userID
            const newUserID = generateUserID();
            //save this UUID
            SB.config.userID = newUserID;
            
            //TODO: Remove when invidious support is old
            // Don't show this to new users
            SB.config.invidiousUpdateInfoShowCount = 6;
        }
    }, 1500);
});

/**
 * Only works on Firefox.
 * Firefox requires that it be applied after every extension restart.
 * 
 * @param {JSON} options 
 */
function registerFirefoxContentScript(options) {
    let oldRegistration = contentScriptRegistrations[options.id];
    if (oldRegistration) oldRegistration.unregister();

    browser.contentScripts.register({
        allFrames: options.allFrames,
        js: options.js,
        css: options.css,
        matches: options.matches
    }).then(() => void (contentScriptRegistrations[options.id] = registration));
}

//gets the sponsor times from memory
function getSponsorTimes(videoID, callback) {
    let sponsorTimes = [];
    let sponsorTimesStorage = SB.config.sponsorTimes.get(videoID);
	
    if (sponsorTimesStorage != undefined && sponsorTimesStorage.length > 0) {
        sponsorTimes = sponsorTimesStorage;
    }
	
    callback(sponsorTimes);
}

function addSponsorTime(time, videoID, callback) {
    getSponsorTimes(videoID, function(sponsorTimes) {
        //add to sponsorTimes
        if (sponsorTimes.length > 0 && sponsorTimes[sponsorTimes.length - 1].length < 2) {
            //it is an end time
            sponsorTimes[sponsorTimes.length - 1][1] = time;
        } else {
            //it is a start time
            let sponsorTimesIndex = sponsorTimes.length;
            sponsorTimes[sponsorTimesIndex] = [];

            sponsorTimes[sponsorTimesIndex][0] = time;
        }

        //save this info
		SB.config.sponsorTimes.set(videoID, sponsorTimes);
		callback();
    });
}

function submitVote(type, UUID, callback) {
    let userID = SB.config.userID;

    if (userID == undefined || userID === "undefined") {
        //generate one
        userID = generateUserID();
        SB.config.userID = userID;
    }

    //publish this vote
    sendRequestToServer("POST", "/api/voteOnSponsorTime?UUID=" + UUID + "&userID=" + userID + "&type=" + type, function(xmlhttp, error) {
        if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
            callback({
                successType: 1
            });
        } else if (xmlhttp.readyState == 4 && xmlhttp.status == 405) {
            //duplicate vote
            callback({
                successType: 0,
                statusCode: xmlhttp.status
            });
        } else if (error) {
            //error while connect
            callback({
                successType: -1,
                statusCode: xmlhttp.status
            });
        }

    });
}

async function submitTimes(videoID, callback) {
    //get the video times from storage
    let sponsorTimes = SB.config.sponsorTimes.get(videoID);
    let userID = SB.config.userID;
		
    if (sponsorTimes != undefined && sponsorTimes.length > 0) {
        let durationResult = await new Promise((resolve, reject) => {
            chrome.tabs.query({
                active: true,
                currentWindow: true
            }, function(tabs) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    message: "getVideoDuration"
                }, (response) => resolve(response));
            });
        });

        //check if a sponsor exceeds the duration of the video
        for (let i = 0; i < sponsorTimes.length; i++) {
            if (sponsorTimes[i][1] > durationResult.duration) {
                sponsorTimes[i][1] = durationResult.duration;
            }
        }

        //submit these times
        for (let i = 0; i < sponsorTimes.length; i++) {
                //to prevent it from happeneing twice
                let increasedContributionAmount = false;

                //submit the sponsorTime
                sendRequestToServer("GET", "/api/postVideoSponsorTimes?videoID=" + videoID + "&startTime=" + sponsorTimes[i][0] + "&endTime=" + sponsorTimes[i][1]
                + "&userID=" + userID, function(xmlhttp, error) {
					if (xmlhttp.readyState == 4 && !error) {
                        callback({
                            statusCode: xmlhttp.status
                        });

                    if (xmlhttp.status == 200) {
                        //add these to the storage log
                                currentContributionAmount = SB.config.sponsorTimesContributed;
                                //save the amount contributed
                                if (!increasedContributionAmount) {
                                    increasedContributionAmount = true;
                                    SB.config.sponsorTimesContributed = currentContributionAmount + sponsorTimes.length;
                                }
                        }
                    } else if (error) {
                        callback({
                            statusCode: -1
                        });
                    }
            });
        }
    }
}

function sendRequestToServer(type, address, callback) {
    let xmlhttp = new XMLHttpRequest();

    xmlhttp.open(type, serverAddress + address, true);

    if (callback != undefined) {
        xmlhttp.onreadystatechange = function () {
            callback(xmlhttp, false);
        };
  
        xmlhttp.onerror = function(ev) {
            callback(xmlhttp, true);
        };
    }

    //submit this request
    xmlhttp.send();
}
