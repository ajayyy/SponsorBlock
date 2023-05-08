import * as React from "react";
import * as CompileConfig from "../../config.json";
import Config from "../config"
import { Category, ContentContainer, SponsorTime, NoticeVisbilityMode, ActionType, SponsorSourceType, SegmentUUID } from "../types";
import NoticeComponent from "./NoticeComponent";
import NoticeTextSelectionComponent from "./NoticeTextSectionComponent";
import Utils from "../utils";
const utils = new Utils();
import { getSkippingText } from "../utils/categoryUtils";

import ThumbsUpSvg from "../svg-icons/thumbs_up_svg";
import ThumbsDownSvg from "../svg-icons/thumbs_down_svg";
import PencilSvg from "../svg-icons/pencil_svg";
import { downvoteButtonColor, SkipNoticeAction } from "../utils/noticeUtils";
import { generateUserID } from "@ajayyy/maze-utils/lib/setup";
import { keybindToString } from "@ajayyy/maze-utils/lib/config";

enum SkipButtonState {
    Undo, // Unskip
    Redo, // Reskip
    Start // Skip
}

export interface SkipNoticeProps {
    segments: SponsorTime[];

    autoSkip: boolean;
    startReskip?: boolean;
    // Contains functions and variables from the content script needed by the skip notice
    contentContainer: ContentContainer;

    closeListener: () => void;
    showKeybindHint?: boolean;
    smaller: boolean;

    unskipTime?: number;
}

export interface SkipNoticeState {
    noticeTitle?: string;

    messages?: string[];
    messageOnClick?: (event: React.MouseEvent) => unknown;

    countdownTime?: number;
    maxCountdownTime?: () => number;
    countdownText?: string;

    skipButtonStates?: SkipButtonState[];
    skipButtonCallbacks?: Array<(buttonIndex: number, index: number, forceSeek: boolean) => void>;
    showSkipButton?: boolean[];

    editing?: boolean;
    choosingCategory?: boolean;
    thanksForVotingText?: string; //null until the voting buttons should be hidden

    actionState?: SkipNoticeAction;

    showKeybindHint?: boolean;

    smaller?: boolean;

    voted?: SkipNoticeAction[];
    copied?: SkipNoticeAction[];

}

class SkipNoticeComponent extends React.Component<SkipNoticeProps, SkipNoticeState> {
    segments: SponsorTime[];
    autoSkip: boolean;
    // Contains functions and variables from the content script needed by the skip notice
    contentContainer: ContentContainer;

    amountOfPreviousNotices: number;
    showInSecondSlot: boolean;

    idSuffix: string;

    noticeRef: React.MutableRefObject<NoticeComponent>;
    categoryOptionRef: React.RefObject<HTMLSelectElement>;

    selectedColor: string;
    unselectedColor: string;
    lockedColor: string;

    // Used to update on config change
    configListener: () => void;

