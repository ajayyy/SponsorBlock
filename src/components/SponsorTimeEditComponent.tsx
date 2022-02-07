import * as React from "react";
import * as CompileConfig from "../../config.json";
import Config from "../config";
import { ActionType, Category, ContentContainer, SponsorTime } from "../types";
import Utils from "../utils";
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
    selectedCategory: Category;
}

const DEFAULT_CATEGORY = "chooseACategory";

class SponsorTimeEditComponent extends React.Component<SponsorTimeEditProps, SponsorTimeEditState> {

    idSuffix: string;

    categoryOptionRef: React.RefObject<HTMLSelectElement>;
    actionTypeOptionRef: React.RefObject<HTMLSelectElement>;

    configUpdateListener: () => void;

    previousSkipType: ActionType;
    // Used when selecting POI or Full
    timesBeforeChanging: number[] = [];
    fullVideoWarningShown = false;

    constructor(props: SponsorTimeEditProps) {
        super(props);

        this.categoryOptionRef = React.createRef();
        this.actionTypeOptionRef = React.createRef();

        this.idSuffix = this.props.idSuffix;

        this.previousSkipType = ActionType.Skip;
        this.state = {
            editing: false,
            sponsorTimeEdits: [null, null],
            selectedCategory: DEFAULT_CATEGORY as Category
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
            Config.configSyncListeners.push(this.configUpdate.bind(this));
        }

        this.checkToShowFullVideoWarning();
    }

    componentWillUnmount(): void {
        if (this.configUpdateListener) {
            Config.configSyncListeners.splice(Config.configSyncListeners.indexOf(this.configUpdate.bind(this)), 1);
        }
    }

