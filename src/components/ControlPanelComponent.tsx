import * as React from "react";
import * as CompileConfig from "../../config.json";
import { Category, ContentContainer, CategoryActionType, SponsorHideType, SponsorTime, NoticeVisbilityMode, ActionType, voteStatus, SponsorSourceType, SegmentUUID } from "../types";
import Config from "../config";
import { getCategoryActionType } from "../utils/categoryUtils";
import Utils from "../utils";
const utils = new Utils();

// Pictures
import ThumbsUpSvg from "../svg-icons/thumbs_up_svg";
import ThumbsDownSvg from "../svg-icons/thumbs_down_svg";
import PencilSvg from "../svg-icons/pencil_svg";
import VisibilitySvg from "../svg-icons/visibility_svg";
import VisibilityOffSvg from "../svg-icons/visibility_off_svg";
import UndoSvg from "../svg-icons/undo_svg";
import ClipboardSvg from "../svg-icons/clipboard_svg";


export enum voteState {
    None,
    Upvote,
    Downvote,
    CategoryVote,
    CopyDownvote,
    Unskip
}

export interface ControlPanelProps {
    // Contains functions and variables from the content script needed by the skip notice
    contentContainer: ContentContainer;
}

export interface ControlPanelState {
    segments: SponsorTime[];

    segmentButtonsVisible: boolean[];
    editing: boolean[];
    choosingCategory: boolean[];
    thanksForVotingText: string[];
    message?: string[];
    messageOnClick?: ((event: React.MouseEvent) => unknown)[];

    isVip: boolean;
    //channelID: string;
}

class ControlPanelComponent extends React.Component<ControlPanelProps, ControlPanelState> {
    contentContainer: ContentContainer;
    categoryOptionRef: React.RefObject<HTMLSelectElement>[]; // Category selectors when changing category
    idPrefix: string;

    selectedColor: string;
    unselectedColor: string;
    lockedColor: string;


    constructor(props: ControlPanelProps) {
        super(props);
        this.contentContainer = props.contentContainer;
        this.idPrefix = "sponsorBlockControlPanel";
        const segments = this.contentContainer().sponsorTimes || [];
        // Sort segments
        const length = segments.length;
        if (length > 1) {
            segments.sort((a, b) => a.segment[0] - b.segment[0]);
        }
        for (const segment of segments) {
            segment.locked ||= 0;
            segment.voted ||= voteStatus.None;
            segment.copied ||= false;
            segment.hidden = SponsorHideType.Visible;
        }
        this.categoryOptionRef = new Array(length).fill(React.createRef());
        // Set State
        this.state = ({
            segments: segments,
            segmentButtonsVisible: new Array(length).fill(false),
            editing: new Array(length).fill(false),
            choosingCategory: new Array(length).fill(false),
            thanksForVotingText: new Array(length).fill(null),
            message: new Array(length).fill(null),
            messageOnClick: new Array(length).fill(null),
            isVip: Config.config.isVip
            //channelID: this.contentContainer().videoInfo?.videoDetails?.channelId
        });
    }

    render(): React.ReactElement {

        return (
            <div id={this.idPrefix}
                className="sponsorBlockPageBody preload">
                <div id={this.idPrefix + "CloseDiv"}></div>
                <div id={this.idPrefix + "videoInfoDiv"}
                        className="bottomSpace">
                    <div id={this.idPrefix + "refreshSegmentsButtonDiv"}>
                        <button id={this.idPrefix + "refreshSegmentsButton"}
                                className="sbSlimButton"
                                title={chrome.i18n.getMessage("refreshSegments")}>
                            <img id={this.idPrefix + "refreshSegments"} src={chrome.runtime.getURL("/icons/refresh.svg")}/>
                        </button>
                    </div>
                    <div id={this.idPrefix + "segmentInteractionContainerDiv"}>
                        {this.getSegments()}
                    </div>
                </div>
                <div id={this.idPrefix + "WhitelistDiv"}>
                        {this.getWhitelistDiv()}
                </div>
            </div>
        );
    }