    constructor(props: SkipNoticeProps) {
        super(props);
        this.noticeRef = React.createRef();
        this.categoryOptionRef = React.createRef();

        this.segments = props.segments;
        this.autoSkip = props.autoSkip;
        this.contentContainer = props.contentContainer;

        const noticeTitle = getSkippingText(this.segments, this.props.autoSkip);

        const previousSkipNotices = document.getElementsByClassName("sponsorSkipNoticeParent");
        this.amountOfPreviousNotices = previousSkipNotices.length;
        // If there is at least one already in the first slot
        this.showInSecondSlot = previousSkipNotices.length > 0 && [...previousSkipNotices].some(notice => !notice.classList.contains("secondSkipNotice"));

        // Sort segments
        if (this.segments.length > 1) {
            this.segments.sort((a, b) => a.segment[0] - b.segment[0]);
        }

        // This is the suffix added at the end of every id
        for (const segment of this.segments) {
            this.idSuffix += segment.UUID;
        }
        this.idSuffix += this.amountOfPreviousNotices;

        this.selectedColor = Config.config.colorPalette.red;
        this.unselectedColor = Config.config.colorPalette.white;
        this.lockedColor = Config.config.colorPalette.locked;

        const isMuteSegment = this.segments[0].actionType === ActionType.Mute;
        const maxCountdownTime = isMuteSegment ? this.getFullDurationCountdown(0) : () => Config.config.skipNoticeDuration;

        const defaultSkipButtonState = this.props.startReskip ? SkipButtonState.Redo : SkipButtonState.Undo;
        const skipButtonStates = [defaultSkipButtonState, isMuteSegment ? SkipButtonState.Start : defaultSkipButtonState];

        const defaultSkipButtonCallback = this.props.startReskip ? this.reskip.bind(this) : this.unskip.bind(this);
        const skipButtonCallbacks = [defaultSkipButtonCallback, isMuteSegment ? this.reskip.bind(this) : defaultSkipButtonCallback];

        // Setup state
        this.state = {
            noticeTitle,
            messages: [],
            messageOnClick: null,

            //the countdown until this notice closes
            maxCountdownTime,
            countdownTime: maxCountdownTime(),
            countdownText: null,

            skipButtonStates,
            skipButtonCallbacks,
            showSkipButton: [true, true],

            editing: false,
            choosingCategory: false,
            thanksForVotingText: null,

            actionState: SkipNoticeAction.None,

            showKeybindHint: this.props.showKeybindHint ?? true,

            smaller: this.props.smaller ?? false,

            // Keep track of what segment the user interacted with.
            voted: new Array(this.props.segments.length).fill(SkipNoticeAction.None),
            copied: new Array(this.props.segments.length).fill(SkipNoticeAction.None),
        }

        if (!this.autoSkip) {
            // Assume manual skip is only skipping 1 submission
            Object.assign(this.state, this.getUnskippedModeInfo(null, 0, SkipButtonState.Start));
        }
    }

    render(): React.ReactElement {
        const noticeStyle: React.CSSProperties = { }
        if (this.contentContainer().onMobileYouTube) {
            noticeStyle.bottom = "4em";
            noticeStyle.transform = "scale(0.8) translate(10%, 10%)";
        }

        // If it started out as smaller, always keep the
        // skip button there
        const showFirstSkipButton = this.props.smaller || this.segments[0].actionType === ActionType.Mute;
        const firstColumn = showFirstSkipButton ? (
            this.getSkipButton(0)
        ) : null;

        return (
            <NoticeComponent noticeTitle={this.state.noticeTitle}
                amountOfPreviousNotices={this.amountOfPreviousNotices}
                showInSecondSlot={this.showInSecondSlot}
                idSuffix={this.idSuffix}
                fadeIn={true}
                startFaded={Config.config.noticeVisibilityMode >= NoticeVisbilityMode.FadedForAll
                    || (Config.config.noticeVisibilityMode >= NoticeVisbilityMode.FadedForAutoSkip && this.autoSkip)}
                timed={true}
                maxCountdownTime={this.state.maxCountdownTime}
                style={noticeStyle}
                biggerCloseButton={this.contentContainer().onMobileYouTube}
                ref={this.noticeRef}
                closeListener={() => this.closeListener()}
                smaller={this.state.smaller}
                limitWidth={true}
                firstColumn={firstColumn}
                bottomRow={[...this.getMessageBoxes(), ...this.getBottomRow() ]}
                onMouseEnter={() => this.onMouseEnter() } >
            </NoticeComponent>
        );
    }

