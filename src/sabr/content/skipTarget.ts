/*
 * Chooses which upcoming segment (if any) the page-side SABR script should prepare for.
 *
 * Pure: the content script gathers the facts about the page and the candidate segments from
 * SponsorBlock's own skip logic; this module decides. A segment qualifies only when SponsorBlock
 * is certain to skip all of it automatically, because the page script will stop downloading
 * the media inside it.
 */

import { ArmTarget, DisarmReason, MIN_RANGE_MS } from "../protocol";

/** Skips that end this close to the end of the video are left alone (special end-of-video handling). */
export const END_GUARD_SEC = 2;
export const MIN_RANGE_SEC = MIN_RANGE_MS / 1000;

const MS_PER_SECOND = 1000;

export interface SkipTargetContext {
    /** The experimental option is on. */
    readonly enabled: boolean;
    readonly videoID: string | null;
    readonly durationSec: number;
    /** A regular youtube.com watch page in a supported browser (not embed, shorts, mobile, music). */
    readonly isSupportedPage: boolean;
    readonly isLive: boolean;
    /** Hover preview player. */
    readonly isInline: boolean;
    readonly isAdPlaying: boolean;
    /** Server-side ads shifted the timeline, so player time and video time disagree. */
    readonly hasTimeOffset: boolean;
    /** The channel was identified, so whitelists and skip profiles are already applied. */
    readonly channelKnown: boolean;
    readonly skippingDisabled: boolean;
    readonly isLoopedChapter: boolean;
}

export interface SkipCandidate {
    readonly startSec: number;
    readonly endSec: number;
    /** A "skip" action, as opposed to mute, point of interest, full video label or chapter. */
    readonly isSkipAction: boolean;
    readonly autoSkip: boolean;
    readonly shouldSkip: boolean;
    readonly visible: boolean;
    /** The entry marks where the segment begins (not the scheduled end of a mute/unmute pair). */
    readonly isStartEntry: boolean;
    /** The user's own, not yet submitted, segment. */
    readonly fromUnsubmitted: boolean;
}

/** How far ahead (in steps and in video time) to look for the next skip worth preparing for. */
export const LOOKAHEAD_STEPS = 8;
export const LOOKAHEAD_HORIZON_SEC = 600;
/** Each lookup starts this much after the previous result, so the same entry is never found twice. */
const LOOKAHEAD_ADVANCE_SEC = 0.001;

/** One answer of SponsorBlock's own "what is scheduled next" lookup. */
export interface NextSkip {
    /** The moment the entry is scheduled for, which is what the next lookup must start after. */
    readonly scheduledTimeSec: number;
    readonly candidate: SkipCandidate;
}

/**
 * Walks forward through the entries SponsorBlock would act on next, starting at `fromSec`.
 * `nextSkip(afterSec)` must return the first entry scheduled at or after that time, or null.
 */
export function collectCandidates(
    fromSec: number,
    nextSkip: (afterSec: number) => NextSkip | null
): ReadonlyArray<SkipCandidate> {
    const candidates: SkipCandidate[] = [];
    let afterSec = fromSec;

    for (let step = 0; step < LOOKAHEAD_STEPS; step++) {
        const next = nextSkip(afterSec);
        if (!next || next.candidate.startSec - fromSec > LOOKAHEAD_HORIZON_SEC) break;

        candidates.push(next.candidate);
        afterSec = Math.max(afterSec, next.scheduledTimeSec) + LOOKAHEAD_ADVANCE_SEC;
    }

    return candidates;
}

export type ShapingDecision =
    | { readonly kind: "arm"; readonly target: ArmTarget }
    | { readonly kind: "disarm"; readonly reason: DisarmReason };

const disarm = (reason: DisarmReason): ShapingDecision => ({ kind: "disarm", reason });

function pageBlocker(context: SkipTargetContext): DisarmReason | null {
    if (!context.enabled) return "disabled";
    if (context.isAdPlaying) return "ad";

    const durationValid = Number.isFinite(context.durationSec) && context.durationSec > 0;
    const unsupported = !context.isSupportedPage
        || context.isLive
        || context.isInline
        || context.hasTimeOffset
        || !context.channelKnown
        || context.skippingDisabled
        || context.isLoopedChapter
        || context.videoID === null
        || !durationValid;

    return unsupported ? "unsupported" : null;
}

function toTarget(candidate: SkipCandidate, videoID: string, durationMs: number): ArmTarget | null {
    if (!candidate.isSkipAction || !candidate.autoSkip || !candidate.shouldSkip) return null;
    if (!candidate.visible || !candidate.isStartEntry || candidate.fromUnsubmitted) return null;
    if (!Number.isFinite(candidate.startSec) || !Number.isFinite(candidate.endSec)) return null;

    const startMs = Math.round(candidate.startSec * MS_PER_SECOND);
    const endMs = Math.round(candidate.endSec * MS_PER_SECOND);
    if (startMs < 0 || endMs - startMs < MIN_RANGE_MS) return null;
    if (endMs >= durationMs - END_GUARD_SEC * MS_PER_SECOND) return null;

    return { videoID, startMs, endMs, durationMs };
}

/** `candidates` are the segments SponsorBlock would skip next, in any order. */
export function deriveShapingDecision(
    context: SkipTargetContext,
    candidates: ReadonlyArray<SkipCandidate>
): ShapingDecision {
    const blocker = pageBlocker(context);
    if (blocker !== null) return disarm(blocker);

    const durationMs = Math.round(context.durationSec * MS_PER_SECOND);
    const videoID = context.videoID as string;

    const target = [...candidates]
        .sort((a, b) => a.startSec - b.startSec)
        .map((candidate) => toTarget(candidate, videoID, durationMs))
        .find((result): result is ArmTarget => result !== null);

    return target ? { kind: "arm", target } : disarm("noTarget");
}
