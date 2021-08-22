import Config from "./config";
import { SponsorTime, CategorySkipOption, VideoID, SponsorHideType, VideoInfo, StorageChangesObject, CategoryActionType, ChannelIDInfo, ChannelIDStatus, SponsorSourceType, SegmentUUID, Category, SkipToTimeParams, ToggleSkippable } from "./types";

import { ContentContainer } from "./types";
import Utils from "./utils";
const utils = new Utils();

import runThePopup from "./popup";

import PreviewBar, {PreviewBarSegment} from "./js-components/previewBar";
import SkipNotice from "./render/SkipNotice";
import SkipNoticeComponent from "./components/SkipNoticeComponent";
import SubmissionNotice from "./render/SubmissionNotice";
import { Message, MessageResponse } from "./messageTypes";
import * as Chat from "./js-components/chat";
import { getCategoryActionType } from "./utils/categoryUtils";
import { SkipButtonControlBar } from "./js-components/skipButtonControlBar";
import { Tooltip } from "./render/Tooltip";

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
//the channel this video is about
let channelIDInfo: ChannelIDInfo;

// Skips are scheduled to ensure precision.
// Skips are rescheduled every seeking event.
// Skips are canceled every seeking event
let currentSkipSchedule: NodeJS.Timeout = null;

/** Has the sponsor been skipped */
let sponsorSkipped: boolean[] = [];

//the video
let video: HTMLVideoElement;
let videoMutationObserver: MutationObserver = null;
// List of videos that have had event listeners added to them
const videosWithEventListeners: HTMLVideoElement[] = [];
const controlsWithEventListeners: HTMLElement[] = []

let onInvidious;
let onMobileYouTube;

//the video id of the last preview bar update
let lastPreviewBarUpdate;

// Is the video currently being switched
let switchingVideos = null;

// Made true every videoID change
let firstEvent = false;

// Used by the play and playing listeners to make sure two aren't
// called at the same time
let lastCheckTime = 0;
let lastCheckVideoTime = -1;

//is this channel whitelised from getting sponsors skipped
let channelWhitelisted = false;

// create preview bar
let previewBar: PreviewBar = null;
let skipButtonControlBar: SkipButtonControlBar = null;

/** Element containing the player controls on the YouTube player. */
let controls: HTMLElement | null = null;

/** Contains buttons created by `createButton()`. */
const playerButtons: Record<string, {button: HTMLButtonElement, image: HTMLImageElement, setupListener: boolean}> = {};

// Direct Links after the config is loaded
utils.wait(() => Config.config !== null, 1000, 1).then(() => videoIDChange(getYouTubeVideoID(document.URL)));
addHotkeyListener();

//the amount of times the sponsor lookup has retried
//this only happens if there is an error
let sponsorLookupRetries = 0;

/** Segments created by the user which have not yet been submitted. */
let sponsorTimesSubmitting: SponsorTime[] = [];

//becomes true when isInfoFound is called
//this is used to close the popup on YouTube when the other popup opens
let popupInitialised = false;

let submissionNotice: SubmissionNotice = null;

// If there is an advert playing (or about to be played), this is true
let isAdPlaying = false;

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
    getRealCurrentTime: getRealCurrentTime
});

// value determining when to count segment as skipped and send telemetry to server (percent based)
const manualSkipPercentCount = 0.5;

//get messages from the background script and the popup
chrome.runtime.onMessage.addListener(messageListener);
  
function messageListener(request: Message, sender: unknown, sendResponse: (response: MessageResponse) => void): void | boolean {
    //messages from popup script
    switch(request.message){
        case "update":
            videoIDChange(getYouTubeVideoID(document.URL));
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
                sponsorTimes: sponsorTimes
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
            sponsorsLookup(sponsorVideoID);

            break;
        case "submitTimes":
            submitSponsorTimes();
            break;
        case "refreshSegments":
            sponsorsLookup(sponsorVideoID, false).then(() => sendResponse({
                found: sponsorDataFound,
                sponsorTimes: sponsorTimes
            }));

            return true;
    }
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
        }
    }
}

if (!Config.configListeners.includes(contentConfigUpdateListener)) {
    Config.configListeners.push(contentConfigUpdateListener);
}

function resetValues() {
    lastCheckTime = 0;
    lastCheckVideoTime = -1;

    //reset sponsor times
    sponsorTimes = null;
    sponsorLookupRetries = 0;
    sponsorSkipped = [];

    videoInfo = null;
    channelWhitelisted = false;
    channelIDInfo = {
        status: ChannelIDStatus.Fetching,
        id: null
    };

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
    }

    firstEvent = true;

    // Reset advert playing flag
    isAdPlaying = false;

    for (let i = 0; i < skipNotices.length; i++) {
        skipNotices.pop().close();
    }

    skipButtonControlBar?.disable();
}