    getBottomRow(): JSX.Element[] {
        return [
            /* Bottom Row */
            (<tr id={"sponsorSkipNoticeSecondRow" + this.idSuffix}
                key={0}>

                {/* Vote Button Container */}
                {!this.state.thanksForVotingText ?
                    <td id={"sponsorTimesVoteButtonsContainer" + this.idSuffix}
                        className="sponsorTimesVoteButtonsContainer">

                        {/* Upvote Button */}
                        <div id={"sponsorTimesDownvoteButtonsContainerUpvote" + this.idSuffix}
                                className="voteButton"
                                style={{marginRight: "5px"}}
                                title={chrome.i18n.getMessage("upvoteButtonInfo")}
                                onClick={() => this.prepAction(SkipNoticeAction.Upvote)}>
                            <ThumbsUpSvg fill={(this.state.actionState === SkipNoticeAction.Upvote) ? this.selectedColor : this.unselectedColor} />
                        </div>

                        {/* Report Button */}
                        <div id={"sponsorTimesDownvoteButtonsContainerDownvote" + this.idSuffix}
                                className="voteButton"
                                style={{marginRight: "5px", marginLeft: "5px"}}
                                title={chrome.i18n.getMessage("reportButtonInfo")}
                                onClick={() => this.prepAction(SkipNoticeAction.Downvote)}>
                            <ThumbsDownSvg fill={downvoteButtonColor(this.segments, this.state.actionState, SkipNoticeAction.Downvote)} />
                        </div>

                        {/* Copy and Downvote Button */}
                        <div id={"sponsorTimesDownvoteButtonsContainerCopyDownvote" + this.idSuffix}
                                className="voteButton"
                                style={{marginLeft: "5px"}}
                                onClick={() => this.openEditingOptions()}>
                            <PencilSvg fill={this.state.editing === true
                                            || this.state.actionState === SkipNoticeAction.CopyDownvote
                                            || this.state.choosingCategory === true
                                            ? this.selectedColor : this.unselectedColor} />
                        </div>
                    </td>

                    :

                    <td id={"sponsorTimesVoteButtonInfoMessage" + this.idSuffix}
                            className="sponsorTimesInfoMessage sponsorTimesVoteButtonMessage"
                            style={{marginRight: "10px"}}>

                        {/* Submitted string */}
                        <span style={{marginRight: "10px"}}>
                            {this.state.thanksForVotingText}
                        </span>

                        {/* Continue Voting Button */}
                        <button id={"sponsorTimesContinueVotingContainer" + this.idSuffix}
                            className="sponsorSkipObject sponsorSkipNoticeButton"
                            title={"Continue Voting"}
                            onClick={() => this.setState({
                                thanksForVotingText: null,
                                messages: []
                            })}>
                            {chrome.i18n.getMessage("ContinueVoting")}
                        </button>
                    </td>
                }

                {/* Unskip/Skip Button */}
                {!this.props.smaller || this.segments[0].actionType === ActionType.Mute
                    ? this.getSkipButton(1) : null}

                {/* Never show button */}
                {!this.autoSkip || this.props.startReskip ? "" :
                    <td className="sponsorSkipNoticeRightSection"
                        key={1}>
                        <button className="sponsorSkipObject sponsorSkipNoticeButton sponsorSkipNoticeRightButton"
                            onClick={this.contentContainer().dontShowNoticeAgain}>
                            {chrome.i18n.getMessage("Hide")}
                        </button>
                    </td>
                }
            </tr>),

            /* Edit Segments Row */
            (this.state.editing && !this.state.thanksForVotingText && !(this.state.choosingCategory || this.state.actionState === SkipNoticeAction.CopyDownvote) &&
                <tr id={"sponsorSkipNoticeEditSegmentsRow" + this.idSuffix}
                    key={2}>
                    <td id={"sponsorTimesEditSegmentsContainer" + this.idSuffix}>

                        {/* Copy Segment */}
                        <button className="sponsorSkipObject sponsorSkipNoticeButton"
                                title={chrome.i18n.getMessage("CopyDownvoteButtonInfo")}
                                style={{color: downvoteButtonColor(this.segments, this.state.actionState, SkipNoticeAction.Downvote)}}
                                onClick={() => this.prepAction(SkipNoticeAction.CopyDownvote)}>
                            {chrome.i18n.getMessage("CopyAndDownvote")}
                        </button>

                        {/* Category vote */}
                        <button className="sponsorSkipObject sponsorSkipNoticeButton"
                                title={chrome.i18n.getMessage("ChangeCategoryTooltip")}
                                style={{color: (this.state.actionState === SkipNoticeAction.CategoryVote && this.state.editing == true) ? this.selectedColor : this.unselectedColor}}
                                onClick={() => this.resetStateToStart(SkipNoticeAction.CategoryVote, true, true)}>
                            {chrome.i18n.getMessage("incorrectCategory")}
                        </button>
                    </td>
                </tr>
            ),

            /* Category Chooser Row */
            (this.state.choosingCategory && !this.state.thanksForVotingText &&
                <tr id={"sponsorSkipNoticeCategoryChooserRow" + this.idSuffix}
                    key={3}>
                    <td>
                        {/* Category Selector */}
                        <select id={"sponsorTimeCategories" + this.idSuffix}
                                className="sponsorTimeCategories sponsorTimeEditSelector"
                                defaultValue={this.segments[0].category}
                                ref={this.categoryOptionRef}>

                            {this.getCategoryOptions()}
                        </select>

                        {/* Submit Button */}
                        {this.segments.length === 1 &&
                            <button className="sponsorSkipObject sponsorSkipNoticeButton"
                                    onClick={() => this.prepAction(SkipNoticeAction.CategoryVote)}>

                                {chrome.i18n.getMessage("submit")}
                            </button>
                        }
                    </td>
                </tr>
            ),

            /* Segment Chooser Row */
            (this.state.actionState !== SkipNoticeAction.None && this.segments.length > 1 && !this.state.thanksForVotingText &&
                <tr id={"sponsorSkipNoticeSubmissionOptionsRow" + this.idSuffix}
                    key={4}>
                    <td id={"sponsorTimesSubmissionOptionsContainer" + this.idSuffix}>
                        {this.getSubmissionChooser()}
                    </td>
                </tr>
            )
        ];
    }

