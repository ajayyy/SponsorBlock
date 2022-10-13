//
// Message and Response Types
//

import { SegmentUUID, SponsorHideType, SponsorTime } from "./types";

interface BaseMessage {
    from?: string;
}

interface DefaultMessage {
    message:
        "update"
        | "sponsorStart"
        | "getVideoID"
        | "getChannelID"
        | "isChannelWhitelisted"
        | "submitTimes"
        | "refreshSegments"
        | "closePopup";
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
    message: "unskip" | "reskip";
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

export type Message = BaseMessage & (DefaultMessage | BoolValueMessage | IsInfoFoundMessage | SkipMessage | SubmitVoteMessage | HideSegmentMessage | CopyToClipboardMessage | ImportSegmentsMessage | KeyDownMessage);

export interface IsInfoFoundMessageResponse {
    found: boolean;
    status: number;
    sponsorTimes: SponsorTime[];
    time: number;
    onMobileYouTube: boolean;
}

interface GetVideoIdResponse {
    videoID: string;
}

export interface GetChannelIDResponse {
    channelID: string;
}

export interface SponsorStartResponse {
    creatingSegment: boolean;
}

export interface IsChannelWhitelistedResponse {
    value: boolean;
}

export type MessageResponse =
    IsInfoFoundMessageResponse
    | GetVideoIdResponse
    | GetChannelIDResponse
    | SponsorStartResponse
    | IsChannelWhitelistedResponse
    | Record<string, never> // empty object response {}
    | VoteResponse
    | ImportSegmentsResponse;

export interface VoteResponse {
    successType: number;
    statusCode: number;
    responseText: string;
}

interface ImportSegmentsResponse {
    importedSegments: SponsorTime[];
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
    whitelisted: boolean;
}

export type PopupMessage = TimeUpdateMessage | InfoUpdatedMessage | VideoChangedPopupMessage;
