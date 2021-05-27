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
        | "isInfoFound"
        | "getVideoID"
        | "getChannelID"
        | "isChannelWhitelisted"
        | "submitTimes";
}

interface BoolValueMessage {
    message: "whitelistChange";
    value: boolean;
}

export type Message = BaseMessage & (DefaultMessage | BoolValueMessage);

interface IsInfoFoundMessageResponse {
    found: boolean;
    sponsorTimes: SponsorTime[];
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
    | IsChannelWhitelistedResponse;

