/**
 * @jest-environment jsdom
 */

import { ActionType, Category, SegmentUUID, SponsorSourceType, SponsorTime } from "../src/types";
import { exportTimes, importTimes } from "../src/utils/exporter";

describe("Export segments", () => {
    it("Some segments", () => {
        const segments: SponsorTime[] = [{
            segment: [0, 10],
            category: "chapter" as Category,
            actionType: ActionType.Chapter,
            description: "Chapter 1",
            source: SponsorSourceType.Server,
            UUID: "1" as SegmentUUID
        }, {
            segment: [20, 20],
            category: "poi_highlight" as Category,
            actionType: ActionType.Poi,
            description: "Highlight",
            source: SponsorSourceType.Server,
            UUID: "2" as SegmentUUID
        }, {
            segment: [30, 40],
            category: "sponsor" as Category,
            actionType: ActionType.Skip,
            description: "Sponsor", // Force a description since chrome is not defined
            source: SponsorSourceType.Server,
            UUID: "3" as SegmentUUID
        }, {
            segment: [50, 60],
            category: "selfpromo" as Category,
            actionType: ActionType.Mute,
            description: "Selfpromo",
            source: SponsorSourceType.Server,
            UUID: "4" as SegmentUUID
        }, {
            segment: [0, 0],
            category: "selfpromo" as Category,
            actionType: ActionType.Full,
            description: "Selfpromo",
            source: SponsorSourceType.Server,
            UUID: "5" as SegmentUUID
        }, {
            segment: [80, 90],
            category: "interaction" as Category,
            actionType: ActionType.Skip,
            description: "Interaction",
            source: SponsorSourceType.YouTube,
            UUID: "6" as SegmentUUID
        }];

        const result = exportTimes(segments);

        expect(result).toBe(
            "0:00.000 - 0:10.000 Chapter 1\n" +
            "0:20.000 Highlight\n" +
            "0:30.000 - 0:40.000 Sponsor"
        );
    });

});

