import SB from "./SB";

import Utils from "./utils";
var utils = new Utils();

import runThePopup from "./popup";

import PreviewBar from "./js-components/previewBar";
import SkipNotice from "./js-components/skipNotice";

//was sponsor data found when doing SponsorsLookup
var sponsorDataFound = false;
var previousVideoID = null;
//the actual sponsorTimes if loaded and UUIDs associated with them
var sponsorTimes = null;
var UUIDs = null;
//what video id are these sponsors for
var sponsorVideoID = null;

//these are sponsors that have been downvoted
var hiddenSponsorTimes = [];

/** @type {Array[boolean]} Has the sponsor been skipped */
var sponsorSkipped = [];

//the video
var v;

var onInvidious;

//the video id of the last preview bar update
var lastPreviewBarUpdate;

//whether the duration listener listening for the duration changes of the video has been setup yet
var durationListenerSetUp = false;

//the channel this video is about
var channelURL;

//the title of the last video loaded. Used to make sure the channel URL has been updated yet.
var title;

//is this channel whitelised from getting sponsors skipped
var channelWhitelisted = false;

// create preview bar
var previewBar = null;

//the player controls on the YouTube player
var controls = null;

// Direct Links
videoIDChange(getYouTubeVideoID(document.URL));

//the last time looked at (used to see if this time is in the interval)
var lastTime = -1;

//the amount of times the sponsor lookup has retried
//this only happens if there is an error
var sponsorLookupRetries = 0;

//the last time in the video a sponsor was skipped
//used for the go back button
var lastSponsorTimeSkipped = null;
//used for ratings
var lastSponsorTimeSkippedUUID = null;

//if showing the start sponsor button or the end sponsor button on the player
var showingStartSponsor = true;

//the sponsor times being prepared to be submitted
var sponsorTimesSubmitting = [];

//becomes true when isInfoFound is called
//this is used to close the popup on YouTube when the other popup opens
var popupInitialised = false;

// Contains all of the functions and variables needed by the skip notice
var skipNoticeContentContainer = {
    vote,
    dontShowNoticeAgain,
    unskipSponsorTime,
    sponsorTimes,
    UUIDs,
    v,
    reskipSponsorTime,
    hiddenSponsorTimes,
    updatePreviewBar
};

//get messages from the background script and the popup
chrome.runtime.onMessage.addListener(messageListener);
  
function messageListener(request: any, sender: any, sendResponse: (response: any) => void): void {
    //messages from popup script
    switch(request.message){
        case "update":
            videoIDChange(getYouTubeVideoID(document.URL));
            break;
        case "sponsorStart":
            sponsorMessageStarted(sendResponse);

            break;
        case "sponsorDataChanged":
            updateSponsorTimesSubmitting();

            break;
        case "isInfoFound":
            //send the sponsor times along with if it's found
            sendResponse({
                found: sponsorDataFound,
                sponsorTimes: sponsorTimes,
                hiddenSponsorTimes: hiddenSponsorTimes,
                UUIDs: UUIDs
            });

            if (popupInitialised && document.getElementById("sponsorBlockPopupContainer") != null) {
                //the popup should be closed now that another is opening
                closeInfoMenu();
            }

            popupInitialised = true;
            break;
        case "getVideoID":
            sendResponse({
                videoID: sponsorVideoID
            });

            break;
        case "getVideoDuration":
            sendResponse({
                duration: v.duration
            });

            break;
        case "skipToTime":
            v.currentTime = request.time;
            return
        case "getCurrentTime":
            sendResponse({
                currentTime: v.currentTime
            });

            break;
        case "getChannelURL":
            sendResponse({
            channelURL: channelURL
            });

            break;
        case "isChannelWhitelisted":
            sendResponse({
                value: channelWhitelisted
            });

            break;
        case "whitelistChange":
            channelWhitelisted = request.value;
            sponsorsLookup(sponsorVideoID);

            break;
        case "changeStartSponsorButton":
            changeStartSponsorButton(request.showStartSponsor, request.uploadButtonVisible);

            break;
    }
}

/**
 * Called when the config is updated
 * 
 * @param {String} changes 
 */
function contentConfigUpdateListener(changes) {
    for (const key in changes) {
        switch(key) {
            case "hideVideoPlayerControls":
            case "hideInfoButtonPlayerControls":
            case "hideDeleteButtonPlayerControls":
                updateVisibilityOfPlayerControlsButton()
                break;
        }
    }
}

