import Config from "./config";
import { SponsorTime, CategorySkipOption, VideoID, SponsorHideType, VideoInfo, StorageChangesObject, ChannelIDInfo, ChannelIDStatus, SponsorSourceType, SegmentUUID, Category, SkipToTimeParams, ToggleSkippable, ActionType, ScheduledTime, HashedValue } from "./types";

import { ContentContainer, Keybind } from "./types";
import Utils from "./utils";
const utils = new Utils();

import PreviewBar, {PreviewBarSegment} from "./js-components/previewBar";
import SkipNotice from "./render/SkipNotice";
import SkipNoticeComponent from "./components/SkipNoticeComponent";
import SubmissionNotice from "./render/SubmissionNotice";
import { Message, MessageResponse, VoteResponse } from "./messageTypes";
import { SkipButtonControlBar } from "./js-components/skipButtonControlBar";
import { getStartTimeFromUrl } from "./utils/urlParser";
import { findValidElement, getControls, getHashParams, isVisible } from "./utils/pageUtils";
import { isSafari, keybindEquals } from "./utils/configUtils";
import { CategoryPill } from "./render/CategoryPill";
import { AnimationUtils } from "./utils/animationUtils";
import { GenericUtils } from "./utils/genericUtils";
import { logDebug } from "./utils/logger";
import { openWarningDialog } from "./utils/warnings";
import { getYouTubeVideoID, getYouTubeVideoIDFromDocument, getYouTubeVideoIDFromURL } from "./utils/getYouTubeVideoID";

// Hack to get the CSS loaded on permission-based sites (Invidious)
utils.wait(() => Config.config !== null, 5000, 10).then(addCSS);

//was sponsor data found when doing SponsorsLookup
let sponsorDataFound = false;
//the actual sponsorTimes if loaded and UUIDs associated with them
let sponsorTimes: SponsorTime[] = null;
//what video id are these sponsors for
let sponsorVideoID: VideoID = null;
// List of open skip notices
const skipNotices: SkipNotice[] = [];
let activeSkipKeybindElement: ToggleSkippable = null;

// JSON video info
let videoInfo: VideoInfo = null;
// The channel this video is about
let channelIDInfo: ChannelIDInfo;
// Locked Categories in this tab, like: ["sponsor","intro","outro"]
let lockedCategories: Category[] = [];
// Used to calculate a more precise "virtual" video time
let lastKnownVideoTime: { videoTime: number, preciseTime: number } = {
    videoTime: null,
    preciseTime: null
};
// It resumes with a slightly later time on chromium
let lastTimeFromWaitingEvent = null;

// Skips are scheduled to ensure precision.
// Skips are rescheduled every seeking event.
// Skips are canceled every seeking event
let currentSkipSchedule: NodeJS.Timeout = null;
let currentSkipInterval: NodeJS.Timeout = null;

/** Has the sponsor been skipped */
let sponsorSkipped: boolean[] = [];

//the video
let video: HTMLVideoElement;
let videoMuted = false; // Has it been attempted to be muted
let videoMutationObserver: MutationObserver = null;
// List of videos that have had event listeners added to them
const videosWithEventListeners: HTMLVideoElement[] = [];
const controlsWithEventListeners: HTMLElement[] = []

// This misleading variable name will be fixed soon
let onInvidious: boolean;
let onMobileYouTube: boolean;

//the video id of the last preview bar update
let lastPreviewBarUpdate;

// Is the video currently being switched
let switchingVideos = null;

// Used by the play and playing listeners to make sure two aren't
// called at the same time
let lastCheckTime = 0;
let lastCheckVideoTime = -1;

//is this channel whitelised from getting sponsors skipped
let channelWhitelisted = false;

let previewBar: PreviewBar = null;
// Skip to highlight button
let skipButtonControlBar: SkipButtonControlBar = null;
// For full video sponsors/selfpromo
let categoryPill: CategoryPill = null;

/** Element containing the player controls on the YouTube player. */
let controls: HTMLElement | null = null;

/** Contains buttons created by `createButton()`. */
const playerButtons: Record<string, {button: HTMLButtonElement, image: HTMLImageElement, setupListener: boolean}> = {};

// Direct Links after the config is loaded
utils.wait(() => Config.config !== null, 1000, 1).then(() => videoIDChange(getYouTubeVideoID(document)));
// wait for hover preview to appear, and refresh attachments if ever found
window.addEventListener("DOMContentLoaded", () => {
    utils.waitForElement(".ytp-inline-preview-ui").then(() => refreshVideoAttachments())
    utils.waitForElement("[data-sessionlink='feature=player-title']").then(() => videoIDChange(getYouTubeVideoID(document)))
});
addPageListeners();
addHotkeyListener();

/** Segments created by the user which have not yet been submitted. */
let sponsorTimesSubmitting: SponsorTime[] = [];
let loadedPreloadedSegment = false;

//becomes true when isInfoFound is called
//this is used to close the popup on YouTube when the other popup opens
let popupInitialised = false;

let submissionNotice: SubmissionNotice = null;

// If there is an advert playing (or about to be played), this is true
let isAdPlaying = false;

let lastResponseStatus: number;
let retryCount = 0;

// Contains all of the functions and variables needed by the skip notice
const skipNoticeContentContainer: ContentContainer = () => ({
    vote,
    dontShowNoticeAgain,
    unskipSponsorTime,
    sponsorTimes,
    sponsorTimesSubmitting,
    skipNotices,
    v: video,
    sponsorVideoID,
    reskipSponsorTime,
    updatePreviewBar,
    onMobileYouTube,
    sponsorSubmissionNotice: submissionNotice,
    resetSponsorSubmissionNotice,
    updateEditButtonsOnPlayer,
    previewTime,
    videoInfo,
    getRealCurrentTime: getRealCurrentTime,
    lockedCategories
});

// value determining when to count segment as skipped and send telemetry to server (percent based)
const manualSkipPercentCount = 0.5;

//get messages from the background script and the popup
chrome.runtime.onMessage.addListener(messageListener);

function messageListener(request: Message, sender: unknown, sendResponse: (response: MessageResponse) => void): void | boolean {
    //messages from popup script
    switch(request.message){
        case "update":
            videoIDChange(getYouTubeVideoID(document));
            break;
        case "sponsorStart":
            startOrEndTimingNewSegment()

            sendResponse({
                creatingSegment: isSegmentCreationInProgress(),
            });

            break;
        case "isInfoFound":
            //send the sponsor times along with if it's found
            sendResponse({
                found: sponsorDataFound,
                status: lastResponseStatus,
                sponsorTimes: sponsorTimes,
                onMobileYouTube
            });

            if (!request.updating && popupInitialised && document.getElementById("sponsorBlockPopupContainer") != null) {
                //the popup should be closed now that another is opening
                closeInfoMenu();
            }

            popupInitialised = true;
            break;
        case "getVideoID":
            sendResponse({
                videoID: sponsorVideoID,
                creatingSegment: isSegmentCreationInProgress(),
            });

            break;
        case "getChannelID":
            sendResponse({
                channelID: channelIDInfo.id
            });

            break;
        case "isChannelWhitelisted":
            sendResponse({
                value: channelWhitelisted
            });

            break;
        case "whitelistChange":
            channelWhitelisted = request.value;
            sponsorsLookup();

            break;
        case "submitTimes":
            submitSponsorTimes();
            break;
        case "refreshSegments":
            // update video on refresh if videoID invalid
            if (!sponsorVideoID) videoIDChange(getYouTubeVideoID(document));
            // fetch segments
            sponsorsLookup(false).then(() => sendResponse({
                found: sponsorDataFound,
                status: lastResponseStatus,
                sponsorTimes: sponsorTimes,
                onMobileYouTube
            }));

            return true;
        case "submitVote":
            vote(request.type, request.UUID).then((response) => sendResponse(response));
            return true;
        case "hideSegment":
            utils.getSponsorTimeFromUUID(sponsorTimes, request.UUID).hidden = request.type;
            utils.addHiddenSegment(sponsorVideoID, request.UUID, request.type);
            updatePreviewBar();
            break;
        case "closePopup":
            closeInfoMenu();
            break;
        case "copyToClipboard":
            navigator.clipboard.writeText(request.text);
            break;
        case "keydown":
            document.dispatchEvent(new KeyboardEvent('keydown', {
                key: request.key,
                keyCode: request.keyCode,
                code: request.code,
                which: request.which,
                shiftKey: request.shiftKey,
                ctrlKey: request.ctrlKey,
                altKey: request.altKey,
                metaKey: request.metaKey
            }));
            break;
    }

    sendResponse({});
}

/**
 * Called when the config is updated
 *
 * @param {String} changes
 */
function contentConfigUpdateListener(changes: StorageChangesObject) {
    for (const key in changes) {
        switch(key) {
            case "hideVideoPlayerControls":
            case "hideInfoButtonPlayerControls":
            case "hideDeleteButtonPlayerControls":
                updateVisibilityOfPlayerControlsButton()
                break;
            case "categorySelections":
                sponsorsLookup();
                break;
        }
    }
}

if (!Config.configSyncListeners.includes(contentConfigUpdateListener)) {
    Config.configSyncListeners.push(contentConfigUpdateListener);
}