describe("Import segments", () => {
    it("1:20 to 1:21 thing", () => {
        const input = ` 1:20 to 1:21 thing
                        1:25 to 1:28 another thing`;
                        
        const result = importTimes(input, 120);
        expect(result).toMatchObject([{
            segment: [80, 81],
            description: "thing",
            category: "chapter" as Category
        }, {
            segment: [85, 88],
            description: "another thing",
            category: "chapter" as Category
        }]);
    });

    it("thing 1:20 to 1:21", () => {
        const input = ` thing 1:20 to 1:21
                        another thing 1:25 to 1:28 ext`;

        const result = importTimes(input, 120);
        expect(result).toMatchObject([{
            segment: [80, 81],
            description: "thing",
            category: "chapter" as Category
        }, {
            segment: [85, 88],
            description: "another thing",
            category: "chapter" as Category
        }]);
    });

    it("1:20 - 1:21 thing", () => {
        const input = ` 1:20 - 1:21 thing
                        1:25 - 1:28 another thing`;
                        
        const result = importTimes(input, 120);
        expect(result).toMatchObject([{
            segment: [80, 81],
            description: "thing",
            category: "chapter" as Category
        }, {
            segment: [85, 88],
            description: "another thing",
            category: "chapter" as Category
        }]);
    });

    it("1:20 1:21 thing", () => {
        const input = ` 1:20 1:21 thing
                        1:25 1:28 another thing`;
                        
        const result = importTimes(input, 120);
        expect(result).toMatchObject([{
            segment: [80, 81],
            description: "thing",
            category: "chapter" as Category
        }, {
            segment: [85, 88],
            description: "another thing",
            category: "chapter" as Category
        }]);
    });

    it("1:20 thing", () => {
        const input = ` 1:20 thing
                        1:25 another thing`;
                        
        const result = importTimes(input, 120);
        expect(result).toMatchObject([{
            segment: [80, 85],
            description: "thing",
            category: "chapter" as Category
        }, {
            segment: [85, 120],
            description: "another thing",
            category: "chapter" as Category
        }]);
    });

    it("1:20: thing", () => {
        const input = ` 1:20: thing
                        1:25: another thing`;
                        
        const result = importTimes(input, 120);
        expect(result).toMatchObject([{
            segment: [80, 85],
            description: "thing",
            category: "chapter" as Category
        }, {
            segment: [85, 120],
            description: "another thing",
            category: "chapter" as Category
        }]);
    });

    it("1:20 (thing)", () => {
        const input = ` 1:20 (thing)
                        1:25 (another thing)`;
                        
        const result = importTimes(input, 120);
        expect(result).toMatchObject([{
            segment: [80, 85],
            description: "thing",
            category: "chapter" as Category
        }, {
            segment: [85, 120],
            description: "another thing",
            category: "chapter" as Category
        }]);
    });

    it("thing 1:20", () => {
        const input = ` thing 1:20
                        another thing 1:25`;
                        
        const result = importTimes(input, 120);
        expect(result).toMatchObject([{
            segment: [80, 85],
            description: "thing",
            category: "chapter" as Category
        }, {
            segment: [85, 120],
            description: "another thing",
            category: "chapter" as Category
        }]);
    });

    it("thing at 1:20", () => {
        const input = ` thing at 1:20
                        another thing at 1:25`;
                        
        const result = importTimes(input, 120);
        expect(result).toMatchObject([{
            segment: [80, 85],
            description: "thing",
            category: "chapter" as Category
        }, {
            segment: [85, 120],
            description: "another thing",
            category: "chapter" as Category
        }]);
    });

    it("thing at 1s", () => {
        const input = ` thing at 1s
                        another thing at 5s`;
                        
        const result = importTimes(input, 120);
        expect(result).toMatchObject([{
            segment: [1, 5],
            description: "thing",
            category: "chapter" as Category
        }, {
            segment: [5, 120],
            description: "another thing",
            category: "chapter" as Category
        }]);
    });

    it("thing at 1 second", () => {
        const input = ` thing at 1 second
                        another thing at 5 seconds`;
                        
        const result = importTimes(input, 120);
        expect(result).toMatchObject([{
            segment: [1, 5],
            description: "thing",
            category: "chapter" as Category
        }, {
            segment: [5, 120],
            description: "another thing",
            category: "chapter" as Category
        }]);
    });

    it ("22. 2:04:22 some name", () => {
        const input = ` 22. 2:04:22 some name
                        23. 2:04:22.23 some other name`;
                        
        const result = importTimes(input, 8000);
        expect(result).toMatchObject([{
            segment: [7462, 7462.23],
            description: "some name",
            category: "chapter" as Category
        }, {
            segment: [7462.23, 8000],
            description: "some other name",
            category: "chapter" as Category
        }]);
    });

    it ("00:00", () => {
        const input = ` 00:00 Cap 1
                        00:10 Cap 2
                        00:12 Cap 3`;
                        
        const result = importTimes(input, 8000);
        expect(result).toMatchObject([{
            segment: [0, 10],
            description: "Cap 1",
            category: "chapter" as Category
        }, {
            segment: [10, 12],
            description: "Cap 2",
            category: "chapter" as Category
        }, {
            segment: [12, 8000],
            description: "Cap 3",
            category: "chapter" as Category
        }]);
    });

    it ("0:00 G¹ (Tangent Continuity)", () => {
        const input = ` 0:00  G¹ (Tangent Continuity)
                        0:01 G² (Tangent Continuity)`;

        const result = importTimes(input, 8000);
        expect(result).toMatchObject([{
            segment: [0, 1],
            description: "G¹ (Tangent Continuity)",
            category: "chapter" as Category
        }, {
            segment: [1, 8000],
            description: "G² (Tangent Continuity)",
            category: "chapter" as Category
        }]);
    });

    it ("((Some name) 1:20)", () => {
        const input = ` ((Some name) 1:20)
                        ((Some other name) 1:25)`;

        const result = importTimes(input, 8000);
        expect(result).toMatchObject([{
            segment: [80, 85],
            description: "Some name",
            category: "chapter" as Category
        }, {
            segment: [85, 8000],
            description: "Some other name",
            category: "chapter" as Category
        }]);
    });
});