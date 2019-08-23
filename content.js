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

//the video
var v;

var listenerAdded;

//the video id of the last preview bar update
var lastPreviewBarUpdate;

//whether the duration listener listening for the duration changes of the video has been setup yet
var durationListenerSetUp = false;

//the channel this video is about
var channelURL;

//is this channel whitelised from getting sponsors skipped
var channelWhitelisted = false;

// create preview bar
var previewBar;

if (id = getYouTubeVideoID(document.URL)) { // Direct Links
    videoIDChange(id);
}

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

//should the video controls buttons be added
var hideVideoPlayerControls = false;
var hideInfoButtonPlayerControls = false;
var hideDeleteButtonPlayerControls = false;

//the sponsor times being prepared to be submitted
var sponsorTimesSubmitting = [];

//becomes true when isInfoFound is called
//this is used to close the popup on YouTube when the other popup opens
var popupInitialised = false;

//should view counts be tracked
var trackViewCount = false;
chrome.storage.sync.get(["trackViewCount"], function(result) {
    let trackViewCountStorage = result.trackViewCount;
    if (trackViewCountStorage != undefined) {
        trackViewCount = trackViewCountStorage;
    } else {
        trackViewCount = true;
    }
});

//if the notice should not be shown
//happens when the user click's the "Don't show notice again" button
var dontShowNotice = false;
chrome.storage.sync.get(["dontShowNoticeAgain"], function(result) {
    let dontShowNoticeAgain = result.dontShowNoticeAgain;
    if (dontShowNoticeAgain != undefined) {
        dontShowNotice = dontShowNoticeAgain;
    }
});

//get messages from the background script and the popup
chrome.runtime.onMessage.addListener(messageListener);
  
function messageListener(request, sender, sendResponse) {
        //messages from popup script
  
        if (request.message == "update") {
            if(id = getYouTubeVideoID(document.URL)){
                videoIDChange(id);
            } else {
                resetValues();
            }
        }
  
        if (request.message == "sponsorStart") {
            sponsorMessageStarted(sendResponse);
        }

        if (request.message == "sponsorDataChanged") {
            updateSponsorTimesSubmitting();
        }

        if (request.message == "isInfoFound") {
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
        }

        if (request.message == "getVideoID") {
            sendResponse({
                videoID: getYouTubeVideoID(document.URL)
            })
        }

        if (request.message == "skipToTime") {
            v.currentTime = request.time;
        }

        if (request.message == "getCurrentTime") {
            sendResponse({
                currentTime: v.currentTime
            });
        }

        if (request.message == "getChannelURL") {
            sendResponse({
                channelURL: channelURL
            })
        }

        if (request.message == "isChannelWhitelisted") {
            sendResponse({
                value: channelWhitelisted
            })
        }

        if (request.message == "whitelistChange") {
            channelWhitelisted = request.value;
            sponsorsLookup(getYouTubeVideoID(document.URL));
        }

        if (request.message == "showNoticeAgain") {
            dontShowNotice = false;
        }

        if (request.message == "changeStartSponsorButton") {
            changeStartSponsorButton(request.showStartSponsor, request.uploadButtonVisible);
        }

        if (request.message == "changeVideoPlayerControlsVisibility") {
            hideVideoPlayerControls = request.value;

            updateVisibilityOfPlayerControlsButton();
        } else if (request.message == "changeInfoButtonPlayerControlsVisibility") {
            hideInfoButtonPlayerControls = request.value;

            updateVisibilityOfPlayerControlsButton();
        } else if (request.message == "changeDeleteButtonPlayerControlsVisibility") {
            hideDeleteButtonPlayerControls = request.value;

            updateVisibilityOfPlayerControlsButton();
        }

        if (request.message == "trackViewCount") {
            trackViewCount = request.value;
        }
}

