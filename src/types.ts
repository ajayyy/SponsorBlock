import SubmissionNotice from "./render/SubmissionNotice";
import SkipNoticeComponent from "./components/SkipNoticeComponent";

interface ContentContainer {
    (): {
        vote: (type: any, UUID: any, category?: string, skipNotice?: SkipNoticeComponent) => void,
        dontShowNoticeAgain: () => void,
        unskipSponsorTime: (UUID: any) => void,
        sponsorTimes: SponsorTime[],
        sponsorTimesSubmitting: SponsorTime[],
        v: HTMLVideoElement,
        sponsorVideoID,
        reskipSponsorTime: (UUID: any) => void,
        updatePreviewBar: () => void,
        onMobileYouTube: boolean,
        sponsorSubmissionNotice: SubmissionNotice,
        resetSponsorSubmissionNotice: () => void,
        changeStartSponsorButton: (showStartSponsor: any, uploadButtonVisible: any) => Promise<boolean>,
        previewTime: (time: number) => void
    }
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

type VideoID = string;

export {
    VideoDurationResponse,
    ContentContainer,
    CategorySelection,
    CategorySkipOption,
    SponsorTime,
    VideoID,
    SponsorHideType
};