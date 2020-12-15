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
        | "sponsorDataChanged"
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

interface ChangeStartSponsorButtonMessage {
    message: "changeStartSponsorButton";
    showStartSponsor: boolean;
    uploadButtonVisible: boolean;
}

export type Message = BaseMessage & (DefaultMessage | BoolValueMessage | ChangeStartSponsorButtonMessage);

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
    time: number;
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

