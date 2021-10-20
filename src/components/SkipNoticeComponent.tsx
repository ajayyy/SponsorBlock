import * as React from "react";
import * as CompileConfig from "../../config.json";
import Config from "../config"
import { Category, ContentContainer, CategoryActionType, SponsorHideType, SponsorTime, NoticeVisbilityMode, ActionType, voteStatus, SponsorSourceType } from "../types";
import NoticeComponent from "./NoticeComponent";
import NoticeTextSelectionComponent from "./NoticeTextSectionComponent";
import SubmissionNotice from "../render/SubmissionNotice";
import Utils from "../utils";
const utils = new Utils();

import { getCategoryActionType, getSkippingText } from "../utils/categoryUtils";

import ThumbsUpSvg from "../svg-icons/thumbs_up_svg";
import ThumbsDownSvg from "../svg-icons/thumbs_down_svg";
import PencilSvg from "../svg-icons/pencil_svg";

export enum SkipNoticeAction {
    None,
    Upvote,
    Downvote,
    CategoryVote,
    CopyDownvote,
    Unskip
}

export interface SkipNoticeProps {
    segments: SponsorTime[];
    autoSkip: boolean;
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

    skipButtonText?: string;
    skipButtonCallback?: (index: number) => void;
    showSkipButton?: boolean;

    segments: SponsorTime[]; // Contains information on how to render
    editing?: boolean;
    choosingCategory?: boolean;
    thanksForVotingText?: string; //null until the voting buttons should be hidden
    actionState?: SkipNoticeAction;
    isVip?: boolean;
    showKeybindHint?: boolean;

    smaller?: boolean;
}

class SkipNoticeComponent extends React.Component<SkipNoticeProps, SkipNoticeState> {
    autoSkip: boolean;
    // Contains functions and variables from the content script needed by the skip notice
    contentContainer: ContentContainer;

    amountOfPreviousNotices: number;
    showInSecondSlot: boolean;
    audio: HTMLAudioElement;
    
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

        this.autoSkip = props.autoSkip;
        this.contentContainer = props.contentContainer;
        this.audio = null;

        const segments = this.props.segments;
        for (const segment of segments) {
            segment.locked ||= 0;
            segment.voted ||= voteStatus.None;
            segment.copied ||= false;
            segment.hidden ||= SponsorHideType.Visible;
        }
        const noticeTitle = getSkippingText(segments, this.props.autoSkip);

        const previousSkipNotices = document.getElementsByClassName("sponsorSkipNoticeParent");
        this.amountOfPreviousNotices = previousSkipNotices.length;
        // If there is at least one already in the first slot
        this.showInSecondSlot = previousSkipNotices.length > 0 && [...previousSkipNotices].some(notice => !notice.classList.contains("secondSkipNotice"));

        // Sort segments
        if (segments.length > 1) {
            segments.sort((a, b) => a.segment[0] - b.segment[0]);
        }
    
        // This is the suffix added at the end of every id
        for (const segment of segments) {
            this.idSuffix += segment.UUID;
        }
        this.idSuffix += this.amountOfPreviousNotices;

        this.selectedColor = Config.config.colorPalette.red;
        this.unselectedColor = Config.config.colorPalette.white;
        this.lockedColor = Config.config.colorPalette.locked;

        // Setup state
        this.state = {
            segments: segments,

            noticeTitle,
            messages: [],
            messageOnClick: null,

            //the countdown until this notice closes
            maxCountdownTime: () => Config.config.skipNoticeDuration,
            countdownTime: Config.config.skipNoticeDuration,
            countdownText: null,

            skipButtonText: this.getUnskipText(segments[0]),
            skipButtonCallback: (index) => this.unskip(index),
            showSkipButton: true,

            editing: false,
            choosingCategory: false,
            thanksForVotingText: null,
            isVip: Config.config.isVip || false,

            actionState: SkipNoticeAction.None,
            showKeybindHint: this.props.showKeybindHint ?? true,
            smaller: this.props.smaller ?? false
        }

