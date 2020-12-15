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

type VideoID = string;

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
    BackgroundScriptContainer
};
