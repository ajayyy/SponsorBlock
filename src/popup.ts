import Config, { generateDebugDetails } from "./config";
import * as CompileConfig from "../config.json";

import Utils from "./utils";
import {
    ActionType,
    Category,
    SegmentUUID,
    SponsorHideType,
    SponsorSourceType,
    SponsorTime,
} from "./types";
import {
    GetChannelIDResponse,
    IsInfoFoundMessageResponse,
    LogResponse,
    Message,
    MessageResponse,
    PopupMessage,
    RefreshSegmentsResponse,
    SponsorStartResponse,
    VoteResponse,
} from "./messageTypes";
import { showDonationLink } from "./utils/configUtils";
import { AnimationUtils } from "../maze-utils/src/animationUtils";
import { shortCategoryName } from "./utils/categoryUtils";
import { localizeHtmlPage } from "../maze-utils/src/setup";
import { exportTimes } from "./utils/exporter";
import GenericNotice from "./render/GenericNotice";
import { getErrorMessage, getFormattedTime } from "../maze-utils/src/formating";
import { StorageChangesObject } from "../maze-utils/src/config";
import { getHash } from "../maze-utils/src/hash";
import { asyncRequestToServer, sendRequestToServer } from "./utils/requests";
import PopupCategorySkipOptionsComponent from "./components/PopupCategorySkipOptionsComponent";
import ReactDOM = require("react-dom");

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
window.addEventListener("message", async (e): Promise<void> => {
    if (e.source !== window.parent) return;
    if (e.origin.endsWith('.youtube.com')) {
        allowPopup = true;

        if (e.data && e.data?.type === "style") {
            const style = document.createElement("style");
            style.textContent = e.data.css;
            document.head.appendChild(style);
        }
    }
});

