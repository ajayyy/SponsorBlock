import * as React from "react";
import * as CompileConfig from "../../config.json";
import Config from "../config";
import { ActionType, ActionTypes, Category, CategoryActionType, ContentContainer, SponsorTime } from "../types";
import Utils from "../utils";
import { getCategoryActionType } from "../utils/categoryUtils";
import SubmissionNoticeComponent from "./SubmissionNoticeComponent";
import { RectangleTooltip } from "../render/RectangleTooltip";


const utils = new Utils();

export interface SponsorTimeEditProps {
    index: number,

    idSuffix: string,
    // Contains functions and variables from the content script needed by the skip notice
    contentContainer: ContentContainer,

    submissionNotice: SubmissionNoticeComponent;
    categoryList?: Category[];
}

export interface SponsorTimeEditState {
    editing: boolean;
    sponsorTimeEdits: [string, string];
}

const DEFAULT_CATEGORY = "chooseACategory";

class SponsorTimeEditComponent extends React.Component<SponsorTimeEditProps, SponsorTimeEditState> {

    idSuffix: string;

    categoryOptionRef: React.RefObject<HTMLSelectElement>;
    actionTypeOptionRef: React.RefObject<HTMLSelectElement>;

    configUpdateListener: () => void;

    constructor(props: SponsorTimeEditProps) {
        super(props);

        this.categoryOptionRef = React.createRef();
        this.actionTypeOptionRef = React.createRef();

        this.idSuffix = this.props.idSuffix;

        this.state = {
            editing: false,
            sponsorTimeEdits: [null, null]
        };
    }

    componentDidMount(): void {
        // Prevent inputs from triggering key events
        document.getElementById("sponsorTimesContainer" + this.idSuffix).addEventListener('keydown', function (event) {
            event.stopPropagation();
        });

        // Prevent scrolling while changing times
        document.getElementById("sponsorTimesContainer" + this.idSuffix).addEventListener('wheel', function (event) {
            event.preventDefault();
        }, {passive: false});

        // Add as a config listener
        if (!this.configUpdateListener) {
            this.configUpdateListener = () => this.configUpdate();
            Config.configListeners.push(this.configUpdate.bind(this));
        }
    }

    componentWillUnmount(): void {
        if (this.configUpdateListener) {
            Config.configListeners.splice(Config.configListeners.indexOf(this.configUpdate.bind(this)), 1);
        }
    }

