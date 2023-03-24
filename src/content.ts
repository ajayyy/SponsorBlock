import Config from "./config";
import {
    ActionType,
    Category,
    CategorySkipOption,
    ChannelIDInfo,
    ChannelIDStatus,
    ContentContainer,
    Keybind,
    ScheduledTime,
    SegmentUUID,
    SkipToTimeParams,
    SponsorHideType,
    SponsorSourceType,
    SponsorTime,
    ToggleSkippable,
    VideoID,
    VideoInfo,
} from "./types";
import Utils from "./utils";
import PreviewBar, { PreviewBarSegment } from "./js-components/previewBar";
import SkipNotice from "./render/SkipNotice";
import SkipNoticeComponent from "./components/SkipNoticeComponent";
import SubmissionNotice from "./render/SubmissionNotice";
import { Message, MessageResponse, VoteResponse } from "./messageTypes";
import { SkipButtonControlBar } from "./js-components/skipButtonControlBar";
import { getStartTimeFromUrl } from "./utils/urlParser";
import { getControls, getExistingChapters, getHashParams, isVisible } from "./utils/pageUtils";
import { isSafari, keybindEquals } from "./utils/configUtils";
import { CategoryPill } from "./render/CategoryPill";
import { AnimationUtils } from "./utils/animationUtils";
import { GenericUtils } from "./utils/genericUtils";
import { logDebug } from "./utils/logger";
import { importTimes } from "./utils/exporter";
import { ChapterVote } from "./render/ChapterVote";
import { openWarningDialog } from "./utils/warnings";
import { waitFor } from "@ajayyy/maze-utils";
import { getFormattedTime } from "@ajayyy/maze-utils/lib/formating";
import { setupVideoMutationListener, getChannelIDInfo, getVideo, refreshVideoAttachments, getIsAdPlaying, getIsLivePremiere, setIsAdPlaying, checkVideoIDChange, getVideoID, getYouTubeVideoID, setupVideoModule, checkIfNewVideoID, isOnInvidious, isOnMobileYouTube } from "@ajayyy/maze-utils/lib/video";
import { StorageChangesObject } from "@ajayyy/maze-utils/lib/config";
import { findValidElement } from "@ajayyy/maze-utils/lib/dom"
import { getHash, HashedValue } from "@ajayyy/maze-utils/lib/hash";
import { generateUserID } from "@ajayyy/maze-utils/lib/setup";
import { updateAll } from "@ajayyy/maze-utils/lib/thumbnailManagement";
import { setupThumbnailListener } from "./utils/thumbnails";
import * as documentScript from "../dist/js/document.js";

const utils = new Utils();

utils.wait(() => Config.isReady(), 5000, 10).then(() => {
    // Hack to get the CSS loaded on permission-based sites (Invidious)
    addCSS();
    setCategoryColorCSSVariables();
});

const skipBuffer = 0.003;

//was sponsor data found when doing SponsorsLookup
let sponsorDataFound = false;
//the actual sponsorTimes if loaded and UUIDs associated with them
let sponsorTimes: SponsorTime[] = [];
let existingChaptersImported = false;
let importingChaptersWaitingForFocus = false;
// List of open skip notices
const skipNotices: SkipNotice[] = [];
let activeSkipKeybindElement: ToggleSkippable = null;
let retryFetchTimeout: NodeJS.Timeout = null;
let shownSegmentFailedToFetchWarning = false;

// JSON video info
let videoInfo: VideoInfo = null;
// Locked Categories in this tab, like: ["sponsor","intro","outro"]
let lockedCategories: Category[] = [];
// Used to calculate a more precise "virtual" video time
const lastKnownVideoTime: { videoTime: number; preciseTime: number; fromPause: boolean; approximateDelay: number } = {
    videoTime: null,
    preciseTime: null,
    fromPause: false,
    approximateDelay: null,
};
// It resumes with a slightly later time on chromium
let lastTimeFromWaitingEvent: number = null;
const lastNextChapterKeybind = {
    time: 0,
    date: 0
};

// Skips are scheduled to ensure precision.
// Skips are rescheduled every seeking event.
// Skips are canceled every seeking event
let currentSkipSchedule: NodeJS.Timeout = null;
let currentSkipInterval: NodeJS.Timeout = null;
let currentVirtualTimeInterval: NodeJS.Timeout = null;

/** Has the sponsor been skipped */
let sponsorSkipped: boolean[] = [];

let videoMuted = false; // Has it been attempted to be muted
const controlsWithEventListeners: HTMLElement[] = [];

setupVideoModule({
    videoIDChange,
    channelIDChange,
    videoElementChange,
    playerInit: () => {
        previewBar = null; // remove old previewbar
        createPreviewBar();
    },
    updatePlayerBar: () => {
        updatePreviewBar();
        updateVisibilityOfPlayerControlsButton();
    },
    resetValues,
    documentScript
}, () => Config);
setupThumbnailListener();

//the video id of the last preview bar update
let lastPreviewBarUpdate: VideoID;

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
const playerButtons: Record<string, {button: HTMLButtonElement; image: HTMLImageElement; setupListener: boolean}> = {};

addHotkeyListener();

/** Segments created by the user which have not yet been submitted. */
let sponsorTimesSubmitting: SponsorTime[] = [];
let loadedPreloadedSegment = false;

//becomes true when isInfoFound is called
//this is used to close the popup on YouTube when the other popup opens
let popupInitialised = false;

let submissionNotice: SubmissionNotice = null;

let lastResponseStatus: number;
let retryCount = 0;
let lookupWaiting = false;

// Contains all of the functions and variables needed by the skip notice
const skipNoticeContentContainer: ContentContainer = () => ({
    vote,
    dontShowNoticeAgain,
    unskipSponsorTime,
    sponsorTimes,
    sponsorTimesSubmitting,
    skipNotices,
    v: getVideo(),
    sponsorVideoID: getVideoID(),
    reskipSponsorTime,
    updatePreviewBar,
    onMobileYouTube: isOnMobileYouTube(),
    sponsorSubmissionNotice: submissionNotice,
    resetSponsorSubmissionNotice,
    updateEditButtonsOnPlayer,
    previewTime,
    videoInfo,
    getRealCurrentTime: getRealCurrentTime,
    lockedCategories,
    channelIDInfo: getChannelIDInfo()
});

// value determining when to count segment as skipped and send telemetry to server (percent based)
const manualSkipPercentCount = 0.5;

//get messages from the background script and the popup
chrome.runtime.onMessage.addListener(messageListener);

