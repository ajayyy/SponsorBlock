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
        | "getChannelInfo"
        | "isChannelWhitelisted"
        | "submitTimes"
        | "refreshSegments";
}

interface BoolValueMessage {
    message: "whitelistChange";
    value: boolean;
}

interface IsInfoFoundMessage {
    message: "isInfoFound";
    updating: boolean;
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

export type Message = BaseMessage & (DefaultMessage | BoolValueMessage | IsInfoFoundMessage | SubmitVoteMessage | HideSegmentMessage);

export interface IsInfoFoundMessageResponse {
    found: boolean;
    sponsorTimes: SponsorTime[];
    onMobileYouTube: boolean;
}

interface GetVideoIdResponse {
    videoID: string;
}

interface GetChannelInfoResponse {
    channelID: string;
    channelName: string;
}

interface SponsorStartResponse {
    creatingSegment: boolean;
}

interface IsChannelWhitelistedResponse {
    value: boolean;
}

export type MessageResponse = 
    IsInfoFoundMessageResponse
    | GetVideoIdResponse
    | GetChannelInfoResponse
    | SponsorStartResponse
    | IsChannelWhitelistedResponse
    | Record<string, never>
    | VoteResponse;

export interface VoteResponse {
    successType: number;
    statusCode: number;
    responseText: string;
}
