import { Category, CategorySkipOption, VideoID } from "../types";
import { getHash } from "../../maze-utils/src/hash";
import { logWarn } from "./logger";
import { asyncRequestToServer } from "./requests";
import { getCategorySelection } from "./skipRule";

export interface VideoLabelsCacheData {
    category: Category;
    hasStartSegment: boolean;
}

export interface LabelCacheEntry {
    timestamp: number;
    videos: Record<VideoID, VideoLabelsCacheData>;
}

const labelCache: Record<string, LabelCacheEntry> = {};
const cacheLimit = 1000;

async function getLabelHashBlock(hashPrefix: string): Promise<LabelCacheEntry | null> {
    // Check cache
    const cachedEntry = labelCache[hashPrefix];
    if (cachedEntry) {
        return cachedEntry;
    }

    const response = await asyncRequestToServer("GET", `/api/videoLabels/${hashPrefix}?hasStartSegment=true`);
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
            videos: Object.fromEntries(data.map(video => [video.videoID, {
                category: video.segments[0]?.category,
                hasStartSegment: video.hasStartSegment
            }])),
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
    const prefix = (await getHash(videoID, 1)).slice(0, 4);
    const result = await getLabelHashBlock(prefix);

    if (result) {
        const category = result.videos[videoID]?.category;
        if (category && getCategorySelection(result.videos[videoID]).option !== CategorySkipOption.Disabled) {
            return category;
        } else {
            return null;
        }
    }

    return null;
}

export async function getHasStartSegment(videoID: VideoID): Promise<boolean | null> {
    const prefix = (await getHash(videoID, 1)).slice(0, 4);
    const result = await getLabelHashBlock(prefix);

    if (result) {
        return result?.videos[videoID]?.hasStartSegment ?? false;
    }

    return null;
}