function messageListener(request: Message, sender: unknown, sendResponse: (response: MessageResponse) => void): void | boolean {
    //messages from popup script
    switch(request.message){
        case "update":
            checkVideoIDChange();
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
                time: getVideo().currentTime,
                onMobileYouTube: isOnMobileYouTube()
            });

            if (!request.updating && popupInitialised && document.getElementById("sponsorBlockPopupContainer") != null) {
                //the popup should be closed now that another is opening
                closeInfoMenu();
            }

            popupInitialised = true;
            break;
        case "getVideoID":
            sendResponse({
                videoID: getVideoID(),
            });

            break;
        case "getChannelID":
            sendResponse({
                channelID: getChannelIDInfo().id
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
            if (!getVideoID()) checkVideoIDChange();
            // fetch segments
            sponsorsLookup(false);

            break;
        case "unskip":
            unskipSponsorTime(sponsorTimes.find((segment) => segment.UUID === request.UUID), null, true);
            break;
        case "reskip":
            reskipSponsorTime(sponsorTimes.find((segment) => segment.UUID === request.UUID), true);
            break;
        case "submitVote":
            vote(request.type, request.UUID).then((response) => sendResponse(response));
            return true;
        case "hideSegment":
            utils.getSponsorTimeFromUUID(sponsorTimes, request.UUID).hidden = request.type;
            utils.addHiddenSegment(getVideoID(), request.UUID, request.type);
            updatePreviewBar();

            if (skipButtonControlBar?.isEnabled()
                && sponsorTimesSubmitting.every((s) => s.hidden !== SponsorHideType.Visible || s.actionType !== ActionType.Poi)) {
                skipButtonControlBar.disable();
            }
            break;
        case "closePopup":
            closeInfoMenu();
            break;
        case "copyToClipboard":
            navigator.clipboard.writeText(request.text);
            break;
        case "importSegments": {
            const importedSegments = importTimes(request.data, getVideo().duration);
            let addedSegments = false;
            for (const segment of importedSegments) {
                if (!sponsorTimesSubmitting.some(
                        (s) => Math.abs(s.segment[0] - segment.segment[0]) < 1
                            && Math.abs(s.segment[1] - segment.segment[1]) < 1)) {
                    if (segment.category === "chapter" && !utils.getCategorySelection("chapter")) {
                        segment.category = "chooseACategory" as Category;
                        segment.actionType = ActionType.Skip;
                        segment.description = "";
                    }

                    sponsorTimesSubmitting.push(segment);
                    addedSegments = true;
                }
            }

            if (addedSegments) {
                Config.config.unsubmittedSegments[getVideoID()] = sponsorTimesSubmitting;
                Config.forceSyncUpdate("unsubmittedSegments");

                updateEditButtonsOnPlayer();
                updateSponsorTimesSubmitting(false);
                submitSponsorTimes();
            }

            sendResponse({
                importedSegments
            });
            break;
        }
        case "keydown":
            (document.body || document).dispatchEvent(new KeyboardEvent('keydown', {
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
            case "barTypes":
                setCategoryColorCSSVariables();
                break;
            case "fullVideoSegments":
            case "fullVideoLabelsOnThumbnails":
                updateAll();
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

    sponsorTimes = [];
    existingChaptersImported = false;
    sponsorSkipped = [];
    lastResponseStatus = 0;
    shownSegmentFailedToFetchWarning = false;

    videoInfo = null;
    channelWhitelisted = false;
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

    skipButtonControlBar?.disable();
    categoryPill?.setVisibility(false);

    for (let i = 0; i < skipNotices.length; i++) {
        skipNotices.pop()?.close();
    }
}

function videoIDChange(): void {
    //setup the preview bar
    if (previewBar === null) {
        if (isOnMobileYouTube()) {
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

    // Notify the popup about the video change
    chrome.runtime.sendMessage({
        message: "videoChanged",
        videoID: getVideoID(),
        whitelisted: channelWhitelisted
    });

    sponsorsLookup();

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
            selector: ".ytp-progress-bar",
            isVisibleCheck: true
        }, {
            // For Desktop YouTube
            selector: ".no-model.cue-range-marker",
            isVisibleCheck: true
        }, {
            // For Invidious/VideoJS
            selector: ".vjs-progress-holder",
            isVisibleCheck: false
        }, {
            // For Youtube Music
            // there are two sliders, one for volume and one for progress - both called #progressContainer
            selector: "#progress-bar>#sliderContainer>div>#sliderBar>#progressContainer",
        }, {
            // For piped
            selector: ".shaka-ad-markers",
            isVisibleCheck: false
        }
    ];

    for (const option of progressElementOptions) {
        const allElements = document.querySelectorAll(option.selector) as NodeListOf<HTMLElement>;
        const el = option.isVisibleCheck ? findValidElement(allElements) : allElements[0];

        if (el) {
            const chapterVote = new ChapterVote(voteAsync);
            previewBar = new PreviewBar(el, isOnMobileYouTube(), isOnInvidious(), chapterVote, () => importExistingChapters(false));

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
    updateVisibilityOfPlayerControlsButton()
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
async function startSponsorSchedule(includeIntersectingSegments = false, currentTime?: number, includeNonIntersectingSegments = true): Promise<void> {
    cancelSponsorSchedule();

    // Don't skip if advert playing and reset last checked time
    if (getIsAdPlaying()) {
        // Reset lastCheckVideoTime
        lastCheckVideoTime = -1;
        lastCheckTime = 0;
        logDebug("[SB] Ad playing, pausing skipping");

        return;
    }

    // Give up if video changed, and trigger a videoID change if so
    if (await checkIfNewVideoID()) {
        return;
    }

    logDebug(`Considering to start skipping: ${!getVideo()}, ${getVideo()?.paused}`);
    if (!getVideo()) return;
    if (currentTime === undefined || currentTime === null) {
        currentTime = getVirtualTime();
    }
    clearWaitingTime();

    updateActiveSegment(currentTime);

    if (getVideo().paused) return;
    const skipInfo = getNextSkipIndex(currentTime, includeIntersectingSegments, includeNonIntersectingSegments);

    const currentSkip = skipInfo.array[skipInfo.index];
    const skipTime: number[] = [currentSkip?.scheduledTime, skipInfo.array[skipInfo.endIndex]?.segment[1]];
    const timeUntilSponsor = skipTime?.[0] - currentTime;
    const videoID = getVideoID();

    if (videoMuted && !inMuteSegment(currentTime, skipInfo.index !== -1
            && timeUntilSponsor < skipBuffer && shouldAutoSkip(currentSkip))) {
        getVideo().muted = false;
        videoMuted = false;

        for (const notice of skipNotices) {
            // So that the notice can hide buttons
            notice.unmutedListener(currentTime);
        }
    }

    logDebug(`Ready to start skipping: ${skipInfo.index} at ${currentTime}`);
    if (skipInfo.index === -1) return;

    if (Config.config.disableSkipping || channelWhitelisted || (getChannelIDInfo().status === ChannelIDStatus.Fetching && Config.config.forceChannelCheck)){
        return;
    }

    if (incorrectVideoCheck()) return;

    // Find all indexes in between the start and end
    let skippingSegments = [skipInfo.array[skipInfo.index]];
    if (skipInfo.index !== skipInfo.endIndex) {
        skippingSegments = [];

        for (const segment of skipInfo.array) {
            if (shouldAutoSkip(segment) &&
                    segment.segment[0] >= skipTime[0] && segment.segment[1] <= skipTime[1]
                    && segment.segment[0] === segment.scheduledTime) { // Don't include artifical scheduled segments (end times for mutes)
                skippingSegments.push(segment);
            }
        }
    }

    logDebug(`Next step in starting skipping: ${!shouldSkip(currentSkip)}, ${!sponsorTimesSubmitting?.some((segment) => segment.segment === currentSkip.segment)}`);

    const skippingFunction = (forceVideoTime?: number) => {
        let forcedSkipTime: number = null;
        let forcedIncludeIntersectingSegments = false;
        let forcedIncludeNonIntersectingSegments = true;

        if (incorrectVideoCheck(videoID, currentSkip)) return;
        forceVideoTime ||= Math.max(getVideo().currentTime, getVirtualTime());

        if ((shouldSkip(currentSkip) || sponsorTimesSubmitting?.some((segment) => segment.segment === currentSkip.segment))) {
            if (forceVideoTime >= skipTime[0] - skipBuffer && forceVideoTime < skipTime[1]) {
                skipToTime({
                    v: getVideo(),
                    skipTime,
                    skippingSegments,
                    openNotice: skipInfo.openNotice
                });

                // These are segments that start at the exact same time but need seperate notices
                for (const extra of skipInfo.extraIndexes) {
                    const extraSkip = skipInfo.array[extra];
                    if (shouldSkip(extraSkip)) {
                        skipToTime({
                            v: getVideo(),
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
            } else {
                forcedSkipTime = forceVideoTime + 0.001;
            }
        } else {
            forcedSkipTime = forceVideoTime + 0.001;
        }

        startSponsorSchedule(forcedIncludeIntersectingSegments, forcedSkipTime, forcedIncludeNonIntersectingSegments);
    };

    if (timeUntilSponsor < skipBuffer) {
        skippingFunction(currentTime);
    } else {
        let delayTime = timeUntilSponsor * 1000 * (1 / getVideo().playbackRate);
        if (delayTime < 300) {
            let forceStartIntervalTime: number | null = null;
            if (utils.isFirefox() && !isSafari() && delayTime > 100) {
                forceStartIntervalTime = await waitForNextTimeChange();
            }

            // Use interval instead of timeout near the end to combat imprecise video time
            const startIntervalTime = forceStartIntervalTime || performance.now();
            const startVideoTime = Math.max(currentTime, getVideo().currentTime);
            delayTime = (skipTime?.[0] - startVideoTime) * 1000 * (1 / getVideo().playbackRate);

            let startWaitingForReportedTimeToChange = true;
            const reportedVideoTimeAtStart = getVideo().currentTime;
            logDebug(`Starting setInterval skipping ${getVideo().currentTime} to skip at ${skipTime[0]}`);

            if (currentSkipInterval !== null) clearInterval(currentSkipInterval);
            currentSkipInterval = setInterval(() => {
                // Estimate delay, but only take the current time right after a change
                // Current time remains the same for many "frames" on Firefox
                if (utils.isFirefox() && !lastKnownVideoTime.fromPause && startWaitingForReportedTimeToChange
                        && reportedVideoTimeAtStart !== getVideo().currentTime) {
                    startWaitingForReportedTimeToChange = false;
                    const delay = getVirtualTime() - getVideo().currentTime;
                    if (delay > 0) lastKnownVideoTime.approximateDelay = delay;
                }

                const intervalDuration = performance.now() - startIntervalTime;
                if (intervalDuration + skipBuffer * 1000 >= delayTime || getVideo().currentTime >= skipTime[0]) {
                    clearInterval(currentSkipInterval);
                    if (!utils.isFirefox() && !getVideo().muted) {
                        // Workaround for more accurate skipping on Chromium
                        getVideo().muted = true;
                        getVideo().muted = false;
                    }

                    skippingFunction(Math.max(getVideo().currentTime, startVideoTime + getVideo().playbackRate * Math.max(delayTime, intervalDuration) / 1000));
                }
            }, 1);
        } else {
            logDebug(`Starting timeout to skip ${getVideo().currentTime} to skip at ${skipTime[0]}`);

            const offset = (utils.isFirefox() && !isSafari ? 300 : 150);
            // Schedule for right before to be more precise than normal timeout
            currentSkipSchedule = setTimeout(skippingFunction, Math.max(0, delayTime - offset));
        }
    }
}

/**
 * Used on Firefox only, waits for the next animation frame until
 * the video time has changed
 */
function waitForNextTimeChange(): Promise<DOMHighResTimeStamp | null> {
    const startVideoTime = getVideo().currentTime;
    let tries = 0;
    return new Promise((resolve) => {
        const callback = (timestamp: DOMHighResTimeStamp) => {
            tries++;
            if (startVideoTime !== getVideo().currentTime) {
                resolve(timestamp);
                return;
            } else if (tries > 4) {
                // Give up
                resolve(null);
            } else {
                requestAnimationFrame(callback);
            }
        }

        requestAnimationFrame(callback);
    });
}

function getVirtualTime(): number {
    const virtualTime = lastTimeFromWaitingEvent ?? (lastKnownVideoTime.videoTime !== null ?
        (performance.now() - lastKnownVideoTime.preciseTime) * getVideo().playbackRate / 1000 + lastKnownVideoTime.videoTime : null);

    if (Config.config.useVirtualTime && !isSafari() && virtualTime
            && Math.abs(virtualTime - getVideo().currentTime) < 0.2 && getVideo().currentTime !== 0) {
        return Math.max(virtualTime, getVideo().currentTime);
    } else {
        return getVideo().currentTime;
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
    const currentVideoID = getYouTubeVideoID();
    const recordedVideoID = videoID || getVideoID();
    if (currentVideoID !== recordedVideoID || (sponsorTime
            && (!sponsorTimes || !sponsorTimes?.some((time) => time.segment === sponsorTime.segment))
            && !sponsorTimesSubmitting.some((time) => time.segment === sponsorTime.segment))) {
        // Something has really gone wrong
        console.error("[SponsorBlock] The videoID recorded when trying to skip is different than what it should be.");
        console.error("[SponsorBlock] VideoID recorded: " + recordedVideoID + ". Actual VideoID: " + currentVideoID);

        // Video ID change occured
        checkVideoIDChange();

        return true;
    } else {
        return false;
    }
}

function setupVideoListeners() {
    //wait until it is loaded
    getVideo().addEventListener('loadstart', videoOnReadyListener)
    getVideo().addEventListener('durationchange', durationChangeListener);

    if (!Config.config.disableSkipping) {
        switchingVideos = false;

        let startedWaiting = false;
        let lastPausedAtZero = true;

        getVideo().addEventListener('play', () => {
            // If it is not the first event, then the only way to get to 0 is if there is a seek event
            // This check makes sure that changing the video resolution doesn't cause the extension to think it
            // gone back to the begining
            if (getVideo().readyState <= HTMLMediaElement.HAVE_CURRENT_DATA
                    && getVideo().currentTime === 0) return;

            updateVirtualTime();

            if (switchingVideos || lastPausedAtZero) {
                switchingVideos = false;
                logDebug("Setting switching videos to false");

                // If already segments loaded before video, retry to skip starting segments
                if (sponsorTimes) startSkipScheduleCheckingForStartSponsors();
            }

            lastPausedAtZero = false;

            // Check if an ad is playing
            updateAdFlag();

            // Make sure it doesn't get double called with the playing event
            if (Math.abs(lastCheckVideoTime - getVideo().currentTime) > 0.3
                    || (lastCheckVideoTime !== getVideo().currentTime && Date.now() - lastCheckTime > 2000)) {
                lastCheckTime = Date.now();
                lastCheckVideoTime = getVideo().currentTime;

                startSponsorSchedule();
            }

        });
        getVideo().addEventListener('playing', () => {
            updateVirtualTime();
            lastPausedAtZero = false;

            if (startedWaiting) {
                startedWaiting = false;
                logDebug(`[SB] Playing event after buffering: ${Math.abs(lastCheckVideoTime - getVideo().currentTime) > 0.3
                    || (lastCheckVideoTime !== getVideo().currentTime && Date.now() - lastCheckTime > 2000)}`);
            }

            if (switchingVideos) {
                switchingVideos = false;
                logDebug("Setting switching videos to false");

                // If already segments loaded before video, retry to skip starting segments
                if (sponsorTimes) startSkipScheduleCheckingForStartSponsors();
            }

            // Make sure it doesn't get double called with the play event
            if (Math.abs(lastCheckVideoTime - getVideo().currentTime) > 0.3
                    || (lastCheckVideoTime !== getVideo().currentTime && Date.now() - lastCheckTime > 2000)) {
                lastCheckTime = Date.now();
                lastCheckVideoTime = getVideo().currentTime;

                startSponsorSchedule();
            }
        });
        getVideo().addEventListener('seeking', () => {
            lastKnownVideoTime.fromPause = false;

            if (!getVideo().paused){
                // Reset lastCheckVideoTime
                lastCheckTime = Date.now();
                lastCheckVideoTime = getVideo().currentTime;

                updateVirtualTime();
                clearWaitingTime();

                startSponsorSchedule();
            } else {
                updateActiveSegment(getVideo().currentTime);

                if (getVideo().currentTime === 0) {
                    lastPausedAtZero = true;
                }
            }
        });
        getVideo().addEventListener('ratechange', () => {
            updateVirtualTime();
            clearWaitingTime();

            startSponsorSchedule();
        });
        // Used by videospeed extension (https://github.com/igrigorik/videospeed/pull/740)
        getVideo().addEventListener('videoSpeed_ratechange', () => {
            updateVirtualTime();
            clearWaitingTime();

            startSponsorSchedule();
        });
        const stoppedPlayback = () => {
            // Reset lastCheckVideoTime
            lastCheckVideoTime = -1;
            lastCheckTime = 0;

            lastKnownVideoTime.videoTime = null;
            lastKnownVideoTime.preciseTime = null;
            updateWaitingTime();

            cancelSponsorSchedule();
        };
        getVideo().addEventListener('pause', () => {
            lastKnownVideoTime.fromPause = true;

            stoppedPlayback();
        });
        getVideo().addEventListener('waiting', () => {
            logDebug("[SB] Not skipping due to buffering");
            startedWaiting = true;

            stoppedPlayback();
        });

        startSponsorSchedule();
    }
}

function updateVirtualTime() {
    if (currentVirtualTimeInterval) clearInterval(currentVirtualTimeInterval);

    lastKnownVideoTime.videoTime = getVideo().currentTime;
    lastKnownVideoTime.preciseTime = performance.now();

    // If on Firefox, wait for the second time change (time remains fixed for many "frames" for privacy reasons)
    if (utils.isFirefox()) {
        let count = 0;
        let rawCount = 0;
        let lastTime = lastKnownVideoTime.videoTime;
        let lastPerformanceTime = performance.now();

        currentVirtualTimeInterval = setInterval(() => {
            const frameTime = performance.now() - lastPerformanceTime;
            if (lastTime !== getVideo().currentTime) {
                rawCount++;

                // If there is lag, give it another shot at finding a good change time
                if (frameTime < 20 || rawCount > 30) {
                    count++;
                }
                lastTime = getVideo().currentTime;
            }

            if (count > 1) {
                const delay = lastKnownVideoTime.fromPause && lastKnownVideoTime.approximateDelay ?
                    lastKnownVideoTime.approximateDelay : 0;

                lastKnownVideoTime.videoTime = getVideo().currentTime + delay;
                lastKnownVideoTime.preciseTime = performance.now();

                clearInterval(currentVirtualTimeInterval);
                currentVirtualTimeInterval = null;
            }

            lastPerformanceTime = performance.now();
        }, 1);
    }
}

function updateWaitingTime(): void {
    lastTimeFromWaitingEvent = getVideo().currentTime;
}

function clearWaitingTime(): void {
    lastTimeFromWaitingEvent = null;
}

function setupSkipButtonControlBar() {
    if (!skipButtonControlBar) {
        skipButtonControlBar = new SkipButtonControlBar({
            skip: (segment) => skipToTime({
                v: getVideo(),
                skipTime: segment.segment,
                skippingSegments: [segment],
                openNotice: true,
                forceAutoSkip: true
            }),
            onMobileYouTube: isOnMobileYouTube()
        });
    }

    skipButtonControlBar.attachToPage();
}

function setupCategoryPill() {
    if (!categoryPill) {
        categoryPill = new CategoryPill();
    }

    categoryPill.attachToPage(isOnMobileYouTube(), isOnInvidious(), voteAsync);
}

async function sponsorsLookup(keepOldSubmissions = true) {
    if (lookupWaiting) return;
    if (!getVideo() || !isVisible(getVideo())) refreshVideoAttachments();
    //there is still no video here
    if (!getVideo()) {
        lookupWaiting = true;
        setTimeout(() => {
            lookupWaiting = false;
            sponsorsLookup()
        }, 100);
        return;
    }

    setupVideoMutationListener();

    const categories: string[] = Config.config.categorySelections.map((category) => category.name);

    const extraRequestData: Record<string, unknown> = {};
    const hashParams = getHashParams();
    if (hashParams.requiredSegment) extraRequestData.requiredSegment = hashParams.requiredSegment;

    const hashPrefix = (await getHash(getVideoID(), 1)).slice(0, 4) as VideoID & HashedValue;
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
                    ?.filter((video) => video.videoID === getVideoID())
                    ?.map((video) => video.segments)?.[0]
                    ?.map((segment) => ({
                        ...segment,
                        source: SponsorSourceType.Server
                    }))
                    ?.sort((a, b) => a.segment[0] - b.segment[0]);
        if (recievedSegments && recievedSegments.length) {
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
            existingChaptersImported = false;

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
                    const hashedUUID = await getHash(segment.UUID, 1);
                    const segmentDownvoteData = downvotedData.segments.find((downvote) => downvote.uuid === hashedUUID);
                    if (segmentDownvoteData) {
                        segment.hidden = segmentDownvoteData.hidden;
                    }
                }
            }

            startSkipScheduleCheckingForStartSponsors();

            //update the preview bar
            //leave the type blank for now until categories are added
            if (lastPreviewBarUpdate == getVideoID() || (lastPreviewBarUpdate == null && !isNaN(getVideo().duration))) {
                //set it now
                //otherwise the listener can handle it
                updatePreviewBar();
            }
        } else {
            retryFetch(404);
        }
    } else {
        retryFetch(lastResponseStatus);
    }

    importExistingChapters(true);

    // notify popup of segment changes
    chrome.runtime.sendMessage({
        message: "infoUpdated",
        found: sponsorDataFound,
        status: lastResponseStatus,
        sponsorTimes: sponsorTimes,
        time: getVideo().currentTime,
        onMobileYouTube: isOnMobileYouTube()
    });

    if (Config.config.isVip) {
        lockedCategoriesLookup();
    }
}

function importExistingChapters(wait: boolean) {
    if (!existingChaptersImported) {
        const waitCondition = () => getVideo()?.duration && getExistingChapters(getVideoID(), getVideo().duration);

        if (!waitCondition() && wait && !document.hasFocus() && !importingChaptersWaitingForFocus) {
            importingChaptersWaitingForFocus = true;
            const listener = () => {
                importExistingChapters(wait);
                window.removeEventListener("focus", listener);
            };
            window.addEventListener("focus", listener);
        } else {
            waitFor(waitCondition,
                wait ? 15000 : 0, 400, (c) => c?.length > 0).then((chapters) => {
                    if (!existingChaptersImported && chapters?.length > 0) {
                        sponsorTimes = (sponsorTimes ?? []).concat(...chapters).sort((a, b) => a.segment[0] - b.segment[0]);
                        existingChaptersImported = true;
                        updatePreviewBar();
                    }
                }).catch(() => {}); // eslint-disable-line @typescript-eslint/no-empty-function
        }
    }
}

function getEnabledActionTypes(forceFullVideo = false): ActionType[] {
    const actionTypes = [ActionType.Skip, ActionType.Poi, ActionType.Chapter];
    if (Config.config.muteSegments) {
        actionTypes.push(ActionType.Mute);
    }
    if (Config.config.fullVideoSegments || forceFullVideo) {
        actionTypes.push(ActionType.Full);
    }

    return actionTypes;
}

async function lockedCategoriesLookup(): Promise<void> {
    const hashPrefix = (await getHash(getVideoID(), 1)).slice(0, 4);
    const response = await utils.asyncRequestToServer("GET", "/api/lockCategories/" + hashPrefix);

    if (response.ok) {
        try {
            const categoriesResponse = JSON.parse(response.responseText).filter((lockInfo) => lockInfo.videoID === getVideoID())[0]?.categories;
            if (Array.isArray(categoriesResponse)) {
                lockedCategories = categoriesResponse;
            }
        } catch (e) { } //eslint-disable-line no-empty
    }
}

function retryFetch(errorCode: number): void {
    sponsorDataFound = false;
    if (!Config.config.refetchWhenNotFound) return;

    if (retryFetchTimeout) clearTimeout(retryFetchTimeout);
    if ((errorCode !== 404 && retryCount > 1) || (errorCode !== 404 && retryCount > 10)) {
        // Too many errors (50x), give up
        return;
    }

    retryCount++;

    const delay = errorCode === 404 ? (30000 + Math.random() * 30000) : (2000 + Math.random() * 10000);
    retryFetchTimeout = setTimeout(() => {
        if (getVideoID() && sponsorTimes?.length === 0
                || sponsorTimes.every((segment) => segment.source !== SponsorSourceType.Server)) {
            // sponsorsLookup();
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
            if (time.segment[0] <= getVideo().currentTime && time.segment[0] > startingSegmentTime && time.segment[1] > getVideo().currentTime
                    && time.actionType !== ActionType.Poi) {
                        startingSegmentTime = time.segment[0];
                        found = true;
                break;
            }
        }
        if (!found) {
            for (const time of sponsorTimesSubmitting) {
                if (time.segment[0] <= getVideo().currentTime && time.segment[0] > startingSegmentTime && time.segment[1] > getVideo().currentTime
                        && time.actionType !== ActionType.Poi) {
                            startingSegmentTime = time.segment[0];
                            found = true;
                    break;
                }
            }
        }

        // For highlight category
        const poiSegments = sponsorTimes
            .filter((time) => time.segment[1] > getVideo().currentTime
                && time.actionType === ActionType.Poi && time.hidden === SponsorHideType.Visible)
            .sort((a, b) => b.segment[0] - a.segment[0]);
        for (const time of poiSegments) {
            const skipOption = utils.getCategorySelection(time.category)?.option;
            if (skipOption !== CategorySkipOption.ShowOverlay) {
                skipToTime({
                    v: getVideo(),
                    skipTime: time.segment,
                    skippingSegments: [time],
                    openNotice: true,
                    unskipTime: getVideo().currentTime
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

    if (getIsAdPlaying()) {
        previewBar.clear();
        return;
    }

    if (getVideo() === null) return;

    const hashParams = getHashParams();
    const requiredSegment = hashParams?.requiredSegment as SegmentUUID || undefined;
    const previewBarSegments: PreviewBarSegment[] = [];
    if (sponsorTimes) {
        sponsorTimes.forEach((segment) => {
            if (segment.hidden !== SponsorHideType.Visible) return;

            previewBarSegments.push({
                segment: segment.segment as [number, number],
                category: segment.category,
                actionType: segment.actionType,
                unsubmitted: false,
                showLarger: segment.actionType === ActionType.Poi,
                description: segment.description,
                source: segment.source,
                requiredSegment: requiredSegment && (segment.UUID === requiredSegment || segment.UUID.startsWith(requiredSegment))
            });
        });
    }

    sponsorTimesSubmitting.forEach((segment) => {
        previewBarSegments.push({
            segment: segment.segment as [number, number],
            category: segment.category,
            actionType: segment.actionType,
            unsubmitted: true,
            showLarger: segment.actionType === ActionType.Poi,
            description: segment.description,
            source: segment.source
        });
    });

    previewBar.set(previewBarSegments.filter((segment) => segment.actionType !== ActionType.Full), getVideo()?.duration)
    if (getVideo()) updateActiveSegment(getVideo().currentTime);

    if (Config.config.showTimeWithSkips) {
        const skippedDuration = utils.getTimestampsDuration(previewBarSegments
            .filter(({actionType}) => ![ActionType.Mute, ActionType.Chapter].includes(actionType))
            .map(({segment}) => segment));

        showTimeWithoutSkips(skippedDuration);
    }

    // Update last video id
    lastPreviewBarUpdate = getVideoID();
}

//checks if this channel is whitelisted, should be done only after the channelID has been loaded
async function channelIDChange(channelIDInfo: ChannelIDInfo) {
    const whitelistedChannels = Config.config.whitelistedChannels;

    //see if this is a whitelisted channel
    if (whitelistedChannels != undefined &&
            channelIDInfo.status === ChannelIDStatus.Found && whitelistedChannels.includes(channelIDInfo.id)) {
        channelWhitelisted = true;
    }

    // check if the start of segments were missed
    if (Config.config.forceChannelCheck && sponsorTimes?.length > 0) startSkipScheduleCheckingForStartSponsors();
}

function videoElementChange(newVideo: boolean): void {
    if (newVideo) {
        setupVideoListeners();
        setupSkipButtonControlBar();
        setupCategoryPill();
    }

    if (previewBar && !utils.findReferenceNode()?.contains(previewBar.container)) {
        previewBar.remove();
        previewBar = null;

        createPreviewBar();
    }
}

/**
 * Returns info about the next upcoming sponsor skip
 */
function getNextSkipIndex(currentTime: number, includeIntersectingSegments: boolean, includeNonIntersectingSegments: boolean):
        {array: ScheduledTime[]; index: number; endIndex: number; extraIndexes: number[]; openNotice: boolean} {

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
    const { scheduledTimes: sponsorStartTimesAfterCurrentTime } = getStartTimes(sponsorTimes, includeIntersectingSegments, includeNonIntersectingSegments, currentTime, true);

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
    const { scheduledTimes: unsubmittedSponsorStartTimesAfterCurrentTime } = getStartTimes(sponsorTimesSubmitting, includeIntersectingSegments, includeNonIntersectingSegments, currentTime, false);

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

        if (currentSegment[0] - skipBuffer <= latestEndTime && currentSegment[1] > latestEndTime
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
    minimum?: number, hideHiddenSponsors = false): {includedTimes: ScheduledTime[]; scheduledTimes: number[]} {
    if (!sponsorTimes) return {includedTimes: [], scheduledTimes: []};

    const includedTimes: ScheduledTime[] = [];
    const scheduledTimes: number[] = [];

    const shouldIncludeTime = (segment: ScheduledTime ) => (minimum === undefined
        || ((includeNonIntersectingSegments && segment.scheduledTime >= minimum)
            || (includeIntersectingSegments && segment.scheduledTime < minimum
                    && segment.segment[1] > minimum && shouldSkip(segment)))) // Only include intersecting skippable segments
        && (!hideHiddenSponsors || segment.hidden === SponsorHideType.Visible)
        && segment.segment.length === 2
        && segment.actionType !== ActionType.Poi;

    const possibleTimes = sponsorTimes.map((sponsorTime) => ({
        ...sponsorTime,
        scheduledTime: sponsorTime.segment[0]
    }));

    // Schedule at the end time to know when to unmute and remove title from seek bar
    sponsorTimes.forEach(sponsorTime => {
        if (!possibleTimes.some((time) => sponsorTime.segment[1] === time.scheduledTime && shouldIncludeTime(time))
            && (minimum === undefined || sponsorTime.segment[1] > minimum)) {
            possibleTimes.push({
                ...sponsorTime,
                scheduledTime: sponsorTime.segment[1]
            });
        }
    });

    for (let i = 0; i < possibleTimes.length; i++) {
        if (shouldIncludeTime(possibleTimes[i])) {
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
    getVideo().currentTime = time;

    // Unpause the video if needed
    if (unpause && getVideo().paused){
        getVideo().play();
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
                if (segment.actionType !== ActionType.Chapter) {
                    Config.config.skipCount = Config.config.skipCount + 1;
                }
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
        beep.volume = getVideo().volume * 0.1;
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
        if (isOnMobileYouTube() || Config.config.skipKeybind == null) skipButtonControlBar.setShowKeybindHint(false);

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
    if (isOnMobileYouTube() || Config.config.skipKeybind == null) newSkipNotice.setShowKeybindHint(false);
    skipNotices.push(newSkipNotice);

    activeSkipKeybindElement?.setShowKeybindHint(false);
    activeSkipKeybindElement = newSkipNotice;
}

function unskipSponsorTime(segment: SponsorTime, unskipTime: number = null, forceSeek = false) {
    if (segment.actionType === ActionType.Mute) {
        getVideo().muted = false;
        videoMuted = false;
    }

    if (forceSeek || segment.actionType === ActionType.Skip) {
        //add a tiny bit of time to make sure it is not skipped again
        getVideo().currentTime = unskipTime ?? segment.segment[0] + 0.001;
    }

}

function reskipSponsorTime(segment: SponsorTime, forceSeek = false) {
    if (segment.actionType === ActionType.Mute && !forceSeek) {
        getVideo().muted = true;
        videoMuted = true;
    } else {
        const skippedTime = Math.max(segment.segment[1] - getVideo().currentTime, 0);
        const segmentDuration = segment.segment[1] - segment.segment[0];
        const fullSkip = skippedTime / segmentDuration > manualSkipPercentCount;

        getVideo().currentTime = segment.segment[1];
        sendTelemetryAndCount([segment], segment.actionType !== ActionType.Chapter ? skippedTime : 0, fullSkip);
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
    return (!Config.config.manualSkipOnFullVideo || !sponsorTimes?.some((s) => s.category === segment.category && s.actionType === ActionType.Full))
        && (utils.getCategorySelection(segment.category)?.option === CategorySkipOption.AutoSkip ||
            (Config.config.autoSkipOnMusicVideos && sponsorTimes?.some((s) => s.category === "music_offtopic")
                && segment.actionType === ActionType.Skip));
}

function shouldSkip(segment: SponsorTime): boolean {
    return (segment.actionType !== ActionType.Full
            && segment.source !== SponsorSourceType.YouTube
            && utils.getCategorySelection(segment.category)?.option !== CategorySkipOption.ShowOverlay)
            || (Config.config.autoSkipOnMusicVideos && sponsorTimes?.some((s) => s.category === "music_offtopic")
                && segment.actionType === ActionType.Skip);
}

/** Creates any missing buttons on the YouTube player if possible. */
async function createButtons(): Promise<void> {
    controls = await utils.wait(getControls).catch();

    // Add button if does not already exist in html
    createButton("startSegment", "sponsorStart", () => startOrEndTimingNewSegment(), "PlayerStartIconSponsorBlocker.svg");
    createButton("cancelSegment", "sponsorCancel", () => cancelCreatingSegment(), "PlayerCancelSegmentIconSponsorBlocker.svg");
    createButton("delete", "clearTimes", () => clearSponsorTimes(), "PlayerDeleteIconSponsorBlocker.svg");
    createButton("submit", "OpenSubmissionMenu", () => submitSponsorTimes(), "PlayerUploadIconSponsorBlocker.svg");
    createButton("info", "openPopup", () => openInfoMenu(), "PlayerInfoIconSponsorBlocker.svg");

    const controlsContainer = getControls();
    if (Config.config.autoHideInfoButton && !isOnInvidious() && controlsContainer
            && playerButtons["info"]?.button && !controlsWithEventListeners.includes(controlsContainer)) {
        controlsWithEventListeners.push(controlsContainer);

        AnimationUtils.setupAutoHideAnimation(playerButtons["info"].button, controlsContainer);
    }
}

/** Creates any missing buttons on the player and updates their visiblity. */
async function updateVisibilityOfPlayerControlsButton(): Promise<void> {
    // Not on a proper video yet
    if (!getVideoID() || isOnMobileYouTube()) return;

    await createButtons();

    updateEditButtonsOnPlayer();

    // Don't show the info button on embeds
    if (Config.config.hideInfoButtonPlayerControls || document.URL.includes("/embed/") || isOnInvidious()
        || document.getElementById("sponsorBlockPopupContainer") != null) {
        playerButtons.info.button.style.display = "none";
    } else {
        playerButtons.info.button.style.removeProperty("display");
    }
}

/** Updates the visibility of buttons on the player related to creating segments. */
function updateEditButtonsOnPlayer(): void {
    // Don't try to update the buttons if we aren't on a YouTube video page
    if (!getVideoID() || isOnMobileYouTube()) return;

    const buttonsEnabled = !(Config.config.hideVideoPlayerControls || isOnInvidious());

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
 * current time is out of date while scrubbing or at the end of the getVideo(). This is not needed
 * for sponsor skipping as the video is not playing during these times.
 */
function getRealCurrentTime(): number {
    // Used to check if replay button
    const playButtonSVGData = document.querySelector(".ytp-play-button")?.querySelector(".ytp-svg-fill")?.getAttribute("d");
    const replaceSVGData = "M 18,11 V 7 l -5,5 5,5 v -4 c 3.3,0 6,2.7 6,6 0,3.3 -2.7,6 -6,6 -3.3,0 -6,-2.7 -6,-6 h -2 c 0,4.4 3.6,8 8,8 4.4,0 8,-3.6 8,-8 0,-4.4 -3.6,-8 -8,-8 z";

    if (playButtonSVGData === replaceSVGData) {
        // At the end of the video
        return getVideo()?.duration;
    } else {
        return getVideo().currentTime;
    }
}

function startOrEndTimingNewSegment() {
    const roundedTime = Math.round((getRealCurrentTime() + Number.EPSILON) * 1000) / 1000;
    if (!isSegmentCreationInProgress()) {
        sponsorTimesSubmitting.push({
            segment: [roundedTime],
            UUID: generateUserID() as SegmentUUID,
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
    Config.config.unsubmittedSegments[getVideoID()] = sponsorTimesSubmitting;
    Config.forceSyncUpdate("unsubmittedSegments");

    // Make sure they know if someone has already submitted something it while they were watching
    sponsorsLookup();

    updateEditButtonsOnPlayer();
    updateSponsorTimesSubmitting(false);

    importExistingChapters(false);

    if (lastResponseStatus !== 200 && lastResponseStatus !== 404
            && !shownSegmentFailedToFetchWarning && Config.config.showSegmentFailedToFetchWarning) {
        alert(chrome.i18n.getMessage("segmentFetchFailureWarning"));

        shownSegmentFailedToFetchWarning = true;
    }
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
        if (sponsorTimesSubmitting.length > 1) {  // If there's more than one segment: remove last
            sponsorTimesSubmitting.pop();
            Config.config.unsubmittedSegments[getVideoID()] = sponsorTimesSubmitting;
        } else {  // Otherwise delete the video entry & close submission menu
            resetSponsorSubmissionNotice();
            sponsorTimesSubmitting = [];
            delete Config.config.unsubmittedSegments[getVideoID()];
        }
        Config.forceSyncUpdate("unsubmittedSegments");
    }

    updateEditButtonsOnPlayer();
    updateSponsorTimesSubmitting(false);
}

function updateSponsorTimesSubmitting(getFromConfig = true) {
    const segmentTimes = Config.config.unsubmittedSegments[getVideoID()];

    //see if this data should be saved in the sponsorTimesSubmitting variable
    if (getFromConfig && segmentTimes != undefined) {
        sponsorTimesSubmitting = [];

        for (const segmentTime of segmentTimes) {
            sponsorTimesSubmitting.push({
                segment: segmentTime.segment,
                UUID: segmentTime.UUID,
                category: segmentTime.category,
                actionType: segmentTime.actionType,
                description: segmentTime.description,
                source: segmentTime.source
            });
        }

        if (sponsorTimesSubmitting.length > 0) {
            importExistingChapters(true);
        }
    }

    updatePreviewBar();

    // Restart skipping schedule
    if (getVideo() !== null) startSponsorSchedule();

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

    const elemHasChild = (elements: NodeListOf<HTMLElement>): Element => {
        let parentNode: Element;
        for (const node of elements) {
            if (node.firstElementChild !== null) {
                parentNode = node;
            }
        }
        return parentNode
    }

    const parentNodeOptions = [{
        // YouTube
        selector: "#secondary-inner",
        hasChildCheck: true
    }, {
        // old youtube theme
        selector: "#watch7-sidebar-contents",
    }];
    for (const option of parentNodeOptions) {
        const allElements = document.querySelectorAll(option.selector) as NodeListOf<HTMLElement>;
        const el = option.hasChildCheck ? elemHasChild(allElements) : allElements[0];

        if (el) {
            if (option.hasChildCheck) el.insertBefore(popup, el.firstChild);
            break;
        }
    }
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
    const currentVideoID = getVideoID();

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

async function voteAsync(type: number, UUID: SegmentUUID, category?: Category): Promise<VoteResponse | undefined> {
    const sponsorIndex = utils.getSponsorIndexFromUUID(sponsorTimes, UUID);

    // Don't vote for preview sponsors
    if (sponsorIndex == -1 || sponsorTimes[sponsorIndex].source !== SponsorSourceType.Server) return Promise.resolve(undefined);

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
                        utils.addHiddenSegment(getVideoID(), segment.UUID, segment.hidden);
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
    // check if all segments are full video
    const onlyFullVideo = sponsorTimesSubmitting.every((segment) => segment.actionType === ActionType.Full);
    // Block if submitting on a running livestream or premiere
    if (!onlyFullVideo && (getIsLivePremiere() || isVisible(document.querySelector(".ytp-live-badge")))) {
        alert(chrome.i18n.getMessage("liveOrPremiere"));
        return;
    }

    // Add loading animation
    playerButtons.submit.image.src = chrome.extension.getURL("icons/PlayerUploadIconSponsorBlocker.svg");
    const stopAnimation = AnimationUtils.applyLoadingAnimation(playerButtons.submit.button, 1, () => updateEditButtonsOnPlayer());

    //check if a sponsor exceeds the duration of the video
    for (let i = 0; i < sponsorTimesSubmitting.length; i++) {
        if (sponsorTimesSubmitting[i].segment[1] > getVideo().duration) {
            sponsorTimesSubmitting[i].segment[1] = getVideo().duration;
        }
    }

    //update sponsorTimes
    Config.config.unsubmittedSegments[getVideoID()] = sponsorTimesSubmitting;
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
        videoID: getVideoID(),
        userID: Config.config.userID,
        segments: sponsorTimesSubmitting,
        videoDuration: getVideo()?.duration,
        userAgent: `${chrome.runtime.id}/v${chrome.runtime.getManifest().version}`
    });

    if (response.status === 200) {
        stopAnimation();

        // Remove segments from storage since they've already been submitted
        delete Config.config.unsubmittedSegments[getVideoID()];
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
        sponsorTimes = (sponsorTimes || []).concat(newSegments).sort((a, b) => a.segment[0] - b.segment[0]);

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
            let timeMessage = getFormattedTime(sponsorTimes[i].segment[s]);
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

function updateActiveSegment(currentTime: number): void {
    const activeSegments = previewBar?.updateChapterText(sponsorTimes, sponsorTimesSubmitting, currentTime);
    chrome.runtime.sendMessage({
        message: "time",
        time: currentTime
    });

    const chapterSegments = activeSegments?.filter((segment) => segment.actionType === ActionType.Chapter);
    if (chapterSegments?.length > 0) {
        sendTelemetryAndCount(chapterSegments, 0, true);
    }
}

function nextChapter(): void {
    const chapters = previewBar.unfilteredChapterGroups?.filter((time) => [ActionType.Chapter, null].includes(time.actionType));
    if (!chapters || chapters.length <= 0) return;

    lastNextChapterKeybind.time = getVideo().currentTime;
    lastNextChapterKeybind.date = Date.now();

    const nextChapter = chapters.findIndex((time) => time.segment[0] > getVideo().currentTime);
    if (nextChapter !== -1) {
        getVideo().currentTime = chapters[nextChapter].segment[0];
    } else {
        getVideo().currentTime = getVideo().duration;
    }
}

function previousChapter(): void {
    if (Date.now() - lastNextChapterKeybind.date < 3000) {
        getVideo().currentTime = lastNextChapterKeybind.time;
        lastNextChapterKeybind.date = 0;
        return;
    }

    const chapters = previewBar.unfilteredChapterGroups?.filter((time) => [ActionType.Chapter, null].includes(time.actionType));
    if (!chapters || chapters.length <= 0) {
        getVideo().currentTime = 0;
        return;
    }

    // subtract 5 seconds to allow skipping back to the previous chapter if close to start of
    // the current one
    const nextChapter = chapters.findIndex((time) => time.segment[0] > getVideo().currentTime - Math.min(5, time.segment[1] - time.segment[0]));
    const previousChapter = nextChapter !== -1 ? (nextChapter - 1) : (chapters.length - 1);
    if (previousChapter !== -1) {
        getVideo().currentTime = chapters[previousChapter].segment[0];
    } else {
        getVideo().currentTime = 0;
    }
}

function addHotkeyListener(): void {
    document.addEventListener("keydown", hotkeyListener);

    document.addEventListener("DOMContentLoaded", () => {
        // Allow us to stop propagation to YouTube by being deeper
        document.removeEventListener("keydown", hotkeyListener);
        document.body.addEventListener("keydown", hotkeyListener);
    });
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
    const nextChapterKey = Config.config.nextChapterKeybind;
    const previousChapterKey = Config.config.previousChapterKeybind;

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
    } else if (keybindEquals(key, nextChapterKey)) {
        if (sponsorTimes.length > 0) e.stopPropagation();
        nextChapter();
        return;
    } else if (keybindEquals(key, previousChapterKey)) {
        if (sponsorTimes.length > 0) e.stopPropagation();
        previousChapter();
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
    const wasAdPlaying = getIsAdPlaying();
    setIsAdPlaying(document.getElementsByClassName('ad-showing').length > 0);
    if(wasAdPlaying != getIsAdPlaying()) {
        updatePreviewBar();
        updateVisibilityOfPlayerControlsButton();
    }
}

function showTimeWithoutSkips(skippedDuration: number): void {
    if (isOnInvidious()) return;

    if (isNaN(skippedDuration) || skippedDuration < 0) {
        skippedDuration = 0;
    }

    // YouTube player time display
    const displayClass = isOnMobileYouTube() ? "ytm-time-display" : "ytp-time-display.notranslate"
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

    const durationAfterSkips = getFormattedTime(getVideo()?.duration - skippedDuration);

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
                        UUID: generateUserID() as SegmentUUID,
                        category: segment.category ? segment.category : Config.config.defaultCategory,
                        actionType: segment.actionType ? segment.actionType : ActionType.Skip,
                        description: segment.description ?? "",
                        source: SponsorSourceType.Local
                    });

                    pushed = true;
                }
            }
        }
    }

    if (pushed) {
        Config.config.unsubmittedSegments[getVideoID()] = sponsorTimesSubmitting;
        Config.forceSyncUpdate("unsubmittedSegments");
    }
}

// Generate and inject a stylesheet that creates CSS variables with configured category colors
function setCategoryColorCSSVariables() {
    let styleContainer = document.getElementById("sbCategoryColorStyle");
    if (!styleContainer) {
        styleContainer = document.createElement("style");
        styleContainer.id = "sbCategoryColorStyle";
        document.head.appendChild(styleContainer)
    }

    let css = ":root {"
    for (const [category, config] of Object.entries(Config.config.barTypes)) {
        css += `--sb-category-${category}: ${config.color};`;
        css += `--darkreader-bg--sb-category-${category}: ${config.color};`;

        const luminance = GenericUtils.getLuminance(config.color);
        css += `--sb-category-text-${category}: ${luminance > 128 ? "black" : "white"};`;
        css += `--darkreader-text--sb-category-text-${category}: ${luminance > 128 ? "black" : "white"};`;
    }
    css += "}";

    styleContainer.innerText = css;
}
