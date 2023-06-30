import { ActionType, Category, SegmentUUID, SponsorSourceType, SponsorTime } from "../types";
import { shortCategoryName } from "./categoryUtils";
import * as CompileConfig from "../../config.json";
import { getFormattedTime, getFormattedTimeToSeconds } from "../maze-utils/formating";
import { generateUserID } from "../maze-utils/setup";

const inTest = typeof chrome === "undefined";

const chapterNames = CompileConfig.categoryList.filter((code) => code !== "chapter")
    .map((code) => ({
        code,
        names: !inTest ? [chrome.i18n.getMessage("category_" + code), shortCategoryName(code)] : [code]
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

    return `${getFormattedTime(segment.segment[0], true)}${
        segment.segment[1] && segment.segment[0] !== segment.segment[1] 
            ? ` - ${getFormattedTime(segment.segment[1], true)}` : ""} ${name}`;
}

export function importTimes(data: string, videoDuration: number): SponsorTime[] {
    const lines = data.split("\n");
    const result: SponsorTime[] = [];
    for (const line of lines) {
        const match = line.match(/(?:((?:\d+:)?\d+:\d+)+(?:\.\d+)?)|(?:\d+(?=s| second))/g);
        if (match) {
            const startTime = getFormattedTimeToSeconds(match[0]);
            if (startTime !== null) {
                // Remove "seconds", "at", special characters, and ")" if there was a "("
                const specialCharMatchers = [{
                    matcher: /^(?:\s+seconds?)?[-:()\s]*|(?:\s+at)?[-:(\s]+$/g
                }, {
                    matcher: /[-:()\s]*$/g,
                    condition: (value) => !!value.match(/^\s*\(/)
                }];
                const titleLeft = removeIf(line.split(match[0])[0], specialCharMatchers);
                let titleRight = null;
                const split2 = line.split(match[1] || match[0]);
                titleRight = removeIf(split2[split2.length - 1], specialCharMatchers)

                const title = titleLeft?.length > titleRight?.length ? titleLeft : titleRight;
                if (title) {
                    const determinedCategory = chapterNames.find(c => c.names.includes(title))?.code as Category;

                    const segment: SponsorTime = {
                        segment: [startTime, getFormattedTimeToSeconds(match[1])],
                        category: determinedCategory ?? ("chapter" as Category),
                        actionType: determinedCategory ? ActionType.Skip : ActionType.Chapter,
                        description: title,
                        source: SponsorSourceType.Local,
                        UUID: generateUserID() as SegmentUUID
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

function removeIf(value: string, matchers: Array<{ matcher: RegExp; condition?: (value: string) => boolean }>): string {
    let result = value;
    for (const matcher of matchers) {
        if (!matcher.condition || matcher.condition(value)) {
            result = result.replace(matcher.matcher, "");
        }
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


export function normalizeChapterName(description: string): string {
    return description.toLowerCase().replace(/\.|:|-/g, "").replace(/\s+/g, " ");
}