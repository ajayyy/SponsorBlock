import { Category, CategorySkipOption, VideoID } from "../types";
import { getHash } from "@ajayyy/maze-utils/lib/hash";
import Utils from "../utils";
import { logWarn } from "./logger";

const utils = new Utils();

export interface LabelCacheEntry {
    timestamp: number;
    videos: Record<VideoID, Category>;
}

const labelCache: Record<string, LabelCacheEntry> = {};
const cacheLimit = 1000;

async function getLabelHashBlock(hashPrefix: string): Promise<LabelCacheEntry | null> {
    // Check cache
    const cachedEntry = labelCache[hashPrefix];
    if (cachedEntry) {
        return cachedEntry;
    }

    const response = await utils.asyncRequestToServer("GET", `/api/videoLabels/${hashPrefix}`);
    if (response.status !== 200) {
        // No video labels or server down
        labelCache[hashPrefix] = {
            timestamp: Date.now(),
            videos: {},
        };
        return null;
    }

    try {
        const data = JSON.parse(response.responseText);

        const newEntry: LabelCacheEntry = {
            timestamp: Date.now(),
            videos: Object.fromEntries(data.map(video => [video.videoID, video.segments[0].category])),
        };
        labelCache[hashPrefix] = newEntry;

        if (Object.keys(labelCache).length > cacheLimit) {
            // Remove oldest entry
            const oldestEntry = Object.entries(labelCache).reduce((a, b) => a[1].timestamp < b[1].timestamp ? a : b);
            delete labelCache[oldestEntry[0]];
        }

        return newEntry;
    } catch (e) {
        logWarn(`Error parsing video labels: ${e}`);

        return null;
    }
}

export async function getVideoLabel(videoID: VideoID): Promise<Category | null> {
    const prefix = (await getHash(videoID, 1)).slice(0, 3);
    const result = await getLabelHashBlock(prefix);

    if (result) {
        const category = result.videos[videoID];
        if (category && utils.getCategorySelection(category).option !== CategorySkipOption.Disabled) {
            return category;
        } else {
            return null;
        }
    }

    return null;
}