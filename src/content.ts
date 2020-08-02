import Config from "./config";

import { SponsorTime, CategorySkipOption, CategorySelection, VideoID, SponsorHideType, FetchResponse } from "./types";

import { ContentContainer } from "./types";
import Utils from "./utils";
var utils = new Utils();

import runThePopup from "./popup";

import PreviewBar from "./js-components/previewBar";
import SkipNotice from "./render/SkipNotice";
import SkipNoticeComponent from "./components/SkipNoticeComponent";
import SubmissionNotice from "./render/SubmissionNotice";

// Hack to get the CSS loaded on permission-based sites (Invidious)
utils.wait(() => Config.config !== null, 5000, 10).then(addCSS);

//was sponsor data found when doing SponsorsLookup
var sponsorDataFound = false;
var previousVideoID: VideoID = null;
//the actual sponsorTimes if loaded and UUIDs associated with them
var sponsorTimes: SponsorTime[] = null;
//what video id are these sponsors for
var sponsorVideoID: VideoID = null;

// JSON video info 
var videoInfo: any = null;
//the channel this video is about
var channelID;

// Skips are scheduled to ensure precision.
// Skips are rescheduled every seeking event.
// Skips are canceled every seeking event
var currentSkipSchedule: NodeJS.Timeout = null;
var seekListenerSetUp = false

/** @type {Array[boolean]} Has the sponsor been skipped */
var sponsorSkipped: boolean[] = [];

//the video
var video: HTMLVideoElement;

var onInvidious;
var onMobileYouTube;

//the video id of the last preview bar update
var lastPreviewBarUpdate;

//whether the duration listener listening for the duration changes of the video has been setup yet
var durationListenerSetUp = false;

// Is the video currently being switched
var switchingVideos = null;

// Used by the play and playing listeners to make sure two aren't
// called at the same time
var lastCheckTime = 0;
var lastCheckVideoTime = -1;

//is this channel whitelised from getting sponsors skipped
var channelWhitelisted = false;

// create preview bar
var previewBar: PreviewBar = null;

//the player controls on the YouTube player
var controls = null;

// Direct Links after the config is loaded
utils.wait(() => Config.config !== null, 1000, 1).then(() => videoIDChange(getYouTubeVideoID(document.URL)));

//the amount of times the sponsor lookup has retried
//this only happens if there is an error
var sponsorLookupRetries = 0;

//if showing the start sponsor button or the end sponsor button on the player
var showingStartSponsor = true;

//the sponsor times being prepared to be submitted
var sponsorTimesSubmitting: SponsorTime[] = [];

//becomes true when isInfoFound is called
//this is used to close the popup on YouTube when the other popup opens
var popupInitialised = false;

var submissionNotice: SubmissionNotice = null;

// If there is an advert playing (or about to be played), this is true
var isAdPlaying = false;

