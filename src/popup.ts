import Config from "./config";

import Utils from "./utils";
import { SponsorTime, SponsorHideType, CategoryActionType } from "./types";
import { Message, MessageResponse, IsInfoFoundMessageResponse } from "./messageTypes";
import { showDonationLink } from "./utils/configUtils";
import { getCategoryActionType } from "./utils/categoryUtils";
const utils = new Utils();

interface MessageListener {
    (request: Message, sender: unknown, sendResponse: (response: MessageResponse) => void): void;
}

class MessageHandler {
    messageListener: MessageListener;

    constructor(messageListener?: MessageListener) {
        this.messageListener = messageListener;
    }

    sendMessage(id: number, request: Message, callback?) {
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
async function runThePopup(messageListener?: MessageListener): Promise<void> {
    const messageHandler = new MessageHandler(messageListener);

    utils.localizeHtmlPage();

    await utils.wait(() => Config.config !== null);

    type InputPageElements = {
        whitelistToggle?: HTMLInputElement,
        toggleSwitch?: HTMLInputElement,
        usernameInput?: HTMLInputElement,
    };
    type PageElements = { [key: string]: HTMLElement } & InputPageElements

    const PageElements: PageElements = {};

    [
        "sponsorblockPopup",
        "sponsorStart",
        // Top toggles
        "whitelistChannel",
        "unwhitelistChannel",
        "whitelistToggle",
        "whitelistForceCheck",
        "disableSkipping",
        "enableSkipping",
        "toggleSwitch",
        // Options
        "showNoticeAgain",
        "optionsButton",
        "helpButton",
        // More controls
        "submitTimes",
        "sponsorTimesContributionsContainer",
        "sponsorTimesContributionsDisplay",
        "sponsorTimesViewsContainer",
        "sponsorTimesViewsDisplay",
        "sponsorTimesViewsDisplayEndWord",
        "sponsorTimesOthersTimeSavedDisplay",
        "sponsorTimesOthersTimeSavedEndWord",
        "sponsorTimesSkipsDoneContainer",
        "sponsorTimesSkipsDoneDisplay",
        "sponsorTimesSkipsDoneEndWord",
        "sponsorTimeSavedDisplay",
        "sponsorTimeSavedEndWord",
        // Username
        "setUsernameContainer",
        "setUsernameButton",
        "setUsernameStatusContainer",
        "setUsernameStatus",
        "setUsername",
        "usernameInput",
        "usernameValue",
        "submitUsername",
        "sbPopupIconCopyUserID",
        // More
        "submissionSection",
        "mainControls",
        "loadingIndicator",
        "videoFound",
        "sponsorMessageTimes",
        //"downloadedSponsorMessageTimes",
        "refreshSegmentsButton",
        "whitelistButton",
        "sbDonate"
    ].forEach(id => PageElements[id] = document.getElementById(id));

    // Hide donate button if wanted (Safari, or user choice)
    if (!showDonationLink()) {
        PageElements.sbDonate.style.display = "none";
    }

    //setup click listeners
    PageElements.sponsorStart.addEventListener("click", sendSponsorStartMessage);
    PageElements.whitelistToggle.addEventListener("change", function () {
        if (this.checked) {
            whitelistChannel();
        } else {
            unwhitelistChannel();
        }
    });
    PageElements.whitelistForceCheck.addEventListener("click", openOptions);
    PageElements.toggleSwitch.addEventListener("change", function () {
        toggleSkipping(!this.checked);
    });
    PageElements.submitTimes.addEventListener("click", submitTimes);
    PageElements.showNoticeAgain.addEventListener("click", showNoticeAgain);
    PageElements.setUsernameButton.addEventListener("click", setUsernameButton);
    PageElements.usernameValue.addEventListener("click", setUsernameButton);
    PageElements.submitUsername.addEventListener("click", submitUsername);
    PageElements.optionsButton.addEventListener("click", openOptions);
    PageElements.helpButton.addEventListener("click", openHelp);
    PageElements.refreshSegmentsButton.addEventListener("click", refreshSegments);
    PageElements.sbPopupIconCopyUserID.addEventListener("click", async () => navigator.clipboard.writeText(await utils.getHash(Config.config.userID)));

    /** If true, the content script is in the process of creating a new segment. */
    let creatingSegment = false;

    //the start and end time pairs (2d)
    let sponsorTimes: SponsorTime[] = [];

    //current video ID of this tab
    let currentVideoID = null;

    //show proper disable skipping button
    const disableSkipping = Config.config.disableSkipping;
    if (disableSkipping != undefined && disableSkipping) {
        PageElements.disableSkipping.style.display = "none";
        PageElements.enableSkipping.style.display = "unset";
        PageElements.toggleSwitch.checked = false;
    }

    //if the don't show notice again variable is true, an option to
    //  disable should be available
    const dontShowNotice = Config.config.dontShowNotice;
    if (dontShowNotice != undefined && dontShowNotice) {
        PageElements.showNoticeAgain.style.display = "unset";
    }

    utils.sendRequestToServer("GET", "/api/getUsername?userID=" + Config.config.userID, (res) => {
        if (res.status === 200) {
            PageElements.usernameValue.innerText = JSON.parse(res.responseText).userName
        }
    })

    //get the amount of times this user has contributed and display it to thank them
    if (Config.config.sponsorTimesContributed != undefined) {
        PageElements.sponsorTimesContributionsDisplay.innerText = Config.config.sponsorTimesContributed.toLocaleString();
        PageElements.sponsorTimesContributionsContainer.classList.remove("hidden");

        //get the userID
        const userID = Config.config.userID;
        if (userID != undefined) {
            //there are probably some views on these submissions then
            //get the amount of views from the sponsors submitted
            utils.sendRequestToServer("GET", "/api/getViewsForUser?userID=" + userID, function (response) {
                if (response.status == 200) {
                    const viewCount = JSON.parse(response.responseText).viewCount;
                    if (viewCount != 0) {
                        if (viewCount > 1) {
                            PageElements.sponsorTimesViewsDisplayEndWord.innerText = chrome.i18n.getMessage("Segments");
                        } else {
                            PageElements.sponsorTimesViewsDisplayEndWord.innerText = chrome.i18n.getMessage("Segment");
                        }

                        PageElements.sponsorTimesViewsDisplay.innerText = viewCount.toLocaleString();
                        PageElements.sponsorTimesViewsContainer.style.display = "unset";
                    }
                }
            });

            //get this time in minutes
            utils.sendRequestToServer("GET", "/api/getSavedTimeForUser?userID=" + userID, function (response) {
                if (response.status == 200) {
                    const minutesSaved = JSON.parse(response.responseText).timeSaved;
                    if (minutesSaved != 0) {
                        if (minutesSaved != 1) {
                            PageElements.sponsorTimesOthersTimeSavedEndWord.innerText = chrome.i18n.getMessage("minsLower");
                        } else {
                            PageElements.sponsorTimesOthersTimeSavedEndWord.innerText = chrome.i18n.getMessage("minLower");
                        }

                        PageElements.sponsorTimesOthersTimeSavedDisplay.innerText = getFormattedHours(minutesSaved);
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

        PageElements.sponsorTimesSkipsDoneDisplay.innerText = Config.config.skipCount.toLocaleString();
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
    }

    // Must be delayed so it only happens once loaded
    setTimeout(() => PageElements.sponsorblockPopup.classList.remove("preload"), 250);

    getSegmentsFromContentScript(false);

    function onTabs(tabs, updating: boolean): void {
        messageHandler.sendMessage(tabs[0].id, { message: 'getVideoID' }, function (result) {
            if (result !== undefined && result.videoID) {
                currentVideoID = result.videoID;
                creatingSegment = result.creatingSegment;

                loadTabData(tabs, updating);
            } else if (result === undefined && chrome.runtime.lastError) {
                //this isn't a YouTube video then, or at least the content script is not loaded
                displayNoVideo();
            }
        });
    }

    function loadTabData(tabs, updating: boolean): void {
        if (!currentVideoID) {
            //this isn't a YouTube video then
            displayNoVideo();
            return;
        }

        sponsorTimes = Config.config.segmentTimes.get(currentVideoID) ?? [];
        updateSegmentEditingUI();

        messageHandler.sendMessage(
            tabs[0].id,
            { message: 'isInfoFound', updating },
            infoFound
        );
    }

    function getSegmentsFromContentScript(updating: boolean): void {
        messageHandler.query({
            active: true,
            currentWindow: true
        }, (tabs) => onTabs(tabs, updating));
    }

    function infoFound(request: IsInfoFoundMessageResponse) {
        if (chrome.runtime.lastError) {
            //This page doesn't have the injected content script, or at least not yet
            displayNoVideo();
            return;
        }

        //if request is undefined, then the page currently being browsed is not YouTube
        if (request != undefined) {
            //remove loading text
            PageElements.mainControls.style.display = "flex";
            if (request.onMobileYouTube) PageElements.mainControls.classList.add("hidden");
            PageElements.whitelistButton.classList.remove("hidden");
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
                { message: 'isChannelWhitelisted' },
                function (response) {
                    if (response.value) {
                        PageElements.whitelistChannel.style.display = "none";
                        PageElements.unwhitelistChannel.style.display = "unset";
                        PageElements.whitelistToggle.checked = true;
                        document.querySelectorAll('.SBWhitelistIcon')[0].classList.add("rotated");
                    }
                });
        }
        );
    }

    function sendSponsorStartMessage() {
        //the content script will get the message if a YouTube page is open
        messageHandler.query({
            active: true,
            currentWindow: true,
        }, (tabs) => {
            messageHandler.sendMessage(
                tabs[0].id,
                { from: 'popup', message: 'sponsorStart' },
                async (response) => {
                    startSponsorCallback(response);

                    // Perform a second update after the config changes take effect as a workaround for a race condition
                    const removeListener = (listener: typeof lateUpdate) => {
                        const index = Config.configListeners.indexOf(listener);
                        if (index !== -1) Config.configListeners.splice(index, 1);
                    };

                    const lateUpdate = () => {
                        startSponsorCallback(response);
                        removeListener(lateUpdate);
                    };

                    Config.configListeners.push(lateUpdate);

                    // Remove the listener after 200ms in case the changes were propagated by the time we got the response
                    setTimeout(() => removeListener(lateUpdate), 200);
                },
            );
        });
    }

    function startSponsorCallback(response: { creatingSegment: boolean }) {
        creatingSegment = response.creatingSegment;

        // Only update the segments after a segment was created
        if (!creatingSegment) {
            sponsorTimes = Config.config.segmentTimes.get(currentVideoID) || [];
        }

        // Update the UI
        updateSegmentEditingUI();
    }

    //display the video times from the array at the top, in a different section
    function displayDownloadedSponsorTimes(request: { found: boolean, sponsorTimes: SponsorTime[] }) {
        if (request.sponsorTimes != undefined) {
            // Sort list by start time
            const segmentTimes = request.sponsorTimes
                .sort((a, b) => a.segment[1] - b.segment[1])
                .sort((a, b) => a.segment[0] - b.segment[0]);

            //add them as buttons to the issue reporting container
            const container = document.getElementById("issueReporterTimeButtons");
            while (container.firstChild) {
                container.removeChild(container.firstChild);
            }

            const isVip = Config.config.isVip;
            for (let i = 0; i < segmentTimes.length; i++) {
                const UUID = segmentTimes[i].UUID;
                const locked = segmentTimes[i].locked;

                const sponsorTimeButton = document.createElement("button");
                sponsorTimeButton.className = "segmentTimeButton popupElement";

                const categoryColorCircle = document.createElement("span");
                categoryColorCircle.id = "sponsorTimesCategoryColorCircle" + UUID;
                categoryColorCircle.style.backgroundColor = Config.config.barTypes[segmentTimes[i].category]?.color;
                categoryColorCircle.classList.add("dot");
                categoryColorCircle.classList.add("sponsorTimesCategoryColorCircle");

                let extraInfo = "";
                if (segmentTimes[i].hidden === SponsorHideType.Downvoted) {
                    //this one is downvoted
                    extraInfo = " (" + chrome.i18n.getMessage("hiddenDueToDownvote") + ")";
                } else if (segmentTimes[i].hidden === SponsorHideType.MinimumDuration) {
                    //this one is too short
                    extraInfo = " (" + chrome.i18n.getMessage("hiddenDueToDuration") + ")";
                }

                const textNode = document.createTextNode(utils.shortCategoryName(segmentTimes[i].category) + extraInfo);
                const segmentTimeFromToNode = document.createElement("div");
                segmentTimeFromToNode.innerText = utils.getFormattedTime(segmentTimes[i].segment[0], true) + 
                            (getCategoryActionType(segmentTimes[i].category) !== CategoryActionType.POI 
                                ? " " + chrome.i18n.getMessage("to") + " " + utils.getFormattedTime(segmentTimes[i].segment[1], true) 
                                : "");
                segmentTimeFromToNode.style.margin = "5px";

                sponsorTimeButton.appendChild(categoryColorCircle);
                sponsorTimeButton.appendChild(textNode);
                sponsorTimeButton.appendChild(segmentTimeFromToNode);

                const votingButtons = document.createElement("div");
                votingButtons.classList.add("votingButtons");

                //thumbs up and down buttons
                const voteButtonsContainer = document.createElement("div");
                voteButtonsContainer.id = "sponsorTimesVoteButtonsContainer" + UUID;
                voteButtonsContainer.setAttribute("align", "center");
                voteButtonsContainer.classList.add('voteButtonsContainer--hide');

                const upvoteButton = document.createElement("img");
                upvoteButton.id = "sponsorTimesUpvoteButtonsContainer" + UUID;
                upvoteButton.className = "voteButton";
                upvoteButton.src = chrome.runtime.getURL("icons/thumbs_up.svg");
                upvoteButton.addEventListener("click", () => vote(1, UUID));

                const downvoteButton = document.createElement("img");
                downvoteButton.id = "sponsorTimesDownvoteButtonsContainer" + UUID;
                downvoteButton.className = "voteButton";
                downvoteButton.src = locked && isVip ? chrome.runtime.getURL("icons/thumbs_down_locked.svg") : chrome.runtime.getURL("icons/thumbs_down.svg");
                downvoteButton.addEventListener("click", () => vote(0, UUID));

                //uuid button

                const uuidButton = document.createElement("img");
                uuidButton.id = "sponsorTimesCopyUUIDButtonContainer" + UUID;
                uuidButton.className = "voteButton";
                uuidButton.src = chrome.runtime.getURL("icons/clipboard.svg");
                uuidButton.addEventListener("click", () => {
                    navigator.clipboard.writeText(UUID);
                    const stopAnimation = utils.applyLoadingAnimation(uuidButton, 0.3);
                    stopAnimation();
                });

                //add thumbs up, thumbs down and uuid copy buttons to the container
                voteButtonsContainer.appendChild(upvoteButton);
                voteButtonsContainer.appendChild(downvoteButton);
                voteButtonsContainer.appendChild(uuidButton);

                //add click listener to open up vote panel
                sponsorTimeButton.addEventListener("click", function () {
                    voteButtonsContainer.classList.toggle("voteButtonsContainer--hide");
                });

                // Will contain request status
                const voteStatusContainer = document.createElement("div");
                voteStatusContainer.id = "sponsorTimesVoteStatusContainer" + UUID;
                voteStatusContainer.classList.add("sponsorTimesVoteStatusContainer");
                voteStatusContainer.style.display = "none";

                const thanksForVotingText = document.createElement("div");
                thanksForVotingText.id = "sponsorTimesThanksForVotingText" + UUID;
                thanksForVotingText.classList.add("sponsorTimesThanksForVotingText");
                voteStatusContainer.appendChild(thanksForVotingText);

                votingButtons.append(sponsorTimeButton);
                votingButtons.append(voteButtonsContainer);
                votingButtons.append(voteStatusContainer);

                container.appendChild(votingButtons);
            }
        }
    }

    function submitTimes() {
        if (sponsorTimes.length > 0) {
            messageHandler.query({
                active: true,
                currentWindow: true
            }, tabs => {
                messageHandler.sendMessage(
                    tabs[0].id,
                    { message: 'submitTimes' },
                );
            });
        }
    }

    function showNoticeAgain() {
        Config.config.dontShowNotice = false;

        PageElements.showNoticeAgain.style.display = "none";
    }

    /** Updates any UI related to segment editing and submission according to the current state. */
    function updateSegmentEditingUI() {
        PageElements.sponsorStart.innerText = chrome.i18n.getMessage(creatingSegment ? "sponsorEnd" : "sponsorStart");

        PageElements.submissionSection.style.display = sponsorTimes && sponsorTimes.length > 0 ? "unset" : "none";
    }

    //make the options div visible
    function openOptions() {
        chrome.runtime.sendMessage({ "message": "openConfig" });
    }

    function openHelp() {
        chrome.runtime.sendMessage({ "message": "openHelp" });
    }

    //make the options username setting option visible
    function setUsernameButton() {
        PageElements.usernameInput.value = PageElements.usernameValue.innerText;

        PageElements.submitUsername.style.display = "unset";
        PageElements.usernameInput.style.display = "unset";

        PageElements.setUsernameContainer.style.display = "none";
        PageElements.setUsername.style.display = "flex";
        PageElements.setUsername.classList.add("SBExpanded");

        PageElements.setUsernameStatusContainer.style.display = "none";

        PageElements.sponsorTimesContributionsContainer.classList.add("hidden");
    }

    //submit the new username
    function submitUsername() {
        //add loading indicator
        PageElements.setUsernameStatusContainer.style.display = "unset";
        PageElements.setUsernameStatus.innerText = chrome.i18n.getMessage("Loading");

        utils.sendRequestToServer("POST", "/api/setUsername?userID=" + Config.config.userID + "&username=" + PageElements.usernameInput.value, function (response) {
            if (response.status == 200) {
                //submitted
                PageElements.submitUsername.style.display = "none";
                PageElements.usernameInput.style.display = "none";

                PageElements.setUsernameContainer.style.removeProperty("display");
                PageElements.setUsername.classList.remove("SBExpanded");
                PageElements.usernameValue.innerText = PageElements.usernameInput.value;

                PageElements.setUsernameStatusContainer.style.display = "none";

                PageElements.sponsorTimesContributionsContainer.classList.remove("hidden");
            } else {
                PageElements.setUsernameStatus.innerText = utils.getErrorMessage(response.status, response.responseText);
            }
        });


        PageElements.setUsernameContainer.style.display = "none";
        PageElements.setUsername.style.display = "unset";
    }

    //this is not a YouTube video page
    function displayNoVideo() {
        document.getElementById("loadingIndicator").innerText = chrome.i18n.getMessage("noVideoID");
    }

    function addVoteMessage(message, UUID) {
        const voteButtonsContainer = document.getElementById("sponsorTimesVoteButtonsContainer" + UUID);
        voteButtonsContainer.style.display = "none";

        const voteStatusContainer = document.getElementById("sponsorTimesVoteStatusContainer" + UUID);
        voteStatusContainer.style.removeProperty("display");

        const thanksForVotingText = document.getElementById("sponsorTimesThanksForVotingText" + UUID);
        thanksForVotingText.innerText = message;
    }

    function vote(type, UUID) {
        //add loading info
        addVoteMessage(chrome.i18n.getMessage("Loading"), UUID);

        //send the vote message to the tab
        chrome.runtime.sendMessage({
            message: "submitVote",
            type: type,
            UUID: UUID
        }, function (response) {
            if (response != undefined) {
                //see if it was a success or failure
                if (response.successType == 1 || (response.successType == -1 && response.statusCode == 429)) {
                    //success (treat rate limits as a success)
                    addVoteMessage(chrome.i18n.getMessage("voted"), UUID);
                } else if (response.successType == -1) {
                    addVoteMessage(utils.getErrorMessage(response.statusCode, response.responseText), UUID);
                }
            }
        });
    }

    function whitelistChannel() {
        //get the channel url
        messageHandler.query({
            active: true,
            currentWindow: true
        }, tabs => {
            messageHandler.sendMessage(
                tabs[0].id,
                { message: 'getChannelID' },
                function (response) {
                    if (!response.channelID) {
                        alert(chrome.i18n.getMessage("channelDataNotFound") + " https://github.com/ajayyy/SponsorBlock/issues/753");
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
                    document.querySelectorAll('.SBWhitelistIcon')[0].classList.add("rotated");

                    if (!Config.config.forceChannelCheck) PageElements.whitelistForceCheck.classList.remove("hidden");

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
                { message: 'getChannelID' },
                function (response) {
                    //get whitelisted channels
                    let whitelistedChannels = Config.config.whitelistedChannels;
                    if (whitelistedChannels == undefined) {
                        whitelistedChannels = [];
                    }

                    //remove this channel
                    const index = whitelistedChannels.indexOf(response.channelID);
                    whitelistedChannels.splice(index, 1);

                    //change button
                    PageElements.whitelistChannel.style.display = "unset";
                    PageElements.unwhitelistChannel.style.display = "none";
                    document.querySelectorAll('.SBWhitelistIcon')[0].classList.remove("rotated");

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

    function refreshSegments() {
        const stopAnimation = utils.applyLoadingAnimation(PageElements.refreshSegmentsButton, 0.3);

        messageHandler.query({
            active: true,
            currentWindow: true
        }, tabs => {
            messageHandler.sendMessage(
                tabs[0].id,
                { message: 'refreshSegments' },
                (response) => {
                    infoFound(response);
                    stopAnimation();
                }
            )
        }
        );
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

    /**
     * Converts time in minutes to 2d 5h 25.1
     * If less than 1 hour, just returns minutes
     * 
     * @param {float} minutes 
     * @returns {string}
     */
    function getFormattedHours(minutes) {
        minutes = Math.round(minutes * 10) / 10;
        const days = Math.floor(minutes / 1440);
        const hours = Math.floor(minutes / 60) % 24;
        return (days > 0 ? days + chrome.i18n.getMessage("dayAbbreviation") + " " : "") + (hours > 0 ? hours + chrome.i18n.getMessage("hourAbbreviation") + " " : "") + (minutes % 60).toFixed(1);
    }

    //end of function
}

if (chrome.tabs != undefined) {
    //this means it is actually opened in the popup
    runThePopup();
}

export default runThePopup;
