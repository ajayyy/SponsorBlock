//make this a function to allow this to run on the content page
async function runThePopup() {
    localizeHtmlPage();
    //is it in the popup or content script
    var inPopup = true;
    if (chrome.tabs == undefined) {
            //this is on the content script, use direct communication
            chrome.tabs = {};
            chrome.tabs.sendMessage = function(id, request, callback) {
                    messageListener(request, null, callback);
            }
  
            //add a dummy query method
            chrome.tabs.query = function(config, callback) {
                    callback([{
                            url: document.URL,
                            id: -1
                    }]);
            }
  
            inPopup = false;
    }

    await wait(() => SB.config !== undefined);

    ["sponsorStart",
    // Top toggles
    "whitelistChannel",
    "unwhitelistChannel",
    "disableSkipping",
    "enableSkipping",
    // Options
    "showNoticeAgain",
    "optionsButton",
    // More controls
    "clearTimes",
    "submitTimes",
    "reportAnIssue",
    // sponsorTimesContributions
    "sponsorTimesContributionsContainer",
    "sponsorTimesContributionsDisplay",
    "sponsorTimesContributionsDisplayEndWord",
    // sponsorTimesViewsDisplay
    "sponsorTimesViewsContainer",
    "sponsorTimesViewsDisplay",
    "sponsorTimesViewsDisplayEndWord",
    // sponsorTimesOthersTimeSaved
    "sponsorTimesOthersTimeSavedContainer",
    "sponsorTimesOthersTimeSavedDisplay",
    "sponsorTimesOthersTimeSavedEndWord",
    // sponsorTimesSkipsDone
    "sponsorTimesSkipsDoneContainer",
    "sponsorTimesSkipsDoneDisplay",
    "sponsorTimesSkipsDoneEndWord",
    // sponsorTimeSaved
    "sponsorTimeSavedContainer",
    "sponsorTimeSavedDisplay",
    "sponsorTimeSavedEndWord",
    // discordButtons
    "discordButtonContainer",
    "hideDiscordButton",
    // submitTimesInfoMessage
    "submitTimesInfoMessageContainer",
    "submitTimesInfoMessage",
    // Username
    "setUsernameContainer",
    "setUsernameButton",
    "setUsernameStatusContainer",
    "setUsernameStatus",
    "setUsername",
    "usernameInput",
    "submitUsername",
    // More
    "submissionSection",
    "mainControls",
    "loadingIndicator",
    "videoFound",
    "sponsorMessageTimes",
    "downloadedSponsorMessageTimes",
    ].forEach(id => SB[id] = document.getElementById(id));

    //setup click listeners
    SB.sponsorStart.addEventListener("click", sendSponsorStartMessage);
    SB.whitelistChannel.addEventListener("click", whitelistChannel);
    SB.unwhitelistChannel.addEventListener("click", unwhitelistChannel);
    SB.disableSkipping.addEventListener("click", () => toggleSkipping(true));
    SB.enableSkipping.addEventListener("click", () => toggleSkipping(false));
    SB.clearTimes.addEventListener("click", clearTimes);
    SB.submitTimes.addEventListener("click", submitTimes);
    SB.showNoticeAgain.addEventListener("click", showNoticeAgain);
    SB.setUsernameButton.addEventListener("click", setUsernameButton);
    SB.submitUsername.addEventListener("click", submitUsername);
    SB.optionsButton.addEventListener("click", openOptions);
    SB.reportAnIssue.addEventListener("click", reportAnIssue);
    SB.hideDiscordButton.addEventListener("click", hideDiscordButton);
	
    //if true, the button now selects the end time
    let startTimeChosen = false;
  
    //the start and end time pairs (2d)
    let sponsorTimes = [];
  
    //current video ID of this tab
    let currentVideoID = null;
  
    //see if discord link can be shown
    let hideDiscordLink = SB.config.hideDiscordLink;
    if (hideDiscordLink == undefined || !hideDiscordLink) {
            let hideDiscordLaunches = SB.config.hideDiscordLaunches;
            //only if less than 10 launches
            if (hideDiscordLaunches == undefined || hideDiscordLaunches < 10) {
                SB.discordButtonContainer.style.display = null;
        
                if (hideDiscordLaunches == undefined) {
                    hideDiscordLaunches = 1;
                }
                SB.config.hideDiscordLaunches = hideDiscordLaunches + 1;
            }
    }

    //show proper disable skipping button
    let disableSkipping = SB.config.disableSkipping;
    if (disableSkipping != undefined && disableSkipping) {
        SB.disableSkipping.style.display = "none";
        SB.enableSkipping.style.display = "unset";
    }

    //if the don't show notice again variable is true, an option to 
    //  disable should be available
    let dontShowNotice = SB.config.dontShowNotice;
    if (dontShowNotice != undefined && dontShowNotice) {
        SB.showNoticeAgain.style.display = "unset";
    }

    //get the amount of times this user has contributed and display it to thank them
    if (SB.config.sponsorTimesContributed != undefined) {
        if (SB.config.sponsorTimesContributed > 1) {
            SB.sponsorTimesContributionsDisplayEndWord.innerText = chrome.i18n.getMessage("Sponsors");
        } else {
            SB.sponsorTimesContributionsDisplayEndWord.innerText = chrome.i18n.getMessage("Sponsor");
        }
        SB.sponsorTimesContributionsDisplay.innerText = SB.config.sponsorTimesContributed;
        SB.sponsorTimesContributionsContainer.style.display = "unset";

        //get the userID
            let userID = SB.config.userID;
            if (userID != undefined) {
                //there are probably some views on these submissions then
                //get the amount of views from the sponsors submitted
                sendRequestToServer("GET", "/api/getViewsForUser?userID=" + userID, function(xmlhttp) {
                    if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
                        let viewCount = JSON.parse(xmlhttp.responseText).viewCount;
                        if (viewCount != 0) {
                            if (viewCount > 1) {
                                SB.sponsorTimesViewsDisplayEndWord.innerText = chrome.i18n.getMessage("Segments");
                            } else {
                                SB.sponsorTimesViewsDisplayEndWord.innerText = chrome.i18n.getMessage("Segment");
                            }

                            SB.sponsorTimesViewsDisplay.innerText = viewCount;
                            SB.sponsorTimesViewsContainer.style.display = "unset";
                        }
                    }
                });

                //get this time in minutes
                sendRequestToServer("GET", "/api/getSavedTimeForUser?userID=" + userID, function(xmlhttp) {
                    if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
                        let minutesSaved = JSON.parse(xmlhttp.responseText).timeSaved;
                        if (minutesSaved != 0) {
                            if (minutesSaved != 1) {
                                SB.sponsorTimesOthersTimeSavedEndWord.innerText = chrome.i18n.getMessage("minsLower");
                            } else {
                                SB.sponsorTimesOthersTimeSavedEndWord.innerText = chrome.i18n.getMessage("minLower");
                            }

                            SB.sponsorTimesOthersTimeSavedDisplay.innerText = getFormattedHours(minutesSaved);
                            SB.sponsorTimesOthersTimeSavedContainer.style.display = "unset";
                        }
                    }
                });
            }
    }

    //get the amount of times this user has skipped a sponsor
    if (SB.config.skipCount != undefined) {
        if (SB.config.skipCount != 1) {
            SB.sponsorTimesSkipsDoneEndWord.innerText = chrome.i18n.getMessage("Sponsors");
        } else {
            SB.sponsorTimesSkipsDoneEndWord.innerText = chrome.i18n.getMessage("Sponsor");
        }

        SB.sponsorTimesSkipsDoneDisplay.innerText = SB.config.skipCount;
        SB.sponsorTimesSkipsDoneContainer.style.display = "unset";
    }

    //get the amount of time this user has saved.
    if (SB.config.minutesSaved != undefined) {
        if (SB.config.minutesSaved != 1) {
            SB.sponsorTimeSavedEndWord.innerText = chrome.i18n.getMessage("minsLower");
        } else {
            SB.sponsorTimeSavedEndWord.innerText = chrome.i18n.getMessage("minLower");
        }

        SB.sponsorTimeSavedDisplay.innerText = getFormattedHours(SB.config.minutesSaved);
        SB.sponsorTimeSavedContainer.style.display = "unset";
    }
  
    chrome.tabs.query({
            active: true,
            currentWindow: true
    }, onTabs);
	
    function onTabs(tabs) {
	  chrome.tabs.sendMessage(tabs[0].id, {message: 'getVideoID'}, function(result) {
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
        console.log( SB.config.sponsorTimes.set)
        setTimeout(()=> console.log( SB.config.sponsorTimes.set), 200        )
        let sponsorTimesStorage = SB.config.sponsorTimes.get(currentVideoID);
        if (sponsorTimesStorage != undefined && sponsorTimesStorage.length > 0) {
            if (sponsorTimesStorage[sponsorTimesStorage.length - 1] != undefined && sponsorTimesStorage[sponsorTimesStorage.length - 1].length < 2) {
                startTimeChosen = true;
                SB.sponsorStart.innerHTML = chrome.i18n.getMessage("sponsorEnd");
            }

            sponsorTimes = sponsorTimesStorage;

            displaySponsorTimes();

            //show submission section
            SB.submissionSection.style.display = "unset";

            showSubmitTimesIfNecessary();
        }
  
        //check if this video's sponsors are known
        chrome.tabs.sendMessage(
            tabs[0].id,
            {message: 'isInfoFound'},
            infoFound
        );
    }
  
    function infoFound(request) {
        if(chrome.runtime.lastError) {
            //This page doesn't have the injected content script, or at least not yet
            displayNoVideo();
            return;
        }
  
        //if request is undefined, then the page currently being browsed is not YouTube
        if (request != undefined) {
            //this must be a YouTube video
            //set letiable
            isYouTubeTab = true;
  
            //remove loading text
            SB.mainControls.style.display = "unset"
            SB.loadingIndicator.style.display = "none";

            if (request.found) {
                SB.videoFound.innerHTML = chrome.i18n.getMessage("sponsorFound");

                displayDownloadedSponsorTimes(request);
            } else {
                SB.videoFound.innerHTML = chrome.i18n.getMessage("sponsor404");
            }
        }

        //see if whitelist button should be swapped
        chrome.tabs.query({
            active: true,
            currentWindow: true
        }, tabs => {
            chrome.tabs.sendMessage(
                tabs[0].id,
                {message: 'isChannelWhitelisted'},
                function(response) {
                    if (response.value) {
                        SB.whitelistChannel.style.display = "none";
                        SB.unwhitelistChannel.style.display = "unset";

                        SB.downloadedSponsorMessageTimes.innerText = chrome.i18n.getMessage("channelWhitelisted");
                        SB.downloadedSponsorMessageTimes.style.fontWeight = "bold";
                    }
                });
            }
        );
    }
  
    function sendSponsorStartMessage() {
            //the content script will get the message if a YouTube page is open
            chrome.tabs.query({
                active: true,
                currentWindow: true
            }, tabs => {
                chrome.tabs.sendMessage(
                    tabs[0].id,
                    {from: 'popup', message: 'sponsorStart'},
                    startSponsorCallback
                );
            });
    }
  
    function startSponsorCallback(response) {
        let sponsorTimesIndex = sponsorTimes.length - (startTimeChosen ? 1 : 0);
  
        if (sponsorTimes[sponsorTimesIndex] == undefined) {
            sponsorTimes[sponsorTimesIndex] = [];
        }
  
        sponsorTimes[sponsorTimesIndex][startTimeChosen ? 1 : 0] = response.time;

        let localStartTimeChosen = startTimeChosen;
        SB.config.sponsorTimes.set(currentVideoID, sponsorTimes);
            //send a message to the client script
            if (localStartTimeChosen) {
                chrome.tabs.query({
                    active: true,
                    currentWindow: true
                }, tabs => {
                    chrome.tabs.sendMessage(
                        tabs[0].id,
                        {message: "sponsorDataChanged"}
                    );
                });
            }
  
        updateStartTimeChosen();
  
        //display video times on screen
        displaySponsorTimes();
  
        //show submission section
        SB.submissionSection.style.display = "unset";
  
        showSubmitTimesIfNecessary();
    }
  
    //display the video times from the array
    function displaySponsorTimes() {
        //remove all children
        while (SB.sponsorMessageTimes.firstChild) {
            SB.sponsorMessageTimes.removeChild(SB.sponsorMessageTimes.firstChild);
        }

        //add sponsor times
        SB.sponsorMessageTimes.appendChild(getSponsorTimesMessageDiv(sponsorTimes));
    }
  
    //display the video times from the array at the top, in a different section
    function displayDownloadedSponsorTimes(request) {
        if (request.sponsorTimes != undefined) {
            //set it to the message
            if (SB.downloadedSponsorMessageTimes.innerText != chrome.i18n.getMessage("channelWhitelisted")) {
                SB.downloadedSponsorMessageTimes.innerText = getSponsorTimesMessage(request.sponsorTimes);
            }

            //add them as buttons to the issue reporting container
            let container = document.getElementById("issueReporterTimeButtons");
            for (let i = 0; i < request.sponsorTimes.length; i++) {
                let sponsorTimeButton = document.createElement("button");
                sponsorTimeButton.className = "warningButton popupElement";

                let extraInfo = "";
                if (request.hiddenSponsorTimes.includes(i)) {
                    //this one is hidden
                    extraInfo = " (hidden)";
                }

                sponsorTimeButton.innerText = getFormattedTime(request.sponsorTimes[i][0]) + " to " + getFormattedTime(request.sponsorTimes[i][1]) + extraInfo;
        
                let votingButtons = document.createElement("div");
  
                let UUID = request.UUIDs[i];
  
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
  
                container.appendChild(sponsorTimeButton);
                container.appendChild(voteButtonsContainer);
  
                //if it is not the last iteration
                if (i != request.sponsorTimes.length - 1) {
                    container.appendChild(document.createElement("br"));
                    container.appendChild(document.createElement("br"));
                }
            }
        }
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
                    timeMessage = " to " + timeMessage;
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
        let skipTime = sponsorTimes[index][0];

        if (document.getElementById("startTimeMinutes" + index) != null) {
            //edit is currently open, use that time

            skipTime = getSponsorTimeEditTimes("startTime", index);

            //save the edit
            saveSponsorTimeEdit(index, false);
        }

        chrome.tabs.query({
            active: true,
            currentWindow: true
        }, tabs => {
            chrome.tabs.sendMessage(
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
        document.getElementById("submitTimesContainer").style.display = "none";
  
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
        startTimeMinutes.value = getTimeInMinutes(sponsorTimes[index][0]);
        startTimeMinutes.style.width = "45px";
    
        let startTimeSeconds = document.createElement("input");
        startTimeSeconds.id = "startTimeSeconds" + index;
        startTimeSeconds.className = "sponsorTime popupElement";
        startTimeSeconds.type = "text";
        startTimeSeconds.value = getTimeInFormattedSeconds(sponsorTimes[index][0]);
        startTimeSeconds.style.width = "60px";

        let endTimeMinutes = document.createElement("input");
        endTimeMinutes.id = "endTimeMinutes" + index;
        endTimeMinutes.className = "sponsorTime popupElement";
        endTimeMinutes.type = "text";
        endTimeMinutes.value = getTimeInMinutes(sponsorTimes[index][1]);
        endTimeMinutes.style.width = "45px";
    
        let endTimeSeconds = document.createElement("input");
        endTimeSeconds.id = "endTimeSeconds" + index;
        endTimeSeconds.className = "sponsorTime popupElement";
        endTimeSeconds.type = "text";
        endTimeSeconds.value = getTimeInFormattedSeconds(sponsorTimes[index][1]);
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
        toText.innerText = " to ";
  
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
        chrome.tabs.query({
            active: true,
            currentWindow: true
        }, tabs => {
            chrome.tabs.sendMessage(
                tabs[0].id,
                {message: "getCurrentTime"},
                function (response) {
                    let minutes = document.getElementById(idStartName + "Minutes" + index);
                    let seconds = document.getElementById(idStartName + "Seconds" + index);
    
                    minutes.value = getTimeInMinutes(response.currentTime);
                    seconds.value = getTimeInFormattedSeconds(response.currentTime);
                });
        });
    }

    //id start name is whether it is the startTime or endTime
    //gives back the time in seconds
    function getSponsorTimeEditTimes(idStartName, index) {
        let minutes = document.getElementById(idStartName + "Minutes" + index);
        let seconds = document.getElementById(idStartName + "Seconds" + index);

        return parseInt(minutes.value) * 60 + parseFloat(seconds.value);
    }
  
    function saveSponsorTimeEdit(index, closeEditMode = true) {
        sponsorTimes[index][0] = getSponsorTimeEditTimes("startTime", index);
        sponsorTimes[index][1] = getSponsorTimeEditTimes("endTime", index);
  
        //save this
		SB.config.sponsorTimes.set(currentVideoID, sponsorTimes);
            chrome.tabs.query({
                active: true,
                currentWindow: true
            }, tabs => {
                chrome.tabs.sendMessage(
                    tabs[0].id,
                    {message: "sponsorDataChanged"}
                );
            });
  
        if (closeEditMode) {
            displaySponsorTimes();

            showSubmitTimesIfNecessary();
        }
    }
  
    //deletes the sponsor time submitted at an index
    function deleteSponsorTime(index) {
        //if it is not a complete sponsor time
        if (sponsorTimes[index].length < 2) {
            chrome.tabs.query({
                active: true,
                currentWindow: true
            }, function(tabs) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    message: "changeStartSponsorButton",
                    showStartSponsor: true,
                    uploadButtonVisible: false
                });
            });
  
            resetStartTimeChosen();
        }
  
        sponsorTimes.splice(index, 1);
  
        //save this
		SB.config.sponsorTimes.set(currentVideoID, sponsorTimes);
            chrome.tabs.query({
                active: true,
                currentWindow: true
            }, tabs => {
                chrome.tabs.sendMessage(
                    tabs[0].id,
                    {message: "sponsorDataChanged"}
                );
            });
  
        //update display
        displaySponsorTimes();
  
        //if they are all removed
        if (sponsorTimes.length == 0) {
            //update chrome tab
            chrome.tabs.query({
                active: true,
                currentWindow: true
            }, function(tabs) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    message: "changeStartSponsorButton",
                    showStartSponsor: true,
                    uploadButtonVisible: false
                });
            });
  
            //hide submission section
            document.getElementById("submissionSection").style.display = "none";
        }
    }
  
    function clearTimes() {
        //send new sponsor time state to tab
        if (sponsorTimes.length > 0) {
            chrome.tabs.query({
                active: true,
                currentWindow: true
            }, function(tabs) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    message: "changeStartSponsorButton",
                    showStartSponsor: true,
                    uploadButtonVisible: false
                });
            });
        }
  
        //reset sponsorTimes
        sponsorTimes = [];

		SB.config.sponsorTimes.set(currentVideoID, sponsorTimes);
            chrome.tabs.query({
                active: true,
                currentWindow: true
            }, tabs => {
                chrome.tabs.sendMessage(
                    tabs[0].id,
                    {message: "sponsorDataChanged"}
                );
            });
  
        displaySponsorTimes();
  
        //hide submission section
        document.getElementById("submissionSection").style.display = "none";
  
        resetStartTimeChosen();
    }
  
    function submitTimes() {
        //make info message say loading
        SB.submitTimesInfoMessage.innerText = chrome.i18n.getMessage("Loading");
        SB.submitTimesInfoMessageContainer.style.display = "unset";
  
        if (sponsorTimes.length > 0) {
            chrome.runtime.sendMessage({
                message: "submitTimes",
                videoID: currentVideoID
            }, function(response) {
                if (response != undefined) {
                    if (response.statusCode == 200) {
                        //hide loading message
                        SB.submitTimesInfoMessageContainer.style.display = "none";

                        clearTimes();
                    } else {
                        document.getElementById("submitTimesInfoMessage").innerText = getErrorMessage(response.statusCode);
                        document.getElementById("submitTimesInfoMessageContainer").style.display = "unset";

                        SB.submitTimesInfoMessageContainer.style.display = "unset";
                    }
                }
            });
        }
    }
  
    function showNoticeAgain() {
        SB.config.dontShowNotice = false;
  
        chrome.tabs.query({
            active: true,
            currentWindow: true
        }, function(tabs) {
            chrome.tabs.sendMessage(tabs[0].id, {
                message: "showNoticeAgain"
            });
        });
  
        SB.showNoticeAgain.style.display = "none";
    }

    function updateStartTimeChosen() {
        //update startTimeChosen letiable
        if (!startTimeChosen) {
            startTimeChosen = true;
        SB.sponsorStart.innerHTML = chrome.i18n.getMessage("sponsorEnd");
        } else {
            resetStartTimeChosen();
        }
    }
  
    //set it to false
    function resetStartTimeChosen() {
        startTimeChosen = false;
        SB.sponsorStart.innerHTML = chrome.i18n.getMessage("sponsorStart");
    }
  
    //hides and shows the submit times button when needed
    function showSubmitTimesIfNecessary() {
        //check if an end time has been specified for the latest sponsor time
        if (sponsorTimes.length > 0 && sponsorTimes[sponsorTimes.length - 1].length > 1) {
            //show submit times button
            document.getElementById("submitTimesContainer").style.display = "unset";
        } else {
            //hide submit times button
            document.getElementById("submitTimesContainer").style.display = "none";
        }
    }
  
    //make the options div visible
    function openOptions() {
        chrome.runtime.openOptionsPage();
    }

    //make the options username setting option visible
    function setUsernameButton() {
            //get username from the server
            sendRequestToServer("GET", "/api/getUsername?userID=" + SB.config.userID, function (xmlhttp, error) {
                if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
                    SB.usernameInput.value = JSON.parse(xmlhttp.responseText).userName;

                    SB.submitUsername.style.display = "unset";
                    SB.usernameInput.style.display = "unset";

                    SB.setUsernameContainer.style.display = "none";
                    SB.setUsername.style.display = "unset";
                    
                    SB.setUsernameStatusContainer.style.display = "none";
                } else if (xmlhttp.readyState == 4) {
                    SB.setUsername.style.display = "unset";
                    SB.submitUsername.style.display = "none";
                    SB.usernameInput.style.display = "none";

                    SB.setUsernameStatusContainer.style.display = "unset";
                    SB.setUsernameStatus.innerText = getErrorMessage(xmlhttp.status);
                }
            });
    }

    //submit the new username
    function submitUsername() {
        //add loading indicator
        SB.setUsernameStatusContainer.style.display = "unset";
        SB.setUsernameStatus.innerText = "Loading...";

        //get the userID
            sendRequestToServer("POST", "/api/setUsername?userID=" + SB.config.userID + "&username=" + SB.usernameInput.value, function (xmlhttp, error) {
                if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
                    //submitted
                    SB.submitUsername.style.display = "none";
                    SB.usernameInput.style.display = "none";

                    SB.setUsernameStatus.innerText = chrome.i18n.getMessage("success");
                } else if (xmlhttp.readyState == 4) {
                    SB.setUsernameStatus.innerText = getErrorMessageI(xmlhttp.status);
                }
            });


        SB.setUsernameContainer.style.display = "none";
        SB.setUsername.style.display = "unset";
    }

    //this is not a YouTube video page
    function displayNoVideo() {
        document.getElementById("loadingIndicator").innerText = chrome.i18n.getMessage("noVideoID");
    }
  
    function reportAnIssue() {
        document.getElementById("issueReporterContainer").style.display = "unset";
        SB.reportAnIssue.style.display = "none";
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
            console.log(response)
            if (response != undefined) {
                //see if it was a success or failure
                console.log(response)
                if (response.successType == 1 || (response.successType == -1 && response.statusCode == 429)) {
                    //success (treat rate limits as a success)
                    addVoteMessage(chrome.i18n.getMessage("voted"), UUID)
                } else if (response.successType == 0) {
                    //failure: duplicate vote
                    addVoteMessage(chrome.i18n.getMessage("voteFail"), UUID)
                } else if (response.successType == -1) {
                    addVoteMessage(getErrorMessage(response.statusCode), UUID)
                }
            }
        });
    }
  
    function hideDiscordButton() {
        SB.config.hideDiscordLink = true;
        SB.discordButtonContainer.style.display = "none";
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

    function whitelistChannel() {
        //get the channel url
        chrome.tabs.query({
            active: true,
            currentWindow: true
        }, tabs => {
            chrome.tabs.sendMessage(
                tabs[0].id,
                {message: 'getChannelURL'},
                function(response) {
                    //get whitelisted channels
                        let whitelistedChannels = SB.config.whitelistedChannels;
                        if (whitelistedChannels == undefined) {
                            whitelistedChannels = [];
                        }

                        //add on this channel
                        whitelistedChannels.push(response.channelURL);

                        //change button
                        SB.whitelistChannel.style.display = "none";
                        SB.unwhitelistChannel.style.display = "unset";

                        SB.downloadedSponsorMessageTimes.innerText = chrome.i18n.getMessage("channelWhitelisted");
                        SB.downloadedSponsorMessageTimes.style.fontWeight = "bold";

                        //save this
                        SB.config.whitelistedChannels = whitelistedChannels;

                        //send a message to the client
                        chrome.tabs.query({
                            active: true,
                            currentWindow: true
                        }, tabs => {
                            chrome.tabs.sendMessage(
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
        chrome.tabs.query({
            active: true,
            currentWindow: true
        }, tabs => {
            chrome.tabs.sendMessage(
                tabs[0].id,
                {message: 'getChannelURL'},
                function(response) {
                    //get whitelisted channels
                        let whitelistedChannels = SB.config.whitelistedChannels;
                        if (whitelistedChannels == undefined) {
                            whitelistedChannels = [];
                        }

                        //remove this channel
                        let index = whitelistedChannels.indexOf(response.channelURL);
                        whitelistedChannels.splice(index, 1);

                        //change button
                        SB.whitelistChannel.style.display = "unset";
                        SB.unwhitelistChannel.style.display = "none";

                        SB.downloadedSponsorMessageTimes.innerText = "";
                        SB.downloadedSponsorMessageTimes.style.fontWeight = "unset";

                        //save this
                        SB.config.whitelistedChannels = whitelistedChannels;

                        //send a message to the client
                        chrome.tabs.query({
                            active: true,
                            currentWindow: true
                        }, tabs => {
                            chrome.tabs.sendMessage(
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
		SB.config.disableSkipping = disabled;

        let hiddenButton = SB.disableSkipping;
        let shownButton = SB.enableSkipping;

        if (!disabled) {
            hiddenButton = SB.enableSkipping;
            shownButton = SB.disableSkipping;
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
        let secondsFormatted = (seconds % 60).toFixed(3);
  
        if (secondsFormatted < 10) {
            secondsFormatted = "0" + secondsFormatted;
        }
  
        return secondsFormatted;
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
    document.getElementById("sponorBlockStyleSheet").sheet.insertRule('.popupBody { width: 325 }', 0);
    //this means it is actually opened in the popup
    runThePopup();
}
