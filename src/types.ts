import SubmissionNotice from "./render/SubmissionNotice";
import SkipNoticeComponent from "./components/SkipNoticeComponent";
import SkipNotice from "./render/SkipNotice";

export interface ContentContainer {
    (): {
        vote: (type: number, UUID: SegmentUUID, category?: Category, skipNotice?: SkipNoticeComponent) => void,
        dontShowNoticeAgain: () => void,
        unskipSponsorTime: (segment: SponsorTime, unskipTime: number) => void,
        sponsorTimes: SponsorTime[],
        sponsorTimesSubmitting: SponsorTime[],
        skipNotices: SkipNotice[],
        v: HTMLVideoElement,
        sponsorVideoID,
        reskipSponsorTime: (segment: SponsorTime) => void,
        updatePreviewBar: () => void,
        onMobileYouTube: boolean,
        sponsorSubmissionNotice: SubmissionNotice,
        resetSponsorSubmissionNotice: () => void,
        updateEditButtonsOnPlayer: () => void,
        previewTime: (time: number, unpause?: boolean) => void,
        videoInfo: VideoInfo,
        getRealCurrentTime: () => number
    }
}

export interface FetchResponse {
    responseText: string,
    status: number,
    ok: boolean
}

export interface VideoDurationResponse {
    duration: number;
}

export enum CategorySkipOption {
    ShowOverlay,
    ManualSkip,
    AutoSkip
}

export interface CategorySelection {
    name: Category;
    option: CategorySkipOption
}

export enum SponsorHideType {
    Visible = undefined,
    Downvoted = 1,
    MinimumDuration
}

export enum CategoryActionType {
    Skippable = "", // Strings are used to find proper language configs
    POI = "_POI"
}

export enum ActionType {
    Skip = "skip",
    Mute = "mute",
    Visual = "visual",
}

export type SegmentUUID = string  & { __segmentUUIDBrand: unknown };
export type Category = string & { __categoryBrand: unknown };

export enum SponsorSourceType {
    Server = undefined,
    Local = 1
}

export interface SponsorTime {
    segment: [number] | [number, number];
    UUID: SegmentUUID;

    category: Category;
    actionType: ActionType;

    hidden?: SponsorHideType;
    source?: SponsorSourceType;

    visual: string;
}

export interface VisualSegmentInfo {
    time: number;
    bounds: [number, number][];
    smooth: boolean;
    curve: string;
    color: string;
}

export interface ScheduledTime extends SponsorTime {
    scheduledTime: number;
}

export interface PreviewBarOption {
    color: string,
    opacity: string
}


export interface Registration {
    message: string,
    id: string,
    allFrames: boolean,
    js: browser.extensionTypes.ExtensionFileOrCode[],
    css: browser.extensionTypes.ExtensionFileOrCode[],
    matches: string[]
}

export interface BackgroundScriptContainer {
    registerFirefoxContentScript: (opts: Registration) => void,
    unregisterFirefoxContentScript: (id: string) => void
}

export interface VideoInfo {
    responseContext: {
        serviceTrackingParams: Array<{service: string, params: Array<{key: string, value: string}>}>,
        webResponseContextExtensionData: {
            hasDecorated: boolean
        }
    },
    playabilityStatus: {
        status: string,
        playableInEmbed: boolean,
        miniplayer: {
            miniplayerRenderer: {
                playbackMode: string
            }
        }
    };
    streamingData: unknown;
    playbackTracking: unknown;
    videoDetails: {
        videoId: string,
        title: string,
        lengthSeconds: string,
        keywords: string[],
        channelId: string,
        isOwnerViewing: boolean,
        shortDescription: string,
        isCrawlable: boolean,
        thumbnail: {
            thumbnails: Array<{url: string, width: number, height: number}>
        },
        averageRating: number,
        allowRatings: boolean,
        viewCount: string,
        author: string,
        isPrivate: boolean,
        isUnpluggedCorpus: boolean,
        isLiveContent: boolean,
    };
    playerConfig: unknown;
    storyboards: unknown;
    microformat: {
        playerMicroformatRenderer: {
            thumbnail: {
                thumbnails: Array<{url: string, width: number, height: number}>
            },
            embed: {
                iframeUrl: string,
                flashUrl: string,
                width: number,
                height: number,
                flashSecureUrl: string,
            },
            title: {
                simpleText: string,
            },
            description: {
                simpleText: string,
            },
            lengthSeconds: string,
            ownerProfileUrl: string,
            externalChannelId: string,
            availableCountries: string[],
            isUnlisted: boolean,
            hasYpcMetadata: boolean,
            viewCount: string,
            category: Category,
            publishDate: string,
            ownerChannelName: string,
            uploadDate: string,
        }
    };
    trackingParams: string;
    attestation: unknown;
    messages: unknown;
}

export type VideoID = string;

export type StorageChangesObject = { [key: string]: chrome.storage.StorageChange };

export type UnEncodedSegmentTimes = [string, SponsorTime[]][];

export enum ChannelIDStatus {
    Fetching,
    Found,
    Failed
}

export interface ChannelIDInfo {
    id: string,
    status: ChannelIDStatus
}

export interface SkipToTimeParams {
    v: HTMLVideoElement, 
    skipTime: number[], 
    skippingSegments: SponsorTime[], 
    openNotice: boolean, 
    forceAutoSkip?: boolean,
    unskipTime?: number
}

export interface ToggleSkippable {
    toggleSkip: () => void;
    setShowKeybindHint: (show: boolean) => void;
}

export enum NoticeVisbilityMode {
    FullSize = 0,
    MiniForAutoSkip = 1,
    MiniForAll = 2,
    FadedForAutoSkip = 3,
    FadedForAll = 4
}