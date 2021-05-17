import * as React from "react";

import Config from "../config";
import * as CompileConfig from "../../config.json";

import Utils from "../utils";
import { ContentContainer, SponsorTime } from "../types";
import SubmissionNoticeComponent from "./SubmissionNoticeComponent";
const utils = new Utils();

export interface SponsorTimeEditProps {
    index: number,

    idSuffix: string,
    // Contains functions and variables from the content script needed by the skip notice
    contentContainer: ContentContainer,

    submissionNotice: SubmissionNoticeComponent;
}

export interface SponsorTimeEditState {
    editing: boolean;
    sponsorTimeEdits: [string, string];
}

const DEFAULT_CATEGORY = "chooseACategory";

class SponsorTimeEditComponent extends React.Component<SponsorTimeEditProps, SponsorTimeEditState> {

    idSuffix: string;

    categoryOptionRef: React.RefObject<HTMLSelectElement>;

    configUpdateListener: () => void;

    constructor(props: SponsorTimeEditProps) {
        super(props);

        this.categoryOptionRef = React.createRef();

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
                            onChange={(e) => {
                                const sponsorTimeEdits = this.state.sponsorTimeEdits;
                                sponsorTimeEdits[0] = e.target.value;

                                this.setState({sponsorTimeEdits});

                                this.saveEditTimes();
                            }}>
                        </input>

                        <span>
                            {" " + chrome.i18n.getMessage("to") + " "}
                        </span>

                        <input id={"submittingTime1" + this.idSuffix}
                            className="sponsorTimeEdit sponsorTimeEditInput"
                            ref={oldYouTubeDarkStyles}
                            type="text"
                            value={this.state.sponsorTimeEdits[1]}
                            onChange={(e) => {
                                const sponsorTimeEdits = this.state.sponsorTimeEdits;
                                sponsorTimeEdits[1] = e.target.value;

                                this.setState({sponsorTimeEdits});

                                this.saveEditTimes();
                            }}>
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
                </div>
            );
        } else {
            timeDisplay = (
                <div id={"sponsorTimesContainer" + this.idSuffix}
                    className="sponsorTimeDisplay"
                    onClick={this.toggleEditTime.bind(this)}>
                        {utils.getFormattedTime(segment[0], true) +
                            ((!isNaN(segment[1])) ? " " + chrome.i18n.getMessage("to") + " " + utils.getFormattedTime(segment[1], true) : "")}
                </div>
            );
        }

        return (
            <div style={style}>
                
                {timeDisplay}

                {/* Category */}
                <div style={{position: "relative"}}>
                    <select id={"sponsorTimeCategories" + this.idSuffix}
                        className="sponsorTimeCategories"
                        defaultValue={sponsorTime.category}
                        ref={this.categoryOptionRef}
                        onChange={this.categorySelectionChange.bind(this)}>
                        {this.getCategoryOptions()}
                    </select>

                    <img id={"sponsorTimeCategoriesHelpButton" + this.idSuffix}
                        className="helpButton"
                        src={chrome.extension.getURL("icons/help.svg")}
                        title={chrome.i18n.getMessage("categoryGuidelines")}
                        onClick={() => chrome.runtime.sendMessage({"message": "openConfig"})}>
                    
                    </img>
                </div>

                <br/>

                {/* Editing Tools */}

                <span id={"sponsorTimeDeleteButton" + this.idSuffix}
                    className="sponsorTimeEditButton"
                    onClick={this.deleteTime.bind(this)}>
                    {chrome.i18n.getMessage("delete")}
                </span>

                {(!isNaN(segment[1])) ? (
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

    getCategoryOptions(): React.ReactElement[] {
        const elements = [(
            <option value={DEFAULT_CATEGORY}
                    key={DEFAULT_CATEGORY}>
                {chrome.i18n.getMessage(DEFAULT_CATEGORY)}
            </option>
        )];

        for (const category of CompileConfig.categoryList) {
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
        if (!Config.config.categorySelections.some((category) => category.name === event.target.value)) {
            const chosenCategory = event.target.value;
            event.target.value = DEFAULT_CATEGORY;
            
            // Alert that they have to enable this category first
            if (confirm(chrome.i18n.getMessage("enableThisCategoryFirst")
                            .replace("{0}", chrome.i18n.getMessage("category_" + chosenCategory)))) {
                // Open options page
                chrome.runtime.sendMessage({"message": "openConfig"});
            }
            
            return;
        }
        
        this.saveEditTimes();
    }

    setTimeToNow(index: number): void {
        this.setTimeTo(index, this.props.contentContainer().getRealCurrentTime());
    }

    setTimeToEnd(): void {
        this.setTimeTo(1, this.props.contentContainer().v.duration);
    }

    setTimeTo(index: number, time: number): void {
        const sponsorTime = this.props.contentContainer().sponsorTimesSubmitting[this.props.index];

        sponsorTime.segment[index] = 
            time;

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

        sponsorTimesSubmitting[this.props.index].category = this.categoryOptionRef.current.value;

        Config.config.segmentTimes.set(this.props.contentContainer().sponsorVideoID, sponsorTimesSubmitting);

        this.props.contentContainer().updatePreviewBar();
    }

    previewTime(): void {
        const sponsorTimes = this.props.contentContainer().sponsorTimesSubmitting;
        const index = this.props.index;

        const skipTime = sponsorTimes[index].segment[0];

        this.props.contentContainer().previewTime(skipTime - 2);
    }

    inspectTime(): void {
        const sponsorTimes = this.props.contentContainer().sponsorTimesSubmitting;
        const index = this.props.index;

        const skipTime = sponsorTimes[index].segment[0];

        this.props.contentContainer().previewTime(skipTime + 0.000001, false);
    }

    deleteTime(): void {
        const sponsorTimes = this.props.contentContainer().sponsorTimesSubmitting;
        const index = this.props.index;

        //if it is not a complete sponsor time
        if (sponsorTimes[index].segment.length < 2) {
            //update video player
            this.props.contentContainer().updateEditButtonsOnPlayer();
        }
  
        sponsorTimes.splice(index, 1);
  
        //save this
        Config.config.segmentTimes.set(this.props.contentContainer().sponsorVideoID, sponsorTimes);

        this.props.contentContainer().updatePreviewBar();
        
        //if they are all removed
        if (sponsorTimes.length == 0) {
            this.props.submissionNotice.cancel();
            
            //update video player
            this.props.contentContainer().updateEditButtonsOnPlayer();
        } else {
            //update display
            this.props.submissionNotice.forceUpdate();
        }
    }

    configUpdate(): void {
        this.forceUpdate();
    }
}

export default SponsorTimeEditComponent;