function resetValues() {
    lastCheckTime = 0;
    lastCheckVideoTime = -1;
    retryCount = 0;

    //reset sponsor times
    sponsorTimes = null;
    sponsorSkipped = [];

    videoInfo = null;
    channelWhitelisted = false;
    channelIDInfo = {
        status: ChannelIDStatus.Fetching,
        id: null
    };
    lockedCategories = [];

    //empty the preview bar
    if (previewBar !== null) {
        previewBar.clear();
    }

    //reset sponsor data found check
    sponsorDataFound = false;

    if (switchingVideos === null) {
        // When first loading a video, it is not switching videos
        switchingVideos = false;
    } else {
        switchingVideos = true;
        logDebug("Setting switching videos to true (reset data)");
    }

    // Reset advert playing flag
    isAdPlaying = false;

    for (let i = 0; i < skipNotices.length; i++) {
        skipNotices.pop()?.close();
    }

    skipButtonControlBar?.disable();
    categoryPill?.setVisibility(false);
}

async function videoIDChange(id) {
    //if the id has not changed return unless the video element has changed
    if (sponsorVideoID === id && (isVisible(video) || !video)) return;

    //set the global videoID
    sponsorVideoID = id;

    resetValues();

	//id is not valid
    if (!id) return;

    // Wait for options to be ready
    await utils.wait(() => Config.config !== null, 5000, 1);

    // If enabled, it will check if this video is private or unlisted and double check with the user if the sponsors should be looked up
    if (Config.config.checkForUnlistedVideos) {
        const shouldContinue = confirm("SponsorBlock: You have the setting 'Ignore Unlisted/Private Videos' enabled."
                                + " Due to a change in how segment fetching works, this setting is not needed anymore as it cannot leak your video ID to the server."
                                + " It instead sends just the first 4 characters of a longer hash of the videoID to the server, and filters through a subset of the database."
                                + " More info about this implementation can be found here: https://github.com/ajayyy/SponsorBlockServer/issues/25"
                                + "\n\nPlease click okay to confirm that you acknowledge this and continue using SponsorBlock.");
        if (shouldContinue) {
            Config.config.checkForUnlistedVideos = false;
        } else {
            return;
        }
    }

    // Update whitelist data when the video data is loaded
    whitelistCheck();

    //setup the preview bar
    if (previewBar === null) {
        if (onMobileYouTube) {
            // Mobile YouTube workaround
            const observer = new MutationObserver(handleMobileControlsMutations);
            let controlsContainer = null;

            utils.wait(() => {
                controlsContainer = document.getElementById("player-control-container")
                return controlsContainer !== null
            }).then(() => {
                observer.observe(document.getElementById("player-control-container"), {
                    attributes: true,
                    childList: true,
                    subtree: true
                });
            }).catch();
        } else {
            utils.wait(getControls).then(createPreviewBar);
        }
    }

    //close popup
    closeInfoMenu();

    sponsorsLookup(id);

    // Make sure all player buttons are properly added
    updateVisibilityOfPlayerControlsButton();

    // Clear unsubmitted segments from the previous video
    sponsorTimesSubmitting = [];
    updateSponsorTimesSubmitting();
}

function handleMobileControlsMutations(): void {
    updateVisibilityOfPlayerControlsButton();

    skipButtonControlBar?.updateMobileControls();

    if (previewBar !== null) {
        if (document.body.contains(previewBar.container)) {
            const progressBarBackground = document.querySelector<HTMLElement>(".progress-bar-background");

            if (progressBarBackground !== null) {
                updatePreviewBarPositionMobile(progressBarBackground);
            }

            return;
        } else {
            // The container does not exist anymore, remove that old preview bar
            previewBar.remove();
            previewBar = null;
        }
    }

    // Create the preview bar if needed (the function hasn't returned yet)
    createPreviewBar();
}

/**
 * Creates a preview bar on the video
 */
function createPreviewBar(): void {
    if (previewBar !== null) return;

    const progressElementOptions = [{
            // For mobile YouTube
            selector: ".progress-bar-background",
            isVisibleCheck: true
        }, {
            // For new mobile YouTube (#1287)
            selector: ".progress-bar-line",
            isVisibleCheck: true
        }, {
            // For Desktop YouTube
            selector: ".ytp-progress-bar-container",
            isVisibleCheck: true
        }, {
            // For Desktop YouTube
            selector: ".no-model.cue-range-marker",
            isVisibleCheck: true
        }, {
            // For Invidious/VideoJS
            selector: ".vjs-progress-holder",
            isVisibleCheck: false
        }
    ];

    for (const option of progressElementOptions) {
        const allElements = document.querySelectorAll(option.selector) as NodeListOf<HTMLElement>;
        const el = option.isVisibleCheck ? findValidElement(allElements) : allElements[0];

        if (el) {
            previewBar = new PreviewBar(el, onMobileYouTube, onInvidious);

            updatePreviewBar();

            break;
        }
    }
}

/**
 * Triggered every time the video duration changes.
 * This happens when the resolution changes or at random time to clear memory.
 */
function durationChangeListener(): void {
    updateAdFlag();
    updatePreviewBar();
}

/**
 * Triggered once the video is ready.
 * This is mainly to attach to embedded players who don't have a video element visible.
 */
function videoOnReadyListener(): void {
    createPreviewBar();
    updatePreviewBar();
    createButtons();
}

function cancelSponsorSchedule(): void {
    logDebug("Pausing skipping");

    if (currentSkipSchedule !== null) {
        clearTimeout(currentSkipSchedule);
        currentSkipSchedule = null;
    }

    if (currentSkipInterval !== null) {
        clearInterval(currentSkipInterval);
        currentSkipInterval = null;
    }
}

/**
 * @param currentTime Optional if you don't want to use the actual current time
 */
function startSponsorSchedule(includeIntersectingSegments = false, currentTime?: number, includeNonIntersectingSegments = true): void {
    cancelSponsorSchedule();

    // Don't skip if advert playing and reset last checked time
    if (isAdPlaying) {
        // Reset lastCheckVideoTime
        lastCheckVideoTime = -1;
        lastCheckTime = 0;
        logDebug("[SB] Ad playing, pausing skipping");

        return;
    }

    logDebug(`Considering to start skipping: ${!video}, ${video?.paused}`);

    if (!video || video.paused) return;
    if (currentTime === undefined || currentTime === null) {
        currentTime = getVirtualTime();
    }
    lastTimeFromWaitingEvent = null;

    const skipInfo = getNextSkipIndex(currentTime, includeIntersectingSegments, includeNonIntersectingSegments);

    const currentSkip = skipInfo.array[skipInfo.index];
    const skipTime: number[] = [currentSkip?.scheduledTime, skipInfo.array[skipInfo.endIndex]?.segment[1]];
    const timeUntilSponsor = skipTime?.[0] - currentTime;
    const videoID = sponsorVideoID;
    const skipBuffer = 0.003;

    if (videoMuted && !inMuteSegment(currentTime, skipInfo.index !== -1 
            && timeUntilSponsor < skipBuffer && shouldAutoSkip(currentSkip))) {
        video.muted = false;
        videoMuted = false;

        for (const notice of skipNotices) {
            // So that the notice can hide buttons
            notice.unmutedListener(currentTime);
        }
    }

    logDebug(`Ready to start skipping: ${skipInfo.index} at ${currentTime}`);
    if (skipInfo.index === -1) return;

    if (Config.config.disableSkipping || channelWhitelisted || (channelIDInfo.status === ChannelIDStatus.Fetching && Config.config.forceChannelCheck)){
        return;
    }

    if (incorrectVideoCheck()) return;

    // Find all indexes in between the start and end
    let skippingSegments = [skipInfo.array[skipInfo.index]];
    if (skipInfo.index !== skipInfo.endIndex) {
        skippingSegments = [];

        for (const segment of skipInfo.array) {
            if (shouldAutoSkip(segment) &&
                    segment.segment[0] >= skipTime[0] && segment.segment[1] <= skipTime[1]) {
                skippingSegments.push(segment);
            }
        }
    }

    logDebug(`Next step in starting skipping: ${!shouldSkip(currentSkip)}, ${!sponsorTimesSubmitting?.some((segment) => segment.segment === currentSkip.segment)}`);

    // Don't skip if this category should not be skipped
    if (!shouldSkip(currentSkip) && !sponsorTimesSubmitting?.some((segment) => segment.segment === currentSkip.segment)) return;

    const skippingFunction = (forceVideoTime?: number) => {
        let forcedSkipTime: number = null;
        let forcedIncludeIntersectingSegments = false;
        let forcedIncludeNonIntersectingSegments = true;

        if (incorrectVideoCheck(videoID, currentSkip)) return;
        forceVideoTime ||= Math.max(video.currentTime, getVirtualTime());

        if (forceVideoTime >= skipTime[0] - skipBuffer && forceVideoTime < skipTime[1]) {
            skipToTime({
                v: video,
                skipTime,
                skippingSegments,
                openNotice: skipInfo.openNotice
            });

            // These are segments that start at the exact same time but need seperate notices
            for (const extra of skipInfo.extraIndexes) {
                const extraSkip = skipInfo.array[extra];
                if (shouldSkip(extraSkip)) {
                    skipToTime({
                        v: video,
                        skipTime: [extraSkip.scheduledTime, extraSkip.segment[1]],
                        skippingSegments: [extraSkip],
                        openNotice: skipInfo.openNotice
                    });
                }
            }

            if (utils.getCategorySelection(currentSkip.category)?.option === CategorySkipOption.ManualSkip
                    || currentSkip.actionType === ActionType.Mute) {
                forcedSkipTime = skipTime[0] + 0.001;
            } else {
                forcedSkipTime = skipTime[1];
                forcedIncludeIntersectingSegments = true;
                forcedIncludeNonIntersectingSegments = false;
            }
        }

        startSponsorSchedule(forcedIncludeIntersectingSegments, forcedSkipTime, forcedIncludeNonIntersectingSegments);
    };

    if (timeUntilSponsor < skipBuffer) {
        skippingFunction(currentTime);
    } else {
        const delayTime = timeUntilSponsor * 1000 * (1 / video.playbackRate);
        if (delayTime < 300) {
            // Use interval instead of timeout near the end to combat imprecise video time
            const startIntervalTime = performance.now();
            const startVideoTime = Math.max(currentTime, video.currentTime);
            logDebug(`Starting setInterval skipping ${video.currentTime} to skip at ${skipTime[0]}`);

            currentSkipInterval = setInterval(() => {
                const intervalDuration = performance.now() - startIntervalTime;
                if (intervalDuration >= delayTime || video.currentTime >= skipTime[0]) {
                    clearInterval(currentSkipInterval);
                    if (!utils.isFirefox() && !video.muted) {
                        // Workaround for more accurate skipping on Chromium
                        video.muted = true;
                        video.muted = false;
                    }

                    skippingFunction(Math.max(video.currentTime, startVideoTime + video.playbackRate * intervalDuration / 1000));
                }
            }, 1);
        } else {
            logDebug(`Starting timeout to skip ${video.currentTime} to skip at ${skipTime[0]}`);
            
            // Schedule for right before to be more precise than normal timeout
            currentSkipSchedule = setTimeout(skippingFunction, Math.max(0, delayTime - 150));
        }
    }
}

