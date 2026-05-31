import { addCleanupListener } from "../../maze-utils/src/cleanup";
import { ActionType, Category, SegmentUUID, SponsorSourceType, SponsorTime, VideoID } from "../types";
import { FetchResponse, sendRequestToCustomServer } from "../../maze-utils/src/background-request-proxy";
import type { VideoService } from ".";

const RUTUBE_API = "https://sponsorblock.futuba.ru/api";
const RUTUBE_PREVIEW_BAR_SELECTOR = '[data-testid="ui-progress-progressBar"], [data-testid="video-ui"] [role="slider"][aria-valuemax]';
const RUTUBE_CONTROLS_SELECTORS = [
    '[data-testid="video-ui"] [class*="desktop-controls-layout-module__column"][class*="_justify-flex-end"][class*="_align-center"]',
    '[data-testid="video-ui"] [class*="_justify-flex-end"][class*="_align-center"]'
];
const RUTUBE_REFERENCE_NODE_SELECTORS = [
    "#raichuContainerWithPlayer",
    "[data-testid='layout-loader']",
    ".video-player"
];

interface RutubeTimestamp {
    start: number;
    end: number;
    type?: string;
}

interface RutubeInfo {
    title?: string;
    url?: string;
    type?: string;
}

export function isRutubeHost(host = location.host): boolean {
    return host === "rutube.ru" || host.endsWith(".rutube.ru");
}

function getRutubeVideoID(url = document.URL): VideoID | null {
    try {
        const urlObject = new URL(url);
        if (!isRutubeHost(urlObject.host)) return null;

        const id = urlObject.pathname.match(/\/video\/([^/]+)/)?.[1];
        return id ? id as VideoID : null;
    } catch {
        return null;
    }
}

function getRutubeVideoElement(): HTMLVideoElement | null {
    return document.querySelector("video") as HTMLVideoElement | null;
}

async function getRutubeInfo(videoID: VideoID): Promise<RutubeInfo | null> {
    const response = await sendRequestToCustomServer("POST", `${RUTUBE_API}/rutube/info`, {
        url: `https://rutube.ru/video/${videoID}`
    });

    if (!response.ok) return null;

    return JSON.parse(response.responseText) as RutubeInfo;
}

async function getRutubeSegments(videoID: VideoID): Promise<FetchResponse & { segments?: SponsorTime[] }> {
    const response = await sendRequestToCustomServer("GET", `${RUTUBE_API}/timestamps/${videoID}`);
    if (!response.ok) return response;

    const timestamps = (JSON.parse(response.responseText)?.timestamps ?? []) as RutubeTimestamp[];
    return {
        ...response,
        segments: timestamps
            .filter((timestamp) => timestamp.type === "skip" && timestamp.end > timestamp.start)
            .map((timestamp) => ({
                segment: [timestamp.start, timestamp.end] as [number, number],
                UUID: `rutube-${timestamp.start}-${timestamp.end}` as SegmentUUID,
                category: "sponsor" as Category,
                actionType: ActionType.Skip,
                source: SponsorSourceType.Server
            }))
            .sort((a, b) => a.segment[0] - b.segment[0])
    };
}

async function submitRutubeSegment(videoID: VideoID, segment: SponsorTime): Promise<FetchResponse> {
    const info = await getRutubeInfo(videoID);

    return await sendRequestToCustomServer("POST", `${RUTUBE_API}/timestamps/${videoID}`, {
        start: segment.segment[0],
        end: segment.segment[1],
        type: "skip",
        videoTitle: info?.title,
        videoUrl: info?.url ?? `https://rutube.ru/video/${videoID}`,
        videoType: info?.type
    });
}

export const rutubeVideoService: VideoService = {
    id: "rutube",
    isCurrentHost: isRutubeHost,
    getVideoID: getRutubeVideoID,
    getVideoElement: getRutubeVideoElement,
    getSegments: getRutubeSegments,
    submitSegment: submitRutubeSegment,
    setupTracking: ({ onVideoIDChange, onVideoElementChange }) => {
        onVideoIDChange();

        const video = getRutubeVideoElement();
        if (video) onVideoElementChange(video);

        let lastUrl = location.href;
        const interval = setInterval(() => {
            const video = getRutubeVideoElement();
            if (video) onVideoElementChange(video);
            if (location.href === lastUrl) return;

            lastUrl = location.href;
            onVideoIDChange();
        }, 500);

        addCleanupListener(() => clearInterval(interval));
    },
    selectors: {
        controls: RUTUBE_CONTROLS_SELECTORS,
        previewBar: RUTUBE_PREVIEW_BAR_SELECTOR,
        referenceNode: RUTUBE_REFERENCE_NODE_SELECTORS
    },
    previewBarClass: "sb-video-service-previewbar",
    capabilities: {
        categoryPill: false,
        chapters: false,
        chapterVote: false,
        deArrow: false,
        documentScript: false
    }
};