if (!SB.configListeners.includes(contentConfigUpdateListener)) {
    SB.configListeners.push(contentConfigUpdateListener);
}

//check for hotkey pressed
document.onkeydown = async function(e){
    var key = e.key;

    let video = document.getElementById("movie_player");

    let startSponsorKey = SB.config.startSponsorKeybind;

    let submitKey = SB.config.submitKeybind;

    //is the video in focus, otherwise they could be typing a comment
    if (document.activeElement === video) {
        if(key == startSponsorKey.startSponsorKeybind){
            //semicolon
            startSponsorClicked();
        } else if (key == submitKey.submitKeybind) {
            //single quote
            submitSponsorTimes();
        }
    }
}

function resetValues() {
    //reset last sponsor times
    lastTime = -1;

    //reset sponsor times
    sponsorTimes = null;
    UUIDs = null;
    sponsorLookupRetries = 0;

    //empty the preview bar
    if (previewBar !== null) {
        previewBar.set([], [], 0);
    }

    //reset sponsor data found check
    sponsorDataFound = false;
}

function videoIDChange(id) {
    //if the id has not changed return
    if (sponsorVideoID === id) return;

    //set the global videoID
    sponsorVideoID = id;

    resetValues();
    
	//id is not valid
    if (!id) return;

    // TODO: Use a better method here than using type any
    // This is done to be able to do channelIDPromise.isFulfilled and channelIDPromise.isRejected
    let channelIDPromise: any = utils.wait(getChannelID);
    channelIDPromise.then(() => channelIDPromise.isFulfilled = true).catch(() => channelIDPromise.isRejected  = true);

    //setup the preview bar
    if (previewBar == null) {
        //create it
        utils.wait(getControls).then(result => {
            const progressElementSelectors = [
                // For YouTube
                "ytp-progress-bar-container",
                "no-model cue-range-markers",
                // For Invidious/VideoJS
                "vjs-progress-holder"
            ];

            for (const selector of progressElementSelectors) {
                const el = document.getElementsByClassName(selector);

                if (el && el.length && el[0]) {
                    previewBar = new PreviewBar(el[0]);
                    break;
                }
            }
        });
    }

    //warn them if they had unsubmitted times
    if (previousVideoID != null) {
        //get the sponsor times from storage
        let sponsorTimes = SB.config.sponsorTimes.get(previousVideoID);
        if (sponsorTimes != undefined && sponsorTimes.length > 0) {
            //warn them that they have unsubmitted sponsor times
                chrome.runtime.sendMessage({
                    message: "alertPrevious",
                    previousVideoID: previousVideoID
                })
        }

        //set the previous video id to the currentID
        previousVideoID = id;
    } else {
        //set the previous id now, don't wait for chrome.storage.get
        previousVideoID = id;
    }
  
    //close popup
    closeInfoMenu();
	
    sponsorsLookup(id, channelIDPromise);

    //make sure everything is properly added
    updateVisibilityOfPlayerControlsButton();

    //reset sponsor times submitting
    sponsorTimesSubmitting = [];

    //see if the onvideo control image needs to be changed
	utils.wait(getControls).then(result => {
		chrome.runtime.sendMessage({
			message: "getSponsorTimes",
			videoID: id
		}, function(response) {
			if (response != undefined) {
				let sponsorTimes = response.sponsorTimes;
				if (sponsorTimes != null && sponsorTimes.length > 0 && sponsorTimes[sponsorTimes.length - 1].length >= 2) {
					changeStartSponsorButton(true, true);
				} else if (sponsorTimes != null && sponsorTimes.length > 0 && sponsorTimes[sponsorTimes.length - 1].length < 2) {
                    changeStartSponsorButton(false, true);
				} else {
					changeStartSponsorButton(true, false);
                }
                
				//see if this data should be saved in the sponsorTimesSubmitting variable
				if (sponsorTimes != undefined && sponsorTimes.length > 0) {
					sponsorTimesSubmitting = sponsorTimes;
          
                    updatePreviewBar();
				}
			}
		});
	});
    //see if video controls buttons should be added
    if (!onInvidious) {
        updateVisibilityOfPlayerControlsButton();
    }
}