    render(): React.ReactElement {
        this.checkToShowFullVideoWarning();

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
        const timeDisplayStyle: React.CSSProperties = {};
        const sponsorTime = this.props.contentContainer().sponsorTimesSubmitting[this.props.index];
        const segment = sponsorTime.segment;
        if (sponsorTime?.actionType === ActionType.Full) timeDisplayStyle.display = "none";
        if (this.state.editing) {
            timeDisplay = (
                <div id={"sponsorTimesContainer" + this.idSuffix}
                    style={timeDisplayStyle}
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

                        {sponsorTime.actionType !== ActionType.Poi ? (
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
                    style={timeDisplayStyle}
                    className="sponsorTimeDisplay"
                    onClick={this.toggleEditTime.bind(this)}>
                        {utils.getFormattedTime(segment[0], true) +
                            ((!isNaN(segment[1]) && sponsorTime.actionType !== ActionType.Poi)
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
                    <a href={CompileConfig.wikiLinks[sponsorTime.category] 
                            || "https://wiki.sponsor.ajay.app/index.php/Segment_Categories"}
                        target="_blank" rel="noreferrer">
                        <img id={"sponsorTimeCategoriesHelpButton" + this.idSuffix}
                            className="helpButton"
                            src={chrome.extension.getURL("icons/help.svg")}
                            title={chrome.i18n.getMessage("categoryGuidelines")} />
                    </a>
                </div>

                {/* Action Type */}
                {CompileConfig.categorySupport[sponsorTime.category] && 
                    (CompileConfig.categorySupport[sponsorTime.category]?.length > 1 
                        || CompileConfig.categorySupport[sponsorTime.category]?.[0] === ActionType.Full) ? (
                    <div style={{position: "relative"}}>
                        <select id={"sponsorTimeActionTypes" + this.idSuffix}
                            className="sponsorTimeEditSelector sponsorTimeActionTypes"
                            defaultValue={sponsorTime.actionType}
                            ref={this.actionTypeOptionRef}
                            onChange={(e) => this.actionTypeSelectionChange(e)}>
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

                {(!isNaN(segment[1]) && ![ActionType.Poi, ActionType.Full].includes(sponsorTime.actionType)) ? (
                    <span id={"sponsorTimePreviewButton" + this.idSuffix}
                        className="sponsorTimeEditButton"
                        onClick={(e) => this.previewTime(e.ctrlKey, e.shiftKey)}>
                        {chrome.i18n.getMessage("preview")}
                    </span>
                ): ""}

                {(!isNaN(segment[1]) && sponsorTime.actionType != ActionType.Full) ? (
                    <span id={"sponsorTimeInspectButton" + this.idSuffix}
                        className="sponsorTimeEditButton"
                        onClick={this.inspectTime.bind(this)}>
                        {chrome.i18n.getMessage("inspect")}
                    </span>
                ): ""}

                {(!isNaN(segment[1]) && sponsorTime.actionType != ActionType.Full) ? (
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
        if (0 < difference && difference< 0.5) this.showScrollToEditToolTip();

        sponsorTimeEdits[index] = targetValue;
        if (index === 0 && sponsorTime.actionType === ActionType.Poi) sponsorTimeEdits[1] = targetValue;

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
            if (sponsorTime.actionType === ActionType.Poi) sponsorTimeEdits[1] = sponsorTimeEdits[0];

            this.setState({sponsorTimeEdits});
            this.saveEditTimes();
        }
    }

    showScrollToEditToolTip(): void {
        if (!Config.config.scrollToEditTimeUpdate && document.getElementById("sponsorRectangleTooltip" + "sponsorTimesContainer" + this.idSuffix) === null) {
            this.showToolTip(chrome.i18n.getMessage("SponsorTimeEditScrollNewFeature"), () => { Config.config.scrollToEditTimeUpdate = true });
        }
    }

    showToolTip(text: string, buttonFunction?: () => void): boolean {
        const element = document.getElementById("sponsorTimesContainer" + this.idSuffix);
        if (element) { 
            new RectangleTooltip({
                text,
                referenceNode: element.parentElement,
                prependElement: element,
                timeout: 15,
                bottomOffset: 0 + "px",
                leftOffset: -318 + "px",
                backgroundColor: "rgba(28, 28, 28, 1.0)",
                htmlId: "sponsorTimesContainer" + this.idSuffix,
                buttonFunction,
                fontSize: "14px",
                maxHeight: "200px"
            });

            return true;
        } else {
            return false;
        }
    }

    checkToShowFullVideoWarning(): void {
        const sponsorTime = this.props.contentContainer().sponsorTimesSubmitting[this.props.index];
        const segmentDuration = sponsorTime.segment[1] - sponsorTime.segment[0];
        const videoPercentage = segmentDuration / this.props.contentContainer().v.duration;

        if (videoPercentage > 0.6 && !this.fullVideoWarningShown 
                && (sponsorTime.category === "sponsor" || sponsorTime.category === "selfpromo" || sponsorTime.category === "chooseACategory")) {
            if (this.showToolTip(chrome.i18n.getMessage("fullVideoTooltipWarning"))) {
                this.fullVideoWarningShown = true;
            }
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
                        key={category}
                        className={this.getCategoryLockedClass(category)}>
                    {chrome.i18n.getMessage("category_" + category)}
                </option>
            );
        }

        return elements;
    }

    getCategoryLockedClass(category: string): string {
        return this.props.contentContainer().lockedCategories.includes(category) ? "sponsorBlockLockedColor" : "";
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
                chrome.runtime.sendMessage({message: "openConfig", hash: "behavior"});
            }
            
            return;
        }

        const sponsorTime = this.props.contentContainer().sponsorTimesSubmitting[this.props.index];
        this.handleReplacingLostTimes(event.target.value as Category, sponsorTime.actionType);
        this.saveEditTimes();
    }

    actionTypeSelectionChange(event: React.ChangeEvent<HTMLSelectElement>): void {
        const sponsorTime = this.props.contentContainer().sponsorTimesSubmitting[this.props.index];

        this.handleReplacingLostTimes(sponsorTime.category, event.target.value as ActionType);
        this.saveEditTimes();
    }

    private handleReplacingLostTimes(category: Category, actionType: ActionType): void {
        if (CompileConfig.categorySupport[category]?.includes(ActionType.Poi)) {
            if (this.previousSkipType !== ActionType.Poi) {
                this.timesBeforeChanging = [null, utils.getFormattedTimeToSeconds(this.state.sponsorTimeEdits[1])];
            }

            this.setTimeTo(1, null);
            this.props.contentContainer().updateEditButtonsOnPlayer();

            if (this.props.contentContainer().sponsorTimesSubmitting
                    .some((segment, i) => segment.category === category && i !== this.props.index)) {
                alert(chrome.i18n.getMessage("poiOnlyOneSegment"));
            }

            this.previousSkipType = ActionType.Poi;
        } else if (CompileConfig.categorySupport[category]?.length === 1 
                && CompileConfig.categorySupport[category]?.[0] === ActionType.Full) {
            if (this.previousSkipType !== ActionType.Full) {
                this.timesBeforeChanging = [utils.getFormattedTimeToSeconds(this.state.sponsorTimeEdits[0]), utils.getFormattedTimeToSeconds(this.state.sponsorTimeEdits[1])];
            }

            this.previousSkipType = ActionType.Full;
        } else if (CompileConfig.categorySupport[category]?.includes(ActionType.Skip) 
                && ![ActionType.Poi, ActionType.Full].includes(this.getNextActionType(category, actionType)) && this.previousSkipType !== ActionType.Skip) {
            if (this.timesBeforeChanging[0]) {
                this.setTimeTo(0, this.timesBeforeChanging[0]);
            }
            if (this.timesBeforeChanging[1]) {
                this.setTimeTo(1, this.timesBeforeChanging[1]);
            }

            this.previousSkipType = ActionType.Skip;
        }
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
        if (sponsorTime.actionType === ActionType.Poi) sponsorTime.segment[1] = time;

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

        const category = this.categoryOptionRef.current.value as Category
        sponsorTimesSubmitting[this.props.index].category = category;

        const inputActionType = this.actionTypeOptionRef?.current?.value as ActionType;
        sponsorTimesSubmitting[this.props.index].actionType = this.getNextActionType(category, inputActionType);

        Config.config.unsubmittedSegments[this.props.contentContainer().sponsorVideoID] = sponsorTimesSubmitting;
        Config.forceSyncUpdate("unsubmittedSegments");

        this.props.contentContainer().updatePreviewBar();

        if (sponsorTimesSubmitting[this.props.index].actionType === ActionType.Full 
                && (sponsorTimesSubmitting[this.props.index].segment[0] !== 0 || sponsorTimesSubmitting[this.props.index].segment[1] !== 0)) {
            this.setTimeTo(0, 0);
            this.setTimeTo(1, 0);
        }
    }

    private getNextActionType(category: Category, actionType: ActionType): ActionType {
        return actionType && CompileConfig.categorySupport[category]?.includes(actionType) ? actionType
            : CompileConfig.categorySupport[category]?.[0] ?? ActionType.Skip
    }

    previewTime(ctrlPressed = false, shiftPressed = false): void {
        const sponsorTimes = this.props.contentContainer().sponsorTimesSubmitting;
        const index = this.props.index;

        const skipTime = sponsorTimes[index].segment[0];

        let seekTime = 2;
        if (ctrlPressed) seekTime = 0.5;
        if (shiftPressed) seekTime = 0.25;

        this.props.contentContainer().previewTime(skipTime - (seekTime * this.props.contentContainer().v.playbackRate));
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
        if (sponsorTimes.length > 0) {
            Config.config.unsubmittedSegments[this.props.contentContainer().sponsorVideoID] = sponsorTimes;
        } else {
            delete Config.config.unsubmittedSegments[this.props.contentContainer().sponsorVideoID];
        }
        Config.forceSyncUpdate("unsubmittedSegments");

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
