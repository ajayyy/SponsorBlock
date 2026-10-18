import {
    PLAYER_TIME_TOLERANCE_MS,
    PlayerElementLike,
    ProbeDocument,
    VideoLike,
    createPlayerProbe
} from "../../src/sabr/main/playerProbe";

const ranges = (list: ReadonlyArray<readonly [number, number]>) => ({
    length: list.length,
    start: (index: number) => list[index][0],
    end: (index: number) => list[index][1]
});

function fakeVideo(overrides: Partial<VideoLike> = {}): VideoLike {
    return { currentTime: 30, playbackRate: 1, paused: false, mediaKeys: null, buffered: ranges([[0, 41]]), ...overrides };
}

function fakePlayer(options: { ad?: boolean; videoData?: PlayerElementLike["getVideoData"] } = {}): PlayerElementLike {
    return {
        classList: { contains: (name: string) => Boolean(options.ad) && name === "ad-showing" },
        getVideoData: options.videoData ?? (() => ({ video_id: "dQw4w9WgXcQ" }))
    };
}

function fakeDocument(video: VideoLike | null, player: PlayerElementLike | null = fakePlayer()): ProbeDocument {
    return {
        querySelector: () => video,
        getElementById: (id: string) => (id === "movie_player" ? player : null)
    };
}

describe("player probe: position and buffer", () => {
    test("reports the playhead in whole milliseconds", () => {
        const probe = createPlayerProbe(fakeDocument(fakeVideo({ currentTime: 30.2504 })));

        expect(probe.currentTimeMs()).toBe(30250);
    });

    test("reports the end of the buffered range around the playhead", () => {
        const video = fakeVideo({ currentTime: 30, buffered: ranges([[0, 10], [25, 41]]) });

        expect(createPlayerProbe(fakeDocument(video)).bufferedEndSec()).toBe(41);
    });

    test("counts a buffered range that starts a hair after the playhead", () => {
        const video = fakeVideo({ currentTime: 24.95, buffered: ranges([[25, 41]]) });

        expect(createPlayerProbe(fakeDocument(video)).bufferedEndSec()).toBe(41);
    });

    test("reports nothing when the playhead is outside every buffered range", () => {
        const video = fakeVideo({ currentTime: 20, buffered: ranges([[0, 10], [25, 41]]) });

        expect(createPlayerProbe(fakeDocument(video)).bufferedEndSec()).toBeNull();
    });

    test("reports nothing when nothing is buffered", () => {
        expect(createPlayerProbe(fakeDocument(fakeVideo({ buffered: ranges([]) }))).bufferedEndSec()).toBeNull();
    });
});

describe("player probe: describing the buffer", () => {
    test("lists every buffered range with one decimal", () => {
        const video = fakeVideo({ buffered: ranges([[0, 10.04], [25, 41.26]]) });

        expect(createPlayerProbe(fakeDocument(video)).bufferedRanges()).toBe("0.0-10.0|25.0-41.3");
    });

    test("says none when nothing is buffered or there is no video", () => {
        expect(createPlayerProbe(fakeDocument(fakeVideo({ buffered: ranges([]) }))).bufferedRanges()).toBe("none");
        expect(createPlayerProbe(fakeDocument(null)).bufferedRanges()).toBe("none");
    });
});

describe("player probe: playback state", () => {
    test("reports the playback rate and the paused state", () => {
        const probe = createPlayerProbe(fakeDocument(fakeVideo({ playbackRate: 1.5, paused: true })));

        expect(probe.playbackRate()).toBe(1.5);
        expect(probe.isPaused()).toBe(true);
    });

    test("without a video it assumes a stopped, normal-speed player", () => {
        const probe = createPlayerProbe(fakeDocument(null));

        expect(probe.currentTimeMs()).toBe(0);
        expect(probe.bufferedEndSec()).toBeNull();
        expect(probe.playbackRate()).toBe(1);
        expect(probe.isPaused()).toBe(true);
    });

    test("nudges a stuck player by seeking to where it already is", () => {
        const assigned: number[] = [];
        const video = fakeVideo();
        Object.defineProperty(video, "currentTime", { get: () => 30.5, set: (value: number) => { assigned.push(value); } });

        createPlayerProbe(fakeDocument(video)).kick();

        expect(assigned).toEqual([30.5]);
    });

    test("kicking without a video does nothing", () => {
        expect(() => createPlayerProbe(fakeDocument(null)).kick()).not.toThrow();
    });
});

describe("player probe: which video is playing", () => {
    test("reads the video id from the player", () => {
        expect(createPlayerProbe(fakeDocument(fakeVideo())).videoId()).toBe("dQw4w9WgXcQ");
    });

    test("reports nothing when the player cannot say", () => {
        expect(createPlayerProbe(fakeDocument(fakeVideo(), null)).videoId()).toBeNull();
        expect(createPlayerProbe(fakeDocument(fakeVideo(), fakePlayer({ videoData: () => null }))).videoId()).toBeNull();
        expect(createPlayerProbe(fakeDocument(fakeVideo(), fakePlayer({ videoData: () => ({ video_id: 5 }) }))).videoId()).toBeNull();
        expect(createPlayerProbe(fakeDocument(fakeVideo(), fakePlayer({ videoData: () => ({ video_id: "" }) }))).videoId()).toBeNull();
    });

    test("survives a player whose video data call throws", () => {
        const throwing = fakePlayer({ videoData: () => { throw new Error("boom"); } });

        expect(createPlayerProbe(fakeDocument(fakeVideo(), throwing)).videoId()).toBeNull();
    });
});

describe("player probe: is the request from the main player", () => {
    const check = (playerTimeMs: number, doc: ProbeDocument) => createPlayerProbe(doc).isMainPlayer(playerTimeMs);

    test("accepts a request for the position being played", () => {
        expect(check(30000, fakeDocument(fakeVideo({ currentTime: 30 })))).toBe(true);
    });

    test("accepts a request within the tolerance and rejects one beyond it", () => {
        const doc = fakeDocument(fakeVideo({ currentTime: 30 }));

        expect(check(30000 + PLAYER_TIME_TOLERANCE_MS, doc)).toBe(true);
        expect(check(30000 - PLAYER_TIME_TOLERANCE_MS, doc)).toBe(true);
        expect(check(30000 + PLAYER_TIME_TOLERANCE_MS + 1, doc)).toBe(false);
        expect(check(30000 - PLAYER_TIME_TOLERANCE_MS - 1, doc)).toBe(false);
    });

    test("rejects requests while an ad is showing", () => {
        expect(check(30000, fakeDocument(fakeVideo(), fakePlayer({ ad: true })))).toBe(false);
    });

    test("rejects requests for protected (DRM) playback", () => {
        expect(check(30000, fakeDocument(fakeVideo({ mediaKeys: {} })))).toBe(false);
    });

    test("rejects everything without a video", () => {
        expect(check(0, fakeDocument(null))).toBe(false);
    });

    test("still works when there is no player element", () => {
        expect(check(30000, fakeDocument(fakeVideo(), null))).toBe(true);
    });
});