    render(): React.ReactElement {
        const style: React.CSSProperties = {
            textAlign: "center"
        };

        if (this.props.index != 0) {
            style.marginTop = "15px";
        }

        // This method is required to get !important
        // https://stackoverflow.com/a/45669262/1985387
        const oldYouTubeDarkStyles = (node) => {
            if (node) {
                node.style.setProperty("color", "black", "important");
                node.style.setProperty("text-shadow", "none", "important");
            }
        };
        // Create time display
        let timeDisplay: JSX.Element;
        const sponsorTime = this.props.contentContainer().sponsorTimesSubmitting[this.props.index];
        const segment = sponsorTime.segment;
        if (this.state.editing) {
            timeDisplay = (
                <div id={"sponsorTimesContainer" + this.idSuffix}
                    className="sponsorTimeDisplay">

                        <span id={"nowButton0" + this.idSuffix}
                            className="sponsorNowButton"
                            onClick={() => this.setTimeToNow(0)}>
                                {chrome.i18n.getMessage("bracketNow")}
                        </span>
                        <input id={"submittingTime0" + this.idSuffix}
                            className="sponsorTimeEdit sponsorTimeEditInput"
                            ref={oldYouTubeDarkStyles}
                            type="text"
                            value={this.state.sponsorTimeEdits[0]}
                            onChange={(e) => {this.handleOnChange(0, e, sponsorTime, e.target.value)}}
                            onWheel={(e) => {this.changeTimesWhenScrolling(0, e, sponsorTime)}}>
                        </input>

                        {getCategoryActionType(sponsorTime.category) === CategoryActionType.Skippable ? (
                            <span>
                                <span>
                                    {" " + chrome.i18n.getMessage("to") + " "}
                                </span>

                                <input id={"submittingTime1" + this.idSuffix}
                                    className="sponsorTimeEdit sponsorTimeEditInput"
                                    ref={oldYouTubeDarkStyles}
                                    type="text"
                                    value={this.state.sponsorTimeEdits[1]}
                                    onChange={(e) => {this.handleOnChange(1, e, sponsorTime, e.target.value)}}
                                    onWheel={(e) => {this.changeTimesWhenScrolling(1, e, sponsorTime)}}>
                                </input>

                                <span id={"nowButton1" + this.idSuffix}
                                    className="sponsorNowButton"
                                    onClick={() => this.setTimeToNow(1)}>
                                        {chrome.i18n.getMessage("bracketNow")}
                                </span>

                                <span id={"endButton" + this.idSuffix}
                                    className="sponsorNowButton"
                                    onClick={() => this.setTimeToEnd()}>
                                        {chrome.i18n.getMessage("bracketEnd")}
                                </span>
                            </span>
                        ): ""}
                </div>
            );
        } else {
            timeDisplay = (
                
                <div id={"sponsorTimesContainer" + this.idSuffix}
                    className="sponsorTimeDisplay"
                    onClick={this.toggleEditTime.bind(this)}
                    onWheel={this.toggleEditTime.bind(this)}>
                        {utils.getFormattedTime(segment[0], true) +
                            ((!isNaN(segment[1]) && getCategoryActionType(sponsorTime.category) === CategoryActionType.Skippable)
                                ? " " + chrome.i18n.getMessage("to") + " " + utils.getFormattedTime(segment[1], true) : "")}
                </div>
            );
        }

        return (
            <div style={style}>
                
                {timeDisplay}

                {/* Category */}
                <div style={{position: "relative"}}>
                    <select id={"sponsorTimeCategories" + this.idSuffix}
                        className="sponsorTimeEditSelector sponsorTimeCategories"
                        defaultValue={sponsorTime.category}
                        ref={this.categoryOptionRef}
                        onChange={this.categorySelectionChange.bind(this)}>
                        {this.getCategoryOptions()}
                    </select>

                    {/* open in new tab */}
                    <a href="https://wiki.sponsor.ajay.app/index.php/Segment_Categories"
                        target="_blank" rel="noreferrer">
                        <img id={"sponsorTimeCategoriesHelpButton" + this.idSuffix}
                            className="helpButton"
                            src={chrome.extension.getURL("icons/help.svg")}
                            title={chrome.i18n.getMessage("categoryGuidelines")} />
                    </a>
                </div>

                {/* Action Type */}
                {CompileConfig.categorySupport[sponsorTime.category]?.length > 1 ? (
                    <div style={{position: "relative"}}>
                        <select id={"sponsorTimeActionTypes" + this.idSuffix}
                            className="sponsorTimeEditSelector sponsorTimeActionTypes"
                            defaultValue={sponsorTime.actionType}
                            ref={this.actionTypeOptionRef}
                            onChange={() => this.saveEditTimes()}>
                            {this.getActionTypeOptions(sponsorTime)}
                        </select>
                    </div>
                ): ""}

                <br/>

                {/* Editing Tools */}

                <span id={"sponsorTimeDeleteButton" + this.idSuffix}
                    className="sponsorTimeEditButton"
                    onClick={this.deleteTime.bind(this)}>
                    {chrome.i18n.getMessage("delete")}
                </span>

                {(!isNaN(segment[1]) && getCategoryActionType(sponsorTime.category) === CategoryActionType.Skippable) ? (
                    <span id={"sponsorTimePreviewButton" + this.idSuffix}
                        className="sponsorTimeEditButton"
                        onClick={this.previewTime.bind(this)}>
                        {chrome.i18n.getMessage("preview")}
                    </span>
                ): ""}

                {(!isNaN(segment[1])) ? (
                    <span id={"sponsorTimeInspectButton" + this.idSuffix}
                        className="sponsorTimeEditButton"
                        onClick={this.inspectTime.bind(this)}>
                        {chrome.i18n.getMessage("inspect")}
                    </span>
                ): ""}

                {(!isNaN(segment[1])) ? (
                    <span id={"sponsorTimeEditButton" + this.idSuffix}
                        className="sponsorTimeEditButton"
                        onClick={this.toggleEditTime.bind(this)}>
                        {this.state.editing ? chrome.i18n.getMessage("save") : chrome.i18n.getMessage("edit")}
                    </span>
                ): ""}
            </div>
        );
    }