    getSkipButton(buttonIndex: number): JSX.Element {
        if (this.state.showSkipButton[buttonIndex] && (this.segments.length > 1
                || this.segments[0].actionType !== ActionType.Poi
                || this.props.unskipTime)) {

            const forceSeek = buttonIndex === 1 && this.segments[0].actionType === ActionType.Mute;

            const style: React.CSSProperties = {
                marginLeft: "4px",
                color: ([SkipNoticeAction.Unskip0, SkipNoticeAction.Unskip1].includes(this.state.actionState))
                    ? this.selectedColor : this.unselectedColor
            };
            if (this.contentContainer().onMobileYouTube) {
                style.padding = "20px";
                style.minWidth = "100px";
            }

            return (
                <span className="sponsorSkipNoticeUnskipSection">
                    <button id={"sponsorSkipUnskipButton" + this.idSuffix}
                            className="sponsorSkipObject sponsorSkipNoticeButton"
                            style={style}
                            onClick={() => this.prepAction(buttonIndex === 1 ? SkipNoticeAction.Unskip1 : SkipNoticeAction.Unskip0)}>
                        {this.getSkipButtonText(buttonIndex, forceSeek ? ActionType.Skip : null)
                            + (!forceSeek && this.state.showKeybindHint
                                ? " (" + keybindToString(Config.config.skipKeybind) + ")" : "")}
                    </button>
                </span>
            );
        }
        return null;
    }

    getSubmissionChooser(): JSX.Element[] {
        const elements: JSX.Element[] = [];
        for (let i = 0; i < this.segments.length; i++) {
            elements.push(
                <button className="sponsorSkipObject sponsorSkipNoticeButton"
                        style={{opacity: this.getSubmissionChooserOpacity(i),
                                color: this.getSubmissionChooserColor(i)}}
                        onClick={() => this.performAction(i)}
                        key={"submission" + i + this.segments[i].category + this.idSuffix}>
                    {(i + 1) + ". " + chrome.i18n.getMessage("category_" + this.segments[i].category)}
                </button>
            );
        }
        return elements;
    }

    getSubmissionChooserOpacity(index: number): number {
        const isUpvote = this.state.actionState === SkipNoticeAction.Upvote;
        const isDownvote = this.state.actionState == SkipNoticeAction.Downvote;
        const isCopyDownvote = this.state.actionState == SkipNoticeAction.CopyDownvote;
        const shouldBeGray: boolean = (isUpvote && this.state.voted[index] == SkipNoticeAction.Upvote) ||
                                        (isDownvote && this.state.voted[index] == SkipNoticeAction.Downvote) ||
                                        (isCopyDownvote && this.state.copied[index] == SkipNoticeAction.CopyDownvote);

        return shouldBeGray ? 0.35 : 1;
    }

    getSubmissionChooserColor(index: number): string {
        const isDownvote = this.state.actionState == SkipNoticeAction.Downvote;
        const isCopyDownvote = this.state.actionState == SkipNoticeAction.CopyDownvote;
        const shouldWarnUser = Config.config.isVip && (isDownvote || isCopyDownvote)
                                        && this.segments[index].locked === 1;

        return shouldWarnUser ? this.lockedColor : this.unselectedColor;
    }

