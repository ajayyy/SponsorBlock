import SubmissionNotice from "./render/SubmissionNotice";
import SkipNoticeComponent from "./components/SkipNoticeComponent";

interface ContentContainer {
    (): {
        vote: (type: any, UUID: any, skipNotice?: SkipNoticeComponent) => void,
        dontShowNoticeAgain: () => void,
        unskipSponsorTime: (UUID: any) => void,
        sponsorTimes: number[][],
        sponsorTimesSubmitting: number[][],
        hiddenSponsorTimes: any[],
        UUIDs: any[],
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

export {
    VideoDurationResponse,
    ContentContainer,
    CategorySkipOption,
    CategorySelection
};