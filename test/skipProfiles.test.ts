jest.mock("../src/config", () => ({
    __esModule: true,
    default: {
        config: {
            minDuration: 0
        },
        local: {
            skipProfileTemp: null,
            channelSkipProfileIDs: {},
            skipProfiles: {}
        }
    }
}));

jest.mock("../maze-utils/src/video", () => ({
    getChannelIDInfo: jest.fn(),
    getVideoID: jest.fn()
}));

import Config from "../src/config";
import { hideTooShortSegments } from "../src/utils/skipProfiles";
import { ActionType, Category, SegmentUUID, SponsorHideType, SponsorSourceType, SponsorTime } from "../src/types";

function createSegment(hidden: SponsorHideType = SponsorHideType.Visible): SponsorTime {
    return {
        segment: [10, 15],
        UUID: "test" as SegmentUUID,
        category: "sponsor" as Category,
        actionType: ActionType.Skip,
        source: SponsorSourceType.Server,
        hidden
    };
}

describe("hideTooShortSegments", () => {
    beforeEach(() => {
        Config.config.minDuration = 0;
    });

    it("preserves downvoted and manually hidden short segments", () => {
        const downvoted = createSegment(SponsorHideType.Downvoted);
        const hidden = createSegment(SponsorHideType.Hidden);

        Config.config.minDuration = 10;
        hideTooShortSegments([downvoted, hidden]);

        Config.config.minDuration = 4;
        hideTooShortSegments([downvoted, hidden]);

        expect(downvoted.hidden).toBe(SponsorHideType.Downvoted);
        expect(hidden.hidden).toBe(SponsorHideType.Hidden);
    });

    it("restores only minimum-duration segments when the threshold is removed", () => {
        const segment = createSegment();

        Config.config.minDuration = 10;
        hideTooShortSegments([segment]);
        expect(segment.hidden).toBe(SponsorHideType.MinimumDuration);

        Config.config.minDuration = 0;
        hideTooShortSegments([segment]);
        expect(segment.hidden).toBe(SponsorHideType.Visible);
    });
});