    getSegments(): React.ReactElement[] {

        const elements = [];
        //for (const segment of segments) {
        for (let i = 0; i < this.state.segments.length; i++) {
            const segment = this.state.segments[i];
            const UUID = segment.UUID;
            const category = segment.category;

            let extraInfo = "";
            if (segment.hidden === SponsorHideType.Downvoted) {
                //this one is downvoted
                extraInfo = " (" + chrome.i18n.getMessage("hiddenDueToDownvote") + ")";
            } else if (segment.hidden === SponsorHideType.MinimumDuration) {
                //this one is too short
                extraInfo = " (" + chrome.i18n.getMessage("hiddenDueToDuration") + ")";
            }

            elements.push(
                <div id={this.idPrefix + "segmentInteractionContainer" + UUID}
                        className="votingButtons">
                    <div id={this.idPrefix + "segmentInfo" + UUID} //Also opens the vote buttons
                            className="segmentTimeButton popupElement"
                            onClick={() => this.switchSegmentButtonDisplay(i)}>
                        <span id={this.idPrefix + "segmentCircle" + UUID}
                                className="dot sponsorTimesCategoryColorCircle"
                                style={{backgroundColor: Config.config.barTypes[segment.category]?.color}}>
                        </span>
                        {utils.shortCategoryName(category) + extraInfo}
                        <div id={this.idPrefix + "segmentStateDescription" + UUID}
                                style={{margin: "5px"}}>
                                {utils.getFormattedTime(segment.segment[0], true) +
                            (getCategoryActionType(category) !== CategoryActionType.POI
                                ? " " + chrome.i18n.getMessage("to") + " " + utils.getFormattedTime(segment.segment[1], true)
                                : "")}
                        </div>
                    </div>
                    {this.state.segmentButtonsVisible[i] ?
                        <table id={this.idPrefix + "Table" + UUID}
                                key={0 + UUID}
                                style={{}}>
                            <tbody id={this.idPrefix + "TableBody" + UUID}>
                                <tr id={this.idPrefix + "1stTableRow" + UUID}>
                                    {!this.state.thanksForVotingText[i] ?
                                        <td id={this.idPrefix + "segmentButtons" + UUID}
                                                className="sponsorTimesVoteButtonsContainer"
                                                style={{alignItems: "center"}}>

                                            {/* Upvote Button */}
                                            <div id={this.idPrefix + "segmentUpvote" + UUID}
                                                    key={1 + UUID}
                                                    className="segmentTimeButton"
                                                    style={{marginRight: "0px"}}
                                                    title={chrome.i18n.getMessage("upvoteButtonInfo")}
                                                    onClick={() => this.upvote(i)}>
                                                <ThumbsUpSvg fill={this.unselectedColor} />
                                            </div>

                                            {/* Downvote Button */}
                                            <div id={this.idPrefix + "segmentDownvote" + UUID}
                                                    key={2 + UUID}
                                                    className="segmentTimeButton"
                                                    title={chrome.i18n.getMessage("reportButtonInfo")}
                                                    onClick={() => this.downvote(i)}>
                                                <ThumbsDownSvg fill={this.state.isVip && this.state.segments[i].locked === 1 ? this.lockedColor : this.unselectedColor} />
                                            </div>

                                            {this.state.isVip ?
                                                /* Undo Button */
                                                <div id={this.idPrefix + "segmentUndo" + UUID}
                                                        key={10 + UUID}
                                                        className="segmentTimeButton"
                                                        title={chrome.i18n.getMessage("undoButtonInfo")}
                                                        onClick={() => this.undo(i)}>
                                                    <UndoSvg fill={this.unselectedColor}/>
                                                </div>
                                                :
                                                null
                                            }

                                            {/* Edit Button */}
                                            <div id={this.idPrefix + "segmentEdit" + UUID}
                                                    key={3 + UUID}
                                                    className="segmentTimeButton"
                                                    onClick={() => this.editButtonOnClick(i)}>
                                                <PencilSvg fill={(this.state.editing[i] === true || this.state.choosingCategory[i] === true) ? this.selectedColor : this.unselectedColor} />
                                            </div>

                                            {/* Hide */}
                                            <div id={this.idPrefix + "segmentHide" + UUID}
                                                    key={4 + UUID}
                                                    className="segmentTimeButton"
                                                    title={this.state.segments[i].hidden === SponsorHideType.Visible ? chrome.i18n.getMessage("hideButtonInfo") : chrome.i18n.getMessage("unhideButtonInfo")}
                                                    onClick={() => this.toggleHide(i)}>
                                                {this.state.segments[i].hidden === SponsorHideType.Visible ? <VisibilitySvg fill={this.unselectedColor}/> : <VisibilityOffSvg fill={this.unselectedColor}/>}
                                            </div>
                                        </td>
                                        :
                                        <td id={this.idPrefix + "segmentAfterVote" + UUID}
                                                key={5 + UUID}>
                                            {/* Submitted string */}
                                            <span style={{marginRight: "10px"}}>
                                                {this.state.thanksForVotingText}
                                            </span>

                                            {/* Continue Voting Button */}
                                            <button id={"sponsorTimesContinueVotingContainer" + UUID}
                                                    className="sponsorSkipObject sponsorSkipNoticeButton"
                                                    title={"Continue Voting"}
                                                    onClick={() => this.setState({
                                                        thanksForVotingText: this.setArrayElement(i, this.state.thanksForVotingText, null),
                                                        message: this.setArrayElement(i, this.state.message, null)
                                                    })}>
                                                {chrome.i18n.getMessage("ContinueVoting")}
                                            </button>
                                        </td>
                                    }
                                </tr>
                                {this.state.editing[i] ?
                                    <tr id={this.idPrefix + "2ndTableRow" + UUID}
                                            key={6 + UUID}>
                                        <td>
                                            {/* Copy Segment */}
                                            <button id={this.idPrefix + "DownvoteCopyButton" + UUID}
                                                    className="sponsorSkipObject sponsorSkipNoticeButton"
                                                    title={chrome.i18n.getMessage("CopyDownvoteButtonInfo")}
                                                    style={{color: this.unselectedColor}}
                                                    onClick={() => this.copyDownvote(i)}>
                                                {chrome.i18n.getMessage("CopyAndDownvote")}
                                            </button>

                                            {/* Category vote opener */}
                                            <button id={this.idPrefix + "ChangeCategoryButton" + UUID}
                                                    className="sponsorSkipObject sponsorSkipNoticeButton"
                                                    title={chrome.i18n.getMessage("ChangeCategoryTooltip")}
                                                    style={{color: (this.state.choosingCategory[i]) ? this.selectedColor : this.unselectedColor}}
                                                    onClick={() => this.categoryVoteOpenerOnClick(i)}>
                                                {chrome.i18n.getMessage("incorrectCategory")}
                                            </button>

                                            {/* Copy UUID */}
                                            <div id={this.idPrefix + "segmentCopyUUID" + UUID}
                                                    key={11 + UUID}
                                                    className="segmentTimeButton"
                                                    title={chrome.i18n.getMessage("copyUUIDButtonInfo")}
                                                    onClick={() => navigator.clipboard.writeText(UUID)}>
                                                <ClipboardSvg fill={this.unselectedColor} />
                                            </div>
                                        </td>
                                    </tr>
                                    :
                                    null
                                }
                                {this.state.choosingCategory[i] ?
                                    (<tr id={this.idPrefix + "1stTableRow" + UUID}
                                            key={7 + UUID}>
                                        <td>
                                            {/* Category Selector */}
                                            <select id={this.idPrefix + "sponsorTimeCategorySelector" + UUID}
                                                    className="sponsorTimeCategories sponsorTimeEditSelector"
                                                    defaultValue={category}
                                                    ref={this.categoryOptionRef[i]}>
                                                {this.getCategoryOptions(UUID)}
                                            </select>

                                            {/* Submit Button */}
                                            <button id={this.idPrefix + "CategoryChangeButton" + UUID}
                                                    className="sponsorSkipObject sponsorSkipNoticeButton"
                                                    onClick={() => this.categoryVote(i, this.categoryOptionRef[i].current.value as Category)}>
                                                {chrome.i18n.getMessage("submit")}
                                            </button>
                                        </td>
                                    </tr>)
                                    :
                                    null
                                }
                            </tbody>
                        </table>
                        :
                        null
                    }
                </div>
            );
        }

        return elements;
    }