async function videoIDChange(id) {
    //if the id has not changed return
    if (sponsorVideoID === id) return;

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

    // Get new video info
    // getVideoInfo(); // Seems to have been replaced

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

    const progressElementSelectors = [
        // For mobile YouTube
        ".progress-bar-background",
        // For YouTube
        ".ytp-progress-bar-container",
        ".no-model.cue-range-markers",
        // For Invidious/VideoJS
        ".vjs-progress-holder"
    ];

    for (const selector of progressElementSelectors) {
        const el = document.querySelector<HTMLElement>(selector);

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

function cancelSponsorSchedule(): void {
    if (currentSkipSchedule !== null) {
        clearTimeout(currentSkipSchedule);

        currentSkipSchedule = null;
    }
}

/**
 * 
 * @param currentTime Optional if you don't want to use the actual current time
 */
function startSponsorSchedule(includeIntersectingSegments = false, currentTime?: number, includeNonIntersectingSegments = true): void {
    cancelSponsorSchedule();

    // Don't skip if advert playing and reset last checked time
    if (isAdPlaying) {
        // Reset lastCheckVideoTime
        lastCheckVideoTime = -1;
        lastCheckTime = 0;

        return;
    }

    if (!video || video.paused) return;

    if (Config.config.disableSkipping || channelWhitelisted || (channelIDInfo.status === ChannelIDStatus.Fetching && Config.config.forceChannelCheck)){
        return;
    }

    if (incorrectVideoCheck()) return;

    if (currentTime === undefined || currentTime === null) currentTime = video.currentTime;

    const skipInfo = getNextSkipIndex(currentTime, includeIntersectingSegments, includeNonIntersectingSegments);

    if (skipInfo.index === -1) return;

    const currentSkip = skipInfo.array[skipInfo.index];
    const skipTime: number[] = [currentSkip.segment[0], skipInfo.array[skipInfo.endIndex].segment[1]];
    const timeUntilSponsor = skipTime[0] - currentTime;
    const videoID = sponsorVideoID;

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

    // Don't skip if this category should not be skipped
    if (!shouldSkip(currentSkip) && skipInfo.array !== sponsorTimesSubmitting) return;

    const skippingFunction = () => {
        let forcedSkipTime: number = null;
        let forcedIncludeIntersectingSegments = false;
        let forcedIncludeNonIntersectingSegments = true;

        if (incorrectVideoCheck(videoID, currentSkip)) return;

        if (video.currentTime >= skipTime[0] && video.currentTime < skipTime[1]) {
            skipToTime({
                v: video, 
                skipTime, 
                skippingSegments, 
                openNotice: skipInfo.openNotice
            });

            if (utils.getCategorySelection(currentSkip.category)?.option === CategorySkipOption.ManualSkip) {
                forcedSkipTime = skipTime[0] + 0.001;
            } else {
                forcedSkipTime = skipTime[1];
                forcedIncludeIntersectingSegments = true;
                forcedIncludeNonIntersectingSegments = false;
            }
        }

        startSponsorSchedule(forcedIncludeIntersectingSegments, forcedSkipTime, forcedIncludeNonIntersectingSegments);
    };

    if (timeUntilSponsor <= 0) {
        skippingFunction();
    } else {
        currentSkipSchedule = setTimeout(skippingFunction, timeUntilSponsor * 1000 * (1 / video.playbackRate));
    }
}

/**
 * This makes sure the videoID is still correct and if the sponsorTime is included
 */
function incorrectVideoCheck(videoID?: string, sponsorTime?: SponsorTime): boolean {
    const currentVideoID = getYouTubeVideoID(document.URL);
    if (currentVideoID !== (videoID || sponsorVideoID) || (sponsorTime && (!sponsorTimes || !sponsorTimes.includes(sponsorTime)) && !sponsorTimesSubmitting.includes(sponsorTime))) {
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
    const newVideo = document.querySelector('video');
    if (newVideo && newVideo !== video) {
        video = newVideo;

        if (!videosWithEventListeners.includes(video)) {
            videosWithEventListeners.push(video);

            setupVideoListeners();
            setupSkipButtonControlBar();
        }
    }
}

function setupVideoListeners() {
    //wait until it is loaded
    video.addEventListener('durationchange', durationChangeListener);

    if (!Config.config.disableSkipping) {
        switchingVideos = false;

        video.addEventListener('play', () => {
            switchingVideos = false;
    
            // If it is not the first event, then the only way to get to 0 is if there is a seek event
            // This check makes sure that changing the video resolution doesn't cause the extension to think it
            // gone back to the begining
            if (!firstEvent && video.currentTime === 0) return;
            firstEvent = false;
    
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
    
                startSponsorSchedule();
            }

            if (!Config.config.dontShowNotice) {
                const currentPoiSegment = sponsorTimes.find((segment) => 
                        getCategoryActionType(segment.category) === CategoryActionType.POI &&
                        video.currentTime - segment.segment[0] > 0 &&
                        video.currentTime - segment.segment[0] < video.duration * 0.006); // Approximate size on preview bar
                if (currentPoiSegment && !skipNotices.some((notice) => notice.segments.some((s) => s.UUID === currentPoiSegment.UUID))) {
                    skipToTime({
                        v: video, 
                        skipTime: currentPoiSegment.segment, 
                        skippingSegments: [currentPoiSegment], 
                        openNotice: true, 
                        forceAutoSkip: true
                    });
                }
            }
        });
        video.addEventListener('ratechange', () => startSponsorSchedule());
        // Used by videospeed extension (https://github.com/igrigorik/videospeed/pull/740)
        video.addEventListener('videoSpeed_ratechange', () => startSponsorSchedule());
        video.addEventListener('pause', () => {
            // Reset lastCheckVideoTime
            lastCheckVideoTime = -1;
            lastCheckTime = 0;
    
            cancelSponsorSchedule();
        });
    
        startSponsorSchedule();
    }
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
            })
        });
    }

    skipButtonControlBar.attachToPage();
}

async function sponsorsLookup(id: string, keepOldSubmissions = true) {
    if (!video) refreshVideoAttachments();
    //there is still no video here
    if (!video) {
        setTimeout(() => sponsorsLookup(id), 100);
        return;
    }

    setupVideoMutationListener();

    //check database for sponsor times
    //made true once a setTimeout has been created to try again after a server error
    let recheckStarted = false;
    // Create categories list
    const categories: string[] = [];
    for (const categorySelection of Config.config.categorySelections) {
        categories.push(categorySelection.name);
    }

    // Check for hashPrefix setting
    const hashPrefix = (await utils.getHash(id, 1)).substr(0, 4);
    const response = await utils.asyncRequestToServer('GET', "/api/skipSegments/" + hashPrefix, {
        categories,
        userAgent: `${chrome.runtime.id}`
    });

    if (response?.ok) {
        const recievedSegments: SponsorTime[] = JSON.parse(response.responseText)
                    ?.filter((video) => video.videoID === id)
                    ?.map((video) => video.segments)[0];
        if (!recievedSegments || !recievedSegments.length) { 
            // return if no video found
            retryFetch();
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
            for (let i = 0; i < sponsorTimes.length; i++) {
                if (sponsorTimes[i].segment[1] - sponsorTimes[i].segment[0] < Config.config.minDuration) {
                    sponsorTimes[i].hidden = SponsorHideType.MinimumDuration;
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

        startSkipScheduleCheckingForStartSponsors();

        //update the preview bar
        //leave the type blank for now until categories are added
        if (lastPreviewBarUpdate == id || (lastPreviewBarUpdate == null && !isNaN(video.duration))) {
            //set it now
            //otherwise the listener can handle it
            updatePreviewBar();
        }

        sponsorLookupRetries = 0;
    } else if (response?.status === 404) {
        retryFetch();
    } else if (sponsorLookupRetries < 15 && !recheckStarted) {
        recheckStarted = true;

        //TODO lower when server becomes better (back to 1 second)
        //some error occurred, try again in a second
        setTimeout(() => {
            if (sponsorVideoID && sponsorTimes?.length === 0) {
                sponsorsLookup(sponsorVideoID);
            }
        }, 5000 + Math.random() * 15000 + 5000 * sponsorLookupRetries);

        sponsorLookupRetries++;
    }
}

function retryFetch(): void {
    if (!Config.config.refetchWhenNotFound) return;

    sponsorDataFound = false;

    setTimeout(() => {
        if (sponsorVideoID && sponsorTimes?.length === 0) {
            sponsorsLookup(sponsorVideoID);
        }
    }, 10000 + Math.random() * 30000);

    sponsorLookupRetries = 0;
}

/**
 * Only should be used when it is okay to skip a sponsor when in the middle of it 
 * 
 * Ex. When segments are first loaded
 */
function startSkipScheduleCheckingForStartSponsors() {
    if (!switchingVideos) {
        // See if there are any starting sponsors
        let startingSegmentTime = -1;
        let startingSegment: SponsorTime = null;
        for (const time of sponsorTimes) {
            if (time.segment[0] <= video.currentTime && time.segment[0] > startingSegmentTime && time.segment[1] > video.currentTime 
                    && getCategoryActionType(time.category) === CategoryActionType.Skippable) {
                        startingSegmentTime = time.segment[0];
                        startingSegment = time;
                break;
            }
        }
        if (startingSegmentTime === -1) {
            for (const time of sponsorTimesSubmitting) {
                if (time.segment[0] <= video.currentTime && time.segment[0] > startingSegmentTime && time.segment[1] > video.currentTime 
                        && getCategoryActionType(time.category) === CategoryActionType.Skippable) {
                            startingSegmentTime = time.segment[0];
                            startingSegment = time;
                    break;
                }
            }
        }

        // For highlight category
        const poiSegments = sponsorTimes
            .filter((time) => time.segment[1] > video.currentTime && getCategoryActionType(time.category) === CategoryActionType.POI)
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

        if (startingSegmentTime !== -1) {
            startSponsorSchedule(undefined, startingSegmentTime);
        } else {
            startSponsorSchedule();
        }
    }
}

/**
 * Get the video info for the current tab from YouTube
 * 
 * TODO: Replace
 */
async function getVideoInfo(): Promise<void> {
    const result = await utils.asyncRequestToCustomServer("GET", "https://www.youtube.com/get_video_info?video_id=" + sponsorVideoID + "&html5=1&c=TVHTML5&cver=7.20190319");

    if (result.ok) {
        const decodedData = decodeURIComponent(result.responseText).match(/player_response=([^&]*)/)[1];
        if (!decodedData) {
            console.error("[SB] Failed at getting video info from YouTube.");
            console.error("[SB] Data returned from YouTube: " + result.responseText);
            return;
        }

        videoInfo = JSON.parse(decodedData);
    }
}

function getYouTubeVideoID(url: string): string | boolean {
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
    if (Config.config && Config.config.invidiousInstances.includes(urlObject.host)) {
        onInvidious = true;
    } else if (urlObject.host === "m.youtube.com") {
        onMobileYouTube = true;
    } else if (!["m.youtube.com", "www.youtube.com", "www.youtube-nocookie.com", "music.youtube.com"].includes(urlObject.host)) {
        if (!Config.config) {
            // Call this later, in case this is an Invidious tab
            utils.wait(() => Config.config !== null).then(() => videoIDChange(getYouTubeVideoID(url)));
        }

        return false
    }

    //Get ID from searchParam
    if (urlObject.searchParams.has("v") && ["/watch", "/watch/"].includes(urlObject.pathname) || urlObject.pathname.startsWith("/tv/watch")) {
        const id = urlObject.searchParams.get("v");
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
                showLarger: getCategoryActionType(segment.category) === CategoryActionType.POI
            });
        });
    }

    sponsorTimesSubmitting.forEach((segment) => {
        previewBarSegments.push({
            segment: segment.segment as [number, number],
            category: segment.category,
            unsubmitted: true,
            showLarger: getCategoryActionType(segment.category) === CategoryActionType.POI
        });
    });

    previewBar.set(previewBarSegments, video.duration)

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

    const getChannelID = () => videoInfo?.videoDetails?.channelId
        ?? document.querySelector(".ytd-channel-name a")?.getAttribute("href")?.replace(/\/.+\//, "") // YouTube
        ?? document.querySelector(".ytp-title-channel-logo")?.getAttribute("href")?.replace(/https:\/.+\//, "") // YouTube Embed
        ?? document.querySelector("a > .channel-profile")?.parentElement?.getAttribute("href")?.replace(/\/.+\//, ""); // Invidious

    try {
        await utils.wait(() => !!getChannelID(), 6000, 20);

        channelIDInfo = {
            status: ChannelIDStatus.Found,
            id: getChannelID().match(/^\/?([^\s/]+)/)[0]
        }
    } catch (e) {
        channelIDInfo = {
            status: ChannelIDStatus.Failed,
            id: null
        }

        return;
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
        {array: SponsorTime[], index: number, endIndex: number, openNotice: boolean} {

    const sponsorStartTimes = getStartTimes(sponsorTimes, includeIntersectingSegments, includeNonIntersectingSegments);
    const sponsorStartTimesAfterCurrentTime = getStartTimes(sponsorTimes, includeIntersectingSegments, includeNonIntersectingSegments, currentTime, true, true);

    const minSponsorTimeIndex = sponsorStartTimes.indexOf(Math.min(...sponsorStartTimesAfterCurrentTime));
    const endTimeIndex = getLatestEndTimeIndex(sponsorTimes, minSponsorTimeIndex);

    const unsubmittedSponsorStartTimes = getStartTimes(sponsorTimesSubmitting, includeIntersectingSegments, includeNonIntersectingSegments);
    const unsubmittedSponsorStartTimesAfterCurrentTime = getStartTimes(sponsorTimesSubmitting, includeIntersectingSegments, includeNonIntersectingSegments, currentTime, false, false);

    const minUnsubmittedSponsorTimeIndex = unsubmittedSponsorStartTimes.indexOf(Math.min(...unsubmittedSponsorStartTimesAfterCurrentTime));
    const previewEndTimeIndex = getLatestEndTimeIndex(sponsorTimesSubmitting, minUnsubmittedSponsorTimeIndex);

    if ((minUnsubmittedSponsorTimeIndex === -1 && minSponsorTimeIndex !== -1) || 
            sponsorStartTimes[minSponsorTimeIndex] < unsubmittedSponsorStartTimes[minUnsubmittedSponsorTimeIndex]) {
        return {
            array: sponsorTimes,
            index: minSponsorTimeIndex,
            endIndex: endTimeIndex,
            openNotice: true
        };
    } else {
        return {
            array: sponsorTimesSubmitting,
            index: minUnsubmittedSponsorTimeIndex,
            endIndex: previewEndTimeIndex,
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
        shouldAutoSkip(sponsorTimes[index])) return index;

    // Default to the normal endTime
    let latestEndTimeIndex = index;

    for (let i = 0; i < sponsorTimes?.length; i++) {
        const currentSegment = sponsorTimes[i].segment;
        const latestEndTime = sponsorTimes[latestEndTimeIndex].segment[1];

        if (currentSegment[0] <= latestEndTime && currentSegment[1] > latestEndTime 
            && (!hideHiddenSponsors || sponsorTimes[i].hidden === SponsorHideType.Visible)
            && shouldAutoSkip(sponsorTimes[i])) {
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
    minimum?: number, onlySkippableSponsors = false, hideHiddenSponsors = false): number[] {
    if (sponsorTimes === null) return [];

    const startTimes: number[] = [];

    for (let i = 0; i < sponsorTimes?.length; i++) {
        if ((minimum === undefined
                || ((includeNonIntersectingSegments && sponsorTimes[i].segment[0] >= minimum) 
                    || (includeIntersectingSegments && sponsorTimes[i].segment[0] < minimum && sponsorTimes[i].segment[1] > minimum))) 
                && (!onlySkippableSponsors || shouldSkip(sponsorTimes[i]))
                && (!hideHiddenSponsors || sponsorTimes[i].hidden === SponsorHideType.Visible)
                && getCategoryActionType(sponsorTimes[i].category) === CategoryActionType.Skippable) {

            startTimes.push(sponsorTimes[i].segment[0]);
        } 
    }

    return startTimes;
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
        const index = sponsorTimes.indexOf(segment);
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
    // There will only be one submission if it is manual skip
    const autoSkip: boolean = forceAutoSkip || shouldAutoSkip(skippingSegments[0]);

    if ((autoSkip || sponsorTimesSubmitting.includes(skippingSegments[0])) && v.currentTime !== skipTime[1]) {
        // Fix for looped videos not working when skipping to the end #426
        // for some reason you also can't skip to 1 second before the end
        if (v.loop && v.duration > 1 && skipTime[1] >= v.duration - 1) {
            v.currentTime = 0;
        } else {
            v.currentTime = skipTime[1];
        }
    }

    if (!autoSkip 
            && skippingSegments.length === 1 
            && getCategoryActionType(skippingSegments[0].category) === CategoryActionType.POI) {
        skipButtonControlBar.enable(skippingSegments[0], !Config.config.highlightCategoryUpdate ? 15 : 0);

        if (!Config.config.highlightCategoryUpdate) {
            new Tooltip({
                text: chrome.i18n.getMessage("highlightNewFeature"),
                link: "https://blog.ajay.app/highlight-sponsorblock",
                referenceNode: skipButtonControlBar.getElement().parentElement,
                prependElement: skipButtonControlBar.getElement(),
                timeout: 15
            });

            Config.config.highlightCategoryUpdate = true;
        }

        activeSkipKeybindElement?.setShowKeybindHint(false);
        activeSkipKeybindElement = skipButtonControlBar;
    } else {
        if (openNotice) {
            //send out the message saying that a sponsor message was skipped
            if (!Config.config.dontShowNotice || !autoSkip) {
                const newSkipNotice = new SkipNotice(skippingSegments, autoSkip, skipNoticeContentContainer, unskipTime);
                skipNotices.push(newSkipNotice);

                activeSkipKeybindElement?.setShowKeybindHint(false);
                activeSkipKeybindElement = newSkipNotice;
            }
        }
    }

    //send telemetry that a this sponsor was skipped
    if (autoSkip) sendTelemetryAndCount(skippingSegments, skipTime[1] - skipTime[0], true);
}

function unskipSponsorTime(segment: SponsorTime, unskipTime: number = null) {
    //add a tiny bit of time to make sure it is not skipped again
    console.log(unskipTime)
    video.currentTime = unskipTime ?? segment.segment[0] + 0.001;
}

function reskipSponsorTime(segment: SponsorTime) {
    const skippedTime = Math.max(segment.segment[1] - video.currentTime, 0);
    const segmentDuration = segment.segment[1] - segment.segment[0];
    const fullSkip = skippedTime / segmentDuration > manualSkipPercentCount;
    
    video.currentTime = segment.segment[1];
    sendTelemetryAndCount([segment], skippedTime, fullSkip);
    startSponsorSchedule(true, segment.segment[1], false);
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
            (Config.config.autoSkipOnMusicVideos && sponsorTimes.some((s) => s.category === "music_offtopic"));
}

function shouldSkip(segment: SponsorTime): boolean {
    return utils.getCategorySelection(segment.category)?.option !== CategorySkipOption.ShowOverlay ||
            (Config.config.autoSkipOnMusicVideos && sponsorTimes.some((s) => s.category === "music_offtopic"));
}

function getControls(): HTMLElement | false {
    const controlsSelectors = [
        // YouTube
        ".ytp-right-controls",
        // Mobile YouTube
        ".player-controls-top",
        // Invidious/videojs video element's controls element
        ".vjs-control-bar",
    ];

    for (const controlsSelector of controlsSelectors) {
        const controls = document.querySelectorAll(controlsSelector);

        if (controls && controls.length > 0) {
            return <HTMLElement> controls[controls.length - 1];
        }
    }

    return false;
}

/** Creates any missing buttons on the YouTube player if possible. */
async function createButtons(): Promise<void> {
    if (onMobileYouTube) return;

    controls = await utils.wait(getControls).catch();

    // Add button if does not already exist in html
    createButton("startSegment", "sponsorStart", () => closeInfoMenuAnd(() => startOrEndTimingNewSegment()), "PlayerStartIconSponsorBlocker.svg");
    createButton("cancelSegment", "sponsorCancel", () => closeInfoMenuAnd(() => cancelCreatingSegment()), "PlayerCancelSegmentIconSponsorBlocker.svg");
    createButton("delete", "clearTimes", () => closeInfoMenuAnd(() => clearSponsorTimes()), "PlayerDeleteIconSponsorBlocker.svg");
    createButton("submit", "SubmitTimes", submitSponsorTimes, "PlayerUploadIconSponsorBlocker.svg");
    createButton("info", "openPopup", openInfoMenu, "PlayerInfoIconSponsorBlocker.svg");

    const controlsContainer = getControls();
    if (Config.config.autoHideInfoButton && !onInvidious && controlsContainer 
            && playerButtons["info"]?.button && !controlsWithEventListeners.includes(controlsContainer)) {
        controlsWithEventListeners.push(controlsContainer);
        playerButtons["info"].button.classList.add("hidden");

        controlsContainer.addEventListener("mouseenter", () => {
            playerButtons["info"].button.classList.remove("hidden");
        });

        controlsContainer.addEventListener("mouseleave", () => {
            playerButtons["info"].button.classList.add("hidden");
        });
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
        return video.duration;
    } else {
        return video.currentTime;
    }
}

function startOrEndTimingNewSegment() {
    if (!isSegmentCreationInProgress()) {
        sponsorTimesSubmitting.push({
            segment: [getRealCurrentTime()],
            UUID: null,
            category: Config.config.defaultCategory,
            source: SponsorSourceType.Local
        });
    } else {
        // Finish creating the new segment
        const existingSegment = getIncompleteSegment();
        const existingTime = existingSegment.segment[0];
        const currentTime = getRealCurrentTime();
            
        // Swap timestamps if the user put the segment end before the start
        existingSegment.segment = [Math.min(existingTime, currentTime), Math.max(existingTime, currentTime)];
    }

    // Save the newly created segment
    Config.config.segmentTimes.set(sponsorVideoID, sponsorTimesSubmitting);

    // Make sure they know if someone has already submitted something it while they were watching
    sponsorsLookup(sponsorVideoID);

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
        Config.config.segmentTimes.set(sponsorVideoID, sponsorTimesSubmitting);

        if (sponsorTimesSubmitting.length <= 0) resetSponsorSubmissionNotice();
    }

    updateEditButtonsOnPlayer();
    updateSponsorTimesSubmitting(false);
}

function updateSponsorTimesSubmitting(getFromConfig = true) {
    const segmentTimes = Config.config.segmentTimes.get(sponsorVideoID);

    //see if this data should be saved in the sponsorTimesSubmitting variable
    if (getFromConfig && segmentTimes != undefined) {
        sponsorTimesSubmitting = [];

        for (const segmentTime of segmentTimes) {
            sponsorTimesSubmitting.push({
                segment: segmentTime.segment,
                UUID: segmentTime.UUID,
                category: segmentTime.category,
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
}

function openInfoMenu() {
    if (document.getElementById("sponsorBlockPopupContainer") != null) {
        //it's already added
        return;
    }

    popupInitialised = false;

    //hide info button
    if (playerButtons.info) playerButtons.info.button.style.display = "none";

    sendRequestToCustomServer('GET', chrome.extension.getURL("popup.html"), function(xmlhttp) {
        if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
            const popup = document.createElement("div");
            popup.id = "sponsorBlockPopupContainer";

            let htmlData = xmlhttp.responseText;
            // Hack to replace head data (title, favicon)
            htmlData = htmlData.replace(/<head>[\S\s]*<\/head>/gi, "");
            // Hack to replace body and html tag with div
            htmlData = htmlData.replace(/<body/gi, "<div");
            htmlData = htmlData.replace(/<\/body/gi, "</div");
            htmlData = htmlData.replace(/<html/gi, "<div");
            htmlData = htmlData.replace(/<\/html/gi, "</div");

            popup.innerHTML = htmlData;

            //close button
            const closeButton = document.createElement("div");
            closeButton.innerText = chrome.i18n.getMessage("closePopup");
            closeButton.classList.add("smallLink");
            closeButton.setAttribute("align", "center");
            closeButton.addEventListener("click", closeInfoMenu);
            // Theme based color
            closeButton.style.color = "var(--yt-spec-text-primary)";

            //add the close button
            popup.prepend(closeButton);
    
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

            //make the logo source not 404
            //query selector must be used since getElementByID doesn't work on a node and this isn't added to the document yet
            const logo = <HTMLImageElement> popup.querySelector("#sponsorBlockPopupLogo");
            const settings = <HTMLImageElement> popup.querySelector("#sbPopupIconSettings");
            const edit = <HTMLImageElement> popup.querySelector("#sbPopupIconEdit");
            const check = <HTMLImageElement> popup.querySelector("#sbPopupIconCheck");
            const refreshSegments = <HTMLImageElement> popup.querySelector("#refreshSegments");
            logo.src = chrome.extension.getURL("icons/IconSponsorBlocker256px.png");
            settings.src = chrome.extension.getURL("icons/settings.svg");
            edit.src = chrome.extension.getURL("icons/pencil.svg");
            check.src = chrome.extension.getURL("icons/check.svg");
            refreshSegments.src = chrome.extension.getURL("icons/refresh.svg");

            parentNode.insertBefore(popup, parentNode.firstChild);

            //run the popup init script
            runThePopup(messageListener);
        }
    });
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

/**
 * The content script currently has no way to notify the info menu of changes. As a workaround we close it, thus making it query the new information when reopened.
 *
 * This function and all its uses should be removed when this issue is fixed.
 * */
function closeInfoMenuAnd<T>(func: () => T): T {
    closeInfoMenu();

    return func();
}

function clearSponsorTimes() {
    const currentVideoID = sponsorVideoID;

    const sponsorTimes = Config.config.segmentTimes.get(currentVideoID);

    if (sponsorTimes != undefined && sponsorTimes.length > 0) {
        const confirmMessage = chrome.i18n.getMessage("clearThis") + getSegmentsMessage(sponsorTimes)
                                + "\n" + chrome.i18n.getMessage("confirmMSG")
        if(!confirm(confirmMessage)) return;

        resetSponsorSubmissionNotice();

        //clear the sponsor times
        Config.config.segmentTimes.delete(currentVideoID);

        //clear sponsor times submitting
        sponsorTimesSubmitting = [];

        updatePreviewBar();
        updateEditButtonsOnPlayer();
    }
}

//if skipNotice is null, it will not affect the UI
function vote(type: number, UUID: SegmentUUID, category?: Category, skipNotice?: SkipNoticeComponent) {
    if (skipNotice !== null && skipNotice !== undefined) {
        //add loading info
        skipNotice.addVoteButtonInfo.bind(skipNotice)(chrome.i18n.getMessage("Loading"))
        skipNotice.setNoticeInfoMessage.bind(skipNotice)();
    }

    const sponsorIndex = utils.getSponsorIndexFromUUID(sponsorTimes, UUID);

    // Don't vote for preview sponsors
    if (sponsorIndex == -1 || sponsorTimes[sponsorIndex].UUID === null) return;

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
 
    chrome.runtime.sendMessage({
        message: "submitVote",
        type: type,
        UUID: UUID,
        category: category
    }, function(response) {
        if (response != undefined) {
            //see if it was a success or failure
            if (skipNotice != null) {
                if (response.successType == 1 || (response.successType == -1 && response.statusCode == 429)) {
                    //success (treat rate limits as a success)
                    skipNotice.afterVote.bind(skipNotice)(utils.getSponsorTimeFromUUID(sponsorTimes, UUID), type, category);
                } else if (response.successType == -1) {
                    if (response.statusCode === 403 && response.responseText.startsWith("Vote rejected due to a warning from a moderator.")) {
                        skipNotice.setNoticeInfoMessageWithOnClick.bind(skipNotice)(() => {
                            Chat.openWarningChat(response.responseText);
                            skipNotice.closeListener.call(skipNotice);
                        }, chrome.i18n.getMessage("voteRejectedWarning"));
                    } else {
                        skipNotice.setNoticeInfoMessage.bind(skipNotice)(utils.getErrorMessage(response.statusCode, response.responseText))
                    }
                    
                    skipNotice.resetVoteButtonInfo.bind(skipNotice)();
                }
            }
        }
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
function resetSponsorSubmissionNotice() {
    submissionNotice?.close();
    submissionNotice = null;
}

function submitSponsorTimes() {
    if (submissionNotice !== null) return;

    if (sponsorTimesSubmitting !== undefined && sponsorTimesSubmitting.length > 0) {
        submissionNotice = new SubmissionNotice(skipNoticeContentContainer, sendSubmitMessage);
    }

}

//send the message to the background js
//called after all the checks have been made that it's okay to do so
async function sendSubmitMessage() {
    // Add loading animation
    playerButtons.submit.image.src = chrome.extension.getURL("icons/PlayerUploadIconSponsorBlocker.svg");
    const stopAnimation = utils.applyLoadingAnimation(playerButtons.submit.button, 1, () => updateEditButtonsOnPlayer());

    //check if a sponsor exceeds the duration of the video
    for (let i = 0; i < sponsorTimesSubmitting.length; i++) {
        if (sponsorTimesSubmitting[i].segment[1] > video.duration) {
            sponsorTimesSubmitting[i].segment[1] = video.duration;
        }
    }

    //update sponsorTimes
    Config.config.segmentTimes.set(sponsorVideoID, sponsorTimesSubmitting);

    // Check to see if any of the submissions are below the minimum duration set
    if (Config.config.minDuration > 0) {
        for (let i = 0; i < sponsorTimesSubmitting.length; i++) {
            if (sponsorTimesSubmitting[i].segment[1] - sponsorTimesSubmitting[i].segment[0] < Config.config.minDuration) {
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
        Config.config.segmentTimes.delete(sponsorVideoID);

        const newSegments = sponsorTimesSubmitting;
        try {
            const recievedNewSegments = JSON.parse(response.responseText);
            if (recievedNewSegments?.length === newSegments.length) {
                for (let i = 0; i < recievedNewSegments.length; i++) {
                    newSegments[i].UUID = recievedNewSegments[i].UUID;
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
    } else {
        // Show that the upload failed
        playerButtons.submit.button.style.animation = "unset";
        playerButtons.submit.image.src = chrome.extension.getURL("icons/PlayerUploadFailedIconSponsorBlocker.svg");

        if (response.status === 403 && response.responseText.startsWith("Submission rejected due to a warning from a moderator.")) {
            Chat.openWarningChat(response.responseText);
        } else {
            alert(utils.getErrorMessage(response.status, response.responseText));
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

function addHotkeyListener(): void {
    document.addEventListener("keydown", hotkeyListener);
}

function hotkeyListener(e: KeyboardEvent): void {
    if (["textarea", "input"].includes(document.activeElement?.tagName?.toLowerCase())
        || document.activeElement?.id?.toLowerCase()?.includes("editable")) return;

    const key = e.key;

    const skipKey = Config.config.skipKeybind;
    const startSponsorKey = Config.config.startSponsorKeybind;
    const submitKey = Config.config.submitKeybind;

    switch (key) {
        case skipKey:
            if (activeSkipKeybindElement) {
                activeSkipKeybindElement.toggleSkip.call(activeSkipKeybindElement);
            }
            break; 
        case startSponsorKey:
            startOrEndTimingNewSegment();
            break;
        case submitKey:
            submitSponsorTimes();
            break;
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

function sendRequestToCustomServer(type, fullAddress, callback) {
    const xmlhttp = new XMLHttpRequest();

    xmlhttp.open(type, fullAddress, true);

    if (callback != undefined) {
        xmlhttp.onreadystatechange = function () {
            callback(xmlhttp, false);
        };
  
        xmlhttp.onerror = function() {
            callback(xmlhttp, true);
        };
    }

    //submit this request
    xmlhttp.send();
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
    if (onMobileYouTube || onInvidious) return;

    if (isNaN(skippedDuration) || skippedDuration < 0) {
        skippedDuration = 0;
    }

    // YouTube player time display
    const display = document.querySelector(".ytp-time-display.notranslate");
    if (!display) return;

    const durationID = "sponsorBlockDurationAfterSkips";
    let duration = document.getElementById(durationID);

    // Create span if needed
    if (duration === null) {
        duration = document.createElement('span');
        duration.id = durationID;
        duration.classList.add("ytp-time-duration");

        display.appendChild(duration);
    }
    
    const durationAfterSkips = utils.getFormattedTime(video.duration - skippedDuration)

    duration.innerText = (durationAfterSkips == null || skippedDuration <= 0) ? "" : " (" + durationAfterSkips + ")";
}
