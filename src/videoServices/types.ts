import { FetchResponse } from "../../maze-utils/src/background-request-proxy";
import { SponsorTime, VideoID } from "../types";

export interface VideoService {
    id: string;
    isCurrentHost(host?: string): boolean;
    getVideoID(url?: string): VideoID | null;
    getVideoElement?(): HTMLVideoElement | null;
    getSegments?(videoID: VideoID): Promise<FetchResponse & { segments?: SponsorTime[] }>;
    submitSegment?(videoID: VideoID, segment: SponsorTime): Promise<FetchResponse>;
    setupTracking?(handlers: {
        onVideoIDChange: () => void;
        onVideoElementChange: (video: HTMLVideoElement) => void;
    }): void;
    selectors?: {
        controls?: string[];
        popupParent?: string[];
        previewBar?: string;
        referenceNode?: string[];
    };
    previewBarClass?: string;
    contentStyle?: string;
    capabilities: {
        categoryPill: boolean;
        chapters: boolean;
        chapterVote: boolean;
        deArrow: boolean;
        documentScript: boolean;
    };
}