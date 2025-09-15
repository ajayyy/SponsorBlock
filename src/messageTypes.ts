//
// Message and Response Types
//

import { ConfigurationID } from "./config";
import { SegmentUUID, SponsorHideType, SponsorTime, VideoID } from "./types";

interface BaseMessage {
    from?: string;
}

interface DefaultMessage {
    message:
        "update"
        | "sponsorStart"
        | "getChannelID"
        | "submitTimes"
        | "refreshSegments"
        | "closePopup"
        | "getLogs";
}

interface BoolValueMessage {
    message: "whitelistChange";
    value: boolean;
}

interface IsInfoFoundMessage {
    message: "isInfoFound";
    updating: boolean;
}

interface SkipMessage {
    message: "unskip" | "reskip" | "selectSegment";
    UUID: SegmentUUID;
}

interface SubmitVoteMessage {
    message: "submitVote";
    type: number;
    UUID: SegmentUUID;
}

interface HideSegmentMessage {
    message: "hideSegment";
    type: SponsorHideType;
    UUID: SegmentUUID;
}

interface CopyToClipboardMessage {
    message: "copyToClipboard";
    text: string;
}

interface ImportSegmentsMessage {
    message: "importSegments";
    data: string;
}

interface LoopChapterMessage {
    message: "loopChapter";
    UUID: SegmentUUID;
}

interface KeyDownMessage {
    message: "keydown";
    key: string;
    keyCode: number;
    code: string;
    which: number;
    shiftKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    metaKey: boolean;
}

interface SetCurrentTabSkipProfileResponse {
    message: "setCurrentTabSkipProfile";
    configID: ConfigurationID | null;
}

export type Message = BaseMessage & (DefaultMessage | BoolValueMessage | IsInfoFoundMessage | SkipMessage | SubmitVoteMessage | HideSegmentMessage | CopyToClipboardMessage | ImportSegmentsMessage | KeyDownMessage | LoopChapterMessage | SetCurrentTabSkipProfileResponse);

export interface IsInfoFoundMessageResponse {
    found: boolean;
    status: number | string | Error;
    sponsorTimes: SponsorTime[];
    time: number;
    onMobileYouTube: boolean;
    videoID: VideoID;
    loopedChapter: SegmentUUID | null;
    channelID: string;
    channelAuthor: string;
    currentTabSkipProfileID: ConfigurationID | null;
}

interface GetVideoIdResponse {
    videoID: string;
}

export interface GetChannelIDResponse {
    channelID: string;
    isYTTV: boolean;
}

export interface SponsorStartResponse {
    creatingSegment: boolean;
}

export interface IsChannelWhitelistedResponse {
    value: boolean;
}

export interface LoopedChapterResponse {
    UUID: SegmentUUID;
}

export type MessageResponse =
    IsInfoFoundMessageResponse
    | GetVideoIdResponse
    | GetChannelIDResponse
    | SponsorStartResponse
    | IsChannelWhitelistedResponse
    | Record<string, never> // empty object response {}
    | VoteResponse
    | ImportSegmentsResponse
    | RefreshSegmentsResponse
    | LogResponse
    | LoopedChapterResponse;

export type VoteResponse = {
    status: number;
    ok: boolean;
    responseText: string;
} | {
    error: Error | string;
};

interface ImportSegmentsResponse {
    importedSegments: SponsorTime[];
}

export interface RefreshSegmentsResponse {
    hasVideo: boolean;
}

export interface LogResponse {
    debug: string[];
    warn: string[];
}

export interface TimeUpdateMessage {
    message: "time";
    time: number;
}

export type InfoUpdatedMessage = IsInfoFoundMessageResponse & {
    message: "infoUpdated";
}

export interface VideoChangedPopupMessage {
    message: "videoChanged";
    videoID: string;
    channelID: string;
    channelAuthor: string;
}

export type PopupMessage = TimeUpdateMessage | InfoUpdatedMessage | VideoChangedPopupMessage;