function getVirtualTime(): number {
    const virtualTime = lastTimeFromWaitingEvent ?? (lastKnownVideoTime.videoTime ?
        (performance.now() - lastKnownVideoTime.preciseTime) / 1000 + lastKnownVideoTime.videoTime : null);

    if ((lastTimeFromWaitingEvent || !utils.isFirefox())
        && !isSafari() && virtualTime && Math.abs(virtualTime - video.currentTime) < 0.6) {
        return virtualTime;
    } else {
        return video.currentTime;
    }
}

function inMuteSegment(currentTime: number, includeOverlap: boolean): boolean {
    const checkFunction = (segment) => segment.actionType === ActionType.Mute 
        && segment.segment[0] <= currentTime 
        && (segment.segment[1] > currentTime || (includeOverlap && segment.segment[1] + 0.02 > currentTime));
    return sponsorTimes?.some(checkFunction) || sponsorTimesSubmitting.some(checkFunction);
}

/**
 * This makes sure the videoID is still correct and if the sponsorTime is included
 */
function incorrectVideoCheck(videoID?: string, sponsorTime?: SponsorTime): boolean {
    const currentVideoID = getYouTubeVideoID(document);
    if (currentVideoID !== (videoID || sponsorVideoID) || (sponsorTime
            && (!sponsorTimes || !sponsorTimes?.some((time) => time.segment === sponsorTime.segment))
            && !sponsorTimesSubmitting.some((time) => time.segment === sponsorTime.segment))) {
        // Something has really gone wrong
        console.error("[SponsorBlock] The videoID recorded when trying to skip is different than what it should be.");
        console.error("[SponsorBlock] VideoID recorded: " + sponsorVideoID + ". Actual VideoID: " + currentVideoID);

        // Video ID change occured
        videoIDChange(currentVideoID);

        return true;
    } else {
        return false;
    }
}

function setupVideoMutationListener() {
    const videoContainer = document.querySelector(".html5-video-container");
    if (!videoContainer || videoMutationObserver !== null || onInvidious) return;

    videoMutationObserver = new MutationObserver(refreshVideoAttachments);

    videoMutationObserver.observe(videoContainer, {
        attributes: true,
        childList: true,
        subtree: true
    });
}

function refreshVideoAttachments() {
    const newVideo = findValidElement(document.querySelectorAll('video')) as HTMLVideoElement;
    if (newVideo && newVideo !== video) {
        video = newVideo;

        if (!videosWithEventListeners.includes(video)) {
            videosWithEventListeners.push(video);

            setupVideoListeners();
            setupSkipButtonControlBar();
            setupCategoryPill();
        }

        // Create a new bar in the new video element
        if (previewBar && !utils.findReferenceNode()?.contains(previewBar.container)) {
            previewBar.remove();
            previewBar = null;

            createPreviewBar();
        }
    }
}

function setupVideoListeners() {
    //wait until it is loaded
    video.addEventListener('loadstart', videoOnReadyListener)
    video.addEventListener('durationchange', durationChangeListener);

    if (!Config.config.disableSkipping) {
        switchingVideos = false;

        let startedWaiting = false;

        video.addEventListener('play', () => {
            // If it is not the first event, then the only way to get to 0 is if there is a seek event
            // This check makes sure that changing the video resolution doesn't cause the extension to think it
            // gone back to the begining
            if (video.readyState <= HTMLMediaElement.HAVE_CURRENT_DATA 
                    && video.currentTime === 0) return;

            updateVirtualTime();

            if (switchingVideos) {
                switchingVideos = false;
                logDebug("Setting switching videos to false");

                // If already segments loaded before video, retry to skip starting segments
                if (sponsorTimes) startSkipScheduleCheckingForStartSponsors();
            }

            // Check if an ad is playing
            updateAdFlag();

            // Make sure it doesn't get double called with the playing event
            if (Math.abs(lastCheckVideoTime - video.currentTime) > 0.3
                    || (lastCheckVideoTime !== video.currentTime && Date.now() - lastCheckTime > 2000)) {
                lastCheckTime = Date.now();
                lastCheckVideoTime = video.currentTime;

                startSponsorSchedule();
            }

        });
        video.addEventListener('playing', () => {
            updateVirtualTime();
            
            if (startedWaiting) {
                startedWaiting = false;
                logDebug(`[SB] Playing event after buffering: ${Math.abs(lastCheckVideoTime - video.currentTime) > 0.3
                    || (lastCheckVideoTime !== video.currentTime && Date.now() - lastCheckTime > 2000)}`);
            }

            // Make sure it doesn't get double called with the play event
            if (Math.abs(lastCheckVideoTime - video.currentTime) > 0.3
                    || (lastCheckVideoTime !== video.currentTime && Date.now() - lastCheckTime > 2000)) {
                lastCheckTime = Date.now();
                lastCheckVideoTime = video.currentTime;

                startSponsorSchedule();
            }
        });
        video.addEventListener('seeking', () => {
            if (!video.paused){
                // Reset lastCheckVideoTime
                lastCheckTime = Date.now();
                lastCheckVideoTime = video.currentTime;

                updateVirtualTime();
                lastTimeFromWaitingEvent = null;

                startSponsorSchedule();
            }
        });
        video.addEventListener('ratechange', () => startSponsorSchedule());
        // Used by videospeed extension (https://github.com/igrigorik/videospeed/pull/740)
        video.addEventListener('videoSpeed_ratechange', () => startSponsorSchedule());
        const paused = () => {
            // Reset lastCheckVideoTime
            lastCheckVideoTime = -1;
            lastCheckTime = 0;

            lastKnownVideoTime = {
                videoTime: null,
                preciseTime: null
            }
            lastTimeFromWaitingEvent = video.currentTime;

            cancelSponsorSchedule();
        };
        video.addEventListener('pause', () => paused());
        video.addEventListener('waiting', () => {
            logDebug("[SB] Not skipping due to buffering");
            startedWaiting = true;

            paused();
        });

        startSponsorSchedule();
    }
}

function updateVirtualTime() {
    lastKnownVideoTime = {
        videoTime: video.currentTime,
        preciseTime: performance.now()
    };
}

function setupSkipButtonControlBar() {
    if (!skipButtonControlBar) {
        skipButtonControlBar = new SkipButtonControlBar({
            skip: (segment) => skipToTime({
                v: video,
                skipTime: segment.segment,
                skippingSegments: [segment],
                openNotice: true,
                forceAutoSkip: true
            }),
            onMobileYouTube
        });
    }

    skipButtonControlBar.attachToPage();
}

function setupCategoryPill() {
    if (!categoryPill) {
        categoryPill = new CategoryPill();
    }

    categoryPill.attachToPage(onMobileYouTube, onInvidious, voteAsync);
}