function sponsorsLookup(id: string, channelIDPromise = null) {
    v = document.querySelector('video') // Youtube video player
    //there is no video here
    if (v == null) {
        setTimeout(() => sponsorsLookup(id), 100);
        return;
    }

    if (!durationListenerSetUp) {
        durationListenerSetUp = true;

        //wait until it is loaded
        v.addEventListener('durationchange', updatePreviewBar);
    }

    if (channelIDPromise != null) {
        if (channelIDPromise.isFulfilled) {
            whitelistCheck();
        } else if (channelIDPromise.isRejected) {
            //try again
            utils.wait(getChannelID).then(whitelistCheck).catch();
        } else {
            //add it as a then statement
            channelIDPromise.then(whitelistCheck);
        }
    }

    //check database for sponsor times
    //made true once a setTimeout has been created to try again after a server error
    let recheckStarted = false;
    utils.sendRequestToServer('GET', "/api/getVideoSponsorTimes?videoID=" + id, function(xmlhttp) {
        if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
            sponsorDataFound = true;

            sponsorTimes = JSON.parse(xmlhttp.responseText).sponsorTimes;
            UUIDs = JSON.parse(xmlhttp.responseText).UUIDs;

            // Reset skip save
            sponsorSkipped = [];

            //update the preview bar
            //leave the type blank for now until categories are added
            if (lastPreviewBarUpdate == id || (lastPreviewBarUpdate == null && !isNaN(v.duration))) {
                //set it now
                //otherwise the listener can handle it
                updatePreviewBar();
            }

            sponsorLookupRetries = 0;
        } else if (xmlhttp.readyState == 4 && xmlhttp.status == 404) {
            sponsorDataFound = false;

            //check if this video was uploaded recently
            //use the invidious api to get the time published
            sendRequestToCustomServer('GET', "https://invidio.us/api/v1/videos/" + id + '?fields=published', function(xmlhttp, error) {
                if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
                    let unixTimePublished = JSON.parse(xmlhttp.responseText).published;

                    //if less than 3 days old
                    if ((Date.now() / 1000) - unixTimePublished < 259200) {
                        //TODO lower when server becomes better
                        setTimeout(() => sponsorsLookup(id), 180000);
                    }
                }
            });

            sponsorLookupRetries = 0;
        } else if (xmlhttp.readyState == 4 && sponsorLookupRetries < 90 && !recheckStarted) {
            recheckStarted = true;

            //TODO lower when server becomes better (back to 1 second)
            //some error occurred, try again in a second
            setTimeout(() => sponsorsLookup(id), 10000);

            sponsorLookupRetries++;
        }
    });

    //add the event to run on the videos "ontimeupdate"
    if (!SB.config.disableSkipping) {
        v.ontimeupdate = function () { 
            sponsorCheck();
        };
    }
}