    handleOnChange(index: number, e: React.ChangeEvent, sponsorTime: SponsorTime, targetValue: string): void {
        const sponsorTimeEdits = this.state.sponsorTimeEdits;
        
        // check if change is small engough to show tooltip
        const before = utils.getFormattedTimeToSeconds(sponsorTimeEdits[index]);
        const after = utils.getFormattedTimeToSeconds(targetValue);
        const difference = Math.abs(before - after);
        if (0 < difference && difference< 0.5) this.showToolTip();

        sponsorTimeEdits[index] = targetValue;
        if (index === 0 && getCategoryActionType(sponsorTime.category) === CategoryActionType.POI) sponsorTimeEdits[1] = targetValue;

        this.setState({sponsorTimeEdits});
        this.saveEditTimes();
    }
    changeTimesWhenScrolling(index: number, e: React.WheelEvent, sponsorTime: SponsorTime): void {
        let step = 0;
        // shift + ctrl = 1
        // ctrl = 0.1
        // default = 0.01
        // shift = 0.001
        if (e.shiftKey) {
            step = (e.ctrlKey) ? 1 : 0.001;
        } else {
            step = (e.ctrlKey) ? 0.1 : 0.01;
        }
        
        const sponsorTimeEdits = this.state.sponsorTimeEdits;
        let timeAsNumber = utils.getFormattedTimeToSeconds(this.state.sponsorTimeEdits[index]);
        if (timeAsNumber !== null && e.deltaY != 0) {
            if (e.deltaY < 0) {
                timeAsNumber += step;
            } else if (timeAsNumber >= step) {
                timeAsNumber -= step;
            } else {
                timeAsNumber = 0;
            }
            sponsorTimeEdits[index] = utils.getFormattedTime(timeAsNumber, true);
            if (getCategoryActionType(sponsorTime.category) === CategoryActionType.POI) sponsorTimeEdits[1] = sponsorTimeEdits[0];
            this.setState({sponsorTimeEdits});
            this.saveEditTimes();
        }
    }

    showToolTip(): void {
        if (!Config.config.scrollToEditTimeUpdate && document.getElementById("sponsorRectangleTooltip" + "sponsorTimesContainer" + this.idSuffix) === null) {
            const element = document.getElementById("sponsorTimesContainer" + this.idSuffix);
            new RectangleTooltip({
                text: chrome.i18n.getMessage("SponsorTimeEditScrollNewFeature"),
                referenceNode: element.parentElement,
                prependElement: element,
                timeout: 15,
                bottomOffset: 75 + "px",
                leftOffset: -318 + "px",
                backgroundColor: "rgba(28, 28, 28, 1.0)",
                htmlId: "sponsorTimesContainer" + this.idSuffix,
                buttonFunction: () => {Config.config.scrollToEditTimeUpdate = true}
            });
        }
    }

    getCategoryOptions(): React.ReactElement[] {
        const elements = [(
            <option value={DEFAULT_CATEGORY}
                    key={DEFAULT_CATEGORY}>
                {chrome.i18n.getMessage(DEFAULT_CATEGORY)}
            </option>
        )];

        for (const category of (this.props.categoryList ?? CompileConfig.categoryList)) {
            elements.push(
                <option value={category}
                        key={category}>
                    {chrome.i18n.getMessage("category_" + category)}
                </option>
            );
        }

        return elements;
    }

    categorySelectionChange(event: React.ChangeEvent<HTMLSelectElement>): void {
        // See if show more categories was pressed
        if (event.target.value !== DEFAULT_CATEGORY && !Config.config.categorySelections.some((category) => category.name === event.target.value)) {
            const chosenCategory = event.target.value;
            event.target.value = DEFAULT_CATEGORY;
            
            // Alert that they have to enable this category first
            if (confirm(chrome.i18n.getMessage("enableThisCategoryFirst")
                            .replace("{0}", chrome.i18n.getMessage("category_" + chosenCategory)))) {
                // Open options page
                chrome.runtime.sendMessage({message: "openConfig", hash: chosenCategory + "OptionsName"});
            }
            
            return;
        }

        if (getCategoryActionType(event.target.value as Category) === CategoryActionType.POI) {
            this.setTimeTo(1, null);
            this.props.contentContainer().updateEditButtonsOnPlayer();

            if (this.props.contentContainer().sponsorTimesSubmitting
                    .some((segment, i) => segment.category === event.target.value && i !== this.props.index)) {
                alert(chrome.i18n.getMessage("poiOnlyOneSegment"));
            }
        }
        
        this.saveEditTimes();
    }