    onMouseEnter(): void {
        if (this.state.smaller) {
            this.setState({
                smaller: false
            });
        }
    }

    getMessageBoxes(): JSX.Element[] {
        if (this.state.messages.length === 0) {
            // Add a spacer if there is no text
            return [
                <tr id={"sponsorSkipNoticeSpacer" + this.idSuffix}
                    className="sponsorBlockSpacer"
                    key={"messageBoxSpacer"}>
                </tr>
            ];
        }

        const elements: JSX.Element[] = [];

        for (let i = 0; i < this.state.messages.length; i++) {
            elements.push(
                <tr key={i + "_messageBox"}>
                    <td key={i + "_messageBox"}>
                        <NoticeTextSelectionComponent idSuffix={this.idSuffix}
                            text={this.state.messages[i]}
                            onClick={this.state.messageOnClick}
                            key={i + "_messageBox"}>
                        </NoticeTextSelectionComponent>
                    </td>
                </tr>
            )
        }

        return elements;
    }

    prepAction(action: SkipNoticeAction): void {
        if (this.segments.length === 1) {
            this.performAction(0, action);
        } else {
            switch (action ?? this.state.actionState) {
                case SkipNoticeAction.None:
                    this.resetStateToStart();
                    break;
                case SkipNoticeAction.Upvote:
                    this.resetStateToStart(SkipNoticeAction.Upvote);
                    break;
                case SkipNoticeAction.Downvote:
                    this.resetStateToStart(SkipNoticeAction.Downvote);
                    break;
                case SkipNoticeAction.CategoryVote:
                    this.resetStateToStart(SkipNoticeAction.CategoryVote, true, true);
                    break;
                case SkipNoticeAction.CopyDownvote:
                    this.resetStateToStart(SkipNoticeAction.CopyDownvote, true);
                    break;
                case SkipNoticeAction.Unskip0:
                    this.resetStateToStart(SkipNoticeAction.Unskip0);
                    break;
                case SkipNoticeAction.Unskip1:
                    this.resetStateToStart(SkipNoticeAction.Unskip1);
                    break;
            }
        }
    }

    /**
     * Performs the action from the current state
     *
     * @param index
     */
    performAction(index: number, action?: SkipNoticeAction): void {
        switch (action ?? this.state.actionState) {
            case SkipNoticeAction.None:
                this.noAction(index);
                break;
            case SkipNoticeAction.Upvote:
                this.upvote(index);
                break;
            case SkipNoticeAction.Downvote:
                this.downvote(index);
                break;
            case SkipNoticeAction.CategoryVote:
                this.categoryVote(index);
                break;
            case SkipNoticeAction.CopyDownvote:
                this.copyDownvote(index);
                break;
            case SkipNoticeAction.Unskip0:
                this.unskipAction(0, index, false);
                break;
            case SkipNoticeAction.Unskip1:
                this.unskipAction(1, index, true);
                break;
            default:
                this.resetStateToStart();
                break;
        }
    }

    noAction(index: number): void {
        const voted = this.state.voted;
        voted[index] = SkipNoticeAction.None;

        this.setState({
            voted
        });
    }

    upvote(index: number): void {
        if (this.segments.length === 1) this.resetStateToStart();
        this.contentContainer().vote(1, this.segments[index].UUID, undefined, this);
    }

    downvote(index: number): void {
        if (this.segments.length === 1) this.resetStateToStart();

        this.contentContainer().vote(0, this.segments[index].UUID, undefined, this);
    }

    categoryVote(index: number): void {
        this.contentContainer().vote(undefined, this.segments[index].UUID, this.categoryOptionRef.current.value as Category, this)
    }