//check for hotkey pressed
document.onkeydown = function(e){
    e = e || window.event;
    var key = e.which || e.keyCode;

    let video = document.getElementById("movie_player");

    //is the video in focus, otherwise they could be typing a comment
    if (document.activeElement === video) {
        if(key == 186){
            //semicolon
            startSponsorClicked();
        } else if (key == 222) {
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
    sponsorVideoID = id;
    sponsorLookupRetries = 0;

    //empty the preview bar
    previewBar.set([], [], 0);

    //reset sponsor data found check
    sponsorDataFound = false;
}

function videoIDChange(id) {
    //not a url change
    if (sponsorVideoID == id) return;

    if (previewBar == null) {
        //create it
        let progressBar = document.getElementsByClassName("ytp-progress-bar-container")[0] || document.getElementsByClassName("no-model cue-range-markers")[0];
        previewBar = new PreviewBar(progressBar);
    }

    //warn them if they had unsubmitted times
    if (previousVideoID != null) {
        //get the sponsor times from storage
        let sponsorTimeKey = 'sponsorTimes' + previousVideoID;
        chrome.storage.sync.get([sponsorTimeKey], function(result) {
            let sponsorTimes = result[sponsorTimeKey];

            if (sponsorTimes != undefined && sponsorTimes.length > 0) {
                //warn them that they have unsubmitted sponsor times
                    chrome.runtime.sendMessage({
                        message: "alertPrevious",
                        previousVideoID: previousVideoID
                    })
            }

            //set the previous video id to the currentID
            previousVideoID = id;
        });
    } else {
        //set the previous id now, don't wait for chrome.storage.get
        previousVideoID = id;
    }
  
    //close popup
    closeInfoMenu();

    resetValues();

    sponsorsLookup(id);

    //make sure everything is properly added
    updateVisibilityOfPlayerControlsButton(true);

    //reset sponsor times submitting
    sponsorTimesSubmitting = [];

    //see if the onvideo control image needs to be changed
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

    //see if video controls buttons should be added
    chrome.storage.sync.get(["hideVideoPlayerControls"], function(result) {
        if (result.hideVideoPlayerControls != undefined) {
            hideVideoPlayerControls = result.hideVideoPlayerControls;
        }

        updateVisibilityOfPlayerControlsButton();
    });
    chrome.storage.sync.get(["hideInfoButtonPlayerControls"], function(result) {
        if (result.hideInfoButtonPlayerControls != undefined) {
            hideInfoButtonPlayerControls = result.hideInfoButtonPlayerControls;
        }

        updateVisibilityOfPlayerControlsButton();
    });
    chrome.storage.sync.get(["hideDeleteButtonPlayerControls"], function(result) {
        if (result.hideDeleteButtonPlayerControls != undefined) {
            hideDeleteButtonPlayerControls = result.hideDeleteButtonPlayerControls;
        }

        updateVisibilityOfPlayerControlsButton(false);
    });
  
}

function sponsorsLookup(id) {
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
  
    //check database for sponsor times
    sendRequestToServer('GET', "/api/getVideoSponsorTimes?videoID=" + id, function(xmlhttp) {
        if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
            sponsorDataFound = true;

            sponsorTimes = JSON.parse(xmlhttp.responseText).sponsorTimes;
            UUIDs = JSON.parse(xmlhttp.responseText).UUIDs;

            //update the preview bar
            //leave the type blank for now until categories are added
            if (lastPreviewBarUpdate == id || (lastPreviewBarUpdate == null && !isNaN(v.duration))) {
                //set it now
                //otherwise the listener can handle it
                updatePreviewBar();
            }

            getChannelID();

            sponsorLookupRetries = 0;
        } else if (xmlhttp.readyState == 4 && xmlhttp.status == 404) {
            sponsorDataFound = false;

            //check if this video was uploaded recently
            //use the invidious api to get the time published
            sendRequestToCustomServer('GET', "https://invidio.us/api/v1/videos/" + id, function(xmlhttp, error) {
                if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
                    let unixTimePublished = JSON.parse(xmlhttp.responseText).published;

                    //if less than 3 days old
                    if ((Date.now() / 1000) - unixTimePublished < 259200) {
                        setTimeout(() => sponsorsLookup(id), 10000);
                    }
                }
            });

            sponsorLookupRetries = 0;
        } else if (xmlhttp.readyState == 4 && sponsorLookupRetries < 90) {
            //some error occurred, try again in a second
            setTimeout(() => sponsorsLookup(id), 1000);

            sponsorLookupRetries++;
        }
    });

    //add the event to run on the videos "ontimeupdate"
    v.ontimeupdate = function () { 
        sponsorCheck();
    };
}

