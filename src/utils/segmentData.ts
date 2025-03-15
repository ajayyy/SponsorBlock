import { DataCache } from "../../maze-utils/src/cache";
import { getHash, HashedValue } from "../../maze-utils/src/hash";
import Config from "../config";
import * as CompileConfig from "../../config.json";
import { ActionType, ActionTypes, CategorySkipOption, Category, SponsorSourceType, SponsorTime, VideoID, ChannelSpecificSettings } from "../types";
import { getHashParams } from "./pageUtils";
import { asyncRequestToServer } from "./requests";

const segmentDataCache = new DataCache<VideoID, SegmentResponse>(() => {
    return {
        segments: null,
        status: 200
    };
}, 5);

const pendingList: Record<VideoID, Promise<SegmentResponse>> = {};

export interface SegmentResponse {
    segments: SponsorTime[] | null;
    status: number;
}

export async function getSegmentsForVideo(videoID: VideoID, ignoreCache: boolean, channelSettings:ChannelSpecificSettings = null): Promise<SegmentResponse> {
    if (!ignoreCache) {
        const cachedData = segmentDataCache.getFromCache(videoID);
        if (cachedData) {
            segmentDataCache.cacheUsed(videoID);
            return cachedData;
        }
    }

    if (pendingList[videoID]) {
        return await pendingList[videoID];
    }

    const pendingData = fetchSegmentsForVideo(videoID, channelSettings);
    pendingList[videoID] = pendingData;

    const result = await pendingData;
    delete pendingList[videoID];

    return result;
}

async function fetchSegmentsForVideo(videoID: VideoID, channelSettings:ChannelSpecificSettings = null): Promise<SegmentResponse> {
    
    let categories: string[] = Config.config.categorySelections.map((category) => category.name);
    

    if (channelSettings){
        const disabledCategories = new Set(channelSettings.categorySelections.filter(category => category.option === CategorySkipOption.Disabled).map((category) => category.name));
        categories = [...new Set([...categories, ...channelSettings.categorySelections.map((category) => category.name)])].filter((category) => !disabledCategories.has(category as Category));
    }

    const extraRequestData: Record<string, unknown> = {};
    const hashParams = getHashParams();
    if (hashParams.requiredSegment) extraRequestData.requiredSegment = hashParams.requiredSegment;

    const hashPrefix = (await getHash(videoID, 1)).slice(0, 4) as VideoID & HashedValue;
    const hasDownvotedSegments = !!Config.local.downvotedSegments[hashPrefix];
    const response = await asyncRequestToServer('GET', "/api/skipSegments/" + hashPrefix, {
        categories: CompileConfig.categoryList,
        actionTypes: ActionTypes,
        trimUUIDs: hasDownvotedSegments ? null : 5,
        ...extraRequestData
    }, {
        "X-CLIENT-NAME": `${chrome.runtime.id}/v${chrome.runtime.getManifest().version}`
    });

    if (response.ok) {
        const enabledActionTypes = getEnabledActionTypes();

        const receivedSegments: SponsorTime[] = JSON.parse(response.responseText)
                    ?.filter((video) => video.videoID === videoID)
                    ?.map((video) => video.segments)?.[0]
                    ?.filter((segment) => enabledActionTypes.includes(segment.actionType) && categories.includes(segment.category))
                    ?.map((segment) => ({
                        ...segment,
                        source: SponsorSourceType.Server
                    }))
                    ?.sort((a, b) => a.segment[0] - b.segment[0]);
        
        //if the channel specific settings make it so the video has no segments, [] has to be returned to 
        //to notify that any segments that loaded have to be removed  
        if (receivedSegments && (receivedSegments.length || channelSettings)) {
            const result = {
                segments: receivedSegments,
                status: response.status
            };

            segmentDataCache.setupCache(videoID).segments = result.segments;
            return result;
        } else {
            // Setup with null data
            segmentDataCache.setupCache(videoID);
        }
    }

    return {
        segments: null,
        status: response.status
    };
}

function getEnabledActionTypes(forceFullVideo = false): ActionType[] {
    const actionTypes = [ActionType.Skip, ActionType.Poi, ActionType.Chapter];
    if (Config.config.muteSegments) {
        actionTypes.push(ActionType.Mute);
    }
    if (Config.config.fullVideoSegments || forceFullVideo) {
        actionTypes.push(ActionType.Full);
    }

    return actionTypes;
}