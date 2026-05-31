import { ActionType, Category, SegmentUUID, SponsorSourceType, SponsorTime, VideoID } from "../types";
import { FetchResponse, sendRequestToCustomServer } from "../../maze-utils/src/background-request-proxy";

const RUTUBE_API = "https://sponsorblock.futuba.ru/api";

interface RutubeTimestamp {
    start: number;
    end: number;
    type?: string;
}

interface RutubeInfo {
    title?: string;
    url?: string;
    type?: string;
}

export function isRutubeHost(host = location.host): boolean {
    return host === "rutube.ru" || host.endsWith(".rutube.ru");
}

export function getRutubeVideoID(url = document.URL): VideoID | null {
    try {
        const urlObject = new URL(url);
        if (!isRutubeHost(urlObject.host)) return null;

        const id = urlObject.pathname.match(/\/video\/([^/]+)/)?.[1];
        return id ? id as VideoID : null;
    } catch {
        return null;
    }
}

export async function getRutubeInfo(videoID: VideoID): Promise<RutubeInfo | null> {
    const response = await sendRequestToCustomServer("POST", `${RUTUBE_API}/rutube/info`, {
        url: `https://rutube.ru/video/${videoID}`
    });

    if (!response.ok) return null;

    return JSON.parse(response.responseText) as RutubeInfo;
}

export async function getRutubeSegments(videoID: VideoID): Promise<FetchResponse & { segments?: SponsorTime[] }> {
    const response = await sendRequestToCustomServer("GET", `${RUTUBE_API}/timestamps/${videoID}`);
    if (!response.ok) return response;

    const timestamps = (JSON.parse(response.responseText)?.timestamps ?? []) as RutubeTimestamp[];
    return {
        ...response,
        segments: timestamps
            .filter((timestamp) => timestamp.type === "skip" && timestamp.end > timestamp.start)
            .map((timestamp) => ({
                segment: [timestamp.start, timestamp.end] as [number, number],
                UUID: `rutube-${timestamp.start}-${timestamp.end}` as SegmentUUID,
                category: "sponsor" as Category,
                actionType: ActionType.Skip,
                source: SponsorSourceType.Server
            }))
            .sort((a, b) => a.segment[0] - b.segment[0])
    };
}

export async function submitRutubeSegment(videoID: VideoID, segment: SponsorTime): Promise<FetchResponse> {
    const info = await getRutubeInfo(videoID);

    return await sendRequestToCustomServer("POST", `${RUTUBE_API}/timestamps/${videoID}`, {
        start: segment.segment[0],
        end: segment.segment[1],
        type: "skip",
        videoTitle: info?.title,
        videoUrl: info?.url ?? `https://rutube.ru/video/${videoID}`,
        videoType: info?.type
    });
}