    copyDownvote(index: number): void {
        const sponsorVideoID = this.props.contentContainer().sponsorVideoID;
        const sponsorTimesSubmitting : SponsorTime = {
            segment: this.segments[index].segment,
            UUID: generateUserID() as SegmentUUID,
            category: this.segments[index].category,
            actionType: this.segments[index].actionType,
            source: SponsorSourceType.Local
        };

        const segmentTimes = Config.config.unsubmittedSegments[sponsorVideoID] || [];
        segmentTimes.push(sponsorTimesSubmitting);
        Config.config.unsubmittedSegments[sponsorVideoID] = segmentTimes;
        Config.forceSyncUpdate("unsubmittedSegments");

        this.props.contentContainer().sponsorTimesSubmitting.push(sponsorTimesSubmitting);
        this.props.contentContainer().updatePreviewBar();
        this.props.contentContainer().resetSponsorSubmissionNotice();
        this.props.contentContainer().updateEditButtonsOnPlayer();

        this.contentContainer().vote(0, this.segments[index].UUID, undefined, this);

        const copied = this.state.copied;
        copied[index] = SkipNoticeAction.CopyDownvote;

        this.setState({
            copied
        });
    }

    unskipAction(buttonIndex: number, index: number, forceSeek: boolean): void {
        this.state.skipButtonCallbacks[buttonIndex](buttonIndex, index, forceSeek);
    }

    openEditingOptions(): void {
        this.resetStateToStart(undefined, true);
    }

    getCategoryOptions(): React.ReactElement[] {
        const elements = [];

        const categories = (CompileConfig.categoryList.filter((cat => CompileConfig.categorySupport[cat].includes(ActionType.Skip)))) as Category[];
        for (const category of categories) {
            elements.push(
                <option value={category}
                        key={category}
                        className={this.getCategoryNameClass(category)}>
                    {chrome.i18n.getMessage("category_" + category)}
                </option>
            );
        }
        return elements;
    }

    getCategoryNameClass(category: string): string {
        return this.props.contentContainer().lockedCategories.includes(category) ? "sponsorBlockLockedColor" : ""
    }

    unskip(buttonIndex: number, index: number, forceSeek: boolean): void {
        this.contentContainer().unskipSponsorTime(this.segments[index], this.props.unskipTime, forceSeek);

        this.unskippedMode(buttonIndex, index, SkipButtonState.Redo);
    }

    reskip(buttonIndex: number, index: number, forceSeek: boolean): void {
        this.contentContainer().reskipSponsorTime(this.segments[index], forceSeek);

        const skipButtonStates = this.state.skipButtonStates;
        skipButtonStates[buttonIndex] = SkipButtonState.Undo;

        const skipButtonCallbacks = this.state.skipButtonCallbacks;
        skipButtonCallbacks[buttonIndex] = this.unskip.bind(this);

        const newState: SkipNoticeState = {
            skipButtonStates,
            skipButtonCallbacks,

            maxCountdownTime: () => Config.config.skipNoticeDuration,
            countdownTime: Config.config.skipNoticeDuration
        };

        //reset countdown
        this.setState(newState, () => {
            this.noticeRef.current.resetCountdown();
        });
    }

    /** Sets up notice to be not skipped yet */
    unskippedMode(buttonIndex: number, index: number, skipButtonState: SkipButtonState): void {
        //setup new callback and reset countdown
        this.setState(this.getUnskippedModeInfo(buttonIndex, index, skipButtonState), () => {
            this.noticeRef.current.resetCountdown();
        });
    }

    getUnskippedModeInfo(buttonIndex: number, index: number, skipButtonState: SkipButtonState): SkipNoticeState {
        const changeCountdown = this.segments[index].actionType !== ActionType.Poi;

        const maxCountdownTime = changeCountdown ?
            this.getFullDurationCountdown(index) : this.state.maxCountdownTime;

        const skipButtonStates = this.state.skipButtonStates;
        const skipButtonCallbacks = this.state.skipButtonCallbacks;
        if (buttonIndex === null) {
            for (let i = 0; i < this.segments.length; i++) {
                skipButtonStates[i] = skipButtonState;
                skipButtonCallbacks[i] = this.reskip.bind(this);
            }
        } else {
            skipButtonStates[buttonIndex] = skipButtonState;
            skipButtonCallbacks[buttonIndex] = this.reskip.bind(this);

            if (buttonIndex === 1) {
                // Trigger both to move at once
                skipButtonStates[0] = SkipButtonState.Redo;
                skipButtonCallbacks[0] = this.reskip.bind(this);
            }
        }

        return {
            skipButtonStates,
            skipButtonCallbacks,
            // change max duration to however much of the sponsor is left
            maxCountdownTime,
            countdownTime: maxCountdownTime(),
            showSkipButton: buttonIndex === 1 ? [true, true] : this.state.showSkipButton
        } as SkipNoticeState;
    }

