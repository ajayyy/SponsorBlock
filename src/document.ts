/*
  Content script are run in an isolated DOM so it is not possible to access some key details that are sanitized when passed cross-dom
  This script is used to get the details from the page and make them available for the content script by being injected directly into the page
*/

import { PageType } from "./types";

interface StartMessage {
    type: "navigation";
    pageType: PageType;
    videoID: string | null;
}

interface FinishMessage extends StartMessage {
    channelID: string;
    channelTitle: string;
}

interface AdMessage {
    type: "ad";
    playing: boolean;
}

interface VideoData {
    type: "data";
    videoID: string;
    isLive: boolean;
    isPremiere: boolean;
}

type WindowMessage = StartMessage | FinishMessage | AdMessage | VideoData;

// global playerClient - too difficult to type
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let playerClient: any;

const sendMessage = (message: WindowMessage): void => {
    window.postMessage({ source: "sponsorblock", ...message }, "/");
}

function setupPlayerClient(e: CustomEvent): void {
    if (playerClient) return; // early exit if already defined
    
    playerClient = e.detail;
    sendVideoData(); // send playerData after setup

    e.detail.addEventListener('onAdStart', () => sendMessage({ type: "ad", playing: true } as AdMessage));
    e.detail.addEventListener('onAdFinish', () => sendMessage({ type: "ad", playing: false } as AdMessage));
}

document.addEventListener("yt-player-updated", setupPlayerClient);
document.addEventListener("yt-navigate-start", navigationStartSend);
document.addEventListener("yt-navigate-finish", navigateFinishSend);

function navigationParser(event: CustomEvent): StartMessage {
    const pageType: PageType = event.detail.pageType;
    if (pageType) {
        const result: StartMessage = { type: "navigation", pageType, videoID: null };
        if (pageType === "shorts" || pageType === "watch") {
            const endpoint = event.detail.endpoint
            if (!endpoint) return null;
            
            result.videoID = (pageType === "shorts" ? endpoint.reelWatchEndpoint : endpoint.watchEndpoint).videoId;
        }

        return result;
    } else {
        return null;
    }
}

function navigationStartSend(event: CustomEvent): void {
    const message = navigationParser(event) as StartMessage;
    if (message) {
        sendMessage(message);
    }
}

function navigateFinishSend(event: CustomEvent): void {
    sendVideoData(); // arrived at new video, send video data
    const videoDetails = event.detail?.response?.playerResponse?.videoDetails;
    if (videoDetails) {
        sendMessage({ channelID: videoDetails.channelId, channelTitle: videoDetails.author, ...navigationParser(event) } as FinishMessage);
    }
}

function sendVideoData(): void {
    if (!playerClient) return;
    const videoData = playerClient.getVideoData();
    if (videoData) {
        sendMessage({ type: "data", videoID: videoData.video_id, isLive: videoData.isLive, isPremiere: videoData.isPremiere } as VideoData);
    }
}