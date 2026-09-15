/**
 * @jest-environment jsdom
 */

jest.mock("../src/config", () => ({
    __esModule: true,
    default: {
        config: {
            categorySelections: [{ name: "sponsor", option: 3 }]
        },
        local: {
            skipRules: [],
            skipProfiles: [],
            channelSkipProfileIDs: {},
            skipProfileTemp: null
        }
    }
}));

import { CategorySkipOption, SponsorTime, SegmentUUID } from "../src/types";
import { getCategorySelection, getRawCategorySelection } from "../src/utils/skipRule";
import { hasAutoSkippedOnce, markAutoSkippedOnce, resetAutoSkippedOnce } from "../src/utils/skipOnce";

const segment = {
    UUID: "uuid-1" as SegmentUUID,
    segment: [10, 20],
    category: "sponsor",
    actionType: "skip",
    source: 1
} as unknown as SponsorTime;

describe("skip once resolution", () => {
    beforeEach(() => {
        resetAutoSkippedOnce();
    });

    it("resolves to auto skip before the segment has been skipped", () => {
        expect(getCategorySelection(segment).option).toBe(CategorySkipOption.AutoSkip);
    });

    it("resolves to manual skip after the segment has been skipped once", () => {
        markAutoSkippedOnce(segment.UUID);

        expect(hasAutoSkippedOnce(segment.UUID)).toBe(true);
        expect(getCategorySelection(segment).option).toBe(CategorySkipOption.ManualSkip);
    });

    it("keeps the stored option available for the options page", () => {
        markAutoSkippedOnce(segment.UUID);

        expect(getRawCategorySelection(segment).option).toBe(CategorySkipOption.SkipOnce);
    });

    it("only consumes the segment that was skipped", () => {
        markAutoSkippedOnce(segment.UUID);
        const otherSegment = { ...segment, UUID: "uuid-2" as SegmentUUID };

        expect(getCategorySelection(otherSegment).option).toBe(CategorySkipOption.AutoSkip);
    });

    it("goes back to auto skip after a reset", () => {
        markAutoSkippedOnce(segment.UUID);
        resetAutoSkippedOnce();

        expect(getCategorySelection(segment).option).toBe(CategorySkipOption.AutoSkip);
    });
});
