import { MAX_MEDIA_HEADER_BYTES } from "../../src/sabr/core/mediaHeader";
import { FilterRule, MAX_BUFFERED_BYTES, createUmpFilter } from "../../src/sabr/core/umpFilter";
import {
    SAMPLE_VIDEO_ID,
    buildMediaHeaderPayload,
    concatBytes,
    fieldLen,
    fieldVarint,
    umpPart,
    umpProtectionOk,
    umpSegment,
    umpVarintBytes
} from "./fixtures";

const RULE: FilterRule = { dropFromMs: 41000, dropToMs: 150000 };

const seg = (headerId: number, itag: number, sequence: number, startMs: number, durationMs = 5000): Uint8Array =>
    umpSegment({ headerId, videoId: SAMPLE_VIDEO_ID, itag, sequence, startMs, durationMs });
const initSegment = (headerId: number, itag: number): Uint8Array =>
    umpSegment({ headerId, videoId: SAMPLE_VIDEO_ID, itag, isInit: true });
const policy = (): Uint8Array => umpPart(35, fieldVarint(1, 15001));

function filterInChunks(rule: FilterRule, bytes: Uint8Array, chunkSize: number) {
    const filter = createUmpFilter(rule);
    const outputs: Uint8Array[] = [];
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        outputs.push(filter.push(bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length))));
    }
    outputs.push(filter.flush());

    return { output: concatBytes(...outputs), stats: filter.stats() };
}

const filterWhole = (rule: FilterRule, bytes: Uint8Array) => filterInChunks(rule, bytes, Math.max(1, bytes.length));

describe("umpFilter: what is removed", () => {
    test("leaves a response untouched when nothing falls inside the range", () => {
        const response = concatBytes(umpProtectionOk(), initSegment(0, 251), seg(1, 251, 3, 20001), seg(2, 400, 7, 30000), policy());

        expect(filterWhole(RULE, response).output).toEqual(response);
    });

    test("removes every part of a segment that starts inside the range, and nothing else", () => {
        const kept = [umpProtectionOk(), initSegment(0, 251), seg(1, 400, 7, 36000, 6000), policy()];
        const dropped = [seg(2, 251, 5, 50001, 10000), seg(3, 400, 9, 60000)];

        const result = filterWhole(RULE, concatBytes(kept[0], kept[1], kept[2], dropped[0], dropped[1], kept[3]));

        expect(result.output).toEqual(concatBytes(...kept));
    });

    test("keeps a segment that merely straddles the start of the range", () => {
        // starts at 40.0 s, runs to 46 s, so it begins before the range even though it reaches into it
        const straddler = seg(1, 400, 7, 40000, 6000);

        expect(filterWhole(RULE, straddler).output).toEqual(straddler);
    });

    test.each([
        ["exactly at the start of the range", 41000, true],
        ["just before the start of the range", 40999, false],
        ["just before the end of the range", 149999, true],
        ["exactly at the end of the range", 150000, false]
    ])("a segment starting %s is %s", (_name, startMs, removed) => {
        const segment = seg(1, 251, 9, startMs);

        const output = filterWhole(RULE, segment).output;

        expect(output.length === 0).toBe(removed);
    });

    test("never removes an init segment", () => {
        const response = concatBytes(initSegment(0, 251), initSegment(1, 400));

        expect(filterWhole(RULE, response).output).toEqual(response);
    });

    test("keeps a segment whose start time is unknown", () => {
        const unknown = umpSegment({ headerId: 1, videoId: SAMPLE_VIDEO_ID, itag: 251, sequence: 5 });

        expect(filterWhole(RULE, unknown).output).toEqual(unknown);
    });

    test("keeps a segment whose header id could not be matched with its media parts", () => {
        const wideId = seg(200, 251, 5, 60000);

        expect(filterWhole(RULE, wideId).output).toEqual(wideId);
    });

    test("tells media parts of a removed segment from those of a kept one by header id", () => {
        const response = concatBytes(seg(1, 251, 3, 30000), seg(2, 400, 5, 60000), seg(3, 400, 4, 38000, 3000));

        expect(filterWhole(RULE, response).output).toEqual(concatBytes(seg(1, 251, 3, 30000), seg(3, 400, 4, 38000, 3000)));
    });
});

describe("umpFilter: statistics", () => {
    test("counts removed and kept segments and the bytes removed", () => {
        const dropped = [seg(2, 251, 5, 50001, 10000), seg(3, 400, 9, 60000)];
        const response = concatBytes(initSegment(0, 251), seg(1, 400, 7, 36000), ...dropped);

        const { stats } = filterWhole(RULE, response);

        expect(stats).toEqual({
            droppedSegments: 2,
            droppedBytes: dropped[0].length + dropped[1].length,
            keptSegments: 1
        });
    });

    test("reports nothing removed for an untouched response", () => {
        expect(filterWhole(RULE, concatBytes(seg(1, 251, 3, 20000))).stats).toEqual({
            droppedSegments: 0,
            droppedBytes: 0,
            keptSegments: 1
        });
    });
});

