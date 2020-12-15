import SubmissionNotice from "./render/SubmissionNotice";
import SkipNoticeComponent from "./components/SkipNoticeComponent";

interface ContentContainer {
    (): {
        vote: (type: number, UUID: string, category?: string, skipNotice?: SkipNoticeComponent) => void,
        dontShowNoticeAgain: () => void,
        unskipSponsorTime: (segment: SponsorTime) => void,
        sponsorTimes: SponsorTime[],
        sponsorTimesSubmitting: SponsorTime[],
        v: HTMLVideoElement,
        sponsorVideoID,
        reskipSponsorTime: (segment: SponsorTime) => void,
        updatePreviewBar: () => void,
        onMobileYouTube: boolean,
        sponsorSubmissionNotice: SubmissionNotice,
        resetSponsorSubmissionNotice: () => void,
        changeStartSponsorButton: (showStartSponsor: boolean, uploadButtonVisible: boolean) => Promise<boolean>,
        previewTime: (time: number, unpause?: boolean) => void,
        videoInfo: VideoInfo,
        getRealCurrentTime: () => number
    }
}

interface FetchResponse {
    responseText: string,
    status: number,
    ok: boolean
}

interface VideoDurationResponse {
    duration: number;
}

enum CategorySkipOption {
    ShowOverlay,
    ManualSkip,
    AutoSkip
}

interface CategorySelection {
    name: string;
    option: CategorySkipOption
}

enum SponsorHideType {
    Visible = undefined,
    Downvoted = 1,
    MinimumDuration
}

interface SponsorTime {
    segment: number[];
    UUID: string;

    category: string;

    hidden?: SponsorHideType;
}

interface PreviewBarOption {
    color: string,
    opacity: string
}


interface Registration {
    message: string,
    id: string,
    allFrames: boolean,
    js: browser.extensionTypes.ExtensionFileOrCode[],
    css: browser.extensionTypes.ExtensionFileOrCode[],
    matches: string[]
}

interface BackgroundScriptContainer {
    registerFirefoxContentScript: (opts: Registration) => void,
    unregisterFirefoxContentScript: (id: string) => void
}

interface VideoInfo {
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
            category: string,
            publishDate: string,
            ownerChannelName: string,
            uploadDate: string,
        }
    };
    trackingParams: string;
    attestation: unknown;
    messages: unknown;
}

type VideoID = string;

type StorageChangesObject = { [key: string]: chrome.storage.StorageChange };

export {
    FetchResponse,
    VideoDurationResponse,
    ContentContainer,
    CategorySelection,
    CategorySkipOption,
    SponsorTime,
    VideoID,
    SponsorHideType,
    PreviewBarOption,
    Registration,
    BackgroundScriptContainer,
    VideoInfo,
    StorageChangesObject,
};