async function sponsorsLookup(keepOldSubmissions = true) {
    if (!video || !isVisible(video)) refreshVideoAttachments();
    //there is still no video here
    if (!video) {
        setTimeout(() => sponsorsLookup(), 100);
        return;
    }

    setupVideoMutationListener();

    // Create categories list
    const categories: string[] = Config.config.categorySelections.map((category) => category.name);

    const extraRequestData: Record<string, unknown> = {};
    const hashParams = getHashParams();
    if (hashParams.requiredSegment) extraRequestData.requiredSegment = hashParams.requiredSegment;

    const hashPrefix = (await utils.getHash(sponsorVideoID, 1)).slice(0, 4) as VideoID & HashedValue;
    const response = await utils.asyncRequestToServer('GET', "/api/skipSegments/" + hashPrefix, {
        categories,
        actionTypes: getEnabledActionTypes(),
        userAgent: `${chrome.runtime.id}`,
        ...extraRequestData
    });

    // store last response status
    lastResponseStatus = response?.status;

    if (response?.ok) {
        const recievedSegments: SponsorTime[] = JSON.parse(response.responseText)
                    ?.filter((video) => video.videoID === sponsorVideoID)
                    ?.map((video) => video.segments)[0];
        if (!recievedSegments || !recievedSegments.length) {
            // return if no video found
            retryFetch(404);
            return;
        }

        sponsorDataFound = true;

        // Check if any old submissions should be kept
        if (sponsorTimes !== null && keepOldSubmissions) {
            for (let i = 0; i < sponsorTimes.length; i++) {
                if (sponsorTimes[i].source === SponsorSourceType.Local)  {
                    // This is a user submission, keep it
                    recievedSegments.push(sponsorTimes[i]);
                }
            }
        }

        const oldSegments = sponsorTimes || [];
        sponsorTimes = recievedSegments;

        // Hide all submissions smaller than the minimum duration
        if (Config.config.minDuration !== 0) {
            for (const segment of sponsorTimes) {
                const duration = segment.segment[1] - segment.segment[0];
                if (duration > 0 && duration < Config.config.minDuration) {
                    segment.hidden = SponsorHideType.MinimumDuration;
                }
            }
        }

        if (keepOldSubmissions) {
            for (const segment of oldSegments) {
                const otherSegment = sponsorTimes.find((other) => segment.UUID === other.UUID);
                if (otherSegment) {
                    // If they downvoted it, or changed the category, keep it
                    otherSegment.hidden = segment.hidden;
                    otherSegment.category = segment.category;
                }
            }
        }

        // See if some segments should be hidden
        const downvotedData = Config.local.downvotedSegments[hashPrefix];
        if (downvotedData) {
            for (const segment of sponsorTimes) {
                const hashedUUID = await utils.getHash(segment.UUID, 1);
                const segmentDownvoteData = downvotedData.segments.find((downvote) => downvote.uuid === hashedUUID);
                if (segmentDownvoteData) {
                    segment.hidden = segmentDownvoteData.hidden;
                }
            }
        }

        startSkipScheduleCheckingForStartSponsors();

        //update the preview bar
        //leave the type blank for now until categories are added
        if (lastPreviewBarUpdate == sponsorVideoID || (lastPreviewBarUpdate == null && !isNaN(video.duration))) {
            //set it now
            //otherwise the listener can handle it
            updatePreviewBar();
        }
    } else {
        retryFetch(lastResponseStatus);
    }

    if (Config.config.isVip) {
        lockedCategoriesLookup();
    }
}

function getEnabledActionTypes(): ActionType[] {
    const actionTypes = [ActionType.Skip, ActionType.Poi];
    if (Config.config.muteSegments) {
        actionTypes.push(ActionType.Mute);
    }
    if (Config.config.fullVideoSegments) {
        actionTypes.push(ActionType.Full);
    }

    return actionTypes;
}

async function lockedCategoriesLookup(): Promise<void> {
    const hashPrefix = (await utils.getHash(sponsorVideoID, 1)).slice(0, 4);
    const response = await utils.asyncRequestToServer("GET", "/api/lockCategories/" + hashPrefix);

    if (response.ok) {
        try {
            const categoriesResponse = JSON.parse(response.responseText).filter((lockInfo) => lockInfo.videoID === sponsorVideoID)[0]?.categories;
            if (Array.isArray(categoriesResponse)) {
                lockedCategories = categoriesResponse;
            }
        } catch (e) { } //eslint-disable-line no-empty
    }
}

function retryFetch(errorCode: number): void {
    if (!Config.config.refetchWhenNotFound) return;
    sponsorDataFound = false;

    if (errorCode !== 404 && retryCount > 1) {
        // Too many errors (50x), give up 
        return;
    }

    retryCount++;

    const delay = errorCode === 404 ? (10000 + Math.random() * 30000) : (2000 + Math.random() * 10000);
    setTimeout(() => {
        if (sponsorVideoID && sponsorTimes?.length === 0) {
            sponsorsLookup();
        }
    }, delay);
}

/**
 * Only should be used when it is okay to skip a sponsor when in the middle of it
 *
 * Ex. When segments are first loaded
 */
function startSkipScheduleCheckingForStartSponsors() {
	// switchingVideos is ignored in Safari due to event fire order. See #1142
    if ((!switchingVideos || isSafari) && sponsorTimes) {
        // See if there are any starting sponsors
        let startingSegmentTime = getStartTimeFromUrl(document.URL) || -1;
        let found = false;
        for (const time of sponsorTimes) {
            if (time.segment[0] <= video.currentTime && time.segment[0] > startingSegmentTime && time.segment[1] > video.currentTime
                    && time.actionType !== ActionType.Poi) {
                        startingSegmentTime = time.segment[0];
                        found = true;
                break;
            }
        }
        if (!found) {
            for (const time of sponsorTimesSubmitting) {
                if (time.segment[0] <= video.currentTime && time.segment[0] > startingSegmentTime && time.segment[1] > video.currentTime
                        && time.actionType !== ActionType.Poi) {
                            startingSegmentTime = time.segment[0];
                            found = true;
                    break;
                }
            }
        }

        // For highlight category
        const poiSegments = sponsorTimes
            .filter((time) => time.segment[1] > video.currentTime && time.actionType === ActionType.Poi)
            .sort((a, b) => b.segment[0] - a.segment[0]);
        for (const time of poiSegments) {
            const skipOption = utils.getCategorySelection(time.category)?.option;
            if (skipOption !== CategorySkipOption.ShowOverlay) {
                skipToTime({
                    v: video,
                    skipTime: time.segment,
                    skippingSegments: [time],
                    openNotice: true,
                    unskipTime: video.currentTime
                });
                if (skipOption === CategorySkipOption.AutoSkip) break;
            }
        }

        const fullVideoSegment = sponsorTimes.filter((time) => time.actionType === ActionType.Full)[0];
        if (fullVideoSegment) {
            categoryPill?.setSegment(fullVideoSegment);
        }

        if (startingSegmentTime !== -1) {
            startSponsorSchedule(undefined, startingSegmentTime);
        } else {
            startSponsorSchedule();
        }
    }
}

/**
 * This function is required on mobile YouTube and will keep getting called whenever the preview bar disapears
 */
function updatePreviewBarPositionMobile(parent: HTMLElement) {
    if (document.getElementById("previewbar") === null) {
        previewBar.createElement(parent);
    }
}

function updatePreviewBar(): void {
    if (previewBar === null) return;

    if (isAdPlaying) {
        previewBar.clear();
        return;
    }

    if (video === null) return;

    const previewBarSegments: PreviewBarSegment[] = [];
    if (sponsorTimes) {
        sponsorTimes.forEach((segment) => {
            if (segment.hidden !== SponsorHideType.Visible) return;

            previewBarSegments.push({
                segment: segment.segment as [number, number],
                category: segment.category,
                unsubmitted: false,
                actionType: segment.actionType,
                showLarger: segment.actionType === ActionType.Poi
            });
        });
    }

    sponsorTimesSubmitting.forEach((segment) => {
        previewBarSegments.push({
            segment: segment.segment as [number, number],
            category: segment.category,
            unsubmitted: true,
            actionType: segment.actionType,
            showLarger: segment.actionType === ActionType.Poi
        });
    });

    previewBar.set(previewBarSegments.filter((segment) => segment.actionType !== ActionType.Full), video?.duration)

    if (Config.config.showTimeWithSkips) {
        const skippedDuration = utils.getTimestampsDuration(previewBarSegments.map(({segment}) => segment));

        showTimeWithoutSkips(skippedDuration);
    }

    // Update last video id
    lastPreviewBarUpdate = sponsorVideoID;
}

//checks if this channel is whitelisted, should be done only after the channelID has been loaded
async function whitelistCheck() {
    const whitelistedChannels = Config.config.whitelistedChannels;

    const getChannelID = () =>
        (document.querySelector("a.ytd-video-owner-renderer") // YouTube
        ?? document.querySelector("a.ytp-title-channel-logo") // YouTube Embed
        ?? document.querySelector(".channel-profile #channel-name")?.parentElement.parentElement // Invidious
        ?? document.querySelector("a.slim-owner-icon-and-title")) // Mobile YouTube
            ?.getAttribute("href")?.match(/\/(?:channel|c|user)\/(UC[a-zA-Z0-9_-]{22}|[a-zA-Z0-9_-]+)/)?.[1];

    try {
        await utils.wait(() => !!getChannelID(), 6000, 20);

        channelIDInfo = {
            status: ChannelIDStatus.Found,
            id: getChannelID().match(/^\/?([^\s/]+)/)[0]
        };
    } catch (e) {
        channelIDInfo = {
            status: ChannelIDStatus.Failed,
            id: null
        };
    }

    //see if this is a whitelisted channel
    if (whitelistedChannels != undefined &&
            channelIDInfo.status === ChannelIDStatus.Found && whitelistedChannels.includes(channelIDInfo.id)) {
        channelWhitelisted = true;
    }

    // check if the start of segments were missed
    if (Config.config.forceChannelCheck && sponsorTimes?.length > 0) startSkipScheduleCheckingForStartSponsors();
}

/**
 * Returns info about the next upcoming sponsor skip
 */
function getNextSkipIndex(currentTime: number, includeIntersectingSegments: boolean, includeNonIntersectingSegments: boolean):
        {array: ScheduledTime[], index: number, endIndex: number, extraIndexes: number[], openNotice: boolean} {

    const autoSkipSorter = (segment: ScheduledTime) => {
        const skipOption = utils.getCategorySelection(segment.category)?.option;
        if ((skipOption === CategorySkipOption.AutoSkip || shouldAutoSkip(segment))
                && segment.actionType === ActionType.Skip) {
            return 0;
        } else if (skipOption !== CategorySkipOption.ShowOverlay) {
            return 1;
        } else {
            return 2;
        }
    }

    const { includedTimes: submittedArray, scheduledTimes: sponsorStartTimes } =
        getStartTimes(sponsorTimes, includeIntersectingSegments, includeNonIntersectingSegments);
    const { scheduledTimes: sponsorStartTimesAfterCurrentTime } = getStartTimes(sponsorTimes, includeIntersectingSegments, includeNonIntersectingSegments, currentTime, true, true);

    // This is an array in-case multiple segments have the exact same start time
    const minSponsorTimeIndexes = GenericUtils.indexesOf(sponsorStartTimes, Math.min(...sponsorStartTimesAfterCurrentTime));
    // Find auto skipping segments if possible, sort by duration otherwise
    const minSponsorTimeIndex = minSponsorTimeIndexes.sort(
        (a, b) => ((autoSkipSorter(submittedArray[a]) - autoSkipSorter(submittedArray[b])) 
        || (submittedArray[a].segment[1] - submittedArray[a].segment[0]) - (submittedArray[b].segment[1] - submittedArray[b].segment[0])))[0] ?? -1;
    // Store extra indexes for the non-auto skipping segments if others occur at the exact same start time
    const extraIndexes = minSponsorTimeIndexes.filter((i) => i !== minSponsorTimeIndex && autoSkipSorter(submittedArray[i]) !== 0);

    const endTimeIndex = getLatestEndTimeIndex(submittedArray, minSponsorTimeIndex);

    const { includedTimes: unsubmittedArray, scheduledTimes: unsubmittedSponsorStartTimes } =
        getStartTimes(sponsorTimesSubmitting, includeIntersectingSegments, includeNonIntersectingSegments);
    const { scheduledTimes: unsubmittedSponsorStartTimesAfterCurrentTime } = getStartTimes(sponsorTimesSubmitting, includeIntersectingSegments, includeNonIntersectingSegments, currentTime, false, false);

    const minUnsubmittedSponsorTimeIndex = unsubmittedSponsorStartTimes.indexOf(Math.min(...unsubmittedSponsorStartTimesAfterCurrentTime));
    const previewEndTimeIndex = getLatestEndTimeIndex(unsubmittedArray, minUnsubmittedSponsorTimeIndex);

    if ((minUnsubmittedSponsorTimeIndex === -1 && minSponsorTimeIndex !== -1) ||
            sponsorStartTimes[minSponsorTimeIndex] < unsubmittedSponsorStartTimes[minUnsubmittedSponsorTimeIndex]) {
        return {
            array: submittedArray,
            index: minSponsorTimeIndex,
            endIndex: endTimeIndex,
            extraIndexes, // Segments at same time that need seperate notices
            openNotice: true
        };
    } else {
        return {
            array: unsubmittedArray,
            index: minUnsubmittedSponsorTimeIndex,
            endIndex: previewEndTimeIndex,
            extraIndexes: [], // No manual things for unsubmitted
            openNotice: false
        };
    }
}

/**
 * This returns index if the skip option is not AutoSkip
 *
 * Finds the last endTime that occurs in a segment that the given
 * segment skips into that is part of an AutoSkip category.
 *
 * Used to find where a segment should truely skip to if there are intersecting submissions due to
 * them having different categories.
 *
 * @param sponsorTimes
 * @param index Index of the given sponsor
 * @param hideHiddenSponsors
 */
function getLatestEndTimeIndex(sponsorTimes: SponsorTime[], index: number, hideHiddenSponsors = true): number {
    // Only combine segments for AutoSkip
    if (index == -1 ||
            !shouldAutoSkip(sponsorTimes[index])
            || sponsorTimes[index].actionType !== ActionType.Skip) {
        return index;
    }

    // Default to the normal endTime
    let latestEndTimeIndex = index;

    for (let i = 0; i < sponsorTimes?.length; i++) {
        const currentSegment = sponsorTimes[i].segment;
        const latestEndTime = sponsorTimes[latestEndTimeIndex].segment[1];

        if (currentSegment[0] <= latestEndTime && currentSegment[1] > latestEndTime
            && (!hideHiddenSponsors || sponsorTimes[i].hidden === SponsorHideType.Visible)
            && shouldAutoSkip(sponsorTimes[i])
            && sponsorTimes[i].actionType === ActionType.Skip) {
                // Overlapping segment
                latestEndTimeIndex = i;
        }
    }

    // Keep going if required
    if (latestEndTimeIndex !== index) {
        latestEndTimeIndex = getLatestEndTimeIndex(sponsorTimes, latestEndTimeIndex, hideHiddenSponsors);
    }

    return latestEndTimeIndex;
}

/**
 * Gets just the start times from a sponsor times array.
 * Optionally specify a minimum
 *
 * @param sponsorTimes
 * @param minimum
 * @param hideHiddenSponsors
 * @param includeIntersectingSegments If true, it will include segments that start before
 *  the current time, but end after
 */
function getStartTimes(sponsorTimes: SponsorTime[], includeIntersectingSegments: boolean, includeNonIntersectingSegments: boolean,
    minimum?: number, onlySkippableSponsors = false, hideHiddenSponsors = false): {includedTimes: ScheduledTime[], scheduledTimes: number[]} {
    if (!sponsorTimes) return {includedTimes: [], scheduledTimes: []};

    const includedTimes: ScheduledTime[] = [];
    const scheduledTimes: number[] = [];

    const possibleTimes = sponsorTimes.map((sponsorTime) => ({
        ...sponsorTime,
        scheduledTime: sponsorTime.segment[0]
    }));

    // Schedule at the end time to know when to unmute
    sponsorTimes.filter(sponsorTime => sponsorTime.actionType === ActionType.Mute)
                .forEach(sponsorTime => {
        if (!possibleTimes.some((time) => sponsorTime.segment[1] === time.scheduledTime)) {
            possibleTimes.push({
                ...sponsorTime,
                scheduledTime: sponsorTime.segment[1]
            });
        }
    });

    for (let i = 0; i < possibleTimes.length; i++) {
        if ((minimum === undefined
                || ((includeNonIntersectingSegments && possibleTimes[i].scheduledTime >= minimum)
                    || (includeIntersectingSegments && possibleTimes[i].scheduledTime < minimum && possibleTimes[i].segment[1] > minimum)))
                && (!onlySkippableSponsors || shouldSkip(possibleTimes[i]))
                && (!hideHiddenSponsors || possibleTimes[i].hidden === SponsorHideType.Visible)
                && possibleTimes[i].actionType !== ActionType.Poi) {

            scheduledTimes.push(possibleTimes[i].scheduledTime);
            includedTimes.push(possibleTimes[i]);
        }
    }

    return { includedTimes, scheduledTimes };
}

/**
 * Skip to exact time in a video and autoskips
 *
 * @param time
 */
function previewTime(time: number, unpause = true) {
    video.currentTime = time;

    // Unpause the video if needed
    if (unpause && video.paused){
        video.play();
    }
}

//send telemetry and count skip
function sendTelemetryAndCount(skippingSegments: SponsorTime[], secondsSkipped: number, fullSkip: boolean) {
    if (!Config.config.trackViewCount || (!Config.config.trackViewCountInPrivate && chrome.extension.inIncognitoContext)) return;

    let counted = false;
    for (const segment of skippingSegments) {
        const index = sponsorTimes?.findIndex((s) => s.segment === segment.segment);
        if (index !== -1 && !sponsorSkipped[index]) {
            sponsorSkipped[index] = true;
            if (!counted) {
                Config.config.minutesSaved = Config.config.minutesSaved + secondsSkipped / 60;
                Config.config.skipCount = Config.config.skipCount + 1;
                counted = true;
            }

            if (fullSkip) utils.asyncRequestToServer("POST", "/api/viewedVideoSponsorTime?UUID=" + segment.UUID);
        }
    }
}

//skip from the start time to the end time for a certain index sponsor time
function skipToTime({v, skipTime, skippingSegments, openNotice, forceAutoSkip, unskipTime}: SkipToTimeParams): void {
    if (Config.config.disableSkipping) return;

    // There will only be one submission if it is manual skip
    const autoSkip: boolean = forceAutoSkip || shouldAutoSkip(skippingSegments[0]);

    if ((autoSkip || sponsorTimesSubmitting.some((time) => time.segment === skippingSegments[0].segment))
            && v.currentTime !== skipTime[1]) {
        switch(skippingSegments[0].actionType) {
            case ActionType.Poi:
            case ActionType.Skip: {
                // Fix for looped videos not working when skipping to the end #426
                // for some reason you also can't skip to 1 second before the end
                if (v.loop && v.duration > 1 && skipTime[1] >= v.duration - 1) {
                    v.currentTime = 0;
                } else if (navigator.vendor === "Apple Computer, Inc." && v.duration > 1 && skipTime[1] >= v.duration) {
                    // MacOS will loop otherwise #1027
                    v.currentTime = v.duration - 0.001;
                } else {
                    v.currentTime = skipTime[1];
                }

                break;
            }
            case ActionType.Mute: {
                if (!v.muted) {
                    v.muted = true;
                    videoMuted = true;
                }
                break;
            }
        }
    }

    if (autoSkip && Config.config.audioNotificationOnSkip) {
        const beep = new Audio(chrome.runtime.getURL("icons/beep.ogg"));
        beep.volume = video.volume * 0.1;
        const oldMetadata = navigator.mediaSession.metadata
        beep.play();
        beep.addEventListener("ended", () => {
            navigator.mediaSession.metadata = null;
            setTimeout(() =>
                navigator.mediaSession.metadata = oldMetadata
            );
        })
    }

    if (!autoSkip
            && skippingSegments.length === 1
            && skippingSegments[0].actionType === ActionType.Poi) {
        skipButtonControlBar.enable(skippingSegments[0]);
        if (onMobileYouTube || Config.config.skipKeybind == null) skipButtonControlBar.setShowKeybindHint(false);

        activeSkipKeybindElement?.setShowKeybindHint(false);
        activeSkipKeybindElement = skipButtonControlBar;
    } else {
        if (openNotice) {
            //send out the message saying that a sponsor message was skipped
            if (!Config.config.dontShowNotice || !autoSkip) {
                createSkipNotice(skippingSegments, autoSkip, unskipTime, false);
            } else if (autoSkip) {
                activeSkipKeybindElement?.setShowKeybindHint(false);
                activeSkipKeybindElement = {
                    setShowKeybindHint: () => {}, //eslint-disable-line @typescript-eslint/no-empty-function
                    toggleSkip: () => {
                        unskipSponsorTime(skippingSegments[0], unskipTime);

                        createSkipNotice(skippingSegments, autoSkip, unskipTime, true);
                    }
                };
            }
        }
    }

    //send telemetry that a this sponsor was skipped
    if (autoSkip) sendTelemetryAndCount(skippingSegments, skipTime[1] - skipTime[0], true);
}

function createSkipNotice(skippingSegments: SponsorTime[], autoSkip: boolean, unskipTime: number, startReskip: boolean) {
    for (const skipNotice of skipNotices) {
        if (skippingSegments.length === skipNotice.segments.length 
                && skippingSegments.every((segment) => skipNotice.segments.some((s) => s.UUID === segment.UUID))) {
            // Skip notice already exists
            return;
        }
    }
    
    const newSkipNotice = new SkipNotice(skippingSegments, autoSkip, skipNoticeContentContainer, unskipTime, startReskip);
    if (onMobileYouTube || Config.config.skipKeybind == null) newSkipNotice.setShowKeybindHint(false);
    skipNotices.push(newSkipNotice);

    activeSkipKeybindElement?.setShowKeybindHint(false);
    activeSkipKeybindElement = newSkipNotice;
}

function unskipSponsorTime(segment: SponsorTime, unskipTime: number = null, forceSeek = false) {
    if (segment.actionType === ActionType.Mute) {
        video.muted = false;
        videoMuted = false;
    }
    
    if (forceSeek || segment.actionType === ActionType.Skip) {
        //add a tiny bit of time to make sure it is not skipped again
        video.currentTime = unskipTime ?? segment.segment[0] + 0.001;
    }

}

function reskipSponsorTime(segment: SponsorTime, forceSeek = false) {
    if (segment.actionType === ActionType.Mute && !forceSeek) {
        video.muted = true;
        videoMuted = true;
    } else {
        const skippedTime = Math.max(segment.segment[1] - video.currentTime, 0);
        const segmentDuration = segment.segment[1] - segment.segment[0];
        const fullSkip = skippedTime / segmentDuration > manualSkipPercentCount;

        video.currentTime = segment.segment[1];
        sendTelemetryAndCount([segment], skippedTime, fullSkip);
        startSponsorSchedule(true, segment.segment[1], false);
    }
}

function createButton(baseID: string, title: string, callback: () => void, imageName: string, isDraggable = false): HTMLElement {
    const existingElement = document.getElementById(baseID + "Button");
    if (existingElement !== null) return existingElement;

    // Button HTML
    const newButton = document.createElement("button");
    newButton.draggable = isDraggable;
    newButton.id = baseID + "Button";
    newButton.classList.add("playerButton");
    newButton.classList.add("ytp-button");
    newButton.setAttribute("title", chrome.i18n.getMessage(title));
    newButton.addEventListener("click", () => {
        callback();
    });

    // Image HTML
    const newButtonImage = document.createElement("img");
    newButton.draggable = isDraggable;
    newButtonImage.id = baseID + "Image";
    newButtonImage.className = "playerButtonImage";
    newButtonImage.src = chrome.extension.getURL("icons/" + imageName);

    // Append image to button
    newButton.appendChild(newButtonImage);

    // Add the button to player
    if (controls) controls.prepend(newButton);

    // Store the elements to prevent unnecessary querying
    playerButtons[baseID] = {
        button: newButton,
        image: newButtonImage,
        setupListener: false
    };

    return newButton;
}

function shouldAutoSkip(segment: SponsorTime): boolean {
    return utils.getCategorySelection(segment.category)?.option === CategorySkipOption.AutoSkip ||
            (Config.config.autoSkipOnMusicVideos && sponsorTimes?.some((s) => s.category === "music_offtopic")
                && segment.actionType !== ActionType.Poi);
}

function shouldSkip(segment: SponsorTime): boolean {
    return (segment.actionType !== ActionType.Full
            && utils.getCategorySelection(segment.category)?.option !== CategorySkipOption.ShowOverlay)
            || (Config.config.autoSkipOnMusicVideos && sponsorTimes?.some((s) => s.category === "music_offtopic"));
}

/** Creates any missing buttons on the YouTube player if possible. */
async function createButtons(): Promise<void> {
    if (onMobileYouTube) return;

    controls = await utils.wait(getControls).catch();

    // Add button if does not already exist in html
    createButton("startSegment", "sponsorStart", () => startOrEndTimingNewSegment(), "PlayerStartIconSponsorBlocker.svg");
    createButton("cancelSegment", "sponsorCancel", () => cancelCreatingSegment(), "PlayerCancelSegmentIconSponsorBlocker.svg");
    createButton("delete", "clearTimes", () => clearSponsorTimes(), "PlayerDeleteIconSponsorBlocker.svg");
    createButton("submit", "SubmitTimes", submitSponsorTimes, "PlayerUploadIconSponsorBlocker.svg");
    createButton("info", "openPopup", openInfoMenu, "PlayerInfoIconSponsorBlocker.svg");

    const controlsContainer = getControls();
    if (Config.config.autoHideInfoButton && !onInvidious && controlsContainer
            && playerButtons["info"]?.button && !controlsWithEventListeners.includes(controlsContainer)) {
        controlsWithEventListeners.push(controlsContainer);

        AnimationUtils.setupAutoHideAnimation(playerButtons["info"].button, controlsContainer);
    }
}

/** Creates any missing buttons on the player and updates their visiblity. */
async function updateVisibilityOfPlayerControlsButton(): Promise<void> {
    // Not on a proper video yet
    if (!sponsorVideoID || onMobileYouTube) return;

    await createButtons();

    updateEditButtonsOnPlayer();

    // Don't show the info button on embeds
    if (Config.config.hideInfoButtonPlayerControls || document.URL.includes("/embed/") || onInvidious) {
        playerButtons.info.button.style.display = "none";
    } else {
        playerButtons.info.button.style.removeProperty("display");
    }
}

/** Updates the visibility of buttons on the player related to creating segments. */
function updateEditButtonsOnPlayer(): void {
    // Don't try to update the buttons if we aren't on a YouTube video page
    if (!sponsorVideoID || onMobileYouTube) return;

    const buttonsEnabled = !Config.config.hideVideoPlayerControls && !onInvidious;

    let creatingSegment = false;
    let submitButtonVisible = false;
    let deleteButtonVisible = false;

    // Only check if buttons should be visible if they're enabled
    if (buttonsEnabled) {
        creatingSegment = isSegmentCreationInProgress();

        // Show only if there are any segments to submit
        submitButtonVisible = sponsorTimesSubmitting.length > 0;

        // Show only if there are any segments to delete
        deleteButtonVisible = sponsorTimesSubmitting.length > 1 || (sponsorTimesSubmitting.length > 0 && !creatingSegment);
    }

    // Update the elements
    playerButtons.startSegment.button.style.display = buttonsEnabled ? "unset" : "none";
    playerButtons.cancelSegment.button.style.display = buttonsEnabled && creatingSegment ? "unset" : "none";

    if (buttonsEnabled) {
        if (creatingSegment) {
            playerButtons.startSegment.image.src = chrome.extension.getURL("icons/PlayerStopIconSponsorBlocker.svg");
            playerButtons.startSegment.button.setAttribute("title", chrome.i18n.getMessage("sponsorEnd"));
        } else {
            playerButtons.startSegment.image.src = chrome.extension.getURL("icons/PlayerStartIconSponsorBlocker.svg");
            playerButtons.startSegment.button.setAttribute("title", chrome.i18n.getMessage("sponsorStart"));
        }
    }

    playerButtons.submit.button.style.display = submitButtonVisible && !Config.config.hideUploadButtonPlayerControls ? "unset" : "none";
    playerButtons.delete.button.style.display = deleteButtonVisible && !Config.config.hideDeleteButtonPlayerControls ? "unset" : "none";
}

/**
 * Used for submitting. This will use the HTML displayed number when required as the video's
 * current time is out of date while scrubbing or at the end of the video. This is not needed
 * for sponsor skipping as the video is not playing during these times.
 */
function getRealCurrentTime(): number {
    // Used to check if replay button
    const playButtonSVGData = document.querySelector(".ytp-play-button")?.querySelector(".ytp-svg-fill")?.getAttribute("d");
    const replaceSVGData = "M 18,11 V 7 l -5,5 5,5 v -4 c 3.3,0 6,2.7 6,6 0,3.3 -2.7,6 -6,6 -3.3,0 -6,-2.7 -6,-6 h -2 c 0,4.4 3.6,8 8,8 4.4,0 8,-3.6 8,-8 0,-4.4 -3.6,-8 -8,-8 z";

    if (playButtonSVGData === replaceSVGData) {
        // At the end of the video
        return video?.duration;
    } else {
        return video.currentTime;
    }
}