function updatePreviewBar() {
    let localSponsorTimes = sponsorTimes;
    if (localSponsorTimes == null) localSponsorTimes = [];

    let allSponsorTimes = localSponsorTimes.concat(sponsorTimesSubmitting);

    //create an array of the sponsor types
    let types = [];
    for (let i = 0; i < localSponsorTimes.length; i++) {
        types.push("sponsor");
    }
    for (let i = 0; i < sponsorTimesSubmitting.length; i++) {
        types.push("previewSponsor");
    }

    previewBar.set(allSponsorTimes, types, v.duration);

    //update last video id
    lastPreviewBarUpdate = getYouTubeVideoID(document.URL);
}

function getChannelID() {
    //get channel id
    let channelContainers = document.querySelectorAll("#owner-name");
    let channelURLContainer = null;

    for (let i = 0; i < channelContainers.length; i++) {
        if (channelContainers[i].firstElementChild != null) {
            channelURLContainer = channelContainers[i].firstElementChild;
        }
    }

    if (channelContainers.length == 0) {
        //old YouTube theme
        channelContainers = document.getElementsByClassName("yt-user-info");
        if (channelContainers.length != 0) {
            channelURLContainer = channelContainers[0].firstElementChild;
        }
    }

    if (channelURLContainer == null) {
        //try later
        setTimeout(getChannelID, 100);
        return;
    }

    channelURL = channelURLContainer.getAttribute("href");

    //see if this is a whitelisted channel
    chrome.storage.sync.get(["whitelistedChannels"], function(result) {
        let whitelistedChannels = result.whitelistedChannels;

        if (whitelistedChannels != undefined && whitelistedChannels.includes(channelURL)) {
            //reset sponsor times to nothing
            sponsorTimes = [];
            UUIDs = [];

            channelWhitelisted = true;
        }
    });
}

