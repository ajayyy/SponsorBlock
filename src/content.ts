import Config from "./config";

import { SponsorTime, CategorySkipOption, VideoID, SponsorHideType, FetchResponse, VideoInfo, StorageChangesObject } from "./types";

import { ContentContainer } from "./types";
import Utils from "./utils";
const utils = new Utils();

import runThePopup from "./popup";

import PreviewBar, {PreviewBarSegment} from "./js-components/previewBar";
import SkipNotice from "./render/SkipNotice";
import SkipNoticeComponent from "./components/SkipNoticeComponent";
import SubmissionNotice from "./render/SubmissionNotice";
import { Message, MessageResponse } from "./messageTypes";

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

// JSON video info 
let videoInfo: VideoInfo = null;
//the channel this video is about
let channelID: string;

// Skips are scheduled to ensure precision.
// Skips are rescheduled every seeking event.
// Skips are canceled every seeking event
let currentSkipSchedule: NodeJS.Timeout = null;
let seekListenerSetUp = false

/** Has the sponsor been skipped */
let sponsorSkipped: boolean[] = [];

//the video
let video: HTMLVideoElement;
// List of videos that have had event listeners added to them
const videoRootsWithEventListeners: HTMLDivElement[] = [];

let onInvidious;
let onMobileYouTube;

//the video id of the last preview bar update
let lastPreviewBarUpdate;

//whether the duration listener listening for the duration changes of the video has been setup yet
let durationListenerSetUp = false;

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

//the player controls on the YouTube player
let controls = null;

// Direct Links after the config is loaded
utils.wait(() => Config.config !== null, 1000, 1).then(() => videoIDChange(getYouTubeVideoID(document.URL)));

//the amount of times the sponsor lookup has retried
//this only happens if there is an error
let sponsorLookupRetries = 0;

//if showing the start sponsor button or the end sponsor button on the player
let showingStartSponsor = true;

//the sponsor times being prepared to be submitted
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
    changeStartSponsorButton,
    previewTime,
    videoInfo,
    getRealCurrentTime: getRealCurrentTime
});

//get messages from the background script and the popup
chrome.runtime.onMessage.addListener(messageListener);
  