    getFullDurationCountdown(index: number): () => number {
        return () => {
            const sponsorTime = this.segments[index];
            const duration = Math.round((sponsorTime.segment[1] - this.contentContainer().v.currentTime) * (1 / this.contentContainer().v.playbackRate));

            return Math.max(duration, Config.config.skipNoticeDuration);
        };
    }

    afterVote(segment: SponsorTime, type: number, category: Category): void {
        const index = utils.getSponsorIndexFromUUID(this.segments, segment.UUID);
        const wikiLinkText = CompileConfig.wikiLinks[segment.category];

        const voted = this.state.voted;
        switch (type) {
            case 0:
                this.clearConfigListener();
                this.setNoticeInfoMessageWithOnClick(() => window.open(wikiLinkText), chrome.i18n.getMessage("OpenCategoryWikiPage"));

                voted[index] = SkipNoticeAction.Downvote;
                break;
            case 1:
                voted[index] = SkipNoticeAction.Upvote;
                break;
            case 20:
                voted[index] = SkipNoticeAction.None;
                break;
        }

        this.setState({
            voted
        });

        this.addVoteButtonInfo(chrome.i18n.getMessage("voted"));

        if (segment && category) {
            // This is the segment inside the skip notice
            this.segments[index].category = category;
        }
    }

    setNoticeInfoMessageWithOnClick(onClick: (event: React.MouseEvent) => unknown, ...messages: string[]): void {
        this.setState({
            messages,
            messageOnClick: (event) => onClick(event)
        });
    }

    setNoticeInfoMessage(...messages: string[]): void {
        this.setState({
            messages
        });
    }

    addVoteButtonInfo(message: string): void {
        this.setState({
            thanksForVotingText: message
        });
    }

    resetVoteButtonInfo(): void {
        this.setState({
            thanksForVotingText: null
        });
    }

    closeListener(): void {
        this.clearConfigListener();

        this.props.closeListener();
    }

    clearConfigListener(): void {
        if (this.configListener) {
            Config.configSyncListeners.splice(Config.configSyncListeners.indexOf(this.configListener), 1);
            this.configListener = null;
        }
    }

    unmutedListener(time: number): void {
        if (this.props.segments.length === 1
                && this.props.segments[0].actionType === ActionType.Mute
                && time >= this.props.segments[0].segment[1]) {
            this.setState({
                showSkipButton: [false, true]
            });
        }
    }

    resetStateToStart(actionState: SkipNoticeAction = SkipNoticeAction.None, editing = false, choosingCategory = false): void {
        this.setState({
            actionState: actionState,
            editing: editing,
            choosingCategory: choosingCategory,
            thanksForVotingText: null,
            messages: []
        });
    }

    private getSkipButtonText(buttonIndex: number, forceType?: ActionType): string {
        switch (this.state.skipButtonStates[buttonIndex]) {
            case SkipButtonState.Undo:
                return this.getUndoText(forceType);
            case SkipButtonState.Redo:
                return this.getRedoText(forceType);
            case SkipButtonState.Start:
                return this.getStartText(forceType);
        }
    }

    private getUndoText(forceType?: ActionType): string {
        const actionType = forceType || this.segments[0].actionType;
        switch (actionType) {
            case ActionType.Mute: {
                return chrome.i18n.getMessage("unmute");
            }
            case ActionType.Skip:
            default: {
                return chrome.i18n.getMessage("unskip");
            }
        }
    }

    private getRedoText(forceType?: ActionType): string {
        const actionType = forceType || this.segments[0].actionType;
        switch (actionType) {
            case ActionType.Mute: {
                return chrome.i18n.getMessage("mute");
            }
            case ActionType.Skip:
            default: {
                return chrome.i18n.getMessage("reskip");
            }
        }
    }

    private getStartText(forceType?: ActionType): string {
        const actionType = forceType || this.segments[0].actionType;
        switch (actionType) {
            case ActionType.Mute: {
                return chrome.i18n.getMessage("mute");
            }
            case ActionType.Skip:
            default: {
                return chrome.i18n.getMessage("skip");
            }
        }
    }
}

export default SkipNoticeComponent;
