/*
 * Reads the state of YouTube's player from the page.
 *
 * Works against small structural interfaces instead of the DOM types, so it can be driven by
 * plain objects in tests. Every read tolerates missing or odd values and falls back to a
 * "nothing known" answer rather than throwing.
 */

import type { ControllerProbe } from "./controller";

/** A request whose player position is further than this from the playhead is not the main stream's. */
export const PLAYER_TIME_TOLERANCE_MS = 2500;
/** Playback can sit a hair before the start of the range that is about to be buffered. */
const BUFFER_EDGE_SLACK_SEC = 0.1;
const MS_PER_SECOND = 1000;

export interface TimeRangesLike {
    readonly length: number;
    start(index: number): number;
    end(index: number): number;
}

export interface VideoLike {
    currentTime: number;
    readonly playbackRate: number;
    readonly paused: boolean;
    readonly mediaKeys?: unknown;
    readonly buffered: TimeRangesLike;
}

export interface PlayerElementLike {
    readonly classList: { contains(name: string): boolean };
    getVideoData?: () => { video_id?: unknown } | null | undefined;
}

export interface ProbeDocument {
    querySelector(selector: string): VideoLike | null;
    getElementById(id: string): PlayerElementLike | null;
}

const PLAYER_ID = "movie_player";
const AD_CLASS = "ad-showing";

export function createPlayerProbe(doc: ProbeDocument): ControllerProbe {
    const video = (): VideoLike | null => doc.querySelector(`#${PLAYER_ID} video`) ?? doc.querySelector("video");
    const player = (): PlayerElementLike | null => doc.getElementById(PLAYER_ID);

    const currentTimeMs = (): number => Math.round((video()?.currentTime ?? 0) * MS_PER_SECOND);

    function bufferedEndSec(): number | null {
        const element = video();
        if (!element) return null;

        const { buffered, currentTime } = element;
        for (let index = 0; index < buffered.length; index++) {
            const inRange = buffered.start(index) <= currentTime + BUFFER_EDGE_SLACK_SEC && buffered.end(index) >= currentTime;
            if (inRange) return buffered.end(index);
        }

        return null;
    }

    /** Every buffered range as "start-end" in seconds, for the debug log. */
    function bufferedRanges(): string {
        const element = video();
        if (!element || element.buffered.length === 0) return "none";

        const ranges: string[] = [];
        for (let index = 0; index < element.buffered.length; index++) {
            ranges.push(`${element.buffered.start(index).toFixed(1)}-${element.buffered.end(index).toFixed(1)}`);
        }

        return ranges.join("|");
    }

    function videoId(): string | null {
        try {
            const id = player()?.getVideoData?.()?.video_id;
            return typeof id === "string" && id.length > 0 ? id : null;
        } catch {
            return null;
        }
    }

    function isMainPlayer(playerTimeMs: number): boolean {
        const element = video();
        if (!element) return false;

        const adShowing = player()?.classList.contains(AD_CLASS) ?? false;
        const protectedPlayback = element.mediaKeys !== undefined && element.mediaKeys !== null;
        return !adShowing
            && !protectedPlayback
            && Math.abs(playerTimeMs - currentTimeMs()) <= PLAYER_TIME_TOLERANCE_MS;
    }

    return {
        currentTimeMs,
        bufferedEndSec,
        bufferedRanges,
        isMainPlayer,
        videoId,
        playbackRate: () => video()?.playbackRate ?? 1,
        isPaused: () => video()?.paused ?? true,

        kick() {
            const element = video();
            if (element) element.currentTime = element.currentTime;
        }
    };
}
