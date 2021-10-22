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
import RefreshSvg from "../svg-icons/refresh_svg";
import CopyPlusDownvoteSvg from "../svg-icons/copy_plus_downvote_svg";
import CategoryDotsSvg from "../svg-icons/category_dots_svg";


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

    loading: boolean;
    segmentButtonsVisible: boolean[];
    editing: boolean[];
    choosingCategory: boolean[];
    thanksForVotingText: string[];
    message?: string[];
    messageOnClick?: ((event: React.MouseEvent) => unknown)[];

    isVip: boolean;
    isWhitelisted: boolean;

    hovering: boolean[][]
}

class ControlPanelComponent extends React.Component<ControlPanelProps, ControlPanelState> {
    contentContainer: ContentContainer;
    categoryOptionRef: React.RefObject<HTMLSelectElement>[]; // Category selectors when changing category
    idPrefix: string;
    channelID: string;

    selectedColor: string;
    unselectedColor: string;
    lockedColor: string;
    selectedOpacity: string;
    amountIcons: number;

    constructor(props: ControlPanelProps) {
        super(props);
        this.contentContainer = props.contentContainer;
        this.idPrefix = "sponsorBlockControlPanel";
        const segments = this.contentContainer().sponsorTimes || [];
        const length = segments.length;
        this.categoryOptionRef = new Array(length).fill(React.createRef());
        this.channelID = this.contentContainer().channelIDInfo.id;

        this.selectedColor = Config.config.colorPalette.red;
        this.unselectedColor = Config.config.colorPalette.white;
        this.lockedColor = Config.config.colorPalette.locked;
        this.selectedOpacity = "0.4";
        this.amountIcons = 8;

        // Set State
        this.state = ({
            loading: false,
            segments: segments,
            segmentButtonsVisible: new Array(length).fill(false),
            editing: new Array(length).fill(false),
            choosingCategory: new Array(length).fill(false),
            thanksForVotingText: new Array(length).fill(null),
            message: new Array(length).fill(null),
            messageOnClick: new Array(length).fill(null),
            isVip: Config.config.isVip,
            isWhitelisted: Config.config.whitelistedChannels.includes(this.channelID),
            hovering: new Array(length).fill(false).map(() => new Array(this.amountIcons).fill(false)) 
        });
        console.log(this.state.hovering);
    }

    render(): React.ReactElement {

        return (
            <div id={this.idPrefix}
                    className="cpMainContainer">
                <div id={this.idPrefix + "CloseDiv"}></div>
                <div id={this.idPrefix + "videoInfoDiv"}>
                    {this.getRefreshSegments()}
                    {this.getSegments()}
                </div>
                <div style={{height: "10px"}}></div>
                {this.getWhitelistDiv()}
            </div>
        );
    }

    getRefreshSegments(): React.ReactElement {
        const className = this.state.loading ? "cpRefreshButton cpRefreshButtonRotate" : "cpRefreshButton";
        return (
            <div id={this.idPrefix + "refreshSegmentsButton"}
                    className={"cpRefreshButton"}
                    style={{}}
                    title={chrome.i18n.getMessage("refreshSegments")}
                    onClick={() => this.refreshSegments()}>
                <RefreshSvg fill={this.unselectedColor} className={className}/>
            </div>
        );
    }

    refreshSegments(): void {
        this.setState({
            loading: true
        })
        this.contentContainer().sponsorsLookup(this.contentContainer().sponsorVideoID, false).then( () => {
            const newSegments = this.contentContainer().sponsorTimes || [];
            const length = newSegments.length;
            this.setState({
                loading: false,
                segments: newSegments,
                segmentButtonsVisible: new Array(length).fill(false),
                editing: new Array(length).fill(false),
                choosingCategory: new Array(length).fill(false),
                thanksForVotingText: new Array(length).fill(null),
                message: new Array(length).fill(null),
                messageOnClick: new Array(length).fill(null),
                hovering: new Array(length).fill(false).map(() => new Array(this.amountIcons).fill(false)) 
            })
        });
    }