//make this a function to allow this to run on the content page
async function runThePopup(messageListener?: MessageListener): Promise<void> {
    const messageHandler = new MessageHandler(messageListener);
    localizeHtmlPage();

    type InputPageElements = {
        toggleSwitch?: HTMLInputElement;
        usernameInput?: HTMLInputElement;
        channelSpecificSettingsToggleSwitch?: HTMLInputElement;
    };
    type PageElements = { [key: string]: HTMLElement } & InputPageElements

    let stopLoadingAnimation = null;
    // For loading video info from the page
    let loadRetryCount = 0;

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

    //saves which detail elemts are opened, by saving the uuids
    const openedUUIDs: SegmentUUID[] =  [];

    const PageElements: PageElements = {};

    [
        "sbPopupLogo",
        "sbYourWorkBox",
        "videoInfo",
        "sbFooter",
        "sponsorBlockPopupBody",
        "sponsorblockPopup",
        "sponsorStart",
        // Top toggles
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
        "sbDonate",
        "issueReporterTabs",
        "issueReporterTabSegments",
        "issueReporterTabChapters",
        "sponsorTimesDonateContainer",
        "sbConsiderDonateLink",
        "sbCloseDonate",
        "sbBetaServerWarning",
        "sbCloseButton",
        // Channel specific settings
        "channelSpecificSettingsToggleSwitch",
        "channelSpecificSettings",
        "channelSettingsForceCheck",
        "disableChannelSpecificSettings",
        "enableChannelSpecificSettings",
        "channelSpecificSettingsDeleteButton",
        "channelSpecificSettingsList",
        "channelSpecificSettingsContainer",
        "issueReporterImportExport",
        "importSegmentsButton",
        "exportSegmentsButton",
        "importSegmentsMenu",
        "importSegmentsText",
        "importSegmentsSubmit",
        "debugLogs"

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

    //setup click listeners
    PageElements.sponsorStart.addEventListener("click", sendSponsorStartMessage);
    PageElements.channelSettingsForceCheck.addEventListener("click", () => {openOptionsAt("behavior")});
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
    PageElements.sbPopupIconCopyUserID.addEventListener("click", async () => copyToClipboard(await getHash(Config.config.userID)));
    PageElements.debugLogs.addEventListener("click", copyDebgLogs);
    PageElements.channelSpecificSettingsToggleSwitch.addEventListener("change", toggleChannelSpecificSettings);
    PageElements.channelSpecificSettingsDeleteButton.addEventListener("click", deleteChannelSpecificSettings);

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

    const values = ["userName", "viewCount", "minutesSaved", "vip", "permissions", "segmentCount"];

    asyncRequestToServer("GET", "/api/userInfo", {
        publicUserID: await getHash(Config.config.userID),
        values
    }).then((res) => {
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

            //get the amount of times this user has contributed and display it to thank them
            PageElements.sponsorTimesContributionsDisplay.innerText = Math.max(Config.config.sponsorTimesContributed ?? 0, userInfo.segmentCount).toLocaleString();
            PageElements.sponsorTimesContributionsContainer.classList.remove("hidden");

            PageElements.sponsorTimesOthersTimeSavedEndWord.innerText = chrome.i18n.getMessage("minsLower");

            Config.config.isVip = userInfo.vip;
            Config.config.permissions = userInfo.permissions;
        }
    });

    

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

                loadTabData(tabs, updating);
            } else {
                // Handle error if it exists
                chrome.runtime.lastError;

                // This isn't a YouTube video then, or at least the content script is not loaded
                displayNoVideo();

                // Try again in some time if a failure
                loadRetryCount++;
                if (loadRetryCount < 6) {
                    setTimeout(() => getSegmentsFromContentScript(false), 100 * loadRetryCount);
                }
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
        sponsorTimes = Config.local.unsubmittedSegments[currentVideoID] ?? [];
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

    async function infoFound(request: IsInfoFoundMessageResponse) {
        // End any loading animation
        if (stopLoadingAnimation != null) {
            stopLoadingAnimation();
            stopLoadingAnimation = null;
        }

        if (chrome.runtime.lastError || request == undefined || request.found == undefined) {
            //This page doesn't have the injected content script, or at least not yet
            // Or if the request is empty, meaning the current page is not YouTube or a video page
            displayNoVideo();
            return;
        }

        //remove loading text
        PageElements.mainControls.style.display = "block";
        if (request.onMobileYouTube) PageElements.mainControls.classList.add("hidden");
        PageElements.channelSpecificSettings.classList.remove("hidden");
        PageElements.loadingIndicator.style.display = "none";

        downloadedTimes = request.sponsorTimes ?? [];
        displayDownloadedSponsorTimes(downloadedTimes, request.time);
        if (request.found) {
            PageElements.videoFound.innerHTML = chrome.i18n.getMessage("sponsorFound");
            PageElements.issueReporterImportExport.classList.remove("hidden");
        } else if (request.status == 404 || request.status == 200) {
            PageElements.videoFound.innerHTML = chrome.i18n.getMessage("sponsor404");
            PageElements.issueReporterImportExport.classList.remove("hidden");
        } else {
            if (request.status) {
                PageElements.videoFound.innerHTML = chrome.i18n.getMessage("connectionError") + request.status;
            } else {
                PageElements.videoFound.innerHTML = chrome.i18n.getMessage("segmentsStillLoading");
            }

            PageElements.issueReporterImportExport.classList.remove("hidden");
        }
    }

    async function sendSponsorStartMessage() {
        //the content script will get the message if a YouTube page is open
        const response = await sendTabMessageAsync({ from: 'popup', message: 'sponsorStart' }) as SponsorStartResponse;
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
    }

    function startSponsorCallback(response: SponsorStartResponse) {
        // Only update the segments after a segment was created
        if (!response.creatingSegment) {
            sponsorTimes = Config.local.unsubmittedSegments[currentVideoID] || [];
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
            .sort((a, b) => b.segment[1] - a.segment[1])
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
                segmentTimeFromToNode.innerText = getFormattedTime(downloadedTimes[i].segment[0], true) +
                        (actionType !== ActionType.Poi
                            ? " " + chrome.i18n.getMessage("to") + " " + getFormattedTime(downloadedTimes[i].segment[1], true)
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
            votingButtons.id = "votingButtons" + UUID;
            votingButtons.setAttribute("data-uuid", UUID);
            votingButtons.addEventListener("toggle", () => {
                if (votingButtons.open) {
                    openedUUIDs.push(UUID);
                } else {
                    const index = openedUUIDs.indexOf(UUID);
                    if (index !== -1) {
                        openedUUIDs.splice(openedUUIDs.indexOf(UUID), 1);
                    }
                }
            });
            votingButtons.open = openedUUIDs.some((u) => u === UUID);

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
            uuidButton.addEventListener("click", async () => {
                const stopAnimation = AnimationUtils.applyLoadingAnimation(uuidButton, 0.3);

                if (UUID.length > 60) {
                    copyToClipboard(UUID);
                } else {
                    const segmentIDData = await asyncRequestToServer("GET", "/api/segmentID", {
                        UUID: UUID,
                        videoID: currentVideoID
                    });
        
                    if (segmentIDData.ok && segmentIDData.responseText) {
                        copyToClipboard(segmentIDData.responseText);
                    }
                }

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

                sendTabMessage({
                    message: "hideSegment",
                    type: downloadedTimes[i].hidden,
                    UUID: UUID
                })
            });

            const skipButton = document.createElement("img");
            skipButton.id = "sponsorTimesSkipButtonContainer" + UUID;
            skipButton.className = "voteButton";
            skipButton.src = chrome.runtime.getURL("icons/skip.svg");
            skipButton.title = actionType === ActionType.Chapter ? chrome.i18n.getMessage("playChapter")
                : chrome.i18n.getMessage("skipSegment");
            skipButton.addEventListener("click", () => skipSegment(actionType, UUID, skipButton));
            votingButtons.addEventListener("dblclick", () => skipSegment(actionType, UUID));
            votingButtons.addEventListener("dblclick", () => skipSegment(actionType, UUID));
            votingButtons.addEventListener("mouseenter", () => selectSegment(UUID));

            //add thumbs up, thumbs down and uuid copy buttons to the container
            voteButtonsContainer.appendChild(upvoteButton);
            voteButtonsContainer.appendChild(downvoteButton);
            voteButtonsContainer.appendChild(uuidButton);
            if (downloadedTimes[i].actionType === ActionType.Skip || downloadedTimes[i].actionType === ActionType.Mute
                    || downloadedTimes[i].actionType === ActionType.Poi
                    && [SponsorHideType.Visible, SponsorHideType.Hidden].includes(downloadedTimes[i].hidden)) {
                voteButtonsContainer.appendChild(hideButton);
            }
            if (downloadedTimes[i].actionType !== ActionType.Full) {
                voteButtonsContainer.appendChild(skipButton);
            }

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

        container.addEventListener("mouseleave", () => selectSegment(null));
    }

    function submitTimes() {
        if (sponsorTimes.length > 0) {
            sendTabMessage({ message: 'submitTimes' })
        }
    }

    function showNoticeAgain() {
        Config.config.dontShowNotice = false;

        PageElements.showNoticeAgain.style.display = "none";
    }

    function isCreatingSegment(): boolean {
        const segments = Config.local.unsubmittedSegments[currentVideoID];
        if (!segments) return false;
        const lastSegment = segments[segments.length - 1];
        return lastSegment && lastSegment?.segment?.length !== 2;
    }

    /** Updates any UI related to segment editing and submission according to the current state. */
    function updateSegmentEditingUI() {
        PageElements.sponsorStart.innerText = chrome.i18n.getMessage(isCreatingSegment() ? "sponsorEnd" : "sponsorStart");

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

    function sendTabMessage(data: Message, callback?) {
        messageHandler.query({
            active: true,
            currentWindow: true
        }, tabs => {
            messageHandler.sendMessage(
                tabs[0].id,
                data,
                callback
            );
        }
        );
    }

    function sendTabMessageAsync(data: Message): Promise<unknown> {
        return new Promise((resolve) => sendTabMessage(data, (response) => resolve(response)))
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

        sendRequestToServer("POST", "/api/setUsername?userID=" + Config.config.userID + "&username=" + PageElements.usernameInput.value, function (response) {
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
                PageElements.setUsernameStatus.innerText = getErrorMessage(response.status, response.responseText);
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

    async function vote(type, UUID) {
        //add loading info
        addVoteMessage(chrome.i18n.getMessage("Loading"), UUID);
        const response = await sendTabMessageAsync({
            message: "submitVote",
            type: type,
            UUID: UUID
        }) as VoteResponse;

        if (response != undefined) {
            //see if it was a success or failure
            if (response.successType == 1 || (response.successType == -1 && response.statusCode == 429)) {
                //success (treat rate limits as a success)
                addVoteMessage(chrome.i18n.getMessage("voted"), UUID);
            } else if (response.successType == -1) {
                addVoteMessage(getErrorMessage(response.statusCode, response.responseText), UUID);
            }
            setTimeout(() => removeVoteMessage(UUID), 1500);
        }
    }

    // ********************************** Channel Override Logic Start ********************************* //
    initChannelSpecificSettings();

    async function initChannelSpecificSettings() {
        //get the channel url
        const response = await sendTabMessageAsync({ message: 'getChannelInfo' }) as GetChannelIDResponse;

        const channelID = response.channelID;

        //get channel settings
        const channelSpecificSettings = Config.config.channelSpecificSettings?.[channelID];

        if (channelSpecificSettings && channelSpecificSettings?.categorySelections.length === 0){
            delete Config.config.channelSpecificSettings[channelID];
            Config.forceSyncUpdate('channelSpecificSettings');
        }

        const channelSpecificSettingsToggle = Config.config.channelSpecificSettings[channelID] ? Config.config.channelSpecificSettings[channelID].toggle : false;

        //change button
        if (Config.config.channelSpecificSettings[channelID]?.categorySelections.length) PageElements.channelSpecificSettingsDeleteButton.classList.remove("hidden");
        PageElements.enableChannelSpecificSettings.style.display = channelSpecificSettingsToggle ? "none" : "unset";
        PageElements.disableChannelSpecificSettings.style.display = channelSpecificSettingsToggle ? "unset" : "none";
        PageElements.channelSpecificSettingsToggleSwitch.checked = channelSpecificSettingsToggle;
        PageElements.channelSpecificSettingsContainer.style.display = channelSpecificSettingsToggle ? "unset" : "none";

        loadChannelSpecificSettings(channelID);
    }

    function loadChannelSpecificSettings(channelID: string) {
        const settingsList = PageElements.channelSpecificSettingsList;
        const deleteButton = PageElements.channelSpecificSettingsDeleteButton;
        CompileConfig.categoryList.forEach((category: Category) => {
            const categorySkipOptionsComponent = new PopupCategorySkipOptionsComponent({category, channelID, deleteButton});
            const wrapper = document.createElement("div");
            ReactDOM.render(categorySkipOptionsComponent.render(), wrapper);
            settingsList.appendChild(wrapper);
        });
    }

    async function toggleChannelSpecificSettings() {
        //get the channel ID
        const response = await sendTabMessageAsync({ message: 'getChannelInfo' }) as GetChannelIDResponse;
        const channelID = response.channelID;

        if (Config.config.channelSpecificSettings?.[channelID] && Config.config.channelSpecificSettings?.[channelID]?.categorySelections.length === 0){
            delete Config.config.channelSpecificSettings[channelID];
            PageElements.channelSpecificSettingsDeleteButton.classList.add("hidden");
            Config.forceSyncUpdate('channelSpecificSettings');
        }
        const channelSpecificSettings = Config.config.channelSpecificSettings?.[channelID];

        const channelSpecificSettingsToggle = PageElements.channelSpecificSettingsToggleSwitch.checked;

        if (!Config.config.forceChannelCheck && channelSpecificSettingsToggle) PageElements.channelSettingsForceCheck.classList.remove("hidden");
        else if (!channelSpecificSettingsToggle) PageElements.channelSettingsForceCheck.classList.add("hidden");
        PageElements.enableChannelSpecificSettings.style.display = channelSpecificSettingsToggle ? "none" : "unset";
        PageElements.disableChannelSpecificSettings.style.display = channelSpecificSettingsToggle ? "unset" : "none";
        PageElements.channelSpecificSettingsContainer.style.display = channelSpecificSettingsToggle ? "unset" : "none";

        if (channelSpecificSettings){
            Config.config.channelSpecificSettings[channelID].toggle = channelSpecificSettingsToggle;
            Config.forceSyncUpdate('channelSpecificSettings');
        }
    }

    async function deleteChannelSpecificSettings() {
        const response = await sendTabMessageAsync({ message: 'getChannelInfo' }) as GetChannelIDResponse;
        const channelID = response.channelID;
        
        if(Config.config.channelSpecificSettings[channelID]){
            delete Config.config.channelSpecificSettings[channelID];
            Config.forceSyncUpdate('channelSpecificSettings');
        }

        PageElements.channelSpecificSettingsList
            .querySelectorAll("select")
            .forEach((select) => {
                select.value = Array.from(select.options).find(option => option.value.endsWith("global")).value;
            });

        if (PageElements.channelSpecificSettingsToggleSwitch.checked){
            PageElements.channelSpecificSettingsToggleSwitch.checked = false;
            PageElements.disableChannelSpecificSettings.style.display = "unset";
            PageElements.enableChannelSpecificSettings.style.display = "none";
            PageElements.channelSpecificSettingsContainer.style.display = "none";
            if (!Config.config.forceChannelCheck) PageElements.channelSettingsForceCheck.classList.add("hidden");
        }
        PageElements.channelSpecificSettingsDeleteButton.classList.add("hidden");
        Config.forceSyncUpdate('channelSpecificSettings');
    }

    // ********************************** Channel Override Logic End ********************************* //

    function startLoadingAnimation() {
        stopLoadingAnimation = AnimationUtils.applyLoadingAnimation(PageElements.refreshSegmentsButton, 0.3);
    }

    async function refreshSegments() {
        startLoadingAnimation();
        const response = await sendTabMessageAsync({ message: 'refreshSegments' }) as RefreshSegmentsResponse;

        if (response == null || !response.hasVideo) {
            if (stopLoadingAnimation != null) {
                stopLoadingAnimation();
                stopLoadingAnimation = null;
            }
            displayNoVideo();
        }
    }

    function skipSegment(actionType: ActionType, UUID: SegmentUUID, element?: HTMLElement): void {
        if (actionType === ActionType.Chapter) {
            sendTabMessage({
                message: "unskip",
                UUID: UUID
            });
        } else {
            sendTabMessage({
                message: "reskip",
                UUID: UUID
            });
        }

        if (element) {
            const stopAnimation = AnimationUtils.applyLoadingAnimation(element, 0.3);
            stopAnimation();
        }
    }

    function selectSegment(UUID: SegmentUUID | null): void {
        sendTabMessage({
            message: "selectSegment",
            UUID: UUID
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

        sendTabMessage({
            message: "importSegments",
            data: text
        });

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
        const years = Math.floor(minutes / 525600); // Assumes 365.0 days in a year
        const days = Math.floor(minutes / 1440) % 365;
        const hours = Math.floor(minutes / 60) % 24;
        return (years > 0 ? years + chrome.i18n.getMessage("yearAbbreviation") + " " : "") + (days > 0 ? days + chrome.i18n.getMessage("dayAbbreviation") + " " : "") + (hours > 0 ? hours + chrome.i18n.getMessage("hourAbbreviation") + " " : "") + (minutes % 60).toFixed(1);
    }

    function contentConfigUpdateListener(changes: StorageChangesObject) {
        for (const key in changes) {
            switch(key) {
                case "unsubmittedSegments":
                    sponsorTimes = Config.local.unsubmittedSegments[currentVideoID] ?? [];
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

    function updateCurrentTime(currentTime: number) {
        // Create a map of segment UUID -> segment object for easy access
        const segmentMap: Record<string, SponsorTime> = {};
        for (const segment of downloadedTimes)
            segmentMap[segment.UUID] = segment

        // Iterate over segment elements and update their classes
        const segmentList = document.getElementById("issueReporterTimeButtons");
        for (const segmentElement of segmentList.children) {
            const UUID = segmentElement.getAttribute("data-uuid");
            if (UUID == null || segmentMap[UUID] == undefined) continue;

            const summaryElement = segmentElement.querySelector("summary")
            if (summaryElement == null) continue;

            const segment = segmentMap[UUID]
            summaryElement.classList.remove("segmentActive", "segmentPassed")
            if (currentTime >= segment.segment[0]) {
                if (currentTime < segment.segment[1]) {
                    summaryElement.classList.add("segmentActive");
                } else {
                    summaryElement.classList.add("segmentPassed");
                }
            }
        }
    }

    function copyDebgLogs() {
        sendTabMessage({ message: "getLogs" }, (logs: LogResponse) => {
            copyToClipboard(`${generateDebugDetails()}\n\nWarn:\n${logs.warn.join("\n")}\n\nDebug:\n${logs.debug.join("\n")}`);
        });
    }

    function onMessage(msg: PopupMessage) {
        switch (msg.message) {
            case "time":
                updateCurrentTime(msg.time);
                break;
            case "infoUpdated":
                infoFound(msg);
                break;
            case "videoChanged":
                currentVideoID = msg.videoID
                sponsorTimes = Config.local.unsubmittedSegments[currentVideoID] ?? [];
                updateSegmentEditingUI();

                PageElements.channelSpecificSettingsList.replaceChildren();
                initChannelSpecificSettings();

                // Clear segments list & start loading animation
                // We'll get a ping once they're loaded
                startLoadingAnimation();
                PageElements.videoFound.innerHTML = chrome.i18n.getMessage("Loading");
                displayDownloadedSponsorTimes([], 0);
                break;
        }
    }
}

runThePopup();