        if (!this.autoSkip) {
            // Assume manual skip is only skipping 1 submission
            Object.assign(this.state, this.getUnskippedModeInfo(0, this.getSkipText()));
        }
    }

    componentDidMount(): void {
        if (Config.config.audioNotificationOnSkip && this.audio) {
            this.audio.volume = this.contentContainer().v.volume * 0.1;
            if (this.autoSkip) this.audio.play();
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
        const firstColumn = this.props.smaller ? (
            this.getSkipButton()
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
                videoSpeed={() => this.contentContainer().v?.playbackRate}
                style={noticeStyle}
                ref={this.noticeRef}
                closeListener={() => this.closeListener()}
                smaller={this.state.smaller}
                limitWidth={true}
                firstColumn={firstColumn}
                bottomRow={[...this.getMessageBox(), ...this.getBottomRow() ]}
                onMouseEnter={() => this.onMouseEnter() } >
                    
                {(Config.config.audioNotificationOnSkip) && <audio ref={(source) => { this.audio = source; }}>
                    <source src={chrome.extension.getURL("icons/beep.ogg")} type="audio/ogg"></source>
                </audio>}
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
                            <ThumbsDownSvg fill={this.downvoteButtonColor(SkipNoticeAction.Downvote)} />
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
                {!this.props.smaller ? this.getSkipButton() : null}

                {/* Never show button if autoSkip is enabled */}
                {!this.autoSkip ? "" : 
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
                                style={{color: this.downvoteButtonColor(SkipNoticeAction.Downvote)}}
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
                                defaultValue={this.state.segments[0].category}
                                ref={this.categoryOptionRef}>

                            {this.getCategoryOptions()}
                        </select>

                        {/* Submit Button */}
                        {this.state.segments.length === 1 &&
                            <button className="sponsorSkipObject sponsorSkipNoticeButton"
                                    onClick={() => this.prepAction(SkipNoticeAction.CategoryVote)}>

                                {chrome.i18n.getMessage("submit")}
                            </button>
                        }
                    </td>
                </tr>
            ),

            /* Segment Chooser Row */
            (this.state.actionState !== SkipNoticeAction.None && this.state.segments.length > 1 && !this.state.thanksForVotingText &&
                <tr id={"sponsorSkipNoticeSubmissionOptionsRow" + this.idSuffix}
                    key={4}>
                    <td id={"sponsorTimesSubmissionOptionsContainer" + this.idSuffix}>
                        {this.getSubmissionChooser()}
                    </td>
                </tr>
            )
        ];
    }

    getSkipButton(): JSX.Element {
        if (this.state.showSkipButton && (this.state.segments.length > 1 
                || getCategoryActionType(this.state.segments[0].category) !== CategoryActionType.POI
                || this.props.unskipTime)) {
            return (
                <span className="sponsorSkipNoticeUnskipSection">
                    <button id={"sponsorSkipUnskipButton" + this.idSuffix}
                            className="sponsorSkipObject sponsorSkipNoticeButton"
                            style={{marginLeft: "4px",
                                color: (this.state.actionState === SkipNoticeAction.Unskip) ? this.selectedColor : this.unselectedColor
                            }}
                            onClick={() => this.prepAction(SkipNoticeAction.Unskip)}>
                        {this.state.skipButtonText + (this.state.showKeybindHint ? " (" + Config.config.skipKeybind + ")" : "")}
                    </button>
                </span>
            );
        }
    }

    getSubmissionChooser(): JSX.Element[] {
        const elements: JSX.Element[] = [];
        for (let i = 0; i < this.state.segments.length; i++) {
            elements.push(
                <button className="sponsorSkipObject sponsorSkipNoticeButton"
                        style={{opacity: this.getSubmissionChooserOpacity(i), 
                                color: this.getSubmissionChooserColor(i)}}
                        onClick={() => this.performAction(i)}
                        key={"submission" + i + this.state.segments[i].category + this.idSuffix}>
                    {(i + 1) + ". " + chrome.i18n.getMessage("category_" + this.state.segments[i].category)}
                </button>
            );
        }
        return elements;
    }

    getSubmissionChooserOpacity(index: number): number {
        const isUpvote = this.state.actionState === SkipNoticeAction.Upvote;
        const isDownvote = this.state.actionState == SkipNoticeAction.Downvote;
        const isCopyDownvote = this.state.actionState == SkipNoticeAction.CopyDownvote;
        const shouldBeGray: boolean = (isUpvote && this.state.segments[index].voted === voteStatus.Upvoted) ||
                                        (isDownvote && this.state.segments[index].voted === voteStatus.Downvoted) ||
                                        (isCopyDownvote && this.state.segments[index].copied === true);
        return shouldBeGray ? 0.35 : 1;
    }

    getSubmissionChooserColor(index: number): string {
        const isDownvote = this.state.actionState == SkipNoticeAction.Downvote;
        const isCopyDownvote = this.state.actionState == SkipNoticeAction.CopyDownvote;
        const shouldWarnUser = this.state.isVip && (isDownvote || isCopyDownvote) 
                                        && this.state.segments[index].locked === 1;

        return shouldWarnUser ? this.lockedColor : this.unselectedColor;
    }

    onMouseEnter(): void {
        if (this.state.smaller) {
            this.setState({
                smaller: false
            });
        }
    }

    getMessageBox(): JSX.Element[] {
        if (this.state.messages === null) {
            // Add a spacer if there is no text
            return [
                <tr id={"sponsorSkipNoticeSpacer" + this.idSuffix}
                    className="sponsorBlockSpacer"
                    key={"messageBoxSpacer"}>
                </tr>];
        } else {
            const elements = [];
            this.state.messages.forEach(message =>
                elements.push(
                    <tr key={"messageBox"}>
                        <td key={"messageBox"}>
                            <NoticeTextSelectionComponent idSuffix={this.idSuffix}
                                text={message}
                                onClick={this.state.messageOnClick}
                                key={"messageBox"}>
                            </NoticeTextSelectionComponent>
                        </td>
                    </tr>
                )
            );
            return elements;
        }
    }

    prepAction(action: SkipNoticeAction): void {
        if (this.state.segments.length === 1) {
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
                case SkipNoticeAction.Unskip:
                    this.resetStateToStart(SkipNoticeAction.Unskip);
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
            case SkipNoticeAction.Unskip:
                this.unskipAction(index);
                break;
            default:
                this.resetStateToStart();
                break;
        }
    }

    noAction(index: number): void {
        return;
    }

    upvote(index: number): void {
        if (this.state.segments.length === 1) this.resetStateToStart();
        this.contentContainer().vote(1, this.state.segments[index].UUID, undefined, this);
    }

    downvote(index: number): void {
        if (this.state.segments.length === 1) this.resetStateToStart();
        this.contentContainer().vote(0, this.state.segments[index].UUID, undefined, this);
    }

    categoryVote(index: number): void {
        this.contentContainer().vote(undefined, this.state.segments[index].UUID, this.categoryOptionRef.current.value as Category, this)
    }

    copyDownvote(index: number): void {
        this.contentContainer().vote(0, this.state.segments[index].UUID, undefined, this);
        this.props.contentContainer().updatePreviewBar();
        
        const sponsorVideoID = this.props.contentContainer().sponsorVideoID;
        const sponsorTimesSubmitting : SponsorTime = {
            segment: this.state.segments[index].segment,
            UUID: null,
            category: this.state.segments[index].category,
            actionType: this.state.segments[index].actionType,
            source: SponsorSourceType.Local
        };
        const segmentTimes = Config.config.segmentTimes.get(sponsorVideoID) || [];
        segmentTimes.push(sponsorTimesSubmitting);
        Config.config.segmentTimes.set(sponsorVideoID, segmentTimes);
        this.props.contentContainer().sponsorTimesSubmitting.push(sponsorTimesSubmitting);
        this.props.contentContainer().resetSponsorSubmissionNotice();
        this.props.contentContainer().updateEditButtonsOnPlayer();
        const segment = this.state.segments[index];
        segment.copied = true;
        this.contentContainer().updateSegments([segment]);

        
    }

    unskipAction(index: number): void {
        this.state.skipButtonCallback(index);
    }

    openEditingOptions(): void {
        this.resetStateToStart(undefined, true);
    }

    getCategoryOptions(): React.ReactElement[] {
        const elements = [];

        const categories = (CompileConfig.categoryList.filter((cat => getCategoryActionType(cat as Category) === CategoryActionType.Skippable))) as Category[];
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

    unskip(index: number): void {
        this.contentContainer().unskipSponsorTime(this.state.segments[index], this.props.unskipTime);

        this.unskippedMode(index, this.getReskipText());
    }

    reskip(index: number): void {
        this.contentContainer().reskipSponsorTime(this.state.segments[index]);

        const newState: SkipNoticeState = {
            skipButtonText: this.getUnskipText(),
            skipButtonCallback: this.unskip.bind(this),

            segments: this.state.segments,

            maxCountdownTime: () => Config.config.skipNoticeDuration,
            countdownTime: Config.config.skipNoticeDuration
        };

        // See if the title should be changed
        if (!this.autoSkip) {
            newState.noticeTitle = chrome.i18n.getMessage("noticeTitle");
        }       

        //reset countdown
        this.setState(newState, () => {
            this.noticeRef.current.resetCountdown();
        });
    }

    /** Sets up notice to be not skipped yet */
    unskippedMode(index: number, buttonText: string): void {
        //setup new callback and reset countdown
        this.setState(this.getUnskippedModeInfo(index, buttonText), () => {
            this.noticeRef.current.resetCountdown();
        });
    }

    getUnskippedModeInfo(index: number, buttonText: string): SkipNoticeState {
        const changeCountdown = getCategoryActionType(this.state.segments[index].category) === CategoryActionType.Skippable;

        const maxCountdownTime = changeCountdown ? () => {
            const sponsorTime = this.state.segments[index];
            const duration = Math.round((sponsorTime.segment[1] - this.contentContainer().v.currentTime) * (1 / this.contentContainer().v.playbackRate));

            return Math.max(duration, Config.config.skipNoticeDuration);
        } : this.state.maxCountdownTime;

        return {
            skipButtonText: buttonText,
            skipButtonCallback: (index) => this.reskip(index),
            // change max duration to however much of the sponsor is left
            maxCountdownTime: maxCountdownTime,
            countdownTime: maxCountdownTime()
        } as SkipNoticeState;
    }

    afterVote(segment: SponsorTime, type: number, category: Category): void {
        if (segment) {
            const index = utils.getSponsorIndexFromUUID(this.state.segments, segment.UUID);
            const wikiLinkText = CompileConfig.wikiLinks[segment.category];

            switch (type) {
                case 0:
                    this.clearConfigListener();
                    this.setNoticeInfoMessageWithOnClick(() => window.open(wikiLinkText), chrome.i18n.getMessage("OpenCategoryWikiPage"));
                    segment.voted = voteStatus.Downvoted;
                    break;
                case 1:
                    segment.voted = voteStatus.Upvoted;
                    break;
                case 20:
                    segment.voted = voteStatus.None;
                    break;
            }

            this.addVoteButtonInfo(chrome.i18n.getMessage("voted"));

            // Change the sponsor locally
            if (type === 0) {
                segment.hidden = SponsorHideType.Downvoted;
            } else if (category) {
                segment.category = category; // This is the actual segment on the video page. This should now change cc and skipnotice
                //this.segments[index].category = category; //this is the segment inside the skip notice.
            } else if (type === 1) {
                segment.hidden = SponsorHideType.Visible;
            }
            this.contentContainer().updateSegments([segment]);
            this.contentContainer().updatePreviewBar();
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
            Config.configListeners.splice(Config.configListeners.indexOf(this.configListener), 1);
            this.configListener = null;
        }
    }

    unmutedListener(): void {
        if (this.state.segments.length === 1 
                && this.state.segments[0].actionType === ActionType.Mute 
                && this.contentContainer().v.currentTime >= this.state.segments[0].segment[1]) {
            this.setState({
                showSkipButton: false
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

    downvoteButtonColor(downvoteType: SkipNoticeAction): string {
        // Also used for "Copy and Downvote"
        if (this.state.segments.length > 1) {
            return (this.state.actionState === downvoteType) ? this.selectedColor : this.unselectedColor;
        } else {
            // You dont have segment selectors so the lockbutton needs to be colored and cannot be selected.
            return this.state.isVip && this.state.segments[0].locked === 1 ? this.lockedColor : this.unselectedColor;
        }
    }

    private getUnskipText(segment?: SponsorTime): string {
        switch (segment || this.state.segments[0].actionType) {
            case ActionType.Mute: {
                return chrome.i18n.getMessage("unmute");
            }
            case ActionType.Skip: 
            default: {
                return chrome.i18n.getMessage("unskip");
            }
        }
    }

    private getReskipText(): string {
        switch (this.state.segments[0].actionType) {
            case ActionType.Mute: {
                return chrome.i18n.getMessage("mute");
            }
            case ActionType.Skip: 
            default: {
                return chrome.i18n.getMessage("reskip");
            }
        }
    }

    private getSkipText(): string {
        switch (this.state.segments[0].actionType) {
            case ActionType.Mute: {
                return chrome.i18n.getMessage("mute");
            }
            case ActionType.Skip: 
            default: {
                return chrome.i18n.getMessage("skip");
            }
        }
    }

    updateStateViaCC(segments: SponsorTime[]): void {
        const stateSegments = this.state.segments;
        for (const segment of segments) {
            const index = utils.getSponsorIndexFromUUID(this.state.segments, segment.UUID);
            // Sort out those segments that are not included in the skipNotice
            if (index !== -1) stateSegments[index] = segment;
        }
        console.log(getSkippingText(stateSegments, this.props.autoSkip)); // This shows that the title is correct
        this.setState({
            segments: stateSegments,
            noticeTitle: getSkippingText(stateSegments, this.props.autoSkip) // Why does this not update the title?
        })
    }
}

export default SkipNoticeComponent;