function messageListener(request: Message, sender: unknown, sendResponse: (response: MessageResponse) => void): void {
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
                sponsorTimes: sponsorTimes
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
        case "getChannelID":
            sendResponse({
                channelID: channelID
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
        case "submitTimes":
            submitSponsorTimes();
            break;
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

    videoInfo = null;
    channelWhitelisted = false;
    channelID = null;

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

    // Get new video info
    getVideoInfo();

    // If enabled, it will check if this video is private or unlisted and double check with the user if the sponsors should be looked up
    if (Config.config.checkForUnlistedVideos) {
        try {
            await utils.wait(() => !!videoInfo, 5000, 1);
        } catch (err) {
            await videoInfoFetchFailed("adblockerIssueUnlistedVideosInfo");
        }

        if (isUnlisted()) {
            const shouldContinue = confirm(chrome.i18n.getMessage("confirmPrivacy"));
            if(!shouldContinue) return;
        }
    }

    // Update whitelist data when the video data is loaded
    utils.wait(() => !!videoInfo, 5000, 10).then(whitelistCheck).catch(() => {
        if (Config.config.forceChannelCheck) {
            videoInfoFetchFailed("adblockerIssueWhitelist");
        }
    });

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

    //make sure everything is properly added
    updateVisibilityOfPlayerControlsButton().then(() => {
        //see if the onvideo control image needs to be changed
        const segments = Config.config.segmentTimes.get(sponsorVideoID);
        if (segments != null && segments.length > 0 && segments[segments.length - 1].segment.length >= 2) {
            changeStartSponsorButton(true, true);
        } else if (segments != null && segments.length > 0 && segments[segments.length - 1].segment.length < 2) {
            changeStartSponsorButton(false, true);
        } else {
            changeStartSponsorButton(true, false);
        }
    });

    //reset sponsor times submitting
    sponsorTimesSubmitting = [];
    updateSponsorTimesSubmitting();

    //see if video controls buttons should be added
    if (!onInvidious) {
        updateVisibilityOfPlayerControlsButton();
    }
}

function handleMobileControlsMutations(): void {
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

    if (video.paused) return;

    if (Config.config.disableSkipping || channelWhitelisted || (channelID === null && Config.config.forceChannelCheck)){
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
            if (utils.getCategorySelection(segment.category).option === CategorySkipOption.AutoSkip &&
                    segment.segment[0] >= skipTime[0] && segment.segment[1] <= skipTime[1]) {
                skippingSegments.push(segment);
            }
        }
    }

    // Don't skip if this category should not be skipped
    if (utils.getCategorySelection(currentSkip.category)?.option === CategorySkipOption.ShowOverlay 
        && skipInfo.array !== sponsorTimesSubmitting) return;

    const skippingFunction = () => {
        let forcedSkipTime: number = null;
        let forcedIncludeIntersectingSegments = false;
        let forcedIncludeNonIntersectingSegments = true;

        if (incorrectVideoCheck(videoID, currentSkip)) return;

        if (video.currentTime >= skipTime[0] && video.currentTime < skipTime[1]) {
            skipToTime(video, skipTime, skippingSegments, skipInfo.openNotice);

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

async function sponsorsLookup(id: string) {
    video = document.querySelector('video') // Youtube video player
    //there is no video here
    if (video == null) {
        setTimeout(() => sponsorsLookup(id), 100);
        return;
    }

    addHotkeyListener();

    if (!durationListenerSetUp) {
        durationListenerSetUp = true;

        //wait until it is loaded
        video.addEventListener('durationchange', durationChangeListener);
    }

    if (!seekListenerSetUp && !Config.config.disableSkipping) {
        seekListenerSetUp = true;
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

    //check database for sponsor times
    //made true once a setTimeout has been created to try again after a server error
    let recheckStarted = false;
    // Create categories list
    const categories: string[] = [];
    for (const categorySelection of Config.config.categorySelections) {
        categories.push(categorySelection.name);
    }

    // Check for hashPrefix setting
    let getRequest;
    if (Config.config.hashPrefix) {
        const hashPrefix = (await utils.getHash(id, 1)).substr(0, 4);
        getRequest = utils.asyncRequestToServer('GET', "/api/skipSegments/" + hashPrefix, {
            categories
        });
    } else {
        getRequest = utils.asyncRequestToServer('GET', "/api/skipSegments", {
            videoID: id,
            categories
        });
    }
    getRequest.then(async (response: FetchResponse) => {
        if (response?.ok) {
            let result = JSON.parse(response.responseText);
            if (Config.config.hashPrefix) {
                result = result.filter((video) => video.videoID === id);
                if (result.length > 0) {
                    result = result[0].segments;
                    if (result.length === 0) { // return if no segments found
                        retryFetch(id);
                        return;
                    }
                } else { // return if no video found
                    retryFetch(id);
                    return;
                }
            }

            const recievedSegments: SponsorTime[] = result;
            if (!recievedSegments.length) {
                console.error("[SponsorBlock] Server returned malformed response: " + JSON.stringify(recievedSegments));
                return;
            }

            sponsorDataFound = true;

            // Check if any old submissions should be kept
            if (sponsorTimes !== null) {
                for (let i = 0; i < sponsorTimes.length; i++) {
                    if (sponsorTimes[i].UUID === null)  {
                        // This is a user submission, keep it
                        recievedSegments.push(sponsorTimes[i]);
                    }
                }
            }

            sponsorTimes = recievedSegments;

            // Hide all submissions smaller than the minimum duration
            if (Config.config.minDuration !== 0) {
                for (let i = 0; i < sponsorTimes.length; i++) {
                    if (sponsorTimes[i].segment[1] - sponsorTimes[i].segment[0] < Config.config.minDuration) {
                        sponsorTimes[i].hidden = SponsorHideType.MinimumDuration;
                    }
                }
            }

            startSkipScheduleCheckingForStartSponsors();

            // Reset skip save
            sponsorSkipped = [];

            //update the preview bar
            //leave the type blank for now until categories are added
            if (lastPreviewBarUpdate == id || (lastPreviewBarUpdate == null && !isNaN(video.duration))) {
                //set it now
                //otherwise the listener can handle it
                updatePreviewBar();
            }

            sponsorLookupRetries = 0;
        } else if (response?.status === 404) {
            retryFetch(id);
        } else if (sponsorLookupRetries < 15 && !recheckStarted) {
            recheckStarted = true;

            //TODO lower when server becomes better (back to 1 second)
            //some error occurred, try again in a second
            setTimeout(() => sponsorsLookup(id), 5000 + Math.random() * 15000 + 5000 * sponsorLookupRetries);

            sponsorLookupRetries++;
        }
    });
}

function retryFetch(id: string): void {
    if (!Config.config.refetchWhenNotFound) return;

    sponsorDataFound = false;

    //check if this video was uploaded recently
    utils.wait(() => !!videoInfo).then(() => {
        const dateUploaded = videoInfo?.microformat?.playerMicroformatRenderer?.uploadDate;

        //if less than 3 days old
        if (Date.now() - new Date(dateUploaded).getTime() < 259200000) {
            setTimeout(() => sponsorsLookup(id), 30000 + Math.random() * 90000);
        }
    });

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
        let startingSponsor = -1;
        for (const time of sponsorTimes) {
            if (time.segment[0] <= video.currentTime && time.segment[0] > startingSponsor && time.segment[1] > video.currentTime) {
                startingSponsor = time.segment[0];
                break;
            }
        }
        if (startingSponsor === -1) {
            for (const time of sponsorTimesSubmitting) {
                if (time.segment[0] <= video.currentTime && time.segment[0] > startingSponsor && time.segment[1] > video.currentTime) {
                    startingSponsor = time.segment[0];
                    break;
                }
            }
        }

        if (startingSponsor !== -1) {
            startSponsorSchedule(undefined, startingSponsor);
        } else {
            startSponsorSchedule();
        }
    }
}

/**
 * Get the video info for the current tab from YouTube
 */
async function getVideoInfo(): Promise<void> {
    const result = await utils.asyncRequestToCustomServer("GET", "https://www.youtube.com/get_video_info?video_id=" + sponsorVideoID);

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

async function videoInfoFetchFailed(errorMessage: string): Promise<void> {
    console.log("failed\t" + errorMessage)
    if (utils.isFirefox()) {
        // Attempt to ask permission for youtube.com domain
        alert(chrome.i18n.getMessage("youtubePermissionRequest"));
        
        chrome.runtime.sendMessage({
            message: "openPage",
            url: "permissions/index.html#youtube.com"
        });
    } else {
        alert(chrome.i18n.getMessage("adblockerIssue") + "\n\n" + chrome.i18n.getMessage(errorMessage));
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
        previewBar.updatePosition(parent);
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
                preview: false,
            });
        });
    }

    sponsorTimesSubmitting.forEach((segment) => {
        previewBarSegments.push({
            segment: segment.segment as [number, number],
            category: segment.category,
            preview: true,
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
function whitelistCheck() {
    channelID = videoInfo?.videoDetails?.channelId;
    if (!channelID) {
        channelID = null;

        return;
    }

    //see if this is a whitelisted channel
    const whitelistedChannels = Config.config.whitelistedChannels;

    if (whitelistedChannels != undefined && whitelistedChannels.includes(channelID)) {
        channelWhitelisted = true;
    }

    // check if the start of segments were missed
    if (Config.config.forceChannelCheck && sponsorTimes && sponsorTimes.length > 0) startSkipScheduleCheckingForStartSponsors();
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

    const previewSponsorStartTimes = getStartTimes(sponsorTimesSubmitting, includeIntersectingSegments, includeNonIntersectingSegments);
    const previewSponsorStartTimesAfterCurrentTime = getStartTimes(sponsorTimesSubmitting, includeIntersectingSegments, includeNonIntersectingSegments, currentTime, false, false);

    const minPreviewSponsorTimeIndex = previewSponsorStartTimes.indexOf(Math.min(...previewSponsorStartTimesAfterCurrentTime));
    const previewEndTimeIndex = getLatestEndTimeIndex(sponsorTimesSubmitting, minPreviewSponsorTimeIndex);

    if ((minPreviewSponsorTimeIndex === -1 && minSponsorTimeIndex !== -1) || 
            sponsorStartTimes[minSponsorTimeIndex] < previewSponsorStartTimes[minPreviewSponsorTimeIndex]) {
        return {
            array: sponsorTimes,
            index: minSponsorTimeIndex,
            endIndex: endTimeIndex,
            openNotice: true
        };
    } else {
        return {
            array: sponsorTimesSubmitting,
            index: minPreviewSponsorTimeIndex,
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
        utils.getCategorySelection(sponsorTimes[index].category)?.option !== CategorySkipOption.AutoSkip) return index;

    // Default to the normal endTime
    let latestEndTimeIndex = index;

    for (let i = 0; i < sponsorTimes?.length; i++) {
        const currentSegment = sponsorTimes[i].segment;
        const latestEndTime = sponsorTimes[latestEndTimeIndex].segment[1];

        if (currentSegment[0] <= latestEndTime && currentSegment[1] > latestEndTime 
            && (!hideHiddenSponsors || sponsorTimes[i].hidden === SponsorHideType.Visible)
            && utils.getCategorySelection(sponsorTimes[i].category).option === CategorySkipOption.AutoSkip) {
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
                && (!onlySkippableSponsors || utils.getCategorySelection(sponsorTimes[i].category).option !== CategorySkipOption.ShowOverlay)
                && (!hideHiddenSponsors || sponsorTimes[i].hidden === SponsorHideType.Visible)) {

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

//skip from the start time to the end time for a certain index sponsor time
function skipToTime(v: HTMLVideoElement, skipTime: number[], skippingSegments: SponsorTime[], openNotice: boolean) {
    // There will only be one submission if it is manual skip
    const autoSkip: boolean = utils.getCategorySelection(skippingSegments[0].category)?.option === CategorySkipOption.AutoSkip;

    if ((autoSkip || sponsorTimesSubmitting.includes(skippingSegments[0])) && v.currentTime !== skipTime[1]) {
        // Fix for looped videos not working when skipping to the end #426
        // for some reason you also can't skip to 1 second before the end
        if (v.loop && v.duration > 1 && skipTime[1] >= v.duration - 1) {
            v.currentTime = 0;
        } else {
            v.currentTime = skipTime[1];
        }
    }

    if (openNotice) {
        //send out the message saying that a sponsor message was skipped
        if (!Config.config.dontShowNotice || !autoSkip) {
            skipNotices.push(new SkipNotice(skippingSegments, autoSkip, skipNoticeContentContainer));
        }
    }

    //send telemetry that a this sponsor was skipped
    if (Config.config.trackViewCount && autoSkip) {
        let alreadySkipped = false;
        let isPreviewSegment = false;

        for (const segment of skippingSegments) {
            const index = sponsorTimes.indexOf(segment);
            if (index !== -1 && !sponsorSkipped[index]) {
                utils.asyncRequestToServer("POST", "/api/viewedVideoSponsorTime?UUID=" + segment.UUID);

                sponsorSkipped[index] = true;
            } else if (sponsorSkipped[index]) {
                alreadySkipped = true;
            }

            if (index === -1) isPreviewSegment = true;
        }
        
        // Count this as a skip
        if (!alreadySkipped && !isPreviewSegment) {
            Config.config.minutesSaved = Config.config.minutesSaved + (skipTime[1] - skipTime[0]) / 60;
            Config.config.skipCount = Config.config.skipCount + 1;
        }
    }
}

function unskipSponsorTime(segment: SponsorTime) {
    if (sponsorTimes != null) {
        //add a tiny bit of time to make sure it is not skipped again
        video.currentTime = segment.segment[0] + 0.001;
    }
}

function reskipSponsorTime(segment: SponsorTime) {
    video.currentTime = segment.segment[1];

    startSponsorSchedule(true, segment.segment[1], false);
}

function createButton(baseID, title, callback, imageName, isDraggable=false): boolean {
    if (document.getElementById(baseID + "Button") != null) return false;

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
    controls.prepend(newButton);

    return true;
}

function getControls(): HTMLElement | false {
    const controlsSelectors = [
        // YouTube
        ".ytp-right-controls",
        // Mobile YouTube
        ".player-controls-top",
        // Invidious/videojs video element's controls element
        ".vjs-control-bar"
    ]

    for (const controlsSelector of controlsSelectors) {
        const controls = document.querySelectorAll(controlsSelector);

        if (controls && controls.length > 0) {
            return <HTMLElement> controls[controls.length - 1];
        }
    }

    return false;
}

//adds all the player controls buttons
async function createButtons(): Promise<boolean> {
    if (onMobileYouTube) return;

    const result = await utils.wait(getControls).catch();

    //set global controls variable
    controls = result;

    let createdButton = false;

    // Add button if does not already exist in html
    createdButton = createButton("startSponsor", "sponsorStart", startSponsorClicked, "PlayerStartIconSponsorBlocker256px.png") || createdButton;
    createdButton = createButton("info", "openPopup", openInfoMenu, "PlayerInfoIconSponsorBlocker256px.png") || createdButton;
    createdButton = createButton("delete", "clearTimes", clearSponsorTimes, "PlayerDeleteIconSponsorBlocker256px.png") || createdButton;
    createdButton = createButton("submit", "SubmitTimes", submitSponsorTimes, "PlayerUploadIconSponsorBlocker256px.png") || createdButton;

    return createdButton;
}

//adds or removes the player controls button to what it should be
async function updateVisibilityOfPlayerControlsButton(): Promise<boolean> {
    //not on a proper video yet
    if (!sponsorVideoID) return false;

    const createdButtons = await createButtons();
    if (!createdButtons) return;

    if (Config.config.hideVideoPlayerControls || onInvidious) {
        document.getElementById("startSponsorButton").style.display = "none";
        document.getElementById("submitButton").style.display = "none";
    } else {
        document.getElementById("startSponsorButton").style.removeProperty("display");
    }

    //don't show the info button on embeds
    if (Config.config.hideInfoButtonPlayerControls || document.URL.includes("/embed/") || onInvidious) {
        document.getElementById("infoButton").style.display = "none";
    } else {
        document.getElementById("infoButton").style.removeProperty("display");
    }
    
    if (Config.config.hideDeleteButtonPlayerControls || onInvidious) {
        document.getElementById("deleteButton").style.display = "none";
    }

    return createdButtons;
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

function startSponsorClicked() {
    //it can't update to this info yet
    closeInfoMenu();

    toggleStartSponsorButton();

    //add to sponsorTimes
    if (sponsorTimesSubmitting.length > 0 && sponsorTimesSubmitting[sponsorTimesSubmitting.length - 1].segment.length < 2) {
        //it is an end time
        sponsorTimesSubmitting[sponsorTimesSubmitting.length - 1].segment[1] = getRealCurrentTime();
        sponsorTimesSubmitting[sponsorTimesSubmitting.length - 1].segment.sort((a, b) => a > b ? 1 : (a < b ? -1 : 0));
    } else {
        //it is a start time
        sponsorTimesSubmitting.push({
            segment: [getRealCurrentTime()],
            UUID: null,
            category: Config.config.defaultCategory
        });
    }

    //save this info
    Config.config.segmentTimes.set(sponsorVideoID, sponsorTimesSubmitting);

    updateSponsorTimesSubmitting(false)
}

function updateSponsorTimesSubmitting(getFromConfig = true) {
    const segmentTimes = Config.config.segmentTimes.get(sponsorVideoID);

    //see if this data should be saved in the sponsorTimesSubmitting variable
    if (getFromConfig && segmentTimes != undefined) {
        sponsorTimesSubmitting = [];

        for (const segmentTime of segmentTimes) {
            sponsorTimesSubmitting.push({
                segment: segmentTime.segment,
                UUID: null,
                category: segmentTime.category
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

async function changeStartSponsorButton(showStartSponsor: boolean, uploadButtonVisible: boolean): Promise<boolean> {
    if(!sponsorVideoID || onMobileYouTube) return false;
    
    //if it isn't visible, there is no data
    const shouldHide = (uploadButtonVisible && !(Config.config.hideDeleteButtonPlayerControls || onInvidious)) ? "unset" : "none"
    document.getElementById("deleteButton").style.display = shouldHide;

    if (showStartSponsor) {
        showingStartSponsor = true;
        (<HTMLImageElement> document.getElementById("startSponsorImage")).src = chrome.extension.getURL("icons/PlayerStartIconSponsorBlocker256px.png");
        document.getElementById("startSponsorButton").setAttribute("title", chrome.i18n.getMessage("sponsorStart"));

        if (document.getElementById("startSponsorImage").style.display != "none" && uploadButtonVisible && !Config.config.hideUploadButtonPlayerControls && !onInvidious) {
            document.getElementById("submitButton").style.display = "unset";
        } else if (!uploadButtonVisible || onInvidious) {
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
            const popup = document.createElement("div");
            popup.id = "sponsorBlockPopupContainer";

            let htmlData = xmlhttp.responseText;
            // Hack to replace head data (title, favicon)
            htmlData = htmlData.replace(/<head>[\S\s]*<\/head>/gi, "");
            // Hack to replace body tag with div
            htmlData = htmlData.replace(/<body/gi, "<div");
            htmlData = htmlData.replace(/<\/body/gi, "</div");

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
            logo.src = chrome.extension.getURL("icons/IconSponsorBlocker256px.png");
            settings.src = chrome.extension.getURL("icons/settings.svg");
            edit.src = chrome.extension.getURL("icons/pencil.svg");
            check.src = chrome.extension.getURL("icons/check.svg");
            check.src = chrome.extension.getURL("icons/thumb.svg");

            parentNode.insertBefore(popup, parentNode.firstChild);

            //run the popup init script
            runThePopup(messageListener);
        }
    });
}

function closeInfoMenu() {
    const popup = document.getElementById("sponsorBlockPopupContainer");
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

    const currentVideoID = sponsorVideoID;

    const sponsorTimes = Config.config.segmentTimes.get(currentVideoID);

    if (sponsorTimes != undefined && sponsorTimes.length > 0) {
        const confirmMessage = chrome.i18n.getMessage("clearThis") + getSegmentsMessage(sponsorTimes)
                                + "\n" + chrome.i18n.getMessage("confirmMSG")
        if(!confirm(confirmMessage)) return;

        //clear the sponsor times
        Config.config.segmentTimes.delete(currentVideoID);

        //clear sponsor times submitting
        sponsorTimesSubmitting = [];

        updatePreviewBar();

        //set buttons to be correct
        changeStartSponsorButton(true, false);
    }
}

//if skipNotice is null, it will not affect the UI
function vote(type: number, UUID: string, category?: string, skipNotice?: SkipNoticeComponent) {
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
                    skipNotice.setNoticeInfoMessage.bind(skipNotice)(utils.getErrorMessage(response.statusCode, response.responseText))
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

function sponsorMessageStarted(callback: (response: MessageResponse) => void) {
    video = document.querySelector('video');

    //send back current time
    callback({
        time: video.currentTime
    })

    //update button
    toggleStartSponsorButton();
}

/**
 * Helper method for the submission notice to clear itself when it closes
 */
function resetSponsorSubmissionNotice() {
    submissionNotice = null;
}

function submitSponsorTimes() {
    if (submissionNotice !== null) return;

    //it can't update to this info yet
    closeInfoMenu();

    if (sponsorTimesSubmitting !== undefined && sponsorTimesSubmitting.length > 0) {
        submissionNotice = new SubmissionNotice(skipNoticeContentContainer, sendSubmitMessage);
    }

}

//send the message to the background js
//called after all the checks have been made that it's okay to do so
async function sendSubmitMessage(): Promise<void> {
    //add loading animation
    (<HTMLImageElement> document.getElementById("submitImage")).src = chrome.extension.getURL("icons/PlayerUploadIconSponsorBlocker256px.png");
    document.getElementById("submitButton").style.animation = "rotate 1s 0s infinite";

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
        segments: sponsorTimesSubmitting
    });

    if (response.status === 200) {
        //hide loading message
        const submitButton = document.getElementById("submitButton");
        submitButton.style.animation = "rotate 1s";
        //finish this animation
        //when the animation is over, hide the button
        const animationEndListener =  function() {
            changeStartSponsorButton(true, false);

            submitButton.style.animation = "none";

            submitButton.removeEventListener("animationend", animationEndListener);
        };

        submitButton.addEventListener("animationend", animationEndListener);

        //clear the sponsor times
        Config.config.segmentTimes.delete(sponsorVideoID);

        //add submissions to current sponsors list
        if (sponsorTimes === null) sponsorTimes = [];
        
        sponsorTimes = sponsorTimes.concat(sponsorTimesSubmitting);

        // Increase contribution count
        Config.config.sponsorTimesContributed = Config.config.sponsorTimesContributed + sponsorTimesSubmitting.length;

        // New count just used to see if a warning "Read The Guidelines!!" message needs to be shown
        // One per time submitting
        Config.config.submissionCountSinceCategories = Config.config.submissionCountSinceCategories + 1;

        // Empty the submitting times
        sponsorTimesSubmitting = [];

        updatePreviewBar();
    } else {
        //show that the upload failed
        document.getElementById("submitButton").style.animation = "unset";
        (<HTMLImageElement> document.getElementById("submitImage")).src = chrome.extension.getURL("icons/PlayerUploadFailedIconSponsorBlocker256px.png");

        alert(utils.getErrorMessage(response.status, response.responseText));
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

function addHotkeyListener(): boolean {
    let videoRoot = document.getElementById("movie_player") as HTMLDivElement;
    if (onInvidious) videoRoot = (document.getElementById("player-container") ?? document.getElementById("player")) as HTMLDivElement;
    if (video.baseURI.startsWith("https://www.youtube.com/tv#/")) videoRoot = document.querySelector("ytlr-watch-page") as HTMLDivElement;

    if (videoRoot && !videoRootsWithEventListeners.includes(videoRoot)) {
        videoRoot.addEventListener("keydown", hotkeyListener);
        videoRootsWithEventListeners.push(videoRoot);
        return true;
    }

    return false;
}

function hotkeyListener(e: KeyboardEvent): void {
    const key = e.key;

    const skipKey = Config.config.skipKeybind;
    const startSponsorKey = Config.config.startSponsorKeybind;
    const submitKey = Config.config.submitKeybind;

    switch (key) {
        case skipKey:
            if (skipNotices.length > 0) {
                const latestSkipNotice = skipNotices[skipNotices.length - 1];
                latestSkipNotice.toggleSkip.call(latestSkipNotice);
            }
            break; 
        case startSponsorKey:
            startSponsorClicked();
            break;
        case submitKey:
            submitSponsorTimes();
            break;
    }
}

/**
 * Is this an unlisted YouTube video.
 * Assumes that the the privacy info is available.
 */
function isUnlisted(): boolean {
    return videoInfo?.microformat?.playerMicroformatRenderer?.isUnlisted || videoInfo?.videoDetails?.isPrivate;
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