//video skipping
function sponsorCheck() {
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
    v.currentTime = sponsorTimes[index][1];

    lastSponsorTimeSkipped = sponsorTimes[index][0];
  
    let currentUUID =  UUIDs[index];
    lastSponsorTimeSkippedUUID = currentUUID; 

    if (openNotice) {
        //send out the message saying that a sponsor message was skipped
        if (!dontShowNotice) {
            new SkipNotice(this, currentUUID);

            //auto-upvote this sponsor
            if (trackViewCount) {
                vote(1, currentUUID, null);
            }
        }
    }

    //send telemetry that a this sponsor was skipped happened
    if (trackViewCount) {
        sendRequestToServer("GET", "/api/viewedVideoSponsorTime?UUID=" + currentUUID);
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

//Adds a sponsorship starts button to the player controls
function addPlayerControlsButton() {
    if (document.getElementById("startSponsorButton") != null) {
        //it's already added
        return;
    }

    let startSponsorButton = document.createElement("button");
    startSponsorButton.id = "startSponsorButton";
    startSponsorButton.draggable = false;
    startSponsorButton.className = "ytp-button playerButton";
    startSponsorButton.setAttribute("title", chrome.i18n.getMessage("sponsorStart"));
    startSponsorButton.addEventListener("click", startSponsorClicked);

    let startSponsorImage = document.createElement("img");
    startSponsorImage.id = "startSponsorImage";
    startSponsorImage.draggable = false;
    startSponsorImage.className = "playerButtonImage";
    startSponsorImage.src = chrome.extension.getURL("icons/PlayerStartIconSponsorBlocker256px.png");

    //add the image to the button
    startSponsorButton.appendChild(startSponsorImage);

    let controls = document.getElementsByClassName("ytp-right-controls");
    let referenceNode = controls[controls.length - 1];

    if (referenceNode == undefined) {
        //page not loaded yet
        setTimeout(addPlayerControlsButton, 100);
        return;
    }

    referenceNode.prepend(startSponsorButton);
}

function removePlayerControlsButton() {
    document.getElementById("startSponsorButton").style.display = "none";
    document.getElementById("submitButton").style.display = "none";
}

//adds or removes the player controls button to what it should be
function updateVisibilityOfPlayerControlsButton() {
    //not on a proper video yet
    if (!getYouTubeVideoID(document.URL)) return;

    addPlayerControlsButton();
    addInfoButton();
    addDeleteButton();
    addSubmitButton();
    if (hideVideoPlayerControls) {
        removePlayerControlsButton();
    }
    if (hideInfoButtonPlayerControls) {
        document.getElementById("infoButton").style.display = "none";
    }
    if (hideDeleteButtonPlayerControls) {
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
        videoID: getYouTubeVideoID(document.URL)
    }, function(response) {
        //see if the sponsorTimesSubmitting needs to be updated
        updateSponsorTimesSubmitting();
    });
}

function updateSponsorTimesSubmitting() {
    chrome.runtime.sendMessage({
        message: "getSponsorTimes",
        videoID: getYouTubeVideoID(document.URL)
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

function changeStartSponsorButton(showStartSponsor, uploadButtonVisible) {
    //if it isn't visible, there is no data
    if (uploadButtonVisible && !hideDeleteButtonPlayerControls) {
        document.getElementById("deleteButton").style.display = "unset";
    } else {
        document.getElementById("deleteButton").style.display = "none";
    }

    if (showStartSponsor) {
        showingStartSponsor = true;
        document.getElementById("startSponsorImage").src = chrome.extension.getURL("icons/PlayerStartIconSponsorBlocker256px.png");
        document.getElementById("startSponsorButton").setAttribute("title", chrome.i18n.getMessage("sponsorStart"));

        if (document.getElementById("startSponsorImage").style.display != "none" && uploadButtonVisible && !hideInfoButtonPlayerControls) {
            document.getElementById("submitButton").style.display = "unset";
        } else if (!uploadButtonVisible) {
            //disable submit button
            document.getElementById("submitButton").style.display = "none";
        }
    } else {
        showingStartSponsor = false;
        document.getElementById("startSponsorImage").src = chrome.extension.getURL("icons/PlayerStopIconSponsorBlocker256px.png");
        document.getElementById("startSponsorButton").setAttribute("title", chrome.i18n.getMessage("sponsorEND"));

        //disable submit button
        document.getElementById("submitButton").style.display = "none";
    }
}

function toggleStartSponsorButton() {
    changeStartSponsorButton(!showingStartSponsor, true);
}

//shows the info button on the video player
function addInfoButton() {
    if (document.getElementById("infoButton") != null) {
        //it's already added
        return;
    }
  
    //make a submit button
    let infoButton = document.createElement("button");
    infoButton.id = "infoButton";
    infoButton.draggable = false;
    infoButton.className = "ytp-button playerButton";
    infoButton.setAttribute("title", "Open SponsorBlock Popup");
    infoButton.addEventListener("click", openInfoMenu);

    let infoImage = document.createElement("img");
    infoImage.id = "infoButtonImage";
    infoImage.draggable = false;
    infoImage.className = "playerButtonImage";
    infoImage.src = chrome.extension.getURL("icons/PlayerInfoIconSponsorBlocker256px.png");

    //add the image to the button
    infoButton.appendChild(infoImage);

    let controls = document.getElementsByClassName("ytp-right-controls");
    let referenceNode = controls[controls.length - 1];

    if (referenceNode == undefined) {
        //page not loaded yet
        setTimeout(addInfoButton, 100);
        return;
    }

    referenceNode.prepend(infoButton);
}

//shows the delete button on the video player
function addDeleteButton() {
    if (document.getElementById("deleteButton") != null) {
        //it's already added
        return;
    }
  
    //make a submit button
    let deleteButton = document.createElement("button");
    deleteButton.id = "deleteButton";
    deleteButton.draggable = false;
    deleteButton.className = "ytp-button playerButton";
    deleteButton.setAttribute("title", "Clear Sponsor Times");
    deleteButton.addEventListener("click", clearSponsorTimes);
    //hide it at the start
    deleteButton.style.display = "none";

    let deleteImage = document.createElement("img");
    deleteImage.id = "deleteButtonImage";
    deleteImage.draggable = false;
    deleteImage.className = "playerButtonImage";
    deleteImage.src = chrome.extension.getURL("icons/PlayerDeleteIconSponsorBlocker256px.png");

    //add the image to the button
    deleteButton.appendChild(deleteImage);

    let controls = document.getElementsByClassName("ytp-right-controls");
    let referenceNode = controls[controls.length - 1];
  
    if (referenceNode == undefined) {
        //page not loaded yet
        setTimeout(addDeleteButton, 100);
        return;
    }

    referenceNode.prepend(deleteButton);
}

//shows the submit button on the video player
function addSubmitButton() {
    if (document.getElementById("submitButton") != null) {
        //it's already added
        return;
    }
  
    //make a submit button
    let submitButton = document.createElement("button");
    submitButton.id = "submitButton";
    submitButton.draggable = false;
    submitButton.className = "ytp-button playerButton";
    submitButton.setAttribute("title", "Submit Sponsor Times");
    submitButton.addEventListener("click", submitSponsorTimes);
    //hide it at the start
    submitButton.style.display = "none";

    let submitImage = document.createElement("img");
    submitImage.id = "submitButtonImage";
    submitImage.draggable = false;
    submitImage.className = "playerButtonImage";
    submitImage.src = chrome.extension.getURL("icons/PlayerUploadIconSponsorBlocker256px.png");

    //add the image to the button
    submitButton.appendChild(submitImage);

    let controls = document.getElementsByClassName("ytp-right-controls");
    let referenceNode = controls[controls.length - 1];

    if (referenceNode == undefined) {
        //page not loaded yet
        setTimeout(addSubmitButton, 100);
        return;
    }
  
    referenceNode.prepend(submitButton);
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
            closeButton.classList = "smallLink";
            closeButton.setAttribute("align", "center");
            closeButton.addEventListener("click", closeInfoMenu);

            //add the close button
            popup.prepend(closeButton);
    
            let parentNode = document.getElementById("secondary");
            if (parentNode == null) {
                //old youtube theme
                parentNode = document.getElementById("watch7-sidebar-contents");
            }

            //make the logo source not 404
            //query selector must be used since getElementByID doesn't work on a node and this isn't added to the document yet
            let logo = popup.querySelector("#sponsorBlockPopupLogo");
            logo.src = chrome.extension.getURL("icons/LogoSponsorBlocker256px.png");

            //remove the style sheet and font that are not necessary
            popup.querySelector("#sponorBlockPopupFont").remove();
            popup.querySelector("#sponorBlockStyleSheet").remove();

            parentNode.insertBefore(popup, parentNode.firstChild);

            //run the popup init script
            runThePopup();
        }
    });
}

function closeInfoMenu() {
    let popup = document.getElementById("sponsorBlockPopupContainer");
    if (popup != null) {
        popup.remove();

        //show info button
        document.getElementById("infoButton").style.display = "unset";
    }
}

function clearSponsorTimes() {
    //it can't update to this info yet
    closeInfoMenu();

    let currentVideoID = getYouTubeVideoID(document.URL);

    let sponsorTimeKey = 'sponsorTimes' + currentVideoID;
    chrome.storage.sync.get([sponsorTimeKey], function(result) {
        let sponsorTimes = result[sponsorTimeKey];

        if (sponsorTimes != undefined && sponsorTimes.length > 0) {
            let confirmMessage = chrome.i18n.getMessage("clearThis") + getSponsorTimesMessage(sponsorTimes);
            confirmMessage += chrome.i18n.getMessage("confirmMSG")
            if(!confirm(confirmMessage)) return;

            //clear the sponsor times
            let sponsorTimeKey = "sponsorTimes" + currentVideoID;
            chrome.storage.sync.set({[sponsorTimeKey]: []});

            //clear sponsor times submitting
            sponsorTimesSubmitting = [];

            updatePreviewBar();

            //set buttons to be correct
            changeStartSponsorButton(true, false);
        }
    });
}

//if skipNotice is null, it will not affect the UI
function vote(type, UUID, skipNotice) {
    if (skipNotice != null) {
        //add loading info
        skipNotice.addVoteButtonInfo.bind(skipNotice)("Loading...")
        skipNotice.resetNoticeInfoMessage.bind(skipNotice)();
    }

    chrome.runtime.sendMessage({
        message: "submitVote",
        type: type,
        UUID: UUID
    }, function(response) {
        if (response != undefined) {
            //see if it was a success or failure
            if (skipNotice != null) {
                if (response.successType == 1) {
                    //success
                    if (type == 0) {
                        skipNotice.afterDownvote.bind(skipNotice)();
                    }
                } else if (response.successType == 0) {
                    //failure: duplicate vote
                    skipNotice.addNoticeInfoMessage.bind(skipNotice)(chrome.i18n.getMessage("voteFail"))
                    skipNotice.resetVoteButtonInfo.bind(skipNotice)();
                } else if (response.successType == -1) {
                    if (response.statusCode == 502) {
                        skipNotice.addNoticeInfoMessage.bind(skipNotice)(chrome.i18n.getMessage("serverDown"))
                        skipNotice.resetVoteButtonInfo.bind(skipNotice)();
                    } else {
                        //failure: unknown error
                        skipNotice.addNoticeInfoMessage.bind(skipNotice)(chrome.i18n.getMessage("connectionError") + response.statusCode);
                        skipNotice.resetVoteButtonInfo.bind(skipNotice)();
                    }
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
    chrome.storage.sync.set({"dontShowNoticeAgain": true});

    dontShowNotice = true;

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

    let currentVideoID = getYouTubeVideoID(document.URL);

    let sponsorTimeKey = 'sponsorTimes' + currentVideoID;
    chrome.storage.sync.get([sponsorTimeKey], function(result) {
        let sponsorTimes = result[sponsorTimeKey];

        if (sponsorTimes != undefined && sponsorTimes.length > 0) {
            let confirmMessage = chrome.i18n.getMessage("submitCheck") + "\n\n" + getSponsorTimesMessage(sponsorTimes);
            confirmMessage += "\n\n" + chrome.i18n.getMessage("confirmMSG");
            if(!confirm(confirmMessage)) return;

            sendSubmitMessage();
        }
    });

}

//send the message to the background js
//called after all the checks have been made that it's okay to do so
function sendSubmitMessage(){
    //add loading animation
    document.getElementById("submitButtonImage").src = chrome.extension.getURL("icons/PlayerUploadIconSponsorBlocker256px.png");
    document.getElementById("submitButton").style.animation = "rotate 1s 0s infinite";

    let currentVideoID = getYouTubeVideoID(document.URL);

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
                let sponsorTimeKey = "sponsorTimes" + currentVideoID;
                chrome.storage.sync.set({[sponsorTimeKey]: []});

                //request the sponsors from the server again
                sponsorsLookup(currentVideoID);
            } else {
                //show that the upload failed
                document.getElementById("submitButton").style.animation = "unset";
                document.getElementById("submitButtonImage").src = chrome.extension.getURL("icons/PlayerUploadFailedIconSponsorBlocker256px.png");

                if([400,429,409,502].includes(response.statusCode)) {
                    alert(chrome.i18n.getMessage(response.statusCode));
                } else {
                    alert(chrome.i18n.getMessage("connectionError") + response.statusCode);
                }
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
    let secondsDisplay = Math.round(seconds - minutes * 60);
    if (secondsDisplay < 10) {
        //add a zero
        secondsDisplay = "0" + secondsDisplay;
    }

    let formatted = minutes+ ":" + secondsDisplay;

    return formatted;
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