    getActionTypeOptions(sponsorTime: SponsorTime): React.ReactElement[] {
        const elements = [];

        for (const actionType of CompileConfig.categorySupport[sponsorTime.category]) {
            elements.push(
                <option value={actionType}
                        key={actionType}>
                    {chrome.i18n.getMessage(actionType)}
                </option>
            );
        }

        return elements;
    }

    setTimeToNow(index: number): void {
        this.setTimeTo(index, this.props.contentContainer().getRealCurrentTime());
    }

    setTimeToEnd(): void {
        this.setTimeTo(1, this.props.contentContainer().v.duration);
    }

    /**
     * @param index 
     * @param time If null, will set time to the first index's time
     */
    setTimeTo(index: number, time: number): void {
        const sponsorTime = this.props.contentContainer().sponsorTimesSubmitting[this.props.index];
        if (time === null) time = sponsorTime.segment[0];

        sponsorTime.segment[index] = time;
        if (getCategoryActionType(sponsorTime.category) === CategoryActionType.POI) sponsorTime.segment[1] = time;

        this.setState({
            sponsorTimeEdits: this.getFormattedSponsorTimesEdits(sponsorTime)
        }, this.saveEditTimes);
    }

    toggleEditTime(): void {
        if (this.state.editing) {
            
            this.setState({
                editing: false
            });

            this.saveEditTimes();            
        } else {
            const sponsorTime = this.props.contentContainer().sponsorTimesSubmitting[this.props.index];

            this.setState({
                editing: true,
                sponsorTimeEdits: this.getFormattedSponsorTimesEdits(sponsorTime)
            });
        }
    }

    /** Returns an array in the sponsorTimeEdits form (formatted time string) from a normal seconds sponsor time */
    getFormattedSponsorTimesEdits(sponsorTime: SponsorTime): [string, string] {
        return [utils.getFormattedTime(sponsorTime.segment[0], true),
            utils.getFormattedTime(sponsorTime.segment[1], true)];
    }

    saveEditTimes(): void {
        const sponsorTimesSubmitting = this.props.contentContainer().sponsorTimesSubmitting;

        if (this.state.editing) {
            const startTime = utils.getFormattedTimeToSeconds(this.state.sponsorTimeEdits[0]);
            const endTime = utils.getFormattedTimeToSeconds(this.state.sponsorTimeEdits[1]);

            // Change segment time only if the format was correct
            if (startTime !== null && endTime !== null) {
                sponsorTimesSubmitting[this.props.index].segment = [startTime, endTime];
            }
        }

        sponsorTimesSubmitting[this.props.index].category = this.categoryOptionRef.current.value as Category;
        sponsorTimesSubmitting[this.props.index].actionType = 
            this.actionTypeOptionRef?.current ? this.actionTypeOptionRef.current.value as ActionType : ActionType.Skip;

        Config.config.segmentTimes.set(this.props.contentContainer().sponsorVideoID, sponsorTimesSubmitting);

        this.props.contentContainer().updatePreviewBar();
    }

    previewTime(): void {
        const sponsorTimes = this.props.contentContainer().sponsorTimesSubmitting;
        const index = this.props.index;

        const skipTime = sponsorTimes[index].segment[0];

        this.props.contentContainer().previewTime(skipTime - (2 * this.props.contentContainer().v.playbackRate));
    }

    inspectTime(): void {
        const sponsorTimes = this.props.contentContainer().sponsorTimesSubmitting;
        const index = this.props.index;

        const skipTime = sponsorTimes[index].segment[0];

        this.props.contentContainer().previewTime(skipTime + 0.0001, false);
    }

    deleteTime(): void {
        const sponsorTimes = this.props.contentContainer().sponsorTimesSubmitting;
        const index = this.props.index;
        const removingIncomplete = sponsorTimes[index].segment.length < 2;

        sponsorTimes.splice(index, 1);
  
        //save this
        Config.config.segmentTimes.set(this.props.contentContainer().sponsorVideoID, sponsorTimes);

        this.props.contentContainer().updatePreviewBar();
        
        //if they are all removed
        if (sponsorTimes.length == 0) {
            this.props.submissionNotice.cancel();
        } else {
            //update display
            this.props.submissionNotice.forceUpdate();
        }

        //if it is not a complete segment, or all are removed
        if (sponsorTimes.length === 0 || removingIncomplete) {
            //update video player
            this.props.contentContainer().updateEditButtonsOnPlayer();
        }
    }

    configUpdate(): void {
        this.forceUpdate();
    }
}

export default SponsorTimeEditComponent;