    getSegments(): React.ReactElement[] {

        const elements = [];
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
                        key={UUID}
                        className="cpSegmentInteractionContainer">
                    <div style={{marginLeft: "auto", /* wrapper div to remove curser and display: inline-block below */
                                marginRight: "auto"}}>
                        <div id={this.idPrefix + "segmentInfo" + UUID} 
                                style={{cursor: "pointer",
                                    textAlign: "center",
                                    display: "inline-block",
                                    userSelect: "none"}}
                                onClick={() => this.switchSegmentButtonDisplay(i)}> {/* Also opens the vote buttons */}
                            <span id={this.idPrefix + "segmentCircle" + UUID}
                                    className="dot sponsorTimesCategoryColorCircle"
                                    style={{backgroundColor: Config.config.barTypes[segment.category]?.color}}>
                            </span>
                            {utils.shortCategoryName(category) + extraInfo}
                            <div id={this.idPrefix + "segmentStateDescription" + UUID}
                                    style={{ }}>
                                    {utils.getFormattedTime(segment.segment[0], true) +
                                (getCategoryActionType(category) !== CategoryActionType.POI
                                    ? " " + chrome.i18n.getMessage("to") + " " + utils.getFormattedTime(segment.segment[1], true)
                                    : "")}
                            </div>
                        </div>
                    </div>
                    {this.state.segmentButtonsVisible[i] ?
                        <table id={this.idPrefix + "Table" + UUID}
                                style={{
                                    marginLeft: "auto",
                                    marginRight: "auto"}}>
                            <tbody id={this.idPrefix + "TableBody" + UUID}>
                                <tr id={this.idPrefix + "1stTableRow" + UUID}>
                                    {!this.state.thanksForVotingText[i] ?
                                        <td id={this.idPrefix + "segmentButtons" + UUID}
                                                className="cpSvgButton"
                                                style={{
                                                    alignItems: "center",
                                                    alignSelf: "center"}}>

                                            {/* Upvote Button */}
                                            <div id={this.idPrefix + "segmentUpvote" + UUID}
                                                    className="cpSvgButtonLeft"
                                                    title={chrome.i18n.getMessage("upvoteButtonInfo")}
                                                    onMouseLeave={() => this.hoverHandler(i, 0, false)}
                                                    onMouseEnter={() => this.hoverHandler(i, 0, true)}
                                                    onClick={() => this.upvote(i)}>
                                                <ThumbsUpSvg 
                                                    fill={this.unselectedColor}
                                                    selectFill={this.selectedColor} 
                                                    opacity={this.state.hovering[i][0] ? this.selectedOpacity : "0"}/>
                                            </div>

                                            {/* Downvote Button */}
                                            <div id={this.idPrefix + "segmentDownvote" + UUID}
                                                    className="cpSvgButtonLeft cpSvgButtonRight"
                                                    title={chrome.i18n.getMessage("reportButtonInfo")}
                                                    onMouseLeave={() => this.hoverHandler(i, 1, false)}
                                                    onMouseEnter={() => this.hoverHandler(i, 1, true)}
                                                    onClick={() => this.downvote(i)}>
                                                <ThumbsDownSvg 
                                                    fill={this.state.isVip && this.state.segments[i].locked === 1 ? this.lockedColor : this.unselectedColor}
                                                    selectFill={this.selectedColor} 
                                                    opacity={this.state.hovering[i][1] ? this.selectedOpacity : "0"}/>
                                            </div>

                                            {/* Edit Button */}
                                            <div id={this.idPrefix + "segmentEdit" + UUID}
                                                    className="cpSvgButtonLeft cpSvgButtonRight"
                                                    onMouseLeave={() => this.hoverHandler(i, 3, false)}
                                                    onMouseEnter={() => this.hoverHandler(i, 3, true)}
                                                    onClick={() => this.editButtonOnClick(i)}>
                                                <PencilSvg 
                                                    fill={(this.state.editing[i] === true || this.state.choosingCategory[i] === true) ? this.selectedColor : this.unselectedColor} 
                                                    selectFill={this.selectedColor} 
                                                    opacity={this.state.hovering[i][3] ? this.selectedOpacity : "0"} />
                                            </div>

                                            {/* Hide */}
                                            <div id={this.idPrefix + "segmentHide" + UUID}
                                                    className="cpSvgButtonRight"
                                                    title={this.state.segments[i].hidden === SponsorHideType.Visible ? chrome.i18n.getMessage("hideButtonInfo") : chrome.i18n.getMessage("unhideButtonInfo")}
                                                    onMouseLeave={() => this.hoverHandler(i, 4, false)}
                                                    onMouseEnter={() => this.hoverHandler(i, 4, true)}
                                                    onClick={() => this.toggleHide(i)}>
                                                {this.state.segments[i].hidden === SponsorHideType.Visible 
                                                    ? <VisibilitySvg 
                                                        fill={this.unselectedColor} 
                                                        selectFill={this.selectedColor} 
                                                        opacity={this.state.hovering[i][4] ? this.selectedOpacity : "0"} /> 
                                                    : <VisibilityOffSvg 
                                                        fill={this.unselectedColor} 
                                                        selectFill={this.selectedColor} 
                                                        opacity={this.state.hovering[i][4] ? this.selectedOpacity : "0"} />}
                                            </div>
                                        </td>
                                        :
                                        <td id={this.idPrefix + "segmentAfterVote" + UUID}>
                                            {/* Submitted string */}
                                            <span style={{marginRight: "10px"}}>
                                                {this.state.thanksForVotingText}
                                            </span>

                                            {/* Continue Voting Button */}
                                            <button id={"sponsorTimesContinueVotingContainer" + UUID}
                                                    title={"Continue Voting"}
                                                    onMouseLeave={() => this.hoverHandler(i, 5, false)}
                                                    onMouseEnter={() => this.hoverHandler(i, 5, true)}
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
                                    <tr id={this.idPrefix + "2ndTableRow" + UUID}>
                                        <td className="cpSvgButton">
                                            {/* Copy Segment */}
                                            <div id={this.idPrefix + "DownvoteCopyButton" + UUID}
                                                    className="cpSvgButtonLeft"
                                                    title={chrome.i18n.getMessage("CopyDownvoteButtonInfo")}
                                                    onMouseLeave={() => this.hoverHandler(i, 7, false)}
                                                    onMouseEnter={() => this.hoverHandler(i, 7, true)}
                                                    onClick={() => this.copyDownvote(i)}>
                                                <CopyPlusDownvoteSvg
                                                    fill={this.state.isVip ? this.lockedColor : this.unselectedColor} 
                                                    selectFill={this.selectedColor} 
                                                    opacity={this.state.hovering[i][7] ? this.selectedOpacity : "0"}/>
                                            </div>

                                            {/* Category vote opener */}
                                            <div id={this.idPrefix + "ChangeCategoryButton" + UUID}
                                                    className="cpSvgButtonLeft cpSvgButtonRight"
                                                    title={chrome.i18n.getMessage("ChangeCategoryTooltip")}
                                                    onClick={() => this.categoryVoteOpenerOnClick(i)}>
                                                <CategoryDotsSvg />
                                            </div>

                                            {this.state.isVip ?
                                                /* Undo Button */
                                                <div id={this.idPrefix + "segmentUndo" + UUID}
                                                        className="cpSvgButtonLeft cpSvgButtonRight"
                                                        title={chrome.i18n.getMessage("undoButtonInfo")}
                                                        onMouseLeave={() => this.hoverHandler(i, 2, false)}
                                                        onMouseEnter={() => this.hoverHandler(i, 2, true)}
                                                        onClick={() => this.undo(i)}>
                                                    <UndoSvg 
                                                        fill={this.unselectedColor} 
                                                        selectFill={this.selectedColor} 
                                                        opacity={this.state.hovering[i][2] ? this.selectedOpacity : "0"} />
                                                </div>
                                                :
                                                null
                                            }

                                            {/* Copy UUID */}
                                            <div id={this.idPrefix + "segmentCopyUUID" + UUID}
                                                    className="cpSvgButtonRight"
                                                    title={chrome.i18n.getMessage("copyUUIDButtonInfo")}
                                                    onMouseLeave={() => this.hoverHandler(i, 6, false)}
                                                    onMouseEnter={() => this.hoverHandler(i, 6, true)}
                                                    onClick={() => navigator.clipboard.writeText(UUID)}>
                                                <ClipboardSvg 
                                                    fill={this.unselectedColor} 
                                                    selectFill={this.selectedColor} 
                                                    opacity={this.state.hovering[i][6] ? this.selectedOpacity : "0"} />
                                            </div>
                                        </td>
                                    </tr>
                                    :
                                    null
                                }
                                {this.state.choosingCategory[i] ?
                                    (<tr id={this.idPrefix + "1stTableRow" + UUID}>
                                        <td>
                                            {/* Category Selector */}
                                            <select id={this.idPrefix + "sponsorTimeCategorySelector" + UUID}
                                                    className={"sponsorTimeEditSelector"}
                                                    defaultValue={category}
                                                    ref={this.categoryOptionRef[i]}
                                                    >
                                                {this.getCategoryOptions(UUID)}
                                            </select>

                                            {/* Submit Button */}
                                            <button id={this.idPrefix + "CategoryChangeButton" + UUID}
                                                    className="sponsorSkipNoticeButton sponsorSkipObject"
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
            segmentButtonsVisible: this.setArrayElement(i, this.state.segmentButtonsVisible, !this.state.segmentButtonsVisible[i])
        });
        this.closeSubmenus(i);
        this.resetVoteButtonInfo(i);
    }

    upvote(i: number): void {
        // Upvote
        this.closeSubmenus(i);
        this.contentContainer().vote(1, this.state.segments[i].UUID, undefined, undefined, [this, i]);
    }

    downvote(i: number): void {
        // Downvote
        this.closeSubmenus(i);
        this.contentContainer().vote(0, this.state.segments[i].UUID, undefined, undefined, [this, i]);
    }

    undo(i: number): void {
        // Undo Vote; type is 20
        this.closeSubmenus(i);
        this.contentContainer().vote(20, this.state.segments[i].UUID, undefined, undefined, [this, i]);
    }

    copyDownvote(i: number): void {
        // CopyDownvote
        const sponsorVideoID = this.props.contentContainer().sponsorVideoID;
        const sponsorTimesSubmitting : SponsorTime = {
            segment: this.state.segments[i].segment,
            UUID: this.state.segments[i].UUID,
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

        this.closeSubmenus(i);

        this.contentContainer().vote(0, this.state.segments[i].UUID, undefined, undefined, [this, i]);
    }

    categoryVote(i: number, category: Category): void {
        // Category vote
        this.closeSubmenus(i);
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
                segment.hidden = segment.hidden === SponsorHideType.Local ? SponsorHideType.Local : SponsorHideType.Visible;
            }

            const hovering = this.state.hovering;
            hovering[index] = new Array(this.amountIcons).fill(false);
            this.setState({
                hovering: hovering
            });
            this.props.contentContainer().updateSegments([segment]);
            this.props.contentContainer().updatePreviewBar();
        }
        this.setState
    }

