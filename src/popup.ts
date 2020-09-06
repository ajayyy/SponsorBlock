import Config from "./config";

import Utils from "./utils";
import { SponsorTime, SponsorHideType } from "./types";
var utils = new Utils();

interface MessageListener {
    (request: any, sender: any, callback: (response: any) => void): void;
} 

class MessageHandler {
    messageListener: MessageListener;

    constructor (messageListener?: MessageListener) {
        this.messageListener = messageListener;
    }

    sendMessage(id: number, request, callback?) {
        if (this.messageListener) {
            this.messageListener(request, null, callback);
        } else {
            chrome.tabs.sendMessage(id, request, callback);
        }
    }

    query(config, callback) {
        if (this.messageListener) {
            // Send back dummy info
            callback([{
                url: document.URL,
                id: -1
            }]);
        } else {
            chrome.tabs.query(config, callback);
        }

    }
}

//make this a function to allow this to run on the content page
async function runThePopup(messageListener?: MessageListener) {
    var messageHandler = new MessageHandler(messageListener);

    utils.localizeHtmlPage();

    await utils.wait(() => Config.config !== null);

    var PageElements: any = {};

    ["sponsorStart",
    // Top toggles
    "whitelistChannel",
    "unwhitelistChannel",
    "whitelistToggle",
    //"whitelistForceCheck",
    "disableSkipping",
    "enableSkipping",
    "toggleSwitch",
    // Options
    //"showNoticeAgain",
    "optionsButton",
    // More controls
    "submitTimes",
    //"reportAnIssue",
    // sponsorTimesContributions
    "sponsorTimesContributionsContainer",
    "sponsorTimesContributionsDisplay",
    //"sponsorTimesContributionsDisplayEndWord",
    // sponsorTimesViewsDisplay
    "sponsorTimesViewsContainer",
    "sponsorTimesViewsDisplay",
    "sponsorTimesViewsDisplayEndWord",
    // sponsorTimesOthersTimeSaved
    //"sponsorTimesOthersTimeSavedContainer",
    "sponsorTimesOthersTimeSavedDisplay",
    "sponsorTimesOthersTimeSavedEndWord",
    // sponsorTimesSkipsDone
    "sponsorTimesSkipsDoneContainer",
    "sponsorTimesSkipsDoneDisplay",
    "sponsorTimesSkipsDoneEndWord",
    // sponsorTimeSaved
    //"sponsorTimeSavedContainer",
    "sponsorTimeSavedDisplay",
    "sponsorTimeSavedEndWord",
    // discordButtons
    //"discordButtonContainer",
    //"hideDiscordButton",
    // Username
    "setUsernameContainer",
    "setUsernameButton",
    "setUsernameStatusContainer",
    "setUsernameStatus",
    "setUsername",
    "usernameInput",
    "usernameValue",
    "submitUsername",
    // More
    "submissionSection",
    "mainControls",
    "loadingIndicator",
    "videoFound",
    "sponsorMessageTimes",
    "downloadedSponsorMessageTimes",
    "whitelistButton",
    ].forEach(id => PageElements[id] = document.getElementById(id));

    //setup click listeners
    //PageElements.sponsorStart.addEventListener("click", sendSponsorStartMessage);
    PageElements.whitelistToggle.addEventListener("change", function() {
        if (this.checked) {
            whitelistChannel();
        } else {
            unwhitelistChannel();
        }
    });
    //PageElements.whitelistChannel.addEventListener("click", whitelistChannel);
    //PageElements.whitelistForceCheck.addEventListener("click", openOptions);
    //ageElements.unwhitelistChannel.addEventListener("click", unwhitelistChannel);
    PageElements.toggleSwitch.addEventListener("change", function() {
        if (this.checked) {
            toggleSkipping(false);
        } else {
            toggleSkipping(true);
        }
    });
    //PageElements.disableSkipping.addEventListener("click", () => toggleSkipping(true));
    //PageElements.enableSkipping.addEventListener("click", () => toggleSkipping(false));
    //PageElements.submitTimes.addEventListener("click", submitTimes);
    //PageElements.showNoticeAgain.addEventListener("click", showNoticeAgain);
    PageElements.setUsernameButton.addEventListener("click", setUsernameButton);
    PageElements.submitUsername.addEventListener("click", submitUsername);
    PageElements.optionsButton.addEventListener("click", openOptions);
    //PageElements.reportAnIssue.addEventListener("click", reportAnIssue);
    //PageElements.hideDiscordButton.addEventListener("click", hideDiscordButton);

    //if true, the button now selects the end time
    let startTimeChosen = false;

    //the start and end time pairs (2d)
    let sponsorTimes: SponsorTime[] = [];

    //current video ID of this tab
    let currentVideoID = null;

    //see if discord link can be shown
    let hideDiscordLink = Config.config.hideDiscordLink;
    if (hideDiscordLink == undefined || !hideDiscordLink) {
            let hideDiscordLaunches = Config.config.hideDiscordLaunches;
            //only if less than 10 launches
            if (hideDiscordLaunches == undefined || hideDiscordLaunches < 10) {
                //PageElements.discordButtonContainer.style.display = null;

                if (hideDiscordLaunches == undefined) {
                    hideDiscordLaunches = 1;
                }
                Config.config.hideDiscordLaunches = hideDiscordLaunches + 1;
            }
    }

    //show proper disable skipping button
    let disableSkipping = Config.config.disableSkipping;
    if (disableSkipping != undefined && disableSkipping) {
        PageElements.disableSkipping.style.display = "none";
        PageElements.enableSkipping.style.display = "unset";
        PageElements.toggleSwitch.checked = false;
    }

    //if the don't show notice again variable is true, an option to
    //  disable should be available
    let dontShowNotice = Config.config.dontShowNotice;
    /*if (dontShowNotice != undefined && dontShowNotice) {
        PageElements.showNoticeAgain.style.display = "unset";
    }*/

    utils.sendRequestToServer("GET", "/api/getUsername?userID=" + Config.config.userID, (res) => {
        if (res.status === 200) {
            PageElements.usernameValue.innerText = JSON.parse(res.responseText).userName
        }
    })

    //get the amount of times this user has contributed and display it to thank them
    if (Config.config.sponsorTimesContributed != undefined) {
        /*if (Config.config.sponsorTimesContributed !== 1) {
            PageElements.sponsorTimesContributionsDisplayEndWord.innerText = chrome.i18n.getMessage("Segments");
        } else {
            PageElements.sponsorTimesContributionsDisplayEndWord.innerText = chrome.i18n.getMessage("Segment");
        }*/
        PageElements.sponsorTimesContributionsDisplay.innerText = Config.config.sponsorTimesContributed;
        PageElements.sponsorTimesContributionsContainer.style.display = "flex";

        //get the userID
        let userID = Config.config.userID;
        if (userID != undefined) {
            //there are probably some views on these submissions then
            //get the amount of views from the sponsors submitted
            utils.sendRequestToServer("GET", "/api/getViewsForUser?userID=" + userID, function(response) {
                if (response.status == 200) {
                    let viewCount = JSON.parse(response.responseText).viewCount;
                    if (viewCount != 0) {
                        if (viewCount > 1) {
                            PageElements.sponsorTimesViewsDisplayEndWord.innerText = chrome.i18n.getMessage("Segments");
                        } else {
                            PageElements.sponsorTimesViewsDisplayEndWord.innerText = chrome.i18n.getMessage("Segment");
                        }

                        PageElements.sponsorTimesViewsDisplay.innerText = viewCount;
                        PageElements.sponsorTimesViewsContainer.style.display = "unset";
                    }
                }
            });

            //get this time in minutes
            utils.sendRequestToServer("GET", "/api/getSavedTimeForUser?userID=" + userID, function(response) {
                if (response.status == 200) {
                    let minutesSaved = JSON.parse(response.responseText).timeSaved;
                    if (minutesSaved != 0) {
                        if (minutesSaved != 1) {
                            PageElements.sponsorTimesOthersTimeSavedEndWord.innerText = chrome.i18n.getMessage("minsLower");
                        } else {
                            PageElements.sponsorTimesOthersTimeSavedEndWord.innerText = chrome.i18n.getMessage("minLower");
                        }

                        PageElements.sponsorTimesOthersTimeSavedDisplay.innerText = getFormattedHours(minutesSaved);
                        //PageElements.sponsorTimesOthersTimeSavedContainer.style.display = "unset";
                    }
                }
            });
        }
    }

    //get the amount of times this user has skipped a sponsor
    if (Config.config.skipCount != undefined) {
        if (Config.config.skipCount != 1) {
            PageElements.sponsorTimesSkipsDoneEndWord.innerText = chrome.i18n.getMessage("Segments");
        } else {
            PageElements.sponsorTimesSkipsDoneEndWord.innerText = chrome.i18n.getMessage("Segment");
        }

        PageElements.sponsorTimesSkipsDoneDisplay.innerText = Config.config.skipCount;
        PageElements.sponsorTimesSkipsDoneContainer.style.display = "unset";
    }

    //get the amount of time this user has saved.
    if (Config.config.minutesSaved != undefined) {
        if (Config.config.minutesSaved != 1) {
            PageElements.sponsorTimeSavedEndWord.innerText = chrome.i18n.getMessage("minsLower");
        } else {
            PageElements.sponsorTimeSavedEndWord.innerText = chrome.i18n.getMessage("minLower");
        }

        PageElements.sponsorTimeSavedDisplay.innerText = getFormattedHours(Config.config.minutesSaved);
        //PageElements.sponsorTimeSavedContainer.style.display = "unset";
    }

    messageHandler.query({
            active: true,
            currentWindow: true
    }, onTabs);

    function onTabs(tabs) {
	  messageHandler.sendMessage(tabs[0].id, {message: 'getVideoID'}, function(result) {
        if (result != undefined && result.videoID) {
			  currentVideoID = result.videoID;
			  loadTabData(tabs);
        } else if (result == undefined && chrome.runtime.lastError) {
			  //this isn't a YouTube video then, or at least the content script is not loaded
			  displayNoVideo();
        }
	  });
    }

    function loadTabData(tabs) {
        if (!currentVideoID) {
            //this isn't a YouTube video then
            displayNoVideo();
            return;
        }

        //load video times for this video
        let sponsorTimesStorage = Config.config.segmentTimes.get(currentVideoID);
        if (sponsorTimesStorage != undefined && sponsorTimesStorage.length > 0) {
            if (sponsorTimesStorage[sponsorTimesStorage.length - 1] != undefined && sponsorTimesStorage[sponsorTimesStorage.length - 1].segment.length < 2) {
                startTimeChosen = true;
                PageElements.sponsorStart.innerHTML = chrome.i18n.getMessage("sponsorEnd");
            }

            sponsorTimes = sponsorTimesStorage;

            //show submission section
            PageElements.submissionSection.style.display = "unset";

            showSubmitTimesIfNecessary();
        }

        //check if this video's sponsors are known
        messageHandler.sendMessage(
            tabs[0].id,
            {message: 'isInfoFound'},
            infoFound
        );
    }

    function infoFound(request: {found: boolean, sponsorTimes: SponsorTime[]}) {
        if(chrome.runtime.lastError) {
            //This page doesn't have the injected content script, or at least not yet
            displayNoVideo();
            return;
        }

        //if request is undefined, then the page currently being browsed is not YouTube
        if (request != undefined) {
            //remove loading text
            PageElements.mainControls.style.display = "unset";
            PageElements.whitelistButton.classList.remove("grayedOut");
            PageElements.loadingIndicator.style.display = "none";

            if (request.found) {
                PageElements.videoFound.innerHTML = chrome.i18n.getMessage("sponsorFound");

                displayDownloadedSponsorTimes(request);
            } else {
                PageElements.videoFound.innerHTML = chrome.i18n.getMessage("sponsor404");
            }
        }

        //see if whitelist button should be swapped
        messageHandler.query({
            active: true,
            currentWindow: true
        }, tabs => {
            messageHandler.sendMessage(
                tabs[0].id,
                {message: 'isChannelWhitelisted'},
                function(response) {
                    if (response.value) {
                        PageElements.whitelistChannel.style.display = "none";
                        PageElements.unwhitelistChannel.style.display = "unset";
                        PageElements.whitelistToggle.checked = true;
                        document.querySelectorAll('label > svg')[0].classList.add("rotated");

                        PageElements.downloadedSponsorMessageTimes.innerText = chrome.i18n.getMessage("channelWhitelisted");
                        PageElements.downloadedSponsorMessageTimes.style.fontWeight = "bold";
                    }
                });
            }
        );
    }

    function sendSponsorStartMessage() {
        //the content script will get the message if a YouTube page is open
        messageHandler.query({
            active: true,
            currentWindow: true
        }, tabs => {
            messageHandler.sendMessage(
                tabs[0].id,
                {from: 'popup', message: 'sponsorStart'},
                startSponsorCallback
            );
        });
    }

    function startSponsorCallback(response) {
        let sponsorTimesIndex = sponsorTimes.length - (startTimeChosen ? 1 : 0);

        if (sponsorTimes[sponsorTimesIndex] == undefined) {
            sponsorTimes[sponsorTimesIndex] = {
                segment: [],
                category: Config.config.defaultCategory,
                UUID: null
            };
        }

        sponsorTimes[sponsorTimesIndex].segment[startTimeChosen ? 1 : 0] = response.time;

        let localStartTimeChosen = startTimeChosen;
        Config.config.segmentTimes.set(currentVideoID, sponsorTimes);

        //send a message to the client script
        if (localStartTimeChosen) {
            messageHandler.query({
                active: true,
                currentWindow: true
            }, tabs => {
                messageHandler.sendMessage(
                    tabs[0].id,
                    {message: "sponsorDataChanged"}
                );
            });
        }

        updateStartTimeChosen();

        //show submission section
        PageElements.submissionSection.style.display = "unset";

        showSubmitTimesIfNecessary();
    }

    //display the video times from the array at the top, in a different section
    function displayDownloadedSponsorTimes(request: {found: boolean, sponsorTimes: SponsorTime[]}) {
        if (request.sponsorTimes != undefined) {
            //set it to the message
            if (PageElements.downloadedSponsorMessageTimes.innerText != chrome.i18n.getMessage("channelWhitelisted")) {
                PageElements.downloadedSponsorMessageTimes.innerText = getSponsorTimesMessage(request.sponsorTimes);
            }

            //add them as buttons to the issue reporting container
            //let container = document.getElementById("issueReporterTimeButtons");
            for (let i = 0; i < request.sponsorTimes.length; i++) {
                let sponsorTimeButton = document.createElement("button");
                sponsorTimeButton.className = "warningButton popupElement";

                let extraInfo = "";
                if (request.sponsorTimes[i].hidden === SponsorHideType.Downvoted) {
                    //this one is downvoted
                    extraInfo = " (" + chrome.i18n.getMessage("hiddenDueToDownvote") + ")";
                } else if (request.sponsorTimes[i].hidden === SponsorHideType.MinimumDuration) {
                    //this one is too short
                    extraInfo = " (" + chrome.i18n.getMessage("hiddenDueToDuration") + ")";
                }

                sponsorTimeButton.innerText = getFormattedTime(request.sponsorTimes[i].segment[0]) + " " + chrome.i18n.getMessage("to") + " " + getFormattedTime(request.sponsorTimes[i].segment[1]) + extraInfo;
                
                let votingButtons = document.createElement("div");

                let UUID = request.sponsorTimes[i].UUID;

                //thumbs up and down buttons
                let voteButtonsContainer = document.createElement("div");
                voteButtonsContainer.id = "sponsorTimesVoteButtonsContainer" + UUID;
                voteButtonsContainer.setAttribute("align", "center");
                voteButtonsContainer.style.display = "none"

                let upvoteButton = document.createElement("img");
                upvoteButton.id = "sponsorTimesUpvoteButtonsContainer" + UUID;
                upvoteButton.className = "voteButton popupElement";
                upvoteButton.src = chrome.extension.getURL("icons/upvote.png");
                upvoteButton.addEventListener("click", () => vote(1, UUID));

                let downvoteButton = document.createElement("img");
                downvoteButton.id = "sponsorTimesDownvoteButtonsContainer" + UUID;
                downvoteButton.className = "voteButton popupElement";
                downvoteButton.src = chrome.extension.getURL("icons/downvote.png");
                downvoteButton.addEventListener("click", () => vote(0, UUID));

                //add thumbs up and down buttons to the container
                voteButtonsContainer.appendChild(document.createElement("br"));
                voteButtonsContainer.appendChild(document.createElement("br"));
                voteButtonsContainer.appendChild(upvoteButton);
                voteButtonsContainer.appendChild(downvoteButton);

                //add click listener to open up vote panel
                sponsorTimeButton.addEventListener("click", function() {
                    voteButtonsContainer.style.display = "unset";
                });

                //container.appendChild(sponsorTimeButton);
                //container.appendChild(voteButtonsContainer);

                //if it is not the last iteration
                if (i != request.sponsorTimes.length - 1) {
                    //container.appendChild(document.createElement("br"));
                    //container.appendChild(document.createElement("br"));
                }
            }
        }
    }

    //get the message that visually displays the video times
    function getSponsorTimesMessage(sponsorTimes: SponsorTime[]) {
        let sponsorTimesMessage = "";

        for (let i = 0; i < sponsorTimes.length; i++) {
            for (let s = 0; s < sponsorTimes[i].segment.length; s++) {
                let timeMessage = getFormattedTime(sponsorTimes[i].segment[s]);
                //if this is an end time
                if (s == 1) {
                    timeMessage = " " + chrome.i18n.getMessage("to") + " " + timeMessage;
                } else if (i > 0) {
                    //add commas if necessary
                    timeMessage = ", " + timeMessage;
                }

                if (sponsorTimes[i].hidden === SponsorHideType.Downvoted) {
                    //this one is downvoted
                    timeMessage += " (" + chrome.i18n.getMessage("hiddenDueToDownvote") + ")";
                } else if (sponsorTimes[i].hidden === SponsorHideType.MinimumDuration) {
                    //this one is too short
                    timeMessage += " (" + chrome.i18n.getMessage("hiddenDueToDuration") + ")";
                }

                sponsorTimesMessage += timeMessage;
            }
        }

        return sponsorTimesMessage;
    }

    //get the message that visually displays the video times
    //this version is a div that contains each with delete buttons
    function getSponsorTimesMessageDiv(sponsorTimes) {
        // let sponsorTimesMessage = "";
        let sponsorTimesContainer = document.createElement("div");
        sponsorTimesContainer.id = "sponsorTimesContainer";
  
        for (let i = 0; i < sponsorTimes.length; i++) {
            let currentSponsorTimeContainer = document.createElement("div");
            currentSponsorTimeContainer.id = "sponsorTimeContainer" + i;
            currentSponsorTimeContainer.className = "sponsorTime popupElement";
            let currentSponsorTimeMessage = "";
  
            let deleteButton = document.createElement("span");
            deleteButton.id = "sponsorTimeDeleteButton" + i;
            deleteButton.innerText = "Delete";
            deleteButton.className = "mediumLink popupElement";
            let index = i;
            deleteButton.addEventListener("click", () => deleteSponsorTime(index));
  
            let previewButton = document.createElement("span");
            previewButton.id = "sponsorTimePreviewButton" + i;
            previewButton.innerText = "Preview";
            previewButton.className = "mediumLink popupElement";
            previewButton.addEventListener("click", () => previewSponsorTime(index));
  
            let editButton = document.createElement("span");
            editButton.id = "sponsorTimeEditButton" + i;
            editButton.innerText = "Edit";
            editButton.className = "mediumLink popupElement";
            editButton.addEventListener("click", () => editSponsorTime(index));
  
            for (let s = 0; s < sponsorTimes[i].length; s++) {
                let timeMessage = getFormattedTime(sponsorTimes[i][s]);
                //if this is an end time
                if (s == 1) {
                    timeMessage = " " + chrome.i18n.getMessage("to") + " " + timeMessage;
                } else if (i > 0) {
                    //add commas if necessary
                    timeMessage = timeMessage;
                }
  
                currentSponsorTimeMessage += timeMessage;
            }
  
            currentSponsorTimeContainer.innerText = currentSponsorTimeMessage;
  
            sponsorTimesContainer.appendChild(currentSponsorTimeContainer);
            sponsorTimesContainer.appendChild(deleteButton);
  
            //only if it is a complete sponsor time
            if (sponsorTimes[i].length > 1) {
                sponsorTimesContainer.appendChild(previewButton);
                sponsorTimesContainer.appendChild(editButton);

                currentSponsorTimeContainer.addEventListener("click", () => editSponsorTime(index));
            }
        }
  
        return sponsorTimesContainer;
    }

    function previewSponsorTime(index) {
        let skipTime = sponsorTimes[index].segment[0];

        if (document.getElementById("startTimeMinutes" + index) != null) {
            //edit is currently open, use that time

            skipTime = getSponsorTimeEditTimes("startTime", index);

            //save the edit
            saveSponsorTimeEdit(index, false);
        }

        messageHandler.query({
            active: true,
            currentWindow: true
        }, tabs => {
            messageHandler.sendMessage(
                tabs[0].id, {
                    message: "skipToTime",
                    time: skipTime - 2
                }
            );
        });
    }
  
    function editSponsorTime(index) {
        if (document.getElementById("startTimeMinutes" + index) != null) {
            //already open
            return;
        }

        //hide submit button
        //document.getElementById("submitTimesContainer").style.display = "none";
  
        let sponsorTimeContainer = document.getElementById("sponsorTimeContainer" + index);
  
        //the button to set the current time
        let startTimeNowButton = document.createElement("span");
        startTimeNowButton.id = "startTimeNowButton" + index;
        startTimeNowButton.innerText = "(Now)";
        startTimeNowButton.className = "tinyLink popupElement";
        startTimeNowButton.addEventListener("click", () => setEditTimeToCurrentTime("startTime", index));

        //get sponsor time minutes and seconds boxes
        let startTimeMinutes = document.createElement("input");
        startTimeMinutes.id = "startTimeMinutes" + index;
        startTimeMinutes.className = "sponsorTime popupElement";
        startTimeMinutes.type = "text";
        startTimeMinutes.value = String(getTimeInMinutes(sponsorTimes[index].segment[0]));
        startTimeMinutes.style.width = "45px";
    
        let startTimeSeconds = document.createElement("input");
        startTimeSeconds.id = "startTimeSeconds" + index;
        startTimeSeconds.className = "sponsorTime popupElement";
        startTimeSeconds.type = "text";
        startTimeSeconds.value = getTimeInFormattedSeconds(sponsorTimes[index].segment[0]);
        startTimeSeconds.style.width = "60px";

        let endTimeMinutes = document.createElement("input");
        endTimeMinutes.id = "endTimeMinutes" + index;
        endTimeMinutes.className = "sponsorTime popupElement";
        endTimeMinutes.type = "text";
        endTimeMinutes.value = String(getTimeInMinutes(sponsorTimes[index].segment[1]));
        endTimeMinutes.style.width = "45px";
    
        let endTimeSeconds = document.createElement("input");
        endTimeSeconds.id = "endTimeSeconds" + index;
        endTimeSeconds.className = "sponsorTime popupElement";
        endTimeSeconds.type = "text";
        endTimeSeconds.value = getTimeInFormattedSeconds(sponsorTimes[index].segment[1]);
        endTimeSeconds.style.width = "60px";

        //the button to set the current time
        let endTimeNowButton = document.createElement("span");
        endTimeNowButton.id = "endTimeNowButton" + index;
        endTimeNowButton.innerText = "(Now)";
        endTimeNowButton.className = "tinyLink popupElement";
        endTimeNowButton.addEventListener("click", () => setEditTimeToCurrentTime("endTime", index));
  
        let colonText = document.createElement("span");
        colonText.innerText = ":";
  
        let toText = document.createElement("span");
        toText.innerText = " " + chrome.i18n.getMessage("to") + " ";
  
        //remove all children to replace
        while (sponsorTimeContainer.firstChild) {
            sponsorTimeContainer.removeChild(sponsorTimeContainer.firstChild);
        }
  
        sponsorTimeContainer.appendChild(startTimeNowButton);
        sponsorTimeContainer.appendChild(startTimeMinutes);
        sponsorTimeContainer.appendChild(colonText);
        sponsorTimeContainer.appendChild(startTimeSeconds);
        sponsorTimeContainer.appendChild(toText);
        sponsorTimeContainer.appendChild(endTimeMinutes);
        sponsorTimeContainer.appendChild(colonText);
        sponsorTimeContainer.appendChild(endTimeSeconds);
        sponsorTimeContainer.appendChild(endTimeNowButton);
  
        //add save button and remove edit button
        let saveButton = document.createElement("span");
        saveButton.id = "sponsorTimeSaveButton" + index;
        saveButton.innerText = "Save";
        saveButton.className = "mediumLink popupElement";
        saveButton.addEventListener("click", () => saveSponsorTimeEdit(index));
  
        let editButton = document.getElementById("sponsorTimeEditButton" + index);
        let sponsorTimesContainer = document.getElementById("sponsorTimesContainer");
  
        sponsorTimesContainer.replaceChild(saveButton, editButton);
    }

    function setEditTimeToCurrentTime(idStartName, index) {
        messageHandler.query({
            active: true,
            currentWindow: true
        }, tabs => {
            messageHandler.sendMessage(
                tabs[0].id,
                {message: "getCurrentTime"},
                function (response) {
                    let minutes = <HTMLInputElement> <unknown> document.getElementById(idStartName + "Minutes" + index);
                    let seconds = <HTMLInputElement> <unknown> document.getElementById(idStartName + "Seconds" + index);

                    minutes.value = String(getTimeInMinutes(response.currentTime));
                    seconds.value = getTimeInFormattedSeconds(response.currentTime);
                });
        });
    }

    //id start name is whether it is the startTime or endTime
    //gives back the time in seconds
    function getSponsorTimeEditTimes(idStartName, index): number {
        let minutes = <HTMLInputElement> <unknown> document.getElementById(idStartName + "Minutes" + index);
        let seconds = <HTMLInputElement> <unknown> document.getElementById(idStartName + "Seconds" + index);

        return parseInt(minutes.value) * 60 + parseFloat(seconds.value);
    }
  
    function saveSponsorTimeEdit(index, closeEditMode = true) {
        sponsorTimes[index].segment[0] = getSponsorTimeEditTimes("startTime", index);
        sponsorTimes[index].segment[1] = getSponsorTimeEditTimes("endTime", index);
  
        //save this
        Config.config.segmentTimes.set(currentVideoID, sponsorTimes);
        
        messageHandler.query({
            active: true,
            currentWindow: true
        }, tabs => {
            messageHandler.sendMessage(
                tabs[0].id,
                {message: "sponsorDataChanged"}
            );
        });
  
        if (closeEditMode) {
            showSubmitTimesIfNecessary();
        }
    }
  
    //deletes the sponsor time submitted at an index
    function deleteSponsorTime(index) {
        //if it is not a complete sponsor time
        if (sponsorTimes[index].segment.length < 2) {
            messageHandler.query({
                active: true,
                currentWindow: true
            }, function(tabs) {
                messageHandler.sendMessage(tabs[0].id, {
                    message: "changeStartSponsorButton",
                    showStartSponsor: true,
                    uploadButtonVisible: false
                });
            });
  
            resetStartTimeChosen();
        }
  
        sponsorTimes.splice(index, 1);
  
        //save this
        Config.config.segmentTimes.set(currentVideoID, sponsorTimes);
        
        //if they are all removed
        if (sponsorTimes.length == 0) {
            //update chrome tab
            messageHandler.query({
                active: true,
                currentWindow: true
            }, function(tabs) {
                messageHandler.sendMessage(tabs[0].id, {
                    message: "changeStartSponsorButton",
                    showStartSponsor: true,
                    uploadButtonVisible: false
                });
            });
  
            //hide submission section
            document.getElementById("submissionSection").style.display = "none";
        }

        messageHandler.query({
            active: true,
            currentWindow: true
        }, tabs => {
            messageHandler.sendMessage(
                tabs[0].id,
                {message: "sponsorDataChanged"}
            );
        });
    }
  
    function submitTimes() {
        if (sponsorTimes.length > 0) {
            messageHandler.query({
                active: true,
                currentWindow: true
            }, tabs => {
                messageHandler.sendMessage(
                    tabs[0].id,
                    {message: 'submitTimes'},
                );
            });
        }
    }
  
    /*function showNoticeAgain() {
        Config.config.dontShowNotice = false;
  
        PageElements.showNoticeAgain.style.display = "none";
    }*/

    function updateStartTimeChosen() {
        //update startTimeChosen letiable
        if (!startTimeChosen) {
            startTimeChosen = true;
            PageElements.sponsorStart.innerHTML = chrome.i18n.getMessage("sponsorEnd");
        } else {
            resetStartTimeChosen();
        }
    }
  
    //set it to false
    function resetStartTimeChosen() {
        startTimeChosen = false;
        PageElements.sponsorStart.innerHTML = chrome.i18n.getMessage("sponsorStart");
    }
  
    //hides and shows the submit times button when needed
    function showSubmitTimesIfNecessary() {
        //check if an end time has been specified for the latest sponsor time
        if (sponsorTimes.length > 0 && sponsorTimes[sponsorTimes.length - 1].segment.length > 1) {
            //show submit times button
            //document.getElementById("submitTimesContainer").style.display = "unset";
        } else {
            //hide submit times button
            //document.getElementById("submitTimesContainer").style.display = "none";
        }
    }
  
    //make the options div visible
    function openOptions() {
        chrome.runtime.sendMessage({"message": "openConfig"});
    }

    //make the options username setting option visible
    function setUsernameButton() {
        //get username from the server
        utils.sendRequestToServer("GET", "/api/getUsername?userID=" + Config.config.userID, function (response) {
            if (response.status == 200) {
                PageElements.usernameInput.value = JSON.parse(response.responseText).userName;

                PageElements.submitUsername.style.display = "unset";
                PageElements.usernameInput.style.display = "unset";

                PageElements.setUsernameContainer.style.display = "none";
                PageElements.setUsername.style.display = "flex";
                PageElements
                PageElements.setUsernameStatusContainer.style.display = "none";
            } else {
                PageElements.setUsername.style.display = "unset";
                PageElements.submitUsername.style.display = "none";
                PageElements.usernameInput.style.display = "none";

                PageElements.setUsernameStatusContainer.style.display = "unset";
                PageElements.setUsernameStatus.innerText = utils.getErrorMessage(response.status);
            }
        });
    }

    //submit the new username
    function submitUsername() {
        //add loading indicator
        PageElements.setUsernameStatusContainer.style.display = "unset";
        PageElements.setUsernameStatus.innerText = "Loading...";

        //get the userID
        utils.sendRequestToServer("POST", "/api/setUsername?userID=" + Config.config.userID + "&username=" + PageElements.usernameInput.value, function (response) {
            if (response.status == 200) {
                //submitted
                PageElements.submitUsername.style.display = "none";
                PageElements.usernameInput.style.display = "none";

                PageElements.setUsernameStatus.innerText = chrome.i18n.getMessage("success");
            } else {
                PageElements.setUsernameStatus.innerText = utils.getErrorMessage(response.status);
            }
        });


        PageElements.setUsernameContainer.style.display = "none";
        PageElements.setUsername.style.display = "unset";
    }

    //this is not a YouTube video page
    function displayNoVideo() {
        document.getElementById("loadingIndicator").innerText = chrome.i18n.getMessage("noVideoID");
    }
  
    function reportAnIssue() {
        document.getElementById("issueReporterContainer").style.display = "unset";
        //PageElements.reportAnIssue.style.display = "none";
    }
  
    function addVoteMessage(message, UUID) {
        let container = document.getElementById("sponsorTimesVoteButtonsContainer" + UUID);
        //remove all children
        while (container.firstChild) {
            container.removeChild(container.firstChild);
        }
  
        let thanksForVotingText = document.createElement("h2");
        thanksForVotingText.innerText = message;
        //there are already breaks there
        thanksForVotingText.style.marginBottom = "0px";
  
        container.appendChild(thanksForVotingText);
    }
  
    function vote(type, UUID) {
        //add loading info
        addVoteMessage("Loading...", UUID)
  
        //send the vote message to the tab
        chrome.runtime.sendMessage({
            message: "submitVote",
            type: type,
            UUID: UUID
        }, function(response) {
            if (response != undefined) {
                //see if it was a success or failure
                if (response.successType == 1 || (response.successType == -1 && response.statusCode == 429)) {
                    //success (treat rate limits as a success)
                    addVoteMessage(chrome.i18n.getMessage("voted"), UUID)
                } else if (response.successType == -1) {
                    addVoteMessage(utils.getErrorMessage(response.statusCode), UUID)
                }
            }
        });
    }
  
    function hideDiscordButton() {
        Config.config.hideDiscordLink = true;
        //PageElements.discordButtonContainer.style.display = "none";
    }
  
    //converts time in seconds to minutes:seconds
    function getFormattedTime(seconds) {
        let minutes = Math.floor(seconds / 60);
        let secondsDisplayNumber = Math.round(seconds - minutes * 60);
        let secondsDisplay = String(secondsDisplayNumber);
        if (secondsDisplayNumber < 10) {
            //add a zero
            secondsDisplay = "0" + secondsDisplay;
        }
  
        let formatted = minutes + ":" + secondsDisplay;
  
        return formatted;
    }

    function whitelistChannel() {
        //get the channel url
        messageHandler.query({
            active: true,
            currentWindow: true
        }, tabs => {
            messageHandler.sendMessage(
                tabs[0].id,
                {message: 'getChannelID'},
                function(response) {
                    if (!response.channelID) {
                        alert(chrome.i18n.getMessage("channelDataNotFound") + "\n\n" + 
                            chrome.i18n.getMessage("itCouldBeAdblockerIssue"));
                        return;
                    }

                    //get whitelisted channels
                    let whitelistedChannels = Config.config.whitelistedChannels;
                    if (whitelistedChannels == undefined) {
                        whitelistedChannels = [];
                    }

                    //add on this channel
                    whitelistedChannels.push(response.channelID);

                    //change button
                    PageElements.whitelistChannel.style.display = "none";
                    PageElements.unwhitelistChannel.style.display = "unset";
                    document.querySelectorAll('label > svg')[0].classList.add("rotated");

                    //TODO if (!Config.config.forceChannelCheck) PageElements.whitelistForceCheck.style.display = "unset";

                    PageElements.downloadedSponsorMessageTimes.innerText = chrome.i18n.getMessage("channelWhitelisted");
                    PageElements.downloadedSponsorMessageTimes.style.fontWeight = "bold";

                    //save this
                    Config.config.whitelistedChannels = whitelistedChannels;

                    //send a message to the client
                    messageHandler.query({
                        active: true,
                        currentWindow: true
                    }, tabs => {
                        messageHandler.sendMessage(
                            tabs[0].id, {
                                message: 'whitelistChange',
                                value: true
                            });
                        }
                    );
                }
            );
        });
    }

    function unwhitelistChannel() {
        //get the channel url
        messageHandler.query({
            active: true,
            currentWindow: true
        }, tabs => {
            messageHandler.sendMessage(
                tabs[0].id,
                {message: 'getChannelID'},
                function(response) {
                    //get whitelisted channels
                        let whitelistedChannels = Config.config.whitelistedChannels;
                        if (whitelistedChannels == undefined) {
                            whitelistedChannels = [];
                        }

                        //remove this channel
                        let index = whitelistedChannels.indexOf(response.channelID);
                        whitelistedChannels.splice(index, 1);

                        //change button
                        PageElements.whitelistChannel.style.display = "unset";
                        PageElements.unwhitelistChannel.style.display = "none";
                        document.querySelectorAll('label > svg')[0].classList.remove("rotated");

                        PageElements.downloadedSponsorMessageTimes.innerText = "";
                        PageElements.downloadedSponsorMessageTimes.style.fontWeight = "unset";

                        //save this
                        Config.config.whitelistedChannels = whitelistedChannels;

                        //send a message to the client
                        messageHandler.query({
                            active: true,
                            currentWindow: true
                        }, tabs => {
                            messageHandler.sendMessage(
                                tabs[0].id, {
                                    message: 'whitelistChange',
                                    value: false
                                });
                            }
                        );
                }
            );
        });
    }

    /**
     * Should skipping be disabled (visuals stay)
     */
    function toggleSkipping(disabled) {
		Config.config.disableSkipping = disabled;

        let hiddenButton = PageElements.disableSkipping;
        let shownButton = PageElements.enableSkipping;

        if (!disabled) {
            hiddenButton = PageElements.enableSkipping;
            shownButton = PageElements.disableSkipping;
        }

        shownButton.style.display = "unset";
        hiddenButton.style.display = "none";
    }

    //converts time in seconds to minutes
    function getTimeInMinutes(seconds) {
        let minutes = Math.floor(seconds / 60);
  
        return minutes;
    }
  
    //converts time in seconds to seconds past the last minute
    function getTimeInFormattedSeconds(seconds) {
        let minutes = seconds % 60;
        let secondsFormatted = minutes.toFixed(3);
  
        if (minutes < 10) {
            secondsFormatted = "0" + secondsFormatted;
        }
  
        return secondsFormatted;
    }
  
    /**
     * Converts time in hours to 5h 25.1
     * If less than 1 hour, just returns minutes
     * 
     * @param {float} seconds 
     * @returns {string}
     */
    function getFormattedHours(minues) {
        let hours = Math.floor(minues / 60);
        return (hours > 0 ? hours + "h " : "") + (minues % 60).toFixed(1);
    }
  
//end of function
}

if (chrome.tabs != undefined) {
    //add the width restriction (because Firefox)
    let link = <HTMLLinkElement> document.getElementById("sponsorBlockStyleSheet");
    //(<CSSStyleSheet> link.sheet).insertRule('.popupBody { width: 325 }', 0);

    //this means it is actually opened in the popup
    runThePopup();
}

export default runThePopup;