    switchSegmentButtonDisplay(i: number): void {
        // Opens the menu to all buttons
        this.setState({
            segmentButtonsVisible: this.setArrayElement(i, this.state.segmentButtonsVisible, !this.state.segmentButtonsVisible[i]),
            editing: this.setArrayElement(i, this.state.editing, false),
        });
        this.resetVoteButtonInfo(i);
    }

    upvote(i: number): void {
        // Upvote
        this.contentContainer().vote(1, this.state.segments[i].UUID, undefined, undefined, [this, i]);
    }

    downvote(i: number): void {
        // Downvote
        this.contentContainer().vote(0, this.state.segments[i].UUID, undefined, undefined, [this, i]);
    }

    undo(i: number): void {
        // Undo Vote; type is 20
        this.contentContainer().vote(20, this.state.segments[i].UUID, undefined, undefined, [this, i]);
    }

    copyDownvote(i: number): void {
        // CopyDownvote
        const sponsorVideoID = this.props.contentContainer().sponsorVideoID;
        const sponsorTimesSubmitting : SponsorTime = {
            segment: this.state.segments[i].segment,
            UUID: null,
            category: this.state.segments[i].category,
            actionType: this.state.segments[i].actionType,
            source: SponsorSourceType.Local
        };

        const segmentTimes = Config.config.segmentTimes.get(sponsorVideoID) || [];
        segmentTimes.push(sponsorTimesSubmitting);
        Config.config.segmentTimes.set(sponsorVideoID, segmentTimes);

        this.props.contentContainer().sponsorTimesSubmitting.push(sponsorTimesSubmitting);
        this.props.contentContainer().updatePreviewBar();
        this.props.contentContainer().resetSponsorSubmissionNotice();
        this.props.contentContainer().updateEditButtonsOnPlayer();
        const segment = this.state.segments[i];
        segment.copied = true;
        this.contentContainer().updateSegments([segment]);

        // Close editing row
        this.setState({
            editing: this.setArrayElement(i, this.state.editing, false)
        })

        this.contentContainer().vote(0, this.state.segments[i].UUID, undefined, undefined, [this, i]);
    }