function startOrEndTimingNewSegment() {
    const roundedTime = Math.round((getRealCurrentTime() + Number.EPSILON) * 1000) / 1000;
    if (!isSegmentCreationInProgress()) {
        sponsorTimesSubmitting.push({
            segment: [roundedTime],
            UUID: utils.generateUserID() as SegmentUUID,
            category: Config.config.defaultCategory,
            actionType: ActionType.Skip,
            source: SponsorSourceType.Local
        });
    } else {
        // Finish creating the new segment
        const existingSegment = getIncompleteSegment();
        const existingTime = existingSegment.segment[0];
        const currentTime = roundedTime;

        // Swap timestamps if the user put the segment end before the start
        existingSegment.segment = [Math.min(existingTime, currentTime), Math.max(existingTime, currentTime)];
    }

    // Save the newly created segment
    Config.config.unsubmittedSegments[sponsorVideoID] = sponsorTimesSubmitting;
    Config.forceSyncUpdate("unsubmittedSegments");

    // Make sure they know if someone has already submitted something it while they were watching
    sponsorsLookup();

    updateEditButtonsOnPlayer();
    updateSponsorTimesSubmitting(false);
}

function getIncompleteSegment(): SponsorTime {
    return sponsorTimesSubmitting[sponsorTimesSubmitting.length - 1];
}

/** Is the latest submitting segment incomplete */
function isSegmentCreationInProgress(): boolean {
    const segment = getIncompleteSegment();
    return segment && segment?.segment?.length !== 2;
}

function cancelCreatingSegment() {
    if (isSegmentCreationInProgress()) {
        sponsorTimesSubmitting.splice(sponsorTimesSubmitting.length - 1, 1);
        Config.config.unsubmittedSegments[sponsorVideoID] = sponsorTimesSubmitting;
        Config.forceSyncUpdate("unsubmittedSegments");

        if (sponsorTimesSubmitting.length <= 0) resetSponsorSubmissionNotice();
    }

    updateEditButtonsOnPlayer();
    updateSponsorTimesSubmitting(false);
}

function updateSponsorTimesSubmitting(getFromConfig = true) {
    const segmentTimes = Config.config.unsubmittedSegments[sponsorVideoID];

    //see if this data should be saved in the sponsorTimesSubmitting variable
    if (getFromConfig && segmentTimes != undefined) {
        sponsorTimesSubmitting = [];

        for (const segmentTime of segmentTimes) {
            sponsorTimesSubmitting.push({
                segment: segmentTime.segment,
                UUID: segmentTime.UUID,
                category: segmentTime.category,
                actionType: segmentTime.actionType,
                source: segmentTime.source
            });
        }
    }

    updatePreviewBar();

    // Restart skipping schedule
    if (video !== null) startSponsorSchedule();

    if (submissionNotice !== null) {
        submissionNotice.update();
    }

    checkForPreloadedSegment();
}

function openInfoMenu() {
    if (document.getElementById("sponsorBlockPopupContainer") != null) {
        //it's already added
        return;
    }

    popupInitialised = false;

    //hide info button
    if (playerButtons.info) playerButtons.info.button.style.display = "none";

    
    const popup = document.createElement("div");
    popup.id = "sponsorBlockPopupContainer";
   
    const frame = document.createElement("iframe");
    frame.width = "374";
    frame.height = "500";
    frame.addEventListener("load", () => frame.contentWindow.postMessage("", "*"));
    frame.src = chrome.extension.getURL("popup.html");
    popup.appendChild(frame);

    const parentNodes = document.querySelectorAll("#secondary");
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
    
    parentNode.insertBefore(popup, parentNode.firstChild);
}

function closeInfoMenu() {
    const popup = document.getElementById("sponsorBlockPopupContainer");
    if (popup === null) return;

    popup.remove();

    // Show info button if it's not an embed
    if (!document.URL.includes("/embed/") && playerButtons.info) {
        playerButtons.info.button.style.display = "unset";
    }
}

function clearSponsorTimes() {
    const currentVideoID = sponsorVideoID;

    const sponsorTimes = Config.config.unsubmittedSegments[currentVideoID];

    if (sponsorTimes != undefined && sponsorTimes.length > 0) {
        const confirmMessage = chrome.i18n.getMessage("clearThis") + getSegmentsMessage(sponsorTimes)
                                + "\n" + chrome.i18n.getMessage("confirmMSG")
        if(!confirm(confirmMessage)) return;

        resetSponsorSubmissionNotice();

        //clear the sponsor times
        delete Config.config.unsubmittedSegments[currentVideoID];
        Config.forceSyncUpdate("unsubmittedSegments");

        //clear sponsor times submitting
        sponsorTimesSubmitting = [];

        updatePreviewBar();
        updateEditButtonsOnPlayer();
    }
}

//if skipNotice is null, it will not affect the UI
async function vote(type: number, UUID: SegmentUUID, category?: Category, skipNotice?: SkipNoticeComponent): Promise<VoteResponse> {
    if (skipNotice !== null && skipNotice !== undefined) {
        //add loading info
        skipNotice.addVoteButtonInfo.bind(skipNotice)(chrome.i18n.getMessage("Loading"))
        skipNotice.setNoticeInfoMessage.bind(skipNotice)();
    }

    const response = await voteAsync(type, UUID, category);
    if (response != undefined) {
        //see if it was a success or failure
        if (skipNotice != null) {
            if (response.successType == 1 || (response.successType == -1 && response.statusCode == 429)) {
                //success (treat rate limits as a success)
                skipNotice.afterVote.bind(skipNotice)(utils.getSponsorTimeFromUUID(sponsorTimes, UUID), type, category);
            } else if (response.successType == -1) {
                if (response.statusCode === 403 && response.responseText.startsWith("Vote rejected due to a warning from a moderator.")) {
                    openWarningDialog(skipNoticeContentContainer);
                } else {
                    skipNotice.setNoticeInfoMessage.bind(skipNotice)(GenericUtils.getErrorMessage(response.statusCode, response.responseText))
                }

                skipNotice.resetVoteButtonInfo.bind(skipNotice)();
            }
        }
    }

    return response;
}

async function voteAsync(type: number, UUID: SegmentUUID, category?: Category): Promise<VoteResponse> {
    const sponsorIndex = utils.getSponsorIndexFromUUID(sponsorTimes, UUID);

    // Don't vote for preview sponsors
    if (sponsorIndex == -1 || sponsorTimes[sponsorIndex].source === SponsorSourceType.Local) return;

    // See if the local time saved count and skip count should be saved
    if (type === 0 && sponsorSkipped[sponsorIndex] || type === 1 && !sponsorSkipped[sponsorIndex]) {
        let factor = 1;
        if (type == 0) {
            factor = -1;

            sponsorSkipped[sponsorIndex] = false;
        }

        // Count this as a skip
        Config.config.minutesSaved = Config.config.minutesSaved + factor * (sponsorTimes[sponsorIndex].segment[1] - sponsorTimes[sponsorIndex].segment[0]) / 60;

        Config.config.skipCount = Config.config.skipCount + factor;
    }

    return new Promise((resolve) => {
        chrome.runtime.sendMessage({
            message: "submitVote",
            type: type,
            UUID: UUID,
            category: category
        }, (response) => {
            if (response.successType === 1) {
                // Change the sponsor locally
                const segment = utils.getSponsorTimeFromUUID(sponsorTimes, UUID);
                if (segment) {
                    if (type === 0) {
                        segment.hidden = SponsorHideType.Downvoted;
                    } else if (category) {
                        segment.category = category;
                    } else if (type === 1) {
                        segment.hidden = SponsorHideType.Visible;
                    }

                    if (!category && !Config.config.isVip) {
                        utils.addHiddenSegment(sponsorVideoID, segment.UUID, segment.hidden);
                    }

                    updatePreviewBar();
                }
            }

            resolve(response);
        });
    });
}

//Closes all notices that tell the user that a sponsor was just skipped
function closeAllSkipNotices(){
    const notices = document.getElementsByClassName("sponsorSkipNotice");
    for (let i = 0; i < notices.length; i++) {
        notices[i].remove();
    }
}

function dontShowNoticeAgain() {
    Config.config.dontShowNotice = true;
    closeAllSkipNotices();
}

/**
 * Helper method for the submission notice to clear itself when it closes
 */
function resetSponsorSubmissionNotice(callRef = true) {
    submissionNotice?.close(callRef);
    submissionNotice = null;
}

function submitSponsorTimes() {
    if (submissionNotice !== null){
        submissionNotice.close();
        submissionNotice = null;
        return;
    }

    if (sponsorTimesSubmitting !== undefined && sponsorTimesSubmitting.length > 0) {
        submissionNotice = new SubmissionNotice(skipNoticeContentContainer, sendSubmitMessage);
    }

}