describe("umpFilter: describing what it did", () => {
    test("lists the segments it removed and kept as itag, sequence, start and duration", () => {
        const filter = createUmpFilter(RULE);

        filter.push(concatBytes(initSegment(0, 251), seg(1, 400, 7, 36000, 6000), seg(2, 251, 5, 50001, 10000), seg(3, 400, 9, 60000, 6000)));

        expect(filter.segments()).toEqual({
            dropped: ["i251#5@50001+10000", "i400#9@60000+6000"],
            kept: ["i400#7@36000+6000"]
        });
    });

    test("does not list init segments", () => {
        const filter = createUmpFilter(RULE);

        filter.push(initSegment(0, 251));

        expect(filter.segments()).toEqual({ dropped: [], kept: [] });
    });

    test("lists only the first few segments of a very long answer", () => {
        const filter = createUmpFilter(RULE);
        const many = Array.from({ length: 30 }, (_, i) => seg(i, 400, i, 60000 + i * 10));

        filter.push(concatBytes(...many.slice(0, 30)));

        expect(filter.segments().dropped.length).toBeLessThan(30);
        expect(filter.stats().droppedSegments).toBe(30);
    });
});

describe("umpFilter: streaming", () => {
    const response = concatBytes(
        umpProtectionOk(),
        initSegment(0, 251),
        seg(1, 400, 7, 36000, 6000),
        seg(2, 251, 5, 50001, 10000),
        policy(),
        seg(3, 400, 9, 60000),
        seg(4, 251, 3, 20001, 10000)
    );

    test.each([1, 2, 3, 5, 7, 16, 100])("gives the same result when the response arrives in chunks of %i bytes", (chunkSize) => {
        const whole = filterWhole(RULE, response);

        const chunked = filterInChunks(RULE, response, chunkSize);

        expect(chunked.output).toEqual(whole.output);
        expect(chunked.stats).toEqual(whole.stats);
    });

    test("holds back an unfinished part until the rest of it arrives", () => {
        const filter = createUmpFilter(RULE);
        const segment = seg(1, 251, 3, 20000);

        const first = filter.push(segment.subarray(0, 5));
        const second = filter.push(segment.subarray(5));

        expect(first.length + second.length).toBe(segment.length);
        expect(concatBytes(first, second)).toEqual(segment);
    });

    test("passes an unfinished tail through on flush", () => {
        const filter = createUmpFilter(RULE);
        const segment = seg(1, 251, 3, 20000);

        const pushed = filter.push(segment.subarray(0, segment.length - 2));
        const flushed = filter.flush();

        expect(concatBytes(pushed, flushed)).toEqual(segment.subarray(0, segment.length - 2));
    });

    test("does not modify the chunks it is given", () => {
        const input = Uint8Array.from(response);
        const snapshot = Uint8Array.from(input);

        filterInChunks(RULE, input, 11);

        expect(input).toEqual(snapshot);
    });
});

describe("umpFilter: when something is wrong", () => {
    test("lets everything after an implausible part through untouched", () => {
        const before = seg(1, 251, 3, 20000);
        const broken = concatBytes(umpVarintBytes(21), umpVarintBytes(2 ** 30));
        const after = seg(2, 400, 5, 60000);
        const response = concatBytes(before, broken, after);

        const result = filterWhole(RULE, response);

        expect(result.output).toEqual(response);
    });

    test("keeps a segment whose header is implausibly large instead of analysing it", () => {
        const oversized = concatBytes(
            buildMediaHeaderPayload({ headerId: 1, videoId: SAMPLE_VIDEO_ID, itag: 251, sequence: 5, startMs: 60000, durationMs: 5000 }),
            fieldLen(99, new Uint8Array(MAX_MEDIA_HEADER_BYTES + 1))
        );
        const response = concatBytes(umpPart(20, oversized), umpPart(21, Uint8Array.from([1, 2, 3])), umpPart(22, Uint8Array.from([1])));

        expect(filterWhole(RULE, response).output).toEqual(response);
    });

    test("stops holding data back once an unfinished part has grown implausibly large", () => {
        const filter = createUmpFilter(RULE);
        const declaredSize = MAX_BUFFERED_BYTES * 2;
        const chunkSize = MAX_BUFFERED_BYTES / 4;
        const start = concatBytes(umpVarintBytes(21), umpVarintBytes(declaredSize), new Uint8Array(chunkSize));

        const forwardedWhileStreaming: Uint8Array[] = [filter.push(start)];
        for (let received = chunkSize; received < declaredSize; received += chunkSize) {
            forwardedWhileStreaming.push(filter.push(new Uint8Array(chunkSize)));
        }
        const flushed = filter.flush();

        const forwardedBeforeEnd = forwardedWhileStreaming.reduce((sum, bytes) => sum + bytes.length, 0);
        expect(forwardedBeforeEnd).toBeGreaterThan(0);
        expect(forwardedBeforeEnd + flushed.length).toBe(start.length + declaredSize - chunkSize);
    });

    test("does not drop a later segment that reuses the id of one whose end never arrived", () => {
        const cutShort = concatBytes(
            umpPart(20, buildMediaHeaderPayload({ headerId: 1, videoId: SAMPLE_VIDEO_ID, itag: 251, sequence: 9, startMs: 60000, durationMs: 5000 })),
            umpPart(21, Uint8Array.from([1, 1, 1]))
        );
        const reused = seg(1, 251, 3, 20000);

        expect(filterWhole(RULE, concatBytes(cutShort, reused)).output).toEqual(reused);
    });
});