    categoryVote(i: number, category: Category): void {
        // Category vote
        this.contentContainer().vote(undefined, this.state.segments[i].UUID, this.categoryOptionRef[i].current.value as Category, undefined, [this, i]);
    }

    toggleHide(i: number): void {
        // Toggles the hidden state of the segment
        const x = this.state.segments[i].hidden
        if (x === SponsorHideType.Visible) {
            this.setHide(i, SponsorHideType.Local);
        } else if (x === SponsorHideType.Downvoted || x === SponsorHideType.Local || x === SponsorHideType.MinimumDuration) {
            this.setHide(i, SponsorHideType.Visible);
        }
    }

    editButtonOnClick(i: number): void {
        // Opens the options to copyDownvote and categoryVote
        this.setState({
            editing: this.setArrayElement(i, this.state.editing, !this.state.editing[i]),
            choosingCategory: this.setArrayElement(i, this.state.choosingCategory, false)
        });
    }

    categoryVoteOpenerOnClick(i: number): void {
        // Opens the category vote menu
        this.setState({
            editing: this.setArrayElement(i, this.state.editing, false),
            choosingCategory: this.setArrayElement(i, this.state.choosingCategory, !this.state.choosingCategory[i])
        });
    }

    afterVote(i: number, segment: SponsorTime, type: number, category: Category): void {
        if (segment) {
            const index = utils.getSponsorIndexFromUUID(this.state.segments, segment.UUID);
            const wikiLinkText = CompileConfig.wikiLinks[segment.category];

            switch (type) {
                case 0:
                    this.setNoticeInfoMessageWithOnClick(i, () => window.open(wikiLinkText), chrome.i18n.getMessage("OpenCategoryWikiPage"));
                    segment.voted = voteStatus.Downvoted;
                    break;
                case 1:
                    segment.voted = voteStatus.Upvoted;
                    break;
                case 20:
                    segment.voted = voteStatus.None;
                    segment.hidden = SponsorHideType.Visible;
                    break;
            }

            this.addVoteButtonInfo(i, chrome.i18n.getMessage("voted"));

            // Change the sponsor locally
            if (type === 0) {
                segment.hidden = SponsorHideType.Downvoted;
            } else if (category) {
                segment.category = category;
            } else if (type === 1) {
                segment.hidden = SponsorHideType.Visible;
            }
            this.props.contentContainer().updateSegments([segment]);
            this.props.contentContainer().updatePreviewBar();
        }
    }