//send the message to the background js
//called after all the checks have been made that it's okay to do so
async function sendSubmitMessage() {
    // Block if submitting on a running livestream or premiere
    if (isVisible(document.querySelector(".ytp-live-badge"))) {
        alert(chrome.i18n.getMessage("liveOrPremiere"));
        return;
    }

    // Add loading animation
    playerButtons.submit.image.src = chrome.extension.getURL("icons/PlayerUploadIconSponsorBlocker.svg");
    const stopAnimation = AnimationUtils.applyLoadingAnimation(playerButtons.submit.button, 1, () => updateEditButtonsOnPlayer());

    //check if a sponsor exceeds the duration of the video
    for (let i = 0; i < sponsorTimesSubmitting.length; i++) {
        if (sponsorTimesSubmitting[i].segment[1] > video.duration) {
            sponsorTimesSubmitting[i].segment[1] = video.duration;
        }
    }

    //update sponsorTimes
    Config.config.unsubmittedSegments[sponsorVideoID] = sponsorTimesSubmitting;
    Config.forceSyncUpdate("unsubmittedSegments");

    // Check to see if any of the submissions are below the minimum duration set
    if (Config.config.minDuration > 0) {
        for (let i = 0; i < sponsorTimesSubmitting.length; i++) {
            const duration = sponsorTimesSubmitting[i].segment[1] - sponsorTimesSubmitting[i].segment[0];
            if (duration > 0 && duration < Config.config.minDuration) {
                const confirmShort = chrome.i18n.getMessage("shortCheck") + "\n\n" +
                    getSegmentsMessage(sponsorTimesSubmitting);

                if(!confirm(confirmShort)) return;
            }
        }
    }

    const response = await utils.asyncRequestToServer("POST", "/api/skipSegments", {
        videoID: sponsorVideoID,
        userID: Config.config.userID,
        segments: sponsorTimesSubmitting,
        videoDuration: video?.duration,
        userAgent: `${chrome.runtime.id}/v${chrome.runtime.getManifest().version}`
    });

    if (response.status === 200) {
        stopAnimation();

        // Remove segments from storage since they've already been submitted
        delete Config.config.unsubmittedSegments[sponsorVideoID];
        Config.forceSyncUpdate("unsubmittedSegments");

        const newSegments = sponsorTimesSubmitting;
        try {
            const recievedNewSegments = JSON.parse(response.responseText);
            if (recievedNewSegments?.length === newSegments.length) {
                for (let i = 0; i < recievedNewSegments.length; i++) {
                    newSegments[i].UUID = recievedNewSegments[i].UUID;
                    newSegments[i].source = SponsorSourceType.Server;
                }
            }
        } catch(e) {} // eslint-disable-line no-empty

        // Add submissions to current sponsors list
        sponsorTimes = (sponsorTimes || []).concat(newSegments);

        // Increase contribution count
        Config.config.sponsorTimesContributed = Config.config.sponsorTimesContributed + sponsorTimesSubmitting.length;

        // New count just used to see if a warning "Read The Guidelines!!" message needs to be shown
        // One per time submitting
        Config.config.submissionCountSinceCategories = Config.config.submissionCountSinceCategories + 1;

        // Empty the submitting times
        sponsorTimesSubmitting = [];

        updatePreviewBar();

        const fullVideoSegment = sponsorTimes.filter((time) => time.actionType === ActionType.Full)[0];
        if (fullVideoSegment) {
            categoryPill?.setSegment(fullVideoSegment);
        }
    } else {
        // Show that the upload failed
        playerButtons.submit.button.style.animation = "unset";
        playerButtons.submit.image.src = chrome.extension.getURL("icons/PlayerUploadFailedIconSponsorBlocker.svg");

        if (response.status === 403 && response.responseText.startsWith("Submission rejected due to a warning from a moderator.")) {
            openWarningDialog(skipNoticeContentContainer);
        } else {
            alert(GenericUtils.getErrorMessage(response.status, response.responseText));
        }
    }
}

//get the message that visually displays the video times
function getSegmentsMessage(sponsorTimes: SponsorTime[]): string {
    let sponsorTimesMessage = "";

    for (let i = 0; i < sponsorTimes.length; i++) {
        for (let s = 0; s < sponsorTimes[i].segment.length; s++) {
            let timeMessage = utils.getFormattedTime(sponsorTimes[i].segment[s]);
            //if this is an end time
            if (s == 1) {
                timeMessage = " " + chrome.i18n.getMessage("to") + " " + timeMessage;
            } else if (i > 0) {
                //add commas if necessary
                timeMessage = ", " + timeMessage;
            }

            sponsorTimesMessage += timeMessage;
        }
    }

    return sponsorTimesMessage;
}

function addPageListeners(): void {
    const refreshListners = () => {
        if (!isVisible(video)) {
            refreshVideoAttachments();
        }
    };

    document.addEventListener("yt-navigate-finish", refreshListners);
}

function addHotkeyListener(): void {
    document.addEventListener("keydown", hotkeyListener);
}

function hotkeyListener(e: KeyboardEvent): void {
    if (["textarea", "input"].includes(document.activeElement?.tagName?.toLowerCase())
        || document.activeElement?.id?.toLowerCase()?.includes("editable")) return;

    const key: Keybind = {
        key: e.key,
        code: e.code,
        alt: e.altKey,
        ctrl: e.ctrlKey,
        shift: e.shiftKey
    };

    const skipKey = Config.config.skipKeybind;
    const startSponsorKey = Config.config.startSponsorKeybind;
    const submitKey = Config.config.submitKeybind;

    if (keybindEquals(key, skipKey)) {
        if (activeSkipKeybindElement)
            activeSkipKeybindElement.toggleSkip.call(activeSkipKeybindElement);
        return;
    } else if (keybindEquals(key, startSponsorKey)) {
        startOrEndTimingNewSegment();
        return;
    } else if (keybindEquals(key, submitKey)) {
        submitSponsorTimes();
        return;
    }

    //legacy - to preserve keybinds for skipKey, startSponsorKey and submitKey for people who set it before the update. (shouldn't be changed for future keybind options)
    if (key.key == skipKey?.key && skipKey.code == null && !keybindEquals(Config.syncDefaults.skipKeybind, skipKey)) {
        if (activeSkipKeybindElement)
            activeSkipKeybindElement.toggleSkip.call(activeSkipKeybindElement);
    } else if (key.key == startSponsorKey?.key && startSponsorKey.code == null && !keybindEquals(Config.syncDefaults.startSponsorKeybind, startSponsorKey)) {
        startOrEndTimingNewSegment();
    } else if (key.key == submitKey?.key && submitKey.code == null && !keybindEquals(Config.syncDefaults.submitKeybind, submitKey)) {
        submitSponsorTimes();
    }
}

/**
 * Adds the CSS to the page if needed. Required on optional sites with Chrome.
 */
function addCSS() {
    if (!utils.isFirefox() && Config.config.invidiousInstances.includes(new URL(document.URL).host)) {
        window.addEventListener("DOMContentLoaded", () => {
            const head = document.getElementsByTagName("head")[0];

            for (const file of utils.css) {
                const fileref = document.createElement("link");

                fileref.rel = "stylesheet";
                fileref.type = "text/css";
                fileref.href = chrome.extension.getURL(file);

                head.appendChild(fileref);
            }
        });
    }
}

/**
 * Update the isAdPlaying flag and hide preview bar/controls if ad is playing
 */
function updateAdFlag(): void {
    const wasAdPlaying = isAdPlaying;
    isAdPlaying = document.getElementsByClassName('ad-showing').length > 0;
    if(wasAdPlaying != isAdPlaying) {
        updatePreviewBar();
        updateVisibilityOfPlayerControlsButton();
    }
}

function showTimeWithoutSkips(skippedDuration: number): void {
    if (onInvidious) return;

    if (isNaN(skippedDuration) || skippedDuration < 0) {
        skippedDuration = 0;
    }

    // YouTube player time display
    const displayClass = onMobileYouTube ? "ytm-time-display" : "ytp-time-display.notranslate"
    const display = document.querySelector(`.${displayClass}`);
    if (!display) return;

    const durationID = "sponsorBlockDurationAfterSkips";
    let duration = document.getElementById(durationID);

    // Create span if needed
    if (duration === null) {
        duration = document.createElement('span');
        duration.id = durationID;
        duration.classList.add(displayClass);

        display.appendChild(duration);
    }

    const durationAfterSkips = utils.getFormattedTime(video?.duration - skippedDuration)

    duration.innerText = (durationAfterSkips == null || skippedDuration <= 0) ? "" : " (" + durationAfterSkips + ")";
}

function checkForPreloadedSegment() {
    if (loadedPreloadedSegment) return;

    loadedPreloadedSegment = true;
    const hashParams = getHashParams();

    let pushed = false;
    const segments = hashParams.segments;
    if (Array.isArray(segments)) {
        for (const segment of segments) {
            if (Array.isArray(segment.segment)) {
                if (!sponsorTimesSubmitting.some((s) => s.segment[0] === segment.segment[0] && s.segment[1] === s.segment[1])) {
                    sponsorTimesSubmitting.push({
                        segment: segment.segment,
                        UUID: utils.generateUserID() as SegmentUUID,
                        category: segment.category ? segment.category : Config.config.defaultCategory,
                        actionType: segment.actionType ? segment.actionType : ActionType.Skip,
                        source: SponsorSourceType.Local
                    });

                    pushed = true;
                }
            }
        }
    }

    if (pushed) {
        Config.config.unsubmittedSegments[sponsorVideoID] = sponsorTimesSubmitting;
        Config.forceSyncUpdate("unsubmittedSegments");
    }
}

// Register listener for URL change via Navigation API
const navigationApiAvailable = "navigation" in window;
if (navigationApiAvailable) {
    // TODO: Remove type cast once type declarations are updated
    (window as unknown as { navigation: EventTarget }).navigation.addEventListener("navigate", (e) => 
        videoIDChange(getYouTubeVideoID(document, (e as unknown as Record<string, Record<string, string>>).destination.url)));
}

// Record availability of Navigation API
utils.wait(() => Config.local !== null).then(() => {
    if (Config.local.navigationApiAvailable !== navigationApiAvailable) {
        Config.local.navigationApiAvailable = navigationApiAvailable;
        Config.forceLocalUpdate("navigationApiAvailable");
    }
});