function getYouTubeVideoID(url: string) {
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

    // Check if valid hostname
    if (SB.config && SB.config.invidiousInstances.includes(urlObject.host)) {
        onInvidious = true;
    } else if (!["www.youtube.com", "www.youtube-nocookie.com"].includes(urlObject.host)) {
        if (!SB.config) {
            // Call this later, in case this is an Invidious tab
            this.wait(() => SB.config !== null).then(() => this.videoIDChange(this.getYouTubeVideoID(url)));
        }

        return false
    }

    //Get ID from searchParam
    if (urlObject.searchParams.has("v") && ["/watch", "/watch/"].includes(urlObject.pathname) || urlObject.pathname.startsWith("/tv/watch")) {
        let id = urlObject.searchParams.get("v");
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

function getChannelID() {
    //get channel id
    let channelURLContainer = null;

    channelURLContainer = document.querySelector("#channel-name > #container > #text-container > #text");
    if (channelURLContainer !== null) {
        channelURLContainer = channelURLContainer.firstElementChild;
    } else if (onInvidious) {
        // Unfortunately, the Invidious HTML doesn't have much in the way of element identifiers...
        channelURLContainer = document.querySelector("body > div > div.pure-u-1.pure-u-md-20-24 div.pure-u-1.pure-u-lg-3-5 > div > a");
    } else {
        //old YouTube theme
        let channelContainers = document.getElementsByClassName("yt-user-info");
        if (channelContainers.length != 0) {
            channelURLContainer = channelContainers[0].firstElementChild;
        }
    }

    if (channelURLContainer === null) {
        //try later
        return false;
    }

    //first get the title to make sure a title change has occurred (otherwise the next video might still be loading)
    let titleInfoContainer = document.getElementById("info-contents");
    let currentTitle = "";
    if (titleInfoContainer != null) {
        currentTitle = (<HTMLElement> titleInfoContainer.firstElementChild.firstElementChild.querySelector(".title").firstElementChild).innerText;
    } else if (onInvidious) {
        // Unfortunately, the Invidious HTML doesn't have much in the way of element identifiers...
        currentTitle = document.querySelector("body > div > div.pure-u-1.pure-u-md-20-24 div.pure-u-1.pure-u-lg-3-5 > div > a > div > span").textContent;
    } else {
        //old YouTube theme
        currentTitle = document.getElementById("eow-title").innerText;
    }

    if (title == currentTitle) {
        //video hasn't changed yet, wait
        //try later
        return false;
    }
    title = currentTitle;

    channelURL = channelURLContainer.getAttribute("href");

    //reset variables
    channelWhitelisted = false;
}

function updatePreviewBar() {
    let localSponsorTimes = sponsorTimes;
    if (localSponsorTimes == null) localSponsorTimes = [];

    let allSponsorTimes = localSponsorTimes.concat(sponsorTimesSubmitting);

    //create an array of the sponsor types
    let types = [];
    for (let i = 0; i < localSponsorTimes.length; i++) {
        if (!hiddenSponsorTimes.includes(i)) {
            types.push("sponsor");
        } else {
            // Don't show this sponsor
            types.push(null);
        }
    }
    for (let i = 0; i < sponsorTimesSubmitting.length; i++) {
        types.push("previewSponsor");
    }

    utils.wait(() => previewBar !== null).then((result) => previewBar.set(allSponsorTimes, types, v.duration));

    //update last video id
    lastPreviewBarUpdate = sponsorVideoID;
}

//checks if this channel is whitelisted, should be done only after the channelID has been loaded
function whitelistCheck() {
    //see if this is a whitelisted channel
    let whitelistedChannels = SB.config.whitelistedChannels;

    if (whitelistedChannels != undefined && whitelistedChannels.includes(channelURL)) {
        channelWhitelisted = true;
    }
}

//video skipping
function sponsorCheck() {
    if (SB.config.disableSkipping) {
        // Make sure this isn't called again
        v.ontimeupdate = null;
        return;
    } else if (channelWhitelisted) {
        return;
    }

    let skipHappened = false;

    if (sponsorTimes != null) {
        //see if any sponsor start time was just passed
        for (let i = 0; i < sponsorTimes.length; i++) {
            //if something was skipped
            if (checkSponsorTime(sponsorTimes, i, true)) {
                skipHappened = true;
                break;
            }
        }
    }

    if (!skipHappened) {
        //check for the "preview" sponsors (currently edited by this user)
        for (let i = 0; i < sponsorTimesSubmitting.length; i++) {
            //must be a finished sponsor and be valid
            if (sponsorTimesSubmitting[i].length > 1 && sponsorTimesSubmitting[i][1] > sponsorTimesSubmitting[i][0]) {
                checkSponsorTime(sponsorTimesSubmitting, i, false);
            }
        }
    }

    //don't keep track until they are loaded in
    if (sponsorTimes != null || sponsorTimesSubmitting.length > 0) {
        lastTime = v.currentTime;
    }
}

function checkSponsorTime(sponsorTimes, index, openNotice) {
    //this means part of the video was just skipped
    if (Math.abs(v.currentTime - lastTime) > 1 && lastTime != -1) {
        //make lastTime as if the video was playing normally
        lastTime = v.currentTime - 0.0001;
    }

    if (checkIfTimeToSkip(v.currentTime, sponsorTimes[index][0], sponsorTimes[index][1]) && !hiddenSponsorTimes.includes(index)) {
        //skip it
        skipToTime(v, index, sponsorTimes, openNotice);

        //something was skipped
        return true;
    }

    return false;
}

function checkIfTimeToSkip(currentVideoTime, startTime, endTime) {
    //If the sponsor time is in between these times, skip it
    //Checks if the last time skipped to is not too close to now, to make sure not to get too many
    //  sponsor times in a row (from one troll)
    //the last term makes 0 second start times possible only if the video is not setup to start at a different time from zero
    return (Math.abs(currentVideoTime - startTime) < 3 && startTime >= lastTime && startTime <= currentVideoTime) || 
                (lastTime == -1 && startTime == 0 && currentVideoTime < endTime)
}

//skip fromt he start time to the end time for a certain index sponsor time
function skipToTime(v, index, sponsorTimes, openNotice) {
    if (!SB.config.disableAutoSkip) {
        v.currentTime = sponsorTimes[index][1];
    }

    lastSponsorTimeSkipped = sponsorTimes[index][0];
  
    let currentUUID =  UUIDs[index];
    lastSponsorTimeSkippedUUID = currentUUID; 

    if (openNotice) {
        //send out the message saying that a sponsor message was skipped
        if (!SB.config.dontShowNotice) {
            let skipNotice = new SkipNotice(this, currentUUID, SB.config.disableAutoSkip, skipNoticeContentContainer);

            //TODO: Remove this when Invidious support is old
            if (SB.config.invidiousUpdateInfoShowCount < 5) {
                skipNotice.addNoticeInfoMessage(chrome.i18n.getMessage("invidiousInfo1"), chrome.i18n.getMessage("invidiousInfo2"));

                SB.config.invidiousUpdateInfoShowCount += 1;
            }

            //auto-upvote this sponsor
            if (SB.config.trackViewCount && !SB.config.disableAutoSkip && SB.config.autoUpvote) {
                vote(1, currentUUID, null);
            }
        }
    }

    //send telemetry that a this sponsor was skipped
    if (SB.config.trackViewCount && !sponsorSkipped[index]) {
        utils.sendRequestToServer("POST", "/api/viewedVideoSponsorTime?UUID=" + currentUUID);

        if (!SB.config.disableAutoSkip) {
            // Count this as a skip
            SB.config.minutesSaved = SB.config.minutesSaved + (sponsorTimes[index][1] - sponsorTimes[index][0]) / 60;
            SB.config.skipCount = SB.config.skipCount + 1;
            sponsorSkipped[index] = true;
        }
    }
}

function unskipSponsorTime(UUID) {
    if (sponsorTimes != null) {
        //add a tiny bit of time to make sure it is not skipped again
        v.currentTime = sponsorTimes[UUIDs.indexOf(UUID)][0] + 0.001;
    }
}

function reskipSponsorTime(UUID) {
    if (sponsorTimes != null) {
        //add a tiny bit of time to make sure it is not skipped again
        v.currentTime = sponsorTimes[UUIDs.indexOf(UUID)][1];
    }
}

function createButton(baseID, title, callback, imageName, isDraggable=false) {
    if (document.getElementById(baseID + "Button") != null) return;

    // Button HTML
    let newButton = document.createElement("button");
    newButton.draggable = isDraggable;
    newButton.id = baseID + "Button";
    newButton.className = "ytp-button playerButton";
    newButton.setAttribute("title", chrome.i18n.getMessage(title));
    newButton.addEventListener("click", callback);

    // Image HTML
    let newButtonImage = document.createElement("img");
    newButton.draggable = isDraggable;
    newButtonImage.id = baseID + "Image";
    newButtonImage.className = "playerButtonImage";
    newButtonImage.src = chrome.extension.getURL("icons/" + imageName);

    // Append image to button
    newButton.appendChild(newButtonImage);

    // Add the button to player
    controls.prepend(newButton);
}

function getControls() {
    let controls = document.getElementsByClassName("ytp-right-controls");

    if (!controls || controls.length === 0) {
        // The invidious video element's controls element
        controls = document.getElementsByClassName("vjs-control-bar");
        return (!controls || controls.length === 0) ? false : controls[controls.length - 1];
    } else {
        return controls[controls.length - 1];
    }
};

//adds all the player controls buttons
async function createButtons() {
    let result = await utils.wait(getControls).catch();

    //set global controls variable
    controls = result;

    // Add button if does not already exist in html
    createButton("startSponsor", "sponsorStart", startSponsorClicked, "PlayerStartIconSponsorBlocker256px.png");	  
    createButton("info", "openPopup", openInfoMenu, "PlayerInfoIconSponsorBlocker256px.png")
    createButton("delete", "clearTimes", clearSponsorTimes, "PlayerDeleteIconSponsorBlocker256px.png");
    createButton("submit", "SubmitTimes", submitSponsorTimes, "PlayerUploadIconSponsorBlocker256px.png");
}
//adds or removes the player controls button to what it should be
async function updateVisibilityOfPlayerControlsButton() {
    //not on a proper video yet
    if (!sponsorVideoID) return;

    await createButtons();
	
    if (SB.config.hideVideoPlayerControls || onInvidious) {
        document.getElementById("startSponsorButton").style.display = "none";
        document.getElementById("submitButton").style.display = "none";
    } else {
        document.getElementById("startSponsorButton").style.removeProperty("display");
    }

    //don't show the info button on embeds
    if (SB.config.hideInfoButtonPlayerControls || document.URL.includes("/embed/") || onInvidious) {
        document.getElementById("infoButton").style.display = "none";
    } else {
        document.getElementById("infoButton").style.removeProperty("display");
    }
    
    if (SB.config.hideDeleteButtonPlayerControls || onInvidious) {
        document.getElementById("deleteButton").style.display = "none";
    }
}

function startSponsorClicked() {
    //it can't update to this info yet
    closeInfoMenu();

    toggleStartSponsorButton();

    //send back current time with message
    chrome.runtime.sendMessage({
        message: "addSponsorTime",
        time: v.currentTime,
        videoID: sponsorVideoID
    }, function(response) {
        //see if the sponsorTimesSubmitting needs to be updated
        updateSponsorTimesSubmitting();
    });
}

function updateSponsorTimesSubmitting() {
    chrome.runtime.sendMessage({
        message: "getSponsorTimes",
        videoID: sponsorVideoID
    }, function(response) {
        if (response != undefined) {
            let sponsorTimes = response.sponsorTimes;

            //see if this data should be saved in the sponsorTimesSubmitting variable
            if (sponsorTimes != undefined) {
                sponsorTimesSubmitting = sponsorTimes;

                updatePreviewBar();
            }
        }
    });
}

//is the submit button on the player loaded yet
function isSubmitButtonLoaded() {
    return document.getElementById("submitButton") !== null;
}

async function changeStartSponsorButton(showStartSponsor, uploadButtonVisible) {
    if(!sponsorVideoID) return false;
    
    //make sure submit button is loaded
    await utils.wait(isSubmitButtonLoaded);
    
    //if it isn't visible, there is no data
    let shouldHide = (uploadButtonVisible && !(SB.config.hideDeleteButtonPlayerControls || onInvidious)) ? "unset" : "none"
    document.getElementById("deleteButton").style.display = shouldHide;

    if (showStartSponsor) {
        showingStartSponsor = true;
        (<HTMLImageElement> document.getElementById("startSponsorImage")).src = chrome.extension.getURL("icons/PlayerStartIconSponsorBlocker256px.png");
        document.getElementById("startSponsorButton").setAttribute("title", chrome.i18n.getMessage("sponsorStart"));

        if (document.getElementById("startSponsorImage").style.display != "none" && uploadButtonVisible && !SB.config.hideInfoButtonPlayerControls) {
            document.getElementById("submitButton").style.display = "unset";
        } else if (!uploadButtonVisible) {
            //disable submit button
            document.getElementById("submitButton").style.display = "none";
        }
    } else {
        showingStartSponsor = false;
        (<HTMLImageElement> document.getElementById("startSponsorImage")).src = chrome.extension.getURL("icons/PlayerStopIconSponsorBlocker256px.png");
        document.getElementById("startSponsorButton").setAttribute("title", chrome.i18n.getMessage("sponsorEND"));

        //disable submit button
        document.getElementById("submitButton").style.display = "none";
    }
}

function toggleStartSponsorButton() {
    changeStartSponsorButton(!showingStartSponsor, true);
}

function openInfoMenu() {
    if (document.getElementById("sponsorBlockPopupContainer") != null) {
        //it's already added
        return;
    }

    popupInitialised = false;

    //hide info button
    document.getElementById("infoButton").style.display = "none";

    sendRequestToCustomServer('GET', chrome.extension.getURL("popup.html"), function(xmlhttp) {
        if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
            var popup = document.createElement("div");
            popup.id = "sponsorBlockPopupContainer";
            popup.innerHTML = xmlhttp.responseText

            //close button
            let closeButton = document.createElement("div");
            closeButton.innerText = "Close Popup";
            closeButton.classList.add("smallLink");
            closeButton.setAttribute("align", "center");
            closeButton.addEventListener("click", closeInfoMenu);

            //add the close button
            popup.prepend(closeButton);
    
            let parentNodes = document.querySelectorAll("#secondary");
            let parentNode = null;
            for (let i = 0; i < parentNodes.length; i++) {
                if (parentNodes[i].firstElementChild !== null) {
                    parentNode = parentNodes[i];
                }
            }
            if (parentNode == null) {
                //old youtube theme
                parentNode = document.getElementById("watch7-sidebar-contents");
            }
                

            //make the logo source not 404
            //query selector must be used since getElementByID doesn't work on a node and this isn't added to the document yet
            let logo = <HTMLImageElement> popup.querySelector("#sponsorBlockPopupLogo");
            logo.src = chrome.extension.getURL("icons/LogoSponsorBlocker256px.png");

            //remove the style sheet and font that are not necessary
            popup.querySelector("#sponsorBlockPopupFont").remove();
            popup.querySelector("#sponsorBlockStyleSheet").remove();

            parentNode.insertBefore(popup, parentNode.firstChild);

            //run the popup init script
            runThePopup(messageListener);
        }
    });
}

function closeInfoMenu() {
    let popup = document.getElementById("sponsorBlockPopupContainer");
    if (popup != null) {
        popup.remove();

        //show info button if it's not an embed
        if (!document.URL.includes("/embed/")) {
            document.getElementById("infoButton").style.display = "unset";
        }
    }
}

function clearSponsorTimes() {
    //it can't update to this info yet
    closeInfoMenu();

    let currentVideoID = sponsorVideoID;

    let sponsorTimes = SB.config.sponsorTimes.get(currentVideoID);

    if (sponsorTimes != undefined && sponsorTimes.length > 0) {
        let confirmMessage = chrome.i18n.getMessage("clearThis") + getSponsorTimesMessage(sponsorTimes)
                                + "\n" + chrome.i18n.getMessage("confirmMSG")
        if(!confirm(confirmMessage)) return;

        //clear the sponsor times
        SB.config.sponsorTimes.delete(currentVideoID);

        //clear sponsor times submitting
        sponsorTimesSubmitting = [];

        updatePreviewBar();

        //set buttons to be correct
        changeStartSponsorButton(true, false);
    }
}

//if skipNotice is null, it will not affect the UI
function vote(type, UUID, skipNotice) {
    if (skipNotice != null) {
        //add loading info
        skipNotice.addVoteButtonInfo.bind(skipNotice)("Loading...")
        skipNotice.resetNoticeInfoMessage.bind(skipNotice)();
    }

    let sponsorIndex = UUIDs.indexOf(UUID);

    // See if the local time saved count and skip count should be saved
    if (type == 0 && sponsorSkipped[sponsorIndex] || type == 1 && !sponsorSkipped[sponsorIndex]) {
        let factor = 1;
        if (type == 0) {
            factor = -1;

            sponsorSkipped[sponsorIndex] = false;
        }

            // Count this as a skip
            SB.config.minutesSaved = SB.config.minutesSaved + factor * (sponsorTimes[sponsorIndex][1] - sponsorTimes[sponsorIndex][0]) / 60;
		
            SB.config.skipCount = 0;

            SB.config.skipCount = SB.config.skipCount + factor * 1;
    }
 
    chrome.runtime.sendMessage({
        message: "submitVote",
        type: type,
        UUID: UUID
    }, function(response) {
        if (response != undefined) {
            //see if it was a success or failure
            if (skipNotice != null) {
                if (response.successType == 1 || (response.successType == -1 && response.statusCode == 429)) {
                    //success (treat rate limits as a success)
                    if (type == 0) {
                        skipNotice.afterDownvote.bind(skipNotice)();
                    }
                } else if (response.successType == 0) {
                    //failure: duplicate vote
                    skipNotice.addNoticeInfoMessage.bind(skipNotice)(chrome.i18n.getMessage("voteFail"))
                    skipNotice.resetVoteButtonInfo.bind(skipNotice)();
                } else if (response.successType == -1) {
                    skipNotice.addNoticeInfoMessage.bind(skipNotice)(utils.getErrorMessage(response.statusCode))
                    skipNotice.resetVoteButtonInfo.bind(skipNotice)();
                }
            }
        }
    });
}

//Closes all notices that tell the user that a sponsor was just skipped
function closeAllSkipNotices(){
    let notices = document.getElementsByClassName("sponsorSkipNotice");
    for (let i = 0; i < notices.length; i++) {
        notices[i].remove();
    }
}

function dontShowNoticeAgain() {
    SB.config.dontShowNotice = true;
    closeAllSkipNotices();
}

function sponsorMessageStarted(callback) {
    v = document.querySelector('video');

    //send back current time
    callback({
        time: v.currentTime
    })

    //update button
    toggleStartSponsorButton();
}

function submitSponsorTimes() {
    if (document.getElementById("submitButton").style.display == "none") {
        //don't submit, not ready
        return;
    }

    //it can't update to this info yet
    closeInfoMenu();

    let currentVideoID = sponsorVideoID;

    let sponsorTimes =  SB.config.sponsorTimes.get(currentVideoID);

    if (sponsorTimes != undefined && sponsorTimes.length > 0) {
        //check if a sponsor exceeds the duration of the video
        for (let i = 0; i < sponsorTimes.length; i++) {
            if (sponsorTimes[i][1] > v.duration) {
                sponsorTimes[i][1] = v.duration;
            }
        }
        //update sponsorTimes
        SB.config.sponsorTimes.set(currentVideoID, sponsorTimes);

        //update sponsorTimesSubmitting
        sponsorTimesSubmitting = sponsorTimes;

        let confirmMessage = chrome.i18n.getMessage("submitCheck") + "\n\n" + getSponsorTimesMessage(sponsorTimes)
                                + "\n\n" + chrome.i18n.getMessage("confirmMSG")  + "\n\n" + chrome.i18n.getMessage("guildlinesSummary");
        if(!confirm(confirmMessage)) return;

        sendSubmitMessage();
    }

}

//send the message to the background js
//called after all the checks have been made that it's okay to do so
function sendSubmitMessage(){
    //add loading animation
    (<HTMLImageElement> document.getElementById("submitImage")).src = chrome.extension.getURL("icons/PlayerUploadIconSponsorBlocker256px.png");
    document.getElementById("submitButton").style.animation = "rotate 1s 0s infinite";

    let currentVideoID = sponsorVideoID;

    chrome.runtime.sendMessage({
        message: "submitTimes",
        videoID: currentVideoID
    }, function(response) {
        if (response != undefined) {
            if (response.statusCode == 200) {
                //hide loading message
                let submitButton = document.getElementById("submitButton");
                //finish this animation
                submitButton.style.animation = "rotate 1s";
                //when the animation is over, hide the button
                let animationEndListener =  function() {
                    changeStartSponsorButton(true, false);

                    submitButton.style.animation = "none";

                    submitButton.removeEventListener("animationend", animationEndListener);
                };

                submitButton.addEventListener("animationend", animationEndListener);

                //clear the sponsor times
                SB.config.sponsorTimes.delete(currentVideoID);

                //add submissions to current sponsors list
                sponsorTimes = sponsorTimes.concat(sponsorTimesSubmitting);
                for (let i = 0; i < sponsorTimesSubmitting.length; i++) {
                    // Add some random IDs
                    UUIDs.push(utils.generateUserID());
                }

                // Empty the submitting times
                sponsorTimesSubmitting = [];

                updatePreviewBar();
            } else {
                //show that the upload failed
                document.getElementById("submitButton").style.animation = "unset";
                (<HTMLImageElement> document.getElementById("submitImage")).src = chrome.extension.getURL("icons/PlayerUploadFailedIconSponsorBlocker256px.png");

                alert(utils.getErrorMessage(response.statusCode));
            }
        }
    });
}

//get the message that visually displays the video times
function getSponsorTimesMessage(sponsorTimes) {
    let sponsorTimesMessage = "";

    for (let i = 0; i < sponsorTimes.length; i++) {
        for (let s = 0; s < sponsorTimes[i].length; s++) {
            let timeMessage = getFormattedTime(sponsorTimes[i][s]);
            //if this is an end time
            if (s == 1) {
                timeMessage = " to " + timeMessage;
            } else if (i > 0) {
                //add commas if necessary
                timeMessage = ", " + timeMessage;
            }

            sponsorTimesMessage += timeMessage;
        }
    }

    return sponsorTimesMessage;
}

//converts time in seconds to minutes:seconds
function getFormattedTime(seconds) {
    let minutes = Math.floor(seconds / 60);
    let secondsNum: number = Math.round(seconds - minutes * 60);
    let secondsDisplay: string = String(secondsNum);
    
    if (secondsNum < 10) {
        //add a zero
        secondsDisplay = "0" + secondsNum;
    }

    let formatted = minutes + ":" + secondsDisplay;

    return formatted;
}

function sendRequestToCustomServer(type, fullAddress, callback) {
    let xmlhttp = new XMLHttpRequest();

    xmlhttp.open(type, fullAddress, true);

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