    getCategoryOptions(UUID: SegmentUUID): React.ReactElement[] {
        const elements = [];
        
        const categories = (CompileConfig.categoryList.filter((cat => getCategoryActionType(cat as Category) === CategoryActionType.Skippable))) as Category[];
        for (const category of categories) {
            elements.push(
                <option value={category}
                        key={category + UUID}
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

    addVoteButtonInfo(i: number, message: string): void {
        this.setState({
            thanksForVotingText: this.setArrayElement(i, this.state.thanksForVotingText, message)
        });
    }

    setNoticeInfoMessageWithOnClick(i: number, onClick: (event: React.MouseEvent) => unknown, message: string): void {
        this.setState({
            message: this.setArrayElement(i, this.state.message, message),
            messageOnClick: this.setArrayElement(i, this.state.messageOnClick, onClick)
        });
    }

    setNoticeInfoMessage(i: number, message: string): void {
        this.setState({
            message: this.setArrayElement(i, this.state.message, message)
        });
    }

    resetVoteButtonInfo(i: number): void {
        this.setState({
            thanksForVotingText: this.setArrayElement(i, this.state.thanksForVotingText, null)
        });
    }

    setHide(i: number, value: SponsorHideType): void {
        const segment = this.state.segments[i];
        segment.hidden = value;
        this.contentContainer().updateSegments([segment]);
        this.props.contentContainer().updatePreviewBar();
    }

    setArrayElement<Type>(index: number, array: Type[], value: Type): Type[] {
        array[index] = value;
        return array;
    }

    updateStateViaCC(segments: SponsorTime[]): void {
        const stateSegments = this.state.segments;
        for (const segment of segments) {
            const index = utils.getSponsorIndexFromUUID(stateSegments, segment.UUID);
            // Sort out those segments that are not included in the skipNotice
            if (index !== -1) stateSegments[index] = segment;
        }
        this.setState({
            segments: stateSegments
        })
    }

    

    getWhitelistDiv(): React.ReactElement {
        const isWhitelisted = true;//Config.config.whitelistedChannels.includes(this.state.channelID);
        return (
            <div id={this.idPrefix + "Whitelist"}>
                <button id={this.idPrefix + "WhitelistToggleButton"}
                    onClick={() => this.setWhitelist(!isWhitelisted)}>
                    {isWhitelisted ? chrome.i18n.getMessage("whitelistChannel") : chrome.i18n.getMessage("removeFromWhitelist")}
                </button>
            </div>
        );
    }

    setWhitelist(shouldAdd: boolean): void {
        const whitelist = Config.config.whitelistedChannels;
        if (shouldAdd) {
            //whitelist.push(this.state.channelID);
        }
        else {
            const index = 0;//whitelist.indexOf(this.state.channelID, 0);
            if (index > -1) {
                whitelist.splice(index, 1);
            }
        }
        Config.config.whitelistedChannels = whitelist;
    }
}

export default ControlPanelComponent;
