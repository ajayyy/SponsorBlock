import { DataCache } from "../../maze-utils/src/cache";
import { getHash, HashedValue } from "../../maze-utils/src/hash";
import Config, { AdvancedSkipRule, SkipRuleAttribute, SkipRuleOperator } from "../config";
import * as CompileConfig from "../../config.json";
import { ActionType, ActionTypes, CategorySelection, CategorySkipOption, SponsorSourceType, SponsorTime, VideoID } from "../types";
import { getHashParams } from "./pageUtils";
import { asyncRequestToServer } from "./requests";
import { extensionUserAgent } from "../../maze-utils/src";
import { VideoLabelsCacheData } from "./videoLabels";

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

export async function getSegmentsForVideo(videoID: VideoID, ignoreCache: boolean): Promise<SegmentResponse> {
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

    const pendingData = fetchSegmentsForVideo(videoID);
    pendingList[videoID] = pendingData;

    const result = await pendingData;
    delete pendingList[videoID];

    return result;
}

async function fetchSegmentsForVideo(videoID: VideoID): Promise<SegmentResponse> {
    const extraRequestData: Record<string, unknown> = {};
    const hashParams = getHashParams();
    if (hashParams.requiredSegment) extraRequestData.requiredSegment = hashParams.requiredSegment;

    const hashPrefix = (await getHash(videoID, 1)).slice(0, 5) as VideoID & HashedValue;
    const hasDownvotedSegments = !!Config.local.downvotedSegments[hashPrefix.slice(0, 4)];
    const response = await asyncRequestToServer('GET', "/api/skipSegments/" + hashPrefix, {
        categories: CompileConfig.categoryList,
        actionTypes: ActionTypes,
        trimUUIDs: hasDownvotedSegments ? null : 5,
        ...extraRequestData
    }, {
        "X-CLIENT-NAME": extensionUserAgent(),
    });

    if (response.ok) {
        const enabledActionTypes = getEnabledActionTypes();

        const receivedSegments: SponsorTime[] = JSON.parse(response.responseText)
                    ?.filter((video) => video.videoID === videoID)
                    ?.map((video) => video.segments)?.[0]
                    ?.filter((segment) => enabledActionTypes.includes(segment.actionType) 
                        && getCategorySelection(segment).option !== CategorySkipOption.Disabled)
                    ?.map((segment) => ({
                        ...segment,
                        source: SponsorSourceType.Server
                    }))
                    ?.sort((a, b) => a.segment[0] - b.segment[0]);

        if (receivedSegments && receivedSegments.length) {
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

export function getCategorySelection(segment: SponsorTime | VideoLabelsCacheData): CategorySelection {
    for (const ruleSet of Config.local.skipRules) {
        if (ruleSet.rules.every((rule) => isSkipRulePassing(segment, rule))) {
            return { name: segment.category, option: ruleSet.skipOption } as CategorySelection;
        }
    }

    for (const selection of Config.config.categorySelections) {
        if (selection.name === segment.category) {
            return selection;
        }
    }
    return { name: segment.category, option: CategorySkipOption.Disabled} as CategorySelection;
}

function getSkipRuleValue(segment: SponsorTime | VideoLabelsCacheData, rule: AdvancedSkipRule): string | number | undefined {
    switch (rule.attribute) {
        case SkipRuleAttribute.StartTime:
            return (segment as SponsorTime).segment?.[0];
        case SkipRuleAttribute.EndTime:
            return (segment as SponsorTime).segment?.[1];
        case SkipRuleAttribute.Duration:
            return (segment as SponsorTime).segment?.[1] - (segment as SponsorTime).segment?.[0];
        case SkipRuleAttribute.Category:
            return segment.category;
        case SkipRuleAttribute.Description:
            return (segment as SponsorTime).description || "";
        case SkipRuleAttribute.Source:
            switch ((segment as SponsorTime).source) {
                case SponsorSourceType.Local:
                    return "local";
                case SponsorSourceType.YouTube:
                    return "youtube";
                case SponsorSourceType.Autogenerated:
                    return "autogenerated";
                case SponsorSourceType.Server:
                    return "server";
            }

            break;
        default:
            return undefined;
    }
}

function isSkipRulePassing(segment: SponsorTime | VideoLabelsCacheData, rule: AdvancedSkipRule): boolean {
    const value = getSkipRuleValue(segment, rule);
    
    switch (rule.operator) {
        case SkipRuleOperator.Less:
            return typeof value === "number" && value < (rule.value as number);
        case SkipRuleOperator.LessOrEqual:
            return typeof value === "number" && value <= (rule.value as number);
        case SkipRuleOperator.Greater:
            return typeof value === "number" && value > (rule.value as number);
        case SkipRuleOperator.GreaterOrEqual:
            return typeof value === "number" && value >= (rule.value as number);
        case SkipRuleOperator.Equal:
            return value === rule.value;
        case SkipRuleOperator.NotEqual:
            return value !== rule.value;
        case SkipRuleOperator.Contains:
            return String(value).toLocaleLowerCase().includes(String(rule.value).toLocaleLowerCase());
        case SkipRuleOperator.Regex:
            return new RegExp(rule.value as string).test(String(value));
        default:
            return false;
    }
}

export function getCategoryDefaultSelection(category: string): CategorySelection {
    for (const selection of Config.config.categorySelections) {
        if (selection.name === category) {
            return selection;
        }
    }
    return { name: category, option: CategorySkipOption.Disabled} as CategorySelection;
}