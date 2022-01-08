//
// Message and Response Types
//

import { SponsorTime } from "./types";

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

export type Message = BaseMessage & (DefaultMessage | BoolValueMessage | IsInfoFoundMessage);

export interface IsInfoFoundMessageResponse {
    found: boolean;
    sponsorTimes: SponsorTime[];
    onMobileYouTube: boolean;
}

interface GetVideoIdResponse {
    videoID: string;
}

interface GetChannelIDResponse {
    channelID: string;
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
    | GetChannelIDResponse
    | SponsorStartResponse
    | IsChannelWhitelistedResponse
    | Record<string, never>;

export interface VoteResponse {
    successType: number;
    statusCode: number;
    responseText: string;
}