    getCategoryOptions(UUID: SegmentUUID): React.ReactElement[] {
        const elements = [];
        
        const categories = (CompileConfig.categoryList.filter((cat => getCategoryActionType(cat as Category) === CategoryActionType.Skippable))) as Category[];
        for (const category of categories) {
            elements.push(
                <option key={category}
                        value={category}
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

    closeSubmenus(i: number): void {
        this.setState({
            editing: this.setArrayElement(i, this.state.editing, false),
            choosingCategory: this.setArrayElement(i, this.state.choosingCategory, false)
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

    hoverHandler(index: number, iconIndex: number, select: boolean): void {
        const hovering = this.state.hovering;
        hovering[index][iconIndex] = select;

        this.setState({
            hovering: hovering
        });
    }

    getWhitelistDiv(): React.ReactElement {
        return (
            <div id={this.idPrefix + "Whitelist"}
                    style={{textAlign: "center"}}>
                <button id={this.idPrefix + "WhitelistToggleButton"}
                        key={"whitelistDiv"}
                        className="sponsorSkipNoticeButton sponsorSkipObject"
                        onClick={() => {this.setWhitelist(!this.state.isWhitelisted)}}>
                    {this.state.isWhitelisted ? chrome.i18n.getMessage("removeFromWhitelist") : chrome.i18n.getMessage("whitelistChannel")}
                </button>
            </div>
        );
    }

    setWhitelist(shouldAdd: boolean): void {
        const whitelist = Config.config.whitelistedChannels;
        const index = whitelist.indexOf(this.channelID);
        if (shouldAdd) {
            if (index === -1) {
                whitelist.push(this.channelID);
            }
        }
        else {
            if (index > -1) {
                whitelist.splice(index, 1);
            }
        }
        console.log(whitelist);
        Config.config.whitelistedChannels = whitelist
        this.setState({
            isWhitelisted: Config.config.whitelistedChannels.includes(this.channelID)
        })
    }
}

export default ControlPanelComponent;
