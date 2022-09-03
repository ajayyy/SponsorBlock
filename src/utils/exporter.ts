import { ActionType, Category, SegmentUUID, SponsorSourceType, SponsorTime } from "../types";
import { shortCategoryName } from "./categoryUtils";
import { GenericUtils } from "./genericUtils";
import * as CompileConfig from "../../config.json";

const inTest = typeof chrome === "undefined";

const chapterNames = CompileConfig.categoryList.filter((code) => code !== "chapter")
    .map((code) => ({
        code,
        name: !inTest ? chrome.i18n.getMessage("category_" + code) : code
    }));

export function exportTimes(segments: SponsorTime[]): string {
    let result = "";
    for (const segment of segments) {
        if (![ActionType.Full, ActionType.Mute].includes(segment.actionType)
                && segment.source !== SponsorSourceType.YouTube) {
            result += exportTime(segment) + "\n";
        }
    }

    return result.replace(/\n$/, "");
}

function exportTime(segment: SponsorTime): string {
    const name = segment.description || shortCategoryName(segment.category);

    return `${GenericUtils.getFormattedTime(segment.segment[0], true)}${
        segment.segment[1] && segment.segment[0] !== segment.segment[1] 
            ? ` - ${GenericUtils.getFormattedTime(segment.segment[1], true)}` : ""} ${name}`;
}

export function importTimes(data: string, videoDuration: number): SponsorTime[] {
    const lines = data.split("\n");
    const result: SponsorTime[] = [];
    for (const line of lines) {
        const match = line.match(/(?:((?:\d+:)?\d+:\d+)+(?:\.\d+)?)|(?:\d+(?=s| second))/g);
        if (match) {
            const startTime = GenericUtils.getFormattedTimeToSeconds(match[0]);
            if (startTime) {
                const specialCharsMatcher = /^(?:\s+seconds?)?[-:()\s]*|(?:\s+at)?[-:()\s]+$/g
                const titleLeft = line.split(match[0])[0].replace(specialCharsMatcher, "");
                let titleRight = null;
                const split2 = line.split(match[1] || match[0]);
                titleRight = split2[split2.length - 1].replace(specialCharsMatcher, "");

                const title = titleLeft?.length > titleRight?.length ? titleLeft : titleRight;
                if (title) {
                    const determinedCategory = chapterNames.find(c => c.name === title)?.code as Category;

                    const segment: SponsorTime = {
                        segment: [startTime, GenericUtils.getFormattedTimeToSeconds(match[1])],
                        category: determinedCategory ?? ("chapter" as Category),
                        actionType: determinedCategory ? ActionType.Skip : ActionType.Chapter,
                        description: title,
                        source: SponsorSourceType.Local,
                        UUID: GenericUtils.generateUserID() as SegmentUUID
                    };

                    if (result.length > 0 && result[result.length - 1].segment[1] === null) {
                        result[result.length - 1].segment[1] = segment.segment[0];
                    }

                    result.push(segment);
                }
            }
        }
    }

    if (result.length > 0 && result[result.length - 1].segment[1] === null) {
        result[result.length - 1].segment[1] = videoDuration;
    }

    return result;
}

export function exportTimesAsHashParam(segments: SponsorTime[]): string {
    const hashparamSegments = segments.map(segment => ({
        actionType: segment.actionType,
        category: segment.category,
        segment: segment.segment,
        ...(segment.description ? {description: segment.description} : {})  // don't include the description param if empty
    }));

    return `#segments=${JSON.stringify(hashparamSegments)}`;
}
