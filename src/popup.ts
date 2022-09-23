import Config from "./config";

import Utils from "./utils";
import { SponsorTime, SponsorHideType, ActionType, SegmentUUID, SponsorSourceType, StorageChangesObject } from "./types";
import { Message, MessageResponse, IsInfoFoundMessageResponse, ImportSegmentsResponse, PopupMessage } from "./messageTypes";
import { showDonationLink } from "./utils/configUtils";
import { AnimationUtils } from "./utils/animationUtils";
import { GenericUtils } from "./utils/genericUtils";
import { shortCategoryName } from "./utils/categoryUtils";
import { localizeHtmlPage } from "./utils/pageUtils";
import { exportTimes } from "./utils/exporter";
import GenericNotice from "./render/GenericNotice";
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
        } else if (chrome.tabs) {
            chrome.tabs.sendMessage(id, request, callback);
        } else {
            chrome.runtime.sendMessage({ message: "tabs", data: request }, callback);
        }
    }

    query(config, callback) {
        if (this.messageListener || !chrome.tabs) {
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

// To prevent clickjacking
let allowPopup = window === window.top;
window.addEventListener("message", async (e) => {
    if (e.source !== window.parent) return;
    if (e.origin.endsWith('.youtube.com')) return allowPopup = true;
});

//make this a function to allow this to run on the content page
async function runThePopup(messageListener?: MessageListener): Promise<void> {
    const messageHandler = new MessageHandler(messageListener);
    localizeHtmlPage();

    type InputPageElements = {
        whitelistToggle?: HTMLInputElement,
        toggleSwitch?: HTMLInputElement,
        usernameInput?: HTMLInputElement,
    };
    type PageElements = { [key: string]: HTMLElement } & InputPageElements

    /** If true, the content script is in the process of creating a new segment. */
    let creatingSegment = false;

    //the start and end time pairs (2d)
    let sponsorTimes: SponsorTime[] = [];
    let downloadedTimes: SponsorTime[] = [];

    //current video ID of this tab
    let currentVideoID = null;

    enum SegmentTab {
        Segments,
        Chapters
    }
    let segmentTab = SegmentTab.Segments;
    let port: chrome.runtime.Port = null;

    const PageElements: PageElements = {};

    [
        "sponsorBlockPopupBody",
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
        "setUsernameStatus",
        "setUsernameStatus",
        "setUsername",
        "usernameInput",
        "usernameValue",
        "submitUsername",
        "sbPopupIconCopyUserID",
        // More
        "submissionHint",
        "mainControls",
        "loadingIndicator",
        "videoFound",
        "sponsorMessageTimes",
        //"downloadedSponsorMessageTimes",
        "refreshSegmentsButton",
        "whitelistButton",
        "sbDonate",
        "issueReporterTabs",
        "issueReporterTabSegments",
        "issueReporterTabChapters",
        "sponsorTimesDonateContainer",
        "sbConsiderDonateLink",
        "sbCloseDonate",
        "sbBetaServerWarning",
        "sbCloseButton",
        "issueReporterImportExport",
        "importSegmentsButton",
        "exportSegmentsButton",
        "importSegmentsMenu",
        "importSegmentsText",
        "importSegmentsSubmit"

    ].forEach(id => PageElements[id] = document.getElementById(id));

    getSegmentsFromContentScript(false);
    await utils.wait(() => Config.config !== null && allowPopup, 5000, 5);
    PageElements.sponsorBlockPopupBody.style.removeProperty("visibility");
    if (!Config.configSyncListeners.includes(contentConfigUpdateListener)) {
        Config.configSyncListeners.push(contentConfigUpdateListener);
    }

    PageElements.sbCloseButton.addEventListener("click", () => {
        sendTabMessage({
            message: "closePopup"
        });
    });

    if (window !== window.top) {
        PageElements.sbCloseButton.classList.remove("hidden");
        PageElements.sponsorBlockPopupBody.classList.add("is-embedded");
    }

    // Hide donate button if wanted (Safari, or user choice)
    if (!showDonationLink()) {
        PageElements.sbDonate.style.display = "none";
    }
    PageElements.sbDonate.addEventListener("click", () => Config.config.donateClicked = Config.config.donateClicked + 1);

    if (Config.config.testingServer) {
        PageElements.sbBetaServerWarning.classList.remove("hidden");
        PageElements.sbBetaServerWarning.addEventListener("click", function () {
            openOptionsAt("advanced");
        });
    }

    PageElements.exportSegmentsButton.addEventListener("click", exportSegments);
    PageElements.importSegmentsButton.addEventListener("click", 
        () => PageElements.importSegmentsMenu.classList.toggle("hidden"));
    PageElements.importSegmentsSubmit.addEventListener("click", importSegments);

    PageElements.sponsorStart.addEventListener("click", sendSponsorStartMessage);
    PageElements.whitelistToggle.addEventListener("change", function () {
        if (this.checked) {
            whitelistChannel();
        } else {
            unwhitelistChannel();
        }
    });
    PageElements.whitelistForceCheck.addEventListener("click", () => {openOptionsAt("behavior")});
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
    PageElements.sbPopupIconCopyUserID.addEventListener("click", async () => copyToClipboard(await utils.getHash(Config.config.userID)));

    // Forward click events
    if (window !== window.top) {
        document.addEventListener("keydown", (e) => {
            const target = e.target as HTMLElement;
            if (target.tagName === "INPUT"
                || target.tagName === "TEXTAREA"
                || e.key === "ArrowUp"
                || e.key === "ArrowDown") {
                return;
            }

            if (e.key === " ") {
                // No scrolling
                e.preventDefault();
            }

            sendTabMessage({
                message: "keydown",
                key: e.key,
                keyCode: e.keyCode,
                code: e.code,
                which: e.which,
                shiftKey: e.shiftKey,
                ctrlKey: e.ctrlKey,
                altKey: e.altKey,
                metaKey: e.metaKey
            });
        });
    }

    setupComPort();

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

    utils.sendRequestToServer("GET", "/api/userInfo?value=userName&value=viewCount&value=minutesSaved&value=vip&value=permissions&value=freeChaptersAccess&userID="
             + Config.config.userID, (res) => {
        if (res.status === 200) {
            const userInfo = JSON.parse(res.responseText);
            PageElements.usernameValue.innerText = userInfo.userName;

            const viewCount = userInfo.viewCount;
            if (viewCount != 0) {
                if (viewCount > 1) {
                    PageElements.sponsorTimesViewsDisplayEndWord.innerText = chrome.i18n.getMessage("Segments");
                } else {
                    PageElements.sponsorTimesViewsDisplayEndWord.innerText = chrome.i18n.getMessage("Segment");
                }
                PageElements.sponsorTimesViewsDisplay.innerText = viewCount.toLocaleString();
                PageElements.sponsorTimesViewsContainer.style.display = "block";
            }

            showDonateWidget(viewCount);

            const minutesSaved = userInfo.minutesSaved;
            if (minutesSaved != 0) {
                if (minutesSaved != 1) {
                    PageElements.sponsorTimesOthersTimeSavedEndWord.innerText = chrome.i18n.getMessage("minsLower");
                } else {
                    PageElements.sponsorTimesOthersTimeSavedEndWord.innerText = chrome.i18n.getMessage("minLower");
                }
                PageElements.sponsorTimesOthersTimeSavedDisplay.innerText = getFormattedHours(minutesSaved);
            }

            Config.config.isVip = userInfo.vip;
            Config.config.permissions = userInfo.permissions;

            if (userInfo.freeChaptersAccess) {
                Config.config.payments.chaptersAllowed = userInfo.freeChaptersAccess;
                Config.config.payments.freeAccess = userInfo.freeChaptersAccess;
                Config.config.payments.lastCheck = Date.now();
                Config.forceSyncUpdate("payments");
            }
        }
    });

    //get the amount of times this user has contributed and display it to thank them
    if (Config.config.sponsorTimesContributed != undefined) {
        PageElements.sponsorTimesContributionsDisplay.innerText = Config.config.sponsorTimesContributed.toLocaleString();
        PageElements.sponsorTimesContributionsContainer.classList.remove("hidden");
    }

    //get the amount of times this user has skipped a sponsor
    if (Config.config.skipCount != undefined) {
        if (Config.config.skipCount != 1) {
            PageElements.sponsorTimesSkipsDoneEndWord.innerText = chrome.i18n.getMessage("Segments");
        } else {
            PageElements.sponsorTimesSkipsDoneEndWord.innerText = chrome.i18n.getMessage("Segment");
        }

        PageElements.sponsorTimesSkipsDoneDisplay.innerText = Config.config.skipCount.toLocaleString();
        PageElements.sponsorTimesSkipsDoneContainer.style.display = "block";
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

    PageElements.issueReporterTabSegments.addEventListener("click", () => {
        PageElements.issueReporterTabSegments.classList.add("sbSelected");
        PageElements.issueReporterTabChapters.classList.remove("sbSelected");

        segmentTab = SegmentTab.Segments;
        getSegmentsFromContentScript(true);
    });

    PageElements.issueReporterTabChapters.addEventListener("click", () => {
        PageElements.issueReporterTabSegments.classList.remove("sbSelected");
        PageElements.issueReporterTabChapters.classList.add("sbSelected");

        segmentTab = SegmentTab.Chapters;
        getSegmentsFromContentScript(true);
    });

    function showDonateWidget(viewCount: number) {
        if (Config.config.showDonationLink && Config.config.donateClicked <= 0 && Config.config.showPopupDonationCount < 5
                && viewCount < 50000 && !Config.config.isVip && Config.config.skipCount > 10) {
            PageElements.sponsorTimesDonateContainer.style.display = "flex";
            PageElements.sbConsiderDonateLink.addEventListener("click", () => {
                Config.config.donateClicked = Config.config.donateClicked + 1;
            });

            PageElements.sbCloseDonate.addEventListener("click", () => {
                PageElements.sponsorTimesDonateContainer.style.display = "none";
                Config.config.showPopupDonationCount = 100;
            });

            Config.config.showPopupDonationCount = Config.config.showPopupDonationCount + 1;
        }
    }

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

    async function loadTabData(tabs, updating: boolean): Promise<void> {
        if (!currentVideoID) {
            //this isn't a YouTube video then
            displayNoVideo();
            return;
        }

        await utils.wait(() => Config.config !== null, 5000, 10);
        sponsorTimes = Config.config.unsubmittedSegments[currentVideoID] ?? [];
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
            PageElements.mainControls.style.display = "block";
            if (request.onMobileYouTube) PageElements.mainControls.classList.add("hidden");
            PageElements.whitelistButton.classList.remove("hidden");
            PageElements.loadingIndicator.style.display = "none";

            downloadedTimes = request.sponsorTimes ?? [];
            if (request.found) {
                PageElements.videoFound.innerHTML = chrome.i18n.getMessage("sponsorFound");

                PageElements.issueReporterImportExport.classList.remove("hidden");
                if (request.sponsorTimes) {
                    displayDownloadedSponsorTimes(request.sponsorTimes, request.time);
                }
            } else if (request.status == 404 || request.status == 200) {
                PageElements.videoFound.innerHTML = chrome.i18n.getMessage("sponsor404");
                PageElements.issueReporterImportExport.classList.add("hidden");
            } else {
                PageElements.videoFound.innerHTML = chrome.i18n.getMessage("connectionError") + request.status;
                PageElements.issueReporterImportExport.classList.add("hidden");
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
                        const index = Config.configSyncListeners.indexOf(listener);
                        if (index !== -1) Config.configSyncListeners.splice(index, 1);
                    };

                    const lateUpdate = () => {
                        startSponsorCallback(response);
                        removeListener(lateUpdate);
                    };

                    Config.configSyncListeners.push(lateUpdate);

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
            sponsorTimes = Config.config.unsubmittedSegments[currentVideoID] || [];
        }

        // Update the UI
        updateSegmentEditingUI();
    }

    //display the video times from the array at the top, in a different section
    function displayDownloadedSponsorTimes(sponsorTimes: SponsorTime[], time: number) {
        let currentSegmentTab = segmentTab;
        if (!sponsorTimes.some((segment) => segment.actionType === ActionType.Chapter && segment.source !== SponsorSourceType.YouTube)) {
            PageElements.issueReporterTabs.classList.add("hidden");
            currentSegmentTab = SegmentTab.Segments;
        } else {
            if (currentSegmentTab === SegmentTab.Segments 
                    && sponsorTimes.every((segment) => segment.actionType === ActionType.Chapter)) {
                PageElements.issueReporterTabs.classList.add("hidden");
                currentSegmentTab = SegmentTab.Chapters;
            } else {
                PageElements.issueReporterTabs.classList.remove("hidden");
            }
        }

        // Sort list by start time
        const downloadedTimes = sponsorTimes
            .filter((segment) => {
                if (currentSegmentTab === SegmentTab.Segments) {
                    return segment.actionType !== ActionType.Chapter;
                } else if (currentSegmentTab === SegmentTab.Chapters) {
                    return segment.actionType === ActionType.Chapter 
                        && segment.source !== SponsorSourceType.YouTube;
                } else {
                    return true;
                }
            })
            .sort((a, b) => a.segment[1] - b.segment[1])
            .sort((a, b) => a.segment[0] - b.segment[0]);

        //add them as buttons to the issue reporting container
        const container = document.getElementById("issueReporterTimeButtons");
        while (container.firstChild) {
            container.removeChild(container.firstChild);
        }

        if (downloadedTimes.length > 0) {
            PageElements.exportSegmentsButton.classList.remove("hidden");
        } else { 
            PageElements.exportSegmentsButton.classList.add("hidden");
        }

        const isVip = Config.config.isVip;
        for (let i = 0; i < downloadedTimes.length; i++) {
            const UUID = downloadedTimes[i].UUID;
            const locked = downloadedTimes[i].locked;
            const category = downloadedTimes[i].category;
            const actionType = downloadedTimes[i].actionType;

            const segmentSummary = document.createElement("summary");
            segmentSummary.classList.add("segmentSummary");
            if (time >= downloadedTimes[i].segment[0]) {
                if (time < downloadedTimes[i].segment[1]) {
                    segmentSummary.classList.add("segmentActive");
                } else {
                    segmentSummary.classList.add("segmentPassed");
                }
            }

            const categoryColorCircle = document.createElement("span");
            categoryColorCircle.id = "sponsorTimesCategoryColorCircle" + UUID;
            categoryColorCircle.style.backgroundColor = Config.config.barTypes[category]?.color;
            categoryColorCircle.classList.add("dot");
            categoryColorCircle.classList.add("sponsorTimesCategoryColorCircle");

            let extraInfo = "";
            if (downloadedTimes[i].hidden === SponsorHideType.Downvoted) {
                //this one is downvoted
                extraInfo = " (" + chrome.i18n.getMessage("hiddenDueToDownvote") + ")";
            } else if (downloadedTimes[i].hidden === SponsorHideType.MinimumDuration) {
                //this one is too short
                extraInfo = " (" + chrome.i18n.getMessage("hiddenDueToDuration") + ")";
            } else if (downloadedTimes[i].hidden === SponsorHideType.Hidden) {
                extraInfo = " (" + chrome.i18n.getMessage("manuallyHidden") + ")";
            }

            const name = downloadedTimes[i].description || shortCategoryName(category);
            const textNode = document.createTextNode(name + extraInfo);
            const segmentTimeFromToNode = document.createElement("div");
            if (downloadedTimes[i].actionType === ActionType.Full) {
                segmentTimeFromToNode.innerText = chrome.i18n.getMessage("full");
            } else {
                segmentTimeFromToNode.innerText = GenericUtils.getFormattedTime(downloadedTimes[i].segment[0], true) + 
                        (actionType !== ActionType.Poi
                            ? " " + chrome.i18n.getMessage("to") + " " + GenericUtils.getFormattedTime(downloadedTimes[i].segment[1], true)
                            : "");
            }

            segmentTimeFromToNode.style.margin = "5px";

            // for inline-styling purposes
            const labelContainer = document.createElement("div");
            if (actionType !== ActionType.Chapter) labelContainer.appendChild(categoryColorCircle);

            const span = document.createElement('span');
            span.className = "summaryLabel";
            span.appendChild(textNode);
            labelContainer.appendChild(span);

            segmentSummary.appendChild(labelContainer);
            segmentSummary.appendChild(segmentTimeFromToNode);

            const votingButtons = document.createElement("details");
            votingButtons.classList.add("votingButtons");

            //thumbs up and down buttons
            const voteButtonsContainer = document.createElement("div");
            voteButtonsContainer.id = "sponsorTimesVoteButtonsContainer" + UUID;
            voteButtonsContainer.classList.add("sbVoteButtonsContainer");

            const upvoteButton = document.createElement("img");
            upvoteButton.id = "sponsorTimesUpvoteButtonsContainer" + UUID;
            upvoteButton.className = "voteButton";
            upvoteButton.title = chrome.i18n.getMessage("upvote");
            upvoteButton.src = chrome.runtime.getURL("icons/thumbs_up.svg");
            upvoteButton.addEventListener("click", () => vote(1, UUID));

            const downvoteButton = document.createElement("img");
            downvoteButton.id = "sponsorTimesDownvoteButtonsContainer" + UUID;
            downvoteButton.className = "voteButton";
            downvoteButton.title = chrome.i18n.getMessage("downvote");
            downvoteButton.src = locked && isVip ? chrome.runtime.getURL("icons/thumbs_down_locked.svg") : chrome.runtime.getURL("icons/thumbs_down.svg");
            downvoteButton.addEventListener("click", () => vote(0, UUID));

            const uuidButton = document.createElement("img");
            uuidButton.id = "sponsorTimesCopyUUIDButtonContainer" + UUID;
            uuidButton.className = "voteButton";
            uuidButton.src = chrome.runtime.getURL("icons/clipboard.svg");
            uuidButton.title = chrome.i18n.getMessage("copySegmentID");
            uuidButton.addEventListener("click", () => {
                copyToClipboard(UUID);
                const stopAnimation = AnimationUtils.applyLoadingAnimation(uuidButton, 0.3);
                stopAnimation();
            });

            const hideButton = document.createElement("img");
            hideButton.id = "sponsorTimesCopyUUIDButtonContainer" + UUID;
            hideButton.className = "voteButton";
            hideButton.title = chrome.i18n.getMessage("hideSegment");
            if (downloadedTimes[i].hidden === SponsorHideType.Hidden) {
                hideButton.src = chrome.runtime.getURL("icons/not_visible.svg");
            } else {
                hideButton.src = chrome.runtime.getURL("icons/visible.svg");
            }
            hideButton.addEventListener("click", () => {
                const stopAnimation = AnimationUtils.applyLoadingAnimation(hideButton, 0.4);
                stopAnimation();

                if (downloadedTimes[i].hidden === SponsorHideType.Hidden) {
                    hideButton.src = chrome.runtime.getURL("icons/visible.svg");
                    downloadedTimes[i].hidden = SponsorHideType.Visible;
                } else {
                    hideButton.src = chrome.runtime.getURL("icons/not_visible.svg");
                    downloadedTimes[i].hidden = SponsorHideType.Hidden;
                }

                messageHandler.query({
                    active: true,
                    currentWindow: true
                }, tabs => {
                    messageHandler.sendMessage(
                        tabs[0].id,
                        {
                            message: "hideSegment",
                            type: downloadedTimes[i].hidden,
                            UUID: UUID
                        }
                    );
                });
            });

            const skipButton = document.createElement("img");
            skipButton.id = "sponsorTimesSkipButtonContainer" + UUID;
            skipButton.className = "voteButton";
            skipButton.src = chrome.runtime.getURL("icons/skip.svg");
            skipButton.addEventListener("click", () => skipSegment(actionType, UUID, skipButton));
            votingButtons.addEventListener("dblclick", () => skipSegment(actionType, UUID));

            //add thumbs up, thumbs down and uuid copy buttons to the container
            voteButtonsContainer.appendChild(upvoteButton);
            voteButtonsContainer.appendChild(downvoteButton);
            voteButtonsContainer.appendChild(uuidButton);
            if (downloadedTimes[i].actionType === ActionType.Skip || downloadedTimes[i].actionType === ActionType.Mute
                    && [SponsorHideType.Visible, SponsorHideType.Hidden].includes(downloadedTimes[i].hidden)) {
                voteButtonsContainer.appendChild(hideButton);
            }
            voteButtonsContainer.appendChild(skipButton);


            // Will contain request status
            const voteStatusContainer = document.createElement("div");
            voteStatusContainer.id = "sponsorTimesVoteStatusContainer" + UUID;
            voteStatusContainer.classList.add("sponsorTimesVoteStatusContainer");
            voteStatusContainer.style.display = "none";

            const thanksForVotingText = document.createElement("div");
            thanksForVotingText.id = "sponsorTimesThanksForVotingText" + UUID;
            thanksForVotingText.classList.add("sponsorTimesThanksForVotingText");
            voteStatusContainer.appendChild(thanksForVotingText);

            votingButtons.append(segmentSummary);
            votingButtons.append(voteButtonsContainer);
            votingButtons.append(voteStatusContainer);

            container.appendChild(votingButtons);
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

        PageElements.submitTimes.style.display = sponsorTimes && sponsorTimes.length > 0 ? "unset" : "none";
        PageElements.submissionHint.style.display = sponsorTimes && sponsorTimes.length > 0 ? "unset" : "none";
    }

    //make the options div visible
    function openOptions() {
        chrome.runtime.sendMessage({ "message": "openConfig" });
    }

    function openOptionsAt(location) {
        chrome.runtime.sendMessage({ "message": "openConfig", "hash": location });
    }

    function openHelp() {
        chrome.runtime.sendMessage({ "message": "openHelp" });
    }

    function sendTabMessage(data: Message): Promise<unknown> {
        return new Promise((resolve) => {
            messageHandler.query({
                active: true,
                currentWindow: true
            }, tabs => {
                messageHandler.sendMessage(
                    tabs[0].id,
                    data,
                    (response) => resolve(response)
                );
            }
            );
        });
    }

    //make the options username setting option visible
    function setUsernameButton() {
        PageElements.usernameInput.value = PageElements.usernameValue.innerText;

        PageElements.submitUsername.style.display = "unset";
        PageElements.usernameInput.style.display = "unset";

        PageElements.setUsernameContainer.style.display = "none";
        PageElements.setUsername.style.display = "flex";
        PageElements.setUsername.classList.add("SBExpanded");

        PageElements.setUsernameStatus.style.display = "none";

        PageElements.sponsorTimesContributionsContainer.classList.add("hidden");
    }

    //submit the new username
    function submitUsername() {
        //add loading indicator
        PageElements.setUsernameStatus.style.display = "unset";
        PageElements.setUsernameStatus.innerText = chrome.i18n.getMessage("Loading");

        utils.sendRequestToServer("POST", "/api/setUsername?userID=" + Config.config.userID + "&username=" + PageElements.usernameInput.value, function (response) {
            if (response.status == 200) {
                //submitted
                PageElements.submitUsername.style.display = "none";
                PageElements.usernameInput.style.display = "none";

                PageElements.setUsernameContainer.style.removeProperty("display");
                PageElements.setUsername.classList.remove("SBExpanded");
                PageElements.usernameValue.innerText = PageElements.usernameInput.value;

                PageElements.setUsernameStatus.style.display = "none";

                PageElements.sponsorTimesContributionsContainer.classList.remove("hidden");
            } else {
                PageElements.setUsernameStatus.innerText = GenericUtils.getErrorMessage(response.status, response.responseText);
            }
        });


        PageElements.setUsernameContainer.style.display = "none";
        PageElements.setUsername.style.display = "unset";
    }

    //this is not a YouTube video page
    function displayNoVideo() {
        document.getElementById("loadingIndicator").innerText = chrome.i18n.getMessage("noVideoID");

        PageElements.issueReporterTabs.classList.add("hidden");
    }

    function addVoteMessage(message, UUID) {
        const voteButtonsContainer = document.getElementById("sponsorTimesVoteButtonsContainer" + UUID);
        voteButtonsContainer.style.display = "none";

        const voteStatusContainer = document.getElementById("sponsorTimesVoteStatusContainer" + UUID);
        voteStatusContainer.style.removeProperty("display");

        const thanksForVotingText = document.getElementById("sponsorTimesThanksForVotingText" + UUID);
        thanksForVotingText.innerText = message;
    }

    function removeVoteMessage(UUID) {
        const voteButtonsContainer = document.getElementById("sponsorTimesVoteButtonsContainer" + UUID);
        voteButtonsContainer.style.display = "block";

        const voteStatusContainer = document.getElementById("sponsorTimesVoteStatusContainer" + UUID);
        voteStatusContainer.style.display = "none";

        const thanksForVotingText = document.getElementById("sponsorTimesThanksForVotingText" + UUID);
        thanksForVotingText.removeAttribute("innerText");
    }

    function vote(type, UUID) {
        //add loading info
        addVoteMessage(chrome.i18n.getMessage("Loading"), UUID);

        messageHandler.query({
            active: true,
            currentWindow: true
        }, tabs => {
            messageHandler.sendMessage(
                tabs[0].id,
                {
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
                            addVoteMessage(GenericUtils.getErrorMessage(response.statusCode, response.responseText), UUID);
                        }
                        setTimeout(() => removeVoteMessage(UUID), 1500);
                    }
                }
            );
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

                    //show 'consider force channel check' alert
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

                    //hide 'consider force channel check' alert
                    PageElements.whitelistForceCheck.classList.add("hidden");

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
        const stopAnimation = AnimationUtils.applyLoadingAnimation(PageElements.refreshSegmentsButton, 0.3);

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

    function skipSegment(actionType: ActionType, UUID: SegmentUUID, element?: HTMLElement): void {
        if (actionType === ActionType.Chapter) {
            sendMessage({
                message: "unskip",
                UUID: UUID
            });
        } else {
            sendMessage({
                message: "reskip",
                UUID: UUID
            });
        }
        
        if (element) {
            const stopAnimation = AnimationUtils.applyLoadingAnimation(element, 0.3);
            stopAnimation();
        }
    }

    function sendMessage(request: Message): void {
        messageHandler.query({
            active: true,
            currentWindow: true
        }, tabs => {
            messageHandler.sendMessage(
                tabs[0].id,
                request
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

    function copyToClipboard(text: string): void {
        if (window === window.top) {
            window.navigator.clipboard.writeText(text);
        } else {
            sendTabMessage({
                message: "copyToClipboard",
                text
            });
        }
    }

    async function importSegments() {
        const text = (PageElements.importSegmentsText as HTMLInputElement).value;

        await sendTabMessage({
            message: "importSegments",
            data: text
        }) as ImportSegmentsResponse;

        PageElements.importSegmentsMenu.classList.add("hidden");
    }

    function exportSegments() {
        copyToClipboard(exportTimes(downloadedTimes));

        const stopAnimation = AnimationUtils.applyLoadingAnimation(PageElements.exportSegmentsButton, 0.3);
        stopAnimation();
        new GenericNotice(null, "exportCopied", {
            title:  chrome.i18n.getMessage(`CopiedExclamation`),
            timed: true,
            maxCountdownTime: () => 0.6,
            referenceNode: PageElements.exportSegmentsButton.parentElement,
            dontPauseCountdown: true,
            style: {
                top: 0,
                bottom: 0,
                minWidth: 0,
                right: "30px",
                margin: "auto",
                height: "max-content"
            },
            hideLogo: true,
            hideRightInfo: true
        });
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

    function contentConfigUpdateListener(changes: StorageChangesObject) {
        for (const key in changes) {
            switch(key) {
                case "unsubmittedSegments":
                    sponsorTimes = Config.config.unsubmittedSegments[currentVideoID] ?? [];
                    updateSegmentEditingUI();
                    break;
            }
        }
    }

    function setupComPort(): void {
        port = chrome.runtime.connect({ name: "popup" });
        port.onDisconnect.addListener(() => setupComPort());
        port.onMessage.addListener((msg) => onMessage(msg));
    }

    function onMessage(msg: PopupMessage) {
        switch (msg.message) {
            case "time":
                displayDownloadedSponsorTimes(downloadedTimes, msg.time);
                break;
        }
    }
}

runThePopup();
