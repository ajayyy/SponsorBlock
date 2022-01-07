import Config from "../config";
import { SponsorTime } from "../types";

export enum SkipNoticeAction {
    None,
    Upvote,
    Downvote,
    CategoryVote,
    CopyDownvote,
    Unskip
}

export function downvoteButtonColor(segments: SponsorTime[], actionState: SkipNoticeAction, downvoteType: SkipNoticeAction): string {
    // Also used for "Copy and Downvote"
    if (segments?.length > 1) {
        return (actionState === downvoteType) ? Config.config.colorPalette.red : Config.config.colorPalette.white;
    } else {
        // You dont have segment selectors so the lockbutton needs to be colored and cannot be selected.
        return Config.config.isVip && segments?.[0].locked === 1 ? Config.config.colorPalette.locked : Config.config.colorPalette.white;
    }
}