// Contains all of the functions and variables needed by the skip notice
var skipNoticeContentContainer: ContentContainer = () => ({
    vote,
    dontShowNoticeAgain,
    unskipSponsorTime,
    sponsorTimes,
    sponsorTimesSubmitting,
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
  
function messageListener(request: any, sender: any, sendResponse: (response: any) => void): void {
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
        case "getVideoDuration":
            sendResponse({
                duration: video.duration
            });

            break;
        case "skipToTime":
            video.currentTime = request.time;

            // Unpause the video if needed
            if (video.paused){
                video.play();
            }

            return;
        case "getCurrentTime":
            sendResponse({
                currentTime: getRealCurrentTime()
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
function contentConfigUpdateListener(changes) {
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

//check for hotkey pressed
document.onkeydown = function(e: KeyboardEvent){
    var key = e.key;

    let video = document.getElementById("movie_player");

    let startSponsorKey = Config.config.startSponsorKeybind;

    let submitKey = Config.config.submitKeybind;

    //is the video in focus, otherwise they could be typing a comment
    if (document.activeElement === video) {
        if(key == startSponsorKey){
            //semicolon
            startSponsorClicked();
        } else if (key == submitKey) {
            //single quote
            submitSponsorTimes();
        }
    }
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
        previewBar.set([], [], 0);
    }

    //reset sponsor data found check
    sponsorDataFound = false;

    if (switchingVideos === null) {
        // When first loading a video, it is not switching videos
        switchingVideos = false;
    } else {
        switchingVideos = true;
    }

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
            alert(chrome.i18n.getMessage("adblockerIssue"));
        }

        if (isUnlisted()) {
            let shouldContinue = confirm(chrome.i18n.getMessage("confirmPrivacy"));
            if(!shouldContinue) return;
        }
    }

    // Update whitelist data when the video data is loaded
    utils.wait(() => !!videoInfo, 5000, 10).then(whitelistCheck);

    //setup the preview bar
    if (previewBar === null) {
        if (onMobileYouTube) {
            // Mobile YouTube workaround
            const observer = new MutationObserver(handleMobileControlsMutations);

            observer.observe(document.getElementById("player-control-container"), { 
                attributes: true, 
                childList: true, 
                subtree: true 
            });
        } else {
            utils.wait(getControls).then(createPreviewBar);
        }
    }

    //warn them if they had unsubmitted times
    if (previousVideoID != null) {
        //get the sponsor times from storage
        let sponsorTimes = Config.config.segmentTimes.get(previousVideoID);
        if (sponsorTimes != undefined && sponsorTimes.length > 0) {
            //warn them that they have unsubmitted sponsor times
            chrome.runtime.sendMessage({
                message: "alertPrevious",
                previousVideoID: previousVideoID
            });
        }

        //set the previous video id to the currentID
        previousVideoID = id;
    } else {
        //set the previous id now, don't wait for chrome.storage.get
        previousVideoID = id;
    }
  
    //close popup
    closeInfoMenu();
	
    sponsorsLookup(id);

    //make sure everything is properly added
    updateVisibilityOfPlayerControlsButton().then(() => {
        //see if the onvideo control image needs to be changed
        let segments = Config.config.segmentTimes.get(sponsorVideoID);
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
    let mobileYouTubeSelector = ".progress-bar-background";
    
    updateVisibilityOfPlayerControlsButton().then((createdButtons) => {
        if (createdButtons) {
            if (sponsorTimesSubmitting != null && sponsorTimesSubmitting.length > 0 && sponsorTimesSubmitting[sponsorTimesSubmitting.length - 1].segment.length >= 2) {
                changeStartSponsorButton(true, true);
            } else if (sponsorTimesSubmitting != null && sponsorTimesSubmitting.length > 0 && sponsorTimesSubmitting[sponsorTimesSubmitting.length - 1].segment.length < 2) {
                changeStartSponsorButton(false, true);
            } else {
                changeStartSponsorButton(true, false);
            }
        }
    });
    
    if (previewBar !== null) {
        if (document.body.contains(previewBar.container)) {
            updatePreviewBarPositionMobile(document.getElementsByClassName(mobileYouTubeSelector)[0]);

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
        const el = document.querySelectorAll(selector);

        if (el && el.length && el[0]) {
            previewBar = new PreviewBar(el[0], onMobileYouTube, onInvidious);
            
            updatePreviewBar();

            break;
        }
    }
}

/**
 * Triggered every time the video duration changes.
 * This happens when the resolution changes or at random time to clear memory.
 */
function durationChangeListener() {
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
function startSponsorSchedule(includeIntersectingSegments: boolean = false, currentTime?: number): void {
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

    let skipInfo = getNextSkipIndex(currentTime, includeIntersectingSegments);

    if (skipInfo.index === -1) return;

    let currentSkip = skipInfo.array[skipInfo.index];
    let skipTime: number[] = [currentSkip.segment[0], skipInfo.array[skipInfo.endIndex].segment[1]];
    let timeUntilSponsor = skipTime[0] - currentTime;
    let videoID = sponsorVideoID;

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

    let skippingFunction = () => {
        let forcedSkipTime: number = null;
        let forcedIncludeIntersectingSegments = false;

        if (incorrectVideoCheck(videoID, currentSkip)) return;

        if (video.currentTime >= skipTime[0] && video.currentTime < skipTime[1]) {
            skipToTime(video, skipTime, skippingSegments, skipInfo.openNotice);

            if (utils.getCategorySelection(currentSkip.category)?.option === CategorySkipOption.ManualSkip) {
                forcedSkipTime = skipTime[0] + 0.001;
            } else {
                forcedSkipTime = skipTime[1];
                forcedIncludeIntersectingSegments = true;
            }
        }

        startSponsorSchedule(forcedIncludeIntersectingSegments, forcedSkipTime);
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
    let currentVideoID = getYouTubeVideoID(document.URL);
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

function sponsorsLookup(id: string) {
    video = document.querySelector('video') // Youtube video player
    //there is no video here
    if (video == null) {
        setTimeout(() => sponsorsLookup(id), 100);
        return;
    }

    if (!durationListenerSetUp) {
        durationListenerSetUp = true;

        //wait until it is loaded
        video.addEventListener('durationchange', durationChangeListener);
    }

    if (!seekListenerSetUp && !Config.config.disableSkipping) {
        seekListenerSetUp = true;

        video.addEventListener('play', () => {
            switchingVideos = false;

            // Check if an ad is playing
            updateAdFlag();

             // Make sure it doesn't get double called with the playing event
             if (lastCheckVideoTime !== video.currentTime && Date.now() - lastCheckTime > 2000) {
                lastCheckTime = Date.now();
                lastCheckVideoTime = video.currentTime;

                startSponsorSchedule();
            }

        });
        video.addEventListener('playing', () => {
            // Make sure it doesn't get double called with the play event
            if (lastCheckVideoTime !== video.currentTime && Date.now() - lastCheckTime > 2000) {
                lastCheckTime = Date.now();
                lastCheckVideoTime = video.currentTime;

                startSponsorSchedule();
            }
        });
        video.addEventListener('seeking', () => {
            // Reset lastCheckVideoTime
            lastCheckVideoTime = -1
            lastCheckTime = 0;

            if (!video.paused){
                startSponsorSchedule();
            }
        });
        video.addEventListener('ratechange', () => startSponsorSchedule());
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
    let categories: string[] = [];
    for (const categorySelection of Config.config.categorySelections) {
        categories.push(categorySelection.name);
    }

    utils.asyncRequestToServer('GET', "/api/skipSegments", {
        videoID: id,
        categories
    }).then(async (response: FetchResponse) => {
        if (response?.ok) {
            let recievedSegments: SponsorTime[] = JSON.parse(response.responseText);
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
            sponsorDataFound = false;

            //check if this video was uploaded recently
            utils.wait(() => !!videoInfo).then(() => {
                let dateUploaded = videoInfo?.microformat?.playerMicroformatRenderer?.uploadDate;

                //if less than 3 days old
                if (Date.now() - new Date(dateUploaded).getTime() < 259200000) {
                    //TODO lower when server becomes better
                    setTimeout(() => sponsorsLookup(id), 180000);
                }
            });

            sponsorLookupRetries = 0;
        } else if (sponsorLookupRetries < 90 && !recheckStarted) {
            recheckStarted = true;

            //TODO lower when server becomes better (back to 1 second)
            //some error occurred, try again in a second
            setTimeout(() => sponsorsLookup(id), 10000);

            sponsorLookupRetries++;
        }
    });
}

/**
 * Only should be used when it is okay to skip a sponsor when in the middle of it 
 * 
 * Ex. When segments are first loaded
 */
function startSkipScheduleCheckingForStartSponsors() {
    if (!switchingVideos) {
        // See if there are any starting sponsors
        let startingSponsor: number = -1;
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
            startSponsorSchedule(false, startingSponsor);
        } else {
            startSponsorSchedule();
        }
    }
}

/**
 * Get the video info for the current tab from YouTube
 */
function getVideoInfo() {
    sendRequestToCustomServer('GET', "https://www.youtube.com/get_video_info?video_id=" + sponsorVideoID, function(xmlhttp, error) {
        if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
            let decodedData = decodeURIComponent(xmlhttp.responseText).match(/player_response=([^&]*)/)[1];
            if (!decodedData) {
                console.error("[SB] Failed at getting video info from YouTube.");
                return;
            }

            videoInfo = JSON.parse(decodedData);
        }
    });
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
    } else if (!["m.youtube.com", "www.youtube.com", "www.youtube-nocookie.com"].includes(urlObject.host)) {
        if (!Config.config) {
            // Call this later, in case this is an Invidious tab
            utils.wait(() => Config.config !== null).then(() => videoIDChange(getYouTubeVideoID(url)));
        }

        return false
    }

    //Get ID from searchParam
    if (urlObject.searchParams.has("v") && ["/watch", "/watch/"].includes(urlObject.pathname) || urlObject.pathname.startsWith("/tv/watch")) {
        let id = urlObject.searchParams.get("v");
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
function updatePreviewBarPositionMobile(parent: Element) {
    if (document.getElementById("previewbar") === null) {
        previewBar.updatePosition(parent);
    }
}

function updatePreviewBar() {
    if(isAdPlaying) {
        previewBar.set([], [], 0);
        return;
    }

    if (previewBar === null || video === null) return;

    let localSponsorTimes = sponsorTimes;
    if (localSponsorTimes == null) localSponsorTimes = [];

    let allSponsorTimes = localSponsorTimes.concat(sponsorTimesSubmitting);
	
    //create an array of the sponsor types
    let types = [];
    for (let i = 0; i < localSponsorTimes.length; i++) {
        if (localSponsorTimes[i].hidden === SponsorHideType.Visible) {
            types.push(localSponsorTimes[i].category);
        } else {
            // Don't show this sponsor
            types.push(null);
        }
    }
    for (let i = 0; i < sponsorTimesSubmitting.length; i++) {
        types.push("preview-" + sponsorTimesSubmitting[i].category);
    }

    previewBar.set(utils.getSegmentsFromSponsorTimes(allSponsorTimes), types, video.duration)

    if (Config.config.showTimeWithSkips) {
        showTimeWithoutSkips(allSponsorTimes);
    }

    //update last video id
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
    let whitelistedChannels = Config.config.whitelistedChannels;

    if (whitelistedChannels != undefined && whitelistedChannels.includes(channelID)) {
        channelWhitelisted = true;
    }

    // check if the start of segments were missed
    if (sponsorTimes && sponsorTimes.length > 0) startSkipScheduleCheckingForStartSponsors();
}

/**
 * Returns info about the next upcoming sponsor skip
 */
function getNextSkipIndex(currentTime: number, includeIntersectingSegments: boolean): 
        {array: SponsorTime[], index: number, endIndex: number, openNotice: boolean} {

    let sponsorStartTimes = getStartTimes(sponsorTimes, includeIntersectingSegments);
    let sponsorStartTimesAfterCurrentTime = getStartTimes(sponsorTimes, includeIntersectingSegments, currentTime, true, true);

    let minSponsorTimeIndex = sponsorStartTimes.indexOf(Math.min(...sponsorStartTimesAfterCurrentTime));
    let endTimeIndex = getLatestEndTimeIndex(sponsorTimes, minSponsorTimeIndex);

    let previewSponsorStartTimes = getStartTimes(sponsorTimesSubmitting, includeIntersectingSegments);
    let previewSponsorStartTimesAfterCurrentTime = getStartTimes(sponsorTimesSubmitting, includeIntersectingSegments, currentTime, false, false);

    let minPreviewSponsorTimeIndex = previewSponsorStartTimes.indexOf(Math.min(...previewSponsorStartTimesAfterCurrentTime));
    let previewEndTimeIndex = getLatestEndTimeIndex(sponsorTimesSubmitting, minPreviewSponsorTimeIndex);

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
function getLatestEndTimeIndex(sponsorTimes: SponsorTime[], index: number, hideHiddenSponsors: boolean = true): number {
    // Only combine segments for AutoSkip
    if (index == -1 || 
        utils.getCategorySelection(sponsorTimes[index].category)?.option !== CategorySkipOption.AutoSkip) return index;

    // Default to the normal endTime
    let latestEndTimeIndex = index;

    for (let i = 0; i < sponsorTimes?.length; i++) {
        let currentSegment = sponsorTimes[i].segment;
        let latestEndTime = sponsorTimes[latestEndTimeIndex].segment[1];

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
function getStartTimes(sponsorTimes: SponsorTime[], includeIntersectingSegments: boolean, minimum?: number, 
        onlySkippableSponsors: boolean = false, hideHiddenSponsors: boolean = false): number[] {
    if (sponsorTimes === null) return [];

    let startTimes: number[] = [];

    for (let i = 0; i < sponsorTimes?.length; i++) {
        if ((minimum === undefined || (sponsorTimes[i].segment[0] >= minimum || (includeIntersectingSegments && sponsorTimes[i].segment[1] > minimum))) 
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
function previewTime(time: number) {
    video.currentTime = time;

    // Unpause the video if needed
    if (video.paused){
        video.play();
    }
}

//skip from the start time to the end time for a certain index sponsor time
function skipToTime(v: HTMLVideoElement, skipTime: number[], skippingSegments: SponsorTime[], openNotice: boolean) {
    // There will only be one submission if it is manual skip
    let autoSkip: boolean = utils.getCategorySelection(skippingSegments[0].category)?.option === CategorySkipOption.AutoSkip;

    if (autoSkip || sponsorTimesSubmitting.includes(skippingSegments[0])) {
        v.currentTime = skipTime[1];
    }

    if (openNotice) {
        //send out the message saying that a sponsor message was skipped
        if (!Config.config.dontShowNotice || !autoSkip) {
            new SkipNotice(skippingSegments, autoSkip, skipNoticeContentContainer);
        }
    }

    //send telemetry that a this sponsor was skipped
    if (Config.config.trackViewCount && autoSkip) {
        let alreadySkipped = false;
        let isPreviewSegment = false;

        for (const segment of skippingSegments) {
            let index = sponsorTimes.indexOf(segment);
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
}

function createButton(baseID, title, callback, imageName, isDraggable=false): boolean {
    if (document.getElementById(baseID + "Button") != null) return false;

    // Button HTML
    let newButton = document.createElement("button");
    newButton.draggable = isDraggable;
    newButton.id = baseID + "Button";
    newButton.classList.add("playerButton");
    newButton.classList.add("ytp-button");
    newButton.setAttribute("title", chrome.i18n.getMessage(title));
    newButton.addEventListener("click", (event: Event) => {
        callback();
    });

    // Image HTML
    let newButtonImage = document.createElement("img");
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

function getControls(): HTMLElement | boolean {
    let controlsSelectors = [
        // YouTube
        ".ytp-right-controls",
        // Mobile YouTube
        ".player-controls-top",
        // Invidious/videojs video element's controls element
        ".vjs-control-bar"
    ]

    for (const controlsSelector of controlsSelectors) {
        let controls = document.querySelectorAll(controlsSelector);

        if (controls && controls.length > 0) {
            return <HTMLElement> controls[controls.length - 1];
        }
    }

    return false;
};

//adds all the player controls buttons
async function createButtons(): Promise<boolean> {
    if (onMobileYouTube) return;

    let result = await utils.wait(getControls).catch();

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

    let createdButtons = await createButtons();

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
    let playButtonSVGData = document.querySelector(".ytp-play-button")?.querySelector(".ytp-svg-fill")?.getAttribute("d");
    let replaceSVGData = "M 18,11 V 7 l -5,5 5,5 v -4 c 3.3,0 6,2.7 6,6 0,3.3 -2.7,6 -6,6 -3.3,0 -6,-2.7 -6,-6 h -2 c 0,4.4 3.6,8 8,8 4.4,0 8,-3.6 8,-8 0,-4.4 -3.6,-8 -8,-8 z";

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

function updateSponsorTimesSubmitting(getFromConfig: boolean = true) {
    let segmentTimes = Config.config.segmentTimes.get(sponsorVideoID);

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

async function changeStartSponsorButton(showStartSponsor, uploadButtonVisible) {
    if(!sponsorVideoID) return false;
    
    //if it isn't visible, there is no data
    let shouldHide = (uploadButtonVisible && !(Config.config.hideDeleteButtonPlayerControls || onInvidious)) ? "unset" : "none"
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
            var popup = document.createElement("div");
            popup.id = "sponsorBlockPopupContainer";
            popup.innerHTML = xmlhttp.responseText

            //close button
            let closeButton = document.createElement("div");
            closeButton.innerText = "Close Popup";
            closeButton.classList.add("smallLink");
            closeButton.setAttribute("align", "center");
            closeButton.addEventListener("click", closeInfoMenu);
            // Theme based color
            closeButton.style.color = "var(--yt-spec-text-primary)";

            //add the close button
            popup.prepend(closeButton);
    
            let parentNodes = document.querySelectorAll("#secondary");
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
            let logo = <HTMLImageElement> popup.querySelector("#sponsorBlockPopupLogo");
            logo.src = chrome.extension.getURL("icons/LogoSponsorBlocker256px.png");

            //remove the style sheet and font that are not necessary
            popup.querySelector("#sponsorBlockPopupFont").remove();
            popup.querySelector("#sponsorBlockStyleSheet").remove();

            parentNode.insertBefore(popup, parentNode.firstChild);

            //run the popup init script
            runThePopup(messageListener);
        }
    });
}

function closeInfoMenu() {
    let popup = document.getElementById("sponsorBlockPopupContainer");
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

    let currentVideoID = sponsorVideoID;

    let sponsorTimes = Config.config.segmentTimes.get(currentVideoID);

    if (sponsorTimes != undefined && sponsorTimes.length > 0) {
        let confirmMessage = chrome.i18n.getMessage("clearThis") + getSegmentsMessage(sponsorTimes)
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
        skipNotice.addVoteButtonInfo.bind(skipNotice)("Loading...")
        skipNotice.setNoticeInfoMessage.bind(skipNotice)();
    }

    let sponsorIndex = utils.getSponsorIndexFromUUID(sponsorTimes, UUID);

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
                    skipNotice.setNoticeInfoMessage.bind(skipNotice)(utils.getErrorMessage(response.statusCode))
                    skipNotice.resetVoteButtonInfo.bind(skipNotice)();
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
    Config.config.dontShowNotice = true;
    closeAllSkipNotices();
}

function sponsorMessageStarted(callback) {
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

    let currentVideoID = sponsorVideoID;

    if (sponsorTimesSubmitting !== undefined && sponsorTimesSubmitting.length > 0) {
        submissionNotice = new SubmissionNotice(skipNoticeContentContainer, sendSubmitMessage);
    }

}

//send the message to the background js
//called after all the checks have been made that it's okay to do so
async function sendSubmitMessage(){
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
                let confirmShort = chrome.i18n.getMessage("shortCheck") + "\n\n" + 
                    getSegmentsMessage(sponsorTimesSubmitting);
                
                if(!confirm(confirmShort)) return;
            }
        }
    }

    let response = await utils.asyncRequestToServer("POST", "/api/skipSegments", {
        videoID: sponsorVideoID,
        userID: Config.config.userID,
        segments: sponsorTimesSubmitting
    });

    if (response.status === 200) {
        //hide loading message
        let submitButton = document.getElementById("submitButton");
        submitButton.style.animation = "rotate 1s";
        //finish this animation
        //when the animation is over, hide the button
        let animationEndListener =  function() {
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

        alert(utils.getErrorMessage(response.status) + "\n\n" + (response.responseText));
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
            let head = document.getElementsByTagName("head")[0];

            for (const file of utils.css) {
                let fileref = document.createElement("link");

                fileref.rel = "stylesheet";
                fileref.type = "text/css";
                fileref.href = chrome.extension.getURL(file);

                head.appendChild(fileref);
            }
        });
    }
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

/**
 * Update the isAdPlaying flag and hide preview bar/controls if ad is playing
 */
function updateAdFlag() {
    let wasAdPlaying = isAdPlaying;
    isAdPlaying = document.getElementsByClassName('ad-showing').length > 0;

    if(wasAdPlaying != isAdPlaying) {
        updatePreviewBar();
        updateVisibilityOfPlayerControlsButton();
    }
}

function showTimeWithoutSkips(allSponsorTimes): void {
    if (onMobileYouTube || onInvidious) return;

	let skipDuration = 0;
	
	// Calculate skipDuration based from the segments in the preview bar
	for (let i = 0; i < allSponsorTimes.length; i++) {
        // If an end time exists
        if (allSponsorTimes[i].segment[1]) {
            skipDuration += allSponsorTimes[i].segment[1] - allSponsorTimes[i].segment[0];
        }
		
	}
	
	// YouTube player time display
	let display = document.getElementsByClassName("ytp-time-display notranslate")[0];
	if (!display) return;
	
    let formatedTime = utils.getFormattedTime(video.duration - skipDuration);
	
	const durationID = "sponsorBlockDurationAfterSkips";	
    let duration = document.getElementById(durationID);

	// Create span if needed
	if(duration === null) {
		duration = document.createElement('span');
        duration.id = durationID;
        duration.classList.add("ytp-time-duration");

		display.appendChild(duration);
	}
		
    duration.innerText = (skipDuration <= 0 || isNaN(skipDuration) || formatedTime.includes("NaN")) ? "" : " ("+formatedTime+")